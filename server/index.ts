import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Anthropic from '@anthropic-ai/sdk';

// ── Schemas (inline to avoid ESM/CJS boundary issues) ────────────────────────
const UserSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    full_name: { type: String, default: '' },
    role: { type: String, enum: ['admin', 'doctor', 'patient'], default: 'patient' },
    city: { type: String, default: '' },
  },
  { timestamps: true }
);

const ChildSchema = new mongoose.Schema(
  {
    parent_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    date_of_birth: { type: String, default: null },
    avatar_emoji: { type: String, default: '🧒' },
  },
  { timestamps: true }
);

const DentistSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    specialty: { type: String, default: 'Pediatric Dentist' },
    clinic_name: { type: String, required: true },
    city: { type: String, required: true },
    address: { type: String, default: '' },
    bio: { type: String, default: '' },
    rating: { type: Number, default: 4.5, min: 0, max: 5 },
    num_reviews: { type: Number, default: 0 },
    self_registered: { type: Boolean, default: false }, // true only for dentists created via the website doctor signup

    experience_years: { type: Number, default: 5 },
    consultation_fee: { type: Number, default: 500 },
    available_today: { type: Boolean, default: false },
    phone: { type: String, default: '' },
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

const AppointmentSchema = new mongoose.Schema(
  {
    parent_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    child_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Child', required: true },
    dentist_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Dentist', required: true },
    appointment_date: { type: String, required: true },
    appointment_time: { type: String, required: true },
    reason: { type: String, default: '' },
    status: { type: String, enum: ['pending', 'confirmed', 'cancelled', 'completed'], default: 'pending' },
    is_emergency: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const TipSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    content: { type: String, required: true },
    emoji: { type: String, default: '🦷' },
    category: { type: String, default: 'General' },
  },
  { timestamps: true }
);

const ReviewSchema = new mongoose.Schema(
  {
    dentist_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Dentist', required: true },
    parent_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, default: '', trim: true },
  },
  { timestamps: true }
);
// One review per patient per dentist (re-submitting updates it).
ReviewSchema.index({ dentist_id: 1, parent_id: 1 }, { unique: true });

// ── Models ───────────────────────────────────────────────────────────────────
const User = (mongoose.models['User'] as mongoose.Model<any>) || mongoose.model('User', UserSchema);
const Child = (mongoose.models['Child'] as mongoose.Model<any>) || mongoose.model('Child', ChildSchema);
const Dentist = (mongoose.models['Dentist'] as mongoose.Model<any>) || mongoose.model('Dentist', DentistSchema);
const Appointment = (mongoose.models['Appointment'] as mongoose.Model<any>) || mongoose.model('Appointment', AppointmentSchema);
const Tip = (mongoose.models['Tip'] as mongoose.Model<any>) || mongoose.model('Tip', TipSchema);
const Review = (mongoose.models['Review'] as mongoose.Model<any>) || mongoose.model('Review', ReviewSchema);

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-me';
const PORT = process.env.API_PORT ?? 3001;

// ── DB connection ────────────────────────────────────────────────────────────
async function connectDB() {
  if (mongoose.connection.readyState >= 1) return;
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('❌  MONGODB_URI is not set in .env');
    process.exit(1);
  }
  await mongoose.connect(uri);
  console.log('✅  MongoDB connected');
}

// ── Auth helpers ─────────────────────────────────────────────────────────────
function signToken(userId: string, email: string, role: string) {
  return jwt.sign({ userId, email, role }, JWT_SECRET, { expiresIn: '30d' });
}

function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const payload = jwt.verify(header.slice(7), JWT_SECRET) as { userId: string; email: string; role: string };
    (req as any).userId = payload.userId;
    (req as any).userEmail = payload.email;
    (req as any).userRole = payload.role ?? 'patient';
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

function requireRole(...roles: string[]) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!roles.includes((req as any).userRole)) {
      res.status(403).json({ error: 'Forbidden' }); return;
    }
    next();
  };
}

// ── App setup ────────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
// Teeth photos are sent as base64 and need a larger body limit than every other route
const TEETH_CHECK_PATH = '/api/teeth-check';
const defaultJson = express.json();
const largeJson = express.json({ limit: '6mb' });
app.use((req, res, next) => (req.path === TEETH_CHECK_PATH ? largeJson : defaultJson)(req, res, next));

// ── METRICS (persisted in MongoDB, auto-expired by a TTL index) ────────────────
interface ApiSample { t: number; method: string; route: string; status: number; ms: number }
interface WebSample { t: number; kind: 'page_load' | 'navigation' | 'api'; page: string; ms: number; ttfb?: number; fcp?: number; dcl?: number; status?: number }

const METRICS_RETENTION_DAYS = Math.max(1, Number(process.env.METRICS_RETENTION_DAYS) || 30);
const metricsTtl = { expireAfterSeconds: METRICS_RETENTION_DAYS * 86400 };

const ApiMetricSchema = new mongoose.Schema(
  { t: { type: Date, required: true }, method: String, route: String, status: Number, ms: Number },
  { versionKey: false, collection: 'api_metrics' }
);
ApiMetricSchema.index({ t: 1 }, metricsTtl);

const WebMetricSchema = new mongoose.Schema(
  { t: { type: Date, required: true }, kind: String, page: String, ms: Number, ttfb: Number, fcp: Number, dcl: Number, status: Number },
  { versionKey: false, collection: 'web_metrics' }
);
WebMetricSchema.index({ t: 1 }, metricsTtl);

const ApiMetric = (mongoose.models['ApiMetric'] as mongoose.Model<any>) || mongoose.model('ApiMetric', ApiMetricSchema);
const WebMetric = (mongoose.models['WebMetric'] as mongoose.Model<any>) || mongoose.model('WebMetric', WebMetricSchema);

// Samples are buffered and written in batches so recording a metric never adds a DB write to the request path
const MAX_PENDING = 10000;
let pendingApi: ApiSample[] = [];
let pendingWeb: WebSample[] = [];
const serverStartedAt = Date.now();

function pushCapped<T>(arr: T[], item: T, cap: number) {
  arr.push(item);
  if (arr.length > cap) arr.splice(0, arr.length - cap);
}

async function flushMetrics() {
  if (mongoose.connection.readyState !== 1) return; // keep buffering until the DB is up
  const api = pendingApi, web = pendingWeb;
  pendingApi = []; pendingWeb = [];
  const toDocs = (list: any[]) => list.map((s) => ({ ...s, t: new Date(s.t) }));
  try {
    await Promise.all([
      api.length ? ApiMetric.insertMany(toDocs(api), { ordered: false }) : null,
      web.length ? WebMetric.insertMany(toDocs(web), { ordered: false }) : null,
    ]);
  } catch (err: any) {
    console.error('Failed to persist metrics:', err.message);
    pendingApi = [...api, ...pendingApi].slice(-MAX_PENDING);
    pendingWeb = [...web, ...pendingWeb].slice(-MAX_PENDING);
  }
}
setInterval(flushMetrics, 2000).unref();

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.once(sig, () => { flushMetrics().finally(() => process.exit(0)); });
}

/** Persisted samples since `since`, plus anything still waiting to be flushed. */
async function loadSamples(since: number): Promise<{ api: ApiSample[]; web: WebSample[] }> {
  const toSample = (d: any) => ({ ...d, _id: undefined, t: new Date(d.t).getTime() });
  const [api, web] = await Promise.all([
    ApiMetric.find({ t: { $gte: new Date(since) } }, { _id: 0 }).sort({ t: 1 }).lean(),
    WebMetric.find({ t: { $gte: new Date(since) } }, { _id: 0 }).sort({ t: 1 }).lean(),
  ]);
  return {
    api: [...api.map(toSample), ...pendingApi.filter((s) => s.t >= since)],
    web: [...web.map(toSample), ...pendingWeb.filter((s) => s.t >= since)],
  };
}

function percentile(sorted: number[], p: number) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

function summarize(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const avg = sorted.length ? sorted.reduce((s, v) => s + v, 0) / sorted.length : 0;
  return {
    count: sorted.length,
    avg: +avg.toFixed(1),
    p50: +percentile(sorted, 50).toFixed(1),
    p95: +percentile(sorted, 95).toFixed(1),
    p99: +percentile(sorted, 99).toFixed(1),
    max: +(sorted[sorted.length - 1] ?? 0).toFixed(1),
  };
}

// Paths excluded from API metrics so the dashboard's own polling doesn't skew them
const METRICS_IGNORED = new Set(['/api/admin/metrics', '/api/metrics/web']);

app.use((req, res, next) => {
  if (!req.path.startsWith('/api') || req.method === 'OPTIONS' || METRICS_IGNORED.has(req.path)) return next();
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    // Use the matched route pattern (e.g. /api/dentists/:id) so ids don't explode the endpoint list
    const route = req.route?.path ? `${req.baseUrl}${req.route.path}` : '(unmatched)';
    pushCapped(pendingApi, { t: Date.now(), method: req.method, route, status: res.statusCode, ms: +ms.toFixed(1) }, MAX_PENDING);
  });
  next();
});

// Browser-side timings (page loads, route navigations, client-observed API round-trips)
app.post('/api/metrics/web', (req, res) => {
  const samples = Array.isArray(req.body?.samples) ? req.body.samples.slice(0, 100) : [];
  const num = (v: any) => (typeof v === 'number' && isFinite(v) && v >= 0 && v < 600000 ? +v.toFixed(1) : undefined);
  for (const s of samples) {
    const ms = num(s?.ms);
    if (ms === undefined || !['page_load', 'navigation', 'api'].includes(s?.kind)) continue;
    pushCapped(pendingWeb, {
      t: Date.now(), kind: s.kind, page: String(s.page ?? '').slice(0, 200), ms,
      ttfb: num(s.ttfb), fcp: num(s.fcp), dcl: num(s.dcl),
      status: typeof s.status === 'number' ? s.status : undefined,
    }, MAX_PENDING);
  }
  res.json({ ok: true });
});

// ── AUTH ─────────────────────────────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  const { email, password, full_name, role: rawRole, clinic_name, city, specialty } = req.body ?? {};
  if (!email || !password) { res.status(400).json({ error: 'Email and password are required' }); return; }
  if (password.length < 6) { res.status(400).json({ error: 'Password must be at least 6 characters' }); return; }

  // Only patient or doctor may self-register; anything else (e.g. admin) falls back to patient.
  const role = rawRole === 'doctor' ? 'doctor' : 'patient';

  // Doctors need a clinic + city so a Dentist profile can be created and the dashboard works.
  if (role === 'doctor') {
    if (!clinic_name?.trim()) { res.status(400).json({ error: 'Clinic name is required for doctor accounts' }); return; }
    if (!city?.trim()) { res.status(400).json({ error: 'City is required for doctor accounts' }); return; }
  }

  try {
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) { res.status(400).json({ error: 'Email already in use' }); return; }
    const hashed = await bcrypt.hash(password, 12);
    const user = await User.create({
      email: email.toLowerCase(),
      password: hashed,
      full_name: full_name ?? '',
      role,
      city: role === 'doctor' ? city.trim() : '',
    });

    // Create the linked Dentist profile so the doctor dashboard has data to load.
    if (role === 'doctor') {
      await Dentist.create({
        name: (full_name ?? '').trim() || 'Doctor',
        clinic_name: clinic_name.trim(),
        city: city.trim(),
        specialty: specialty?.trim() || 'Pediatric Dentist',
        rating: null, // new dentists have no rating yet — shown as "New" rather than a fabricated score
        self_registered: true,
        user_id: user._id,
      });
    }

    const token = signToken(user._id.toString(), user.email, user.role);
    res.status(201).json({ token, user: { id: user._id.toString(), email: user.email, full_name: user.full_name, role: user.role, city: user.city ?? '' } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) { res.status(400).json({ error: 'Email and password are required' }); return; }
  try {
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) { res.status(401).json({ error: 'Invalid email or password' }); return; }
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) { res.status(401).json({ error: 'Invalid email or password' }); return; }
    const token = signToken(user._id.toString(), user.email, user.role);
    res.json({ token, user: { id: user._id.toString(), email: user.email, full_name: user.full_name, role: user.role, city: user.city ?? '' } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
  try {
    const user = await User.findById((req as any).userId).select('-password');
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }
    res.json({ id: user._id.toString(), email: user.email, full_name: user.full_name, role: user.role, city: user.city ?? '' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/auth/me', requireAuth, async (req, res) => {
  try {
    const { city } = req.body ?? {};
    const user = await User.findByIdAndUpdate(
      (req as any).userId,
      { city: (city ?? '').trim() },
      { new: true }
    ).select('-password');
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }
    res.json({ id: user._id.toString(), email: user.email, full_name: user.full_name, role: user.role, city: user.city ?? '' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── CHILDREN ──────────────────────────────────────────────────────────────────
app.get('/api/children', requireAuth, async (req, res) => {
  try {
    const children = await Child.find({ parent_id: (req as any).userId }).sort({ createdAt: 1 });
    res.json(children.map((c: any) => ({
      id: c._id.toString(), parent_id: c.parent_id.toString(),
      name: c.name, date_of_birth: c.date_of_birth,
      avatar_emoji: c.avatar_emoji, created_at: c.createdAt,
    })));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.post('/api/children', requireAuth, async (req, res) => {
  const { name, date_of_birth, avatar_emoji } = req.body ?? {};
  if (!name?.trim()) { res.status(400).json({ error: 'Name is required' }); return; }
  try {
    const child = await Child.create({
      parent_id: (req as any).userId,
      name: name.trim(),
      date_of_birth: date_of_birth || null,
      avatar_emoji: avatar_emoji || '🧒',
    });
    res.status(201).json({
      id: child._id.toString(), parent_id: child.parent_id.toString(),
      name: child.name, date_of_birth: child.date_of_birth,
      avatar_emoji: child.avatar_emoji, created_at: child.createdAt,
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/children/:id', requireAuth, async (req, res) => {
  try {
    await Child.findOneAndDelete({ _id: req.params.id, parent_id: (req as any).userId });
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── DENTISTS ──────────────────────────────────────────────────────────────────
function fmtDentist(d: any) {
  return {
    id: d._id.toString(), name: d.name, specialty: d.specialty,
    clinic_name: d.clinic_name, city: d.city, address: d.address,
    bio: d.bio, rating: d.rating, num_reviews: d.num_reviews ?? 0, experience_years: d.experience_years,
    consultation_fee: d.consultation_fee, available_today: d.available_today,
    phone: d.phone, user_id: d.user_id?.toString() ?? null,
  };
}

app.get('/api/dentists', async (req, res) => {
  try {
    const { city } = req.query;
    // Only surface dentists who signed up through the website — bookings must reach a real doctor.
    const filter: any = { self_registered: true };
    if (city && typeof city === 'string' && city.trim()) {
      filter.city = { $regex: new RegExp(city.trim(), 'i') };
    }
    const dentists = await Dentist.find(filter).sort({ rating: -1 });
    res.json(dentists.map(fmtDentist));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.get('/api/dentists/cities', async (_req, res) => {
  try {
    const raw: string[] = await Dentist.distinct('city', { self_registered: true });
    // Normalise to title-case and deduplicate
    const seen = new Set<string>();
    const cities = raw
      .map(c => c.trim().replace(/\b\w/g, l => l.toUpperCase()))
      .filter(c => { if (seen.has(c.toLowerCase())) return false; seen.add(c.toLowerCase()); return true; })
      .sort();
    res.json(cities);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.get('/api/dentists/:id', async (req, res) => {
  try {
    const d = await Dentist.findById(req.params.id);
    if (!d) { res.status(404).json({ error: 'Dentist not found' }); return; }
    res.json(fmtDentist(d));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── APPOINTMENTS ──────────────────────────────────────────────────────────────
function fmtAppt(a: any) {
  const child = a.child_id as any;
  const dentist = a.dentist_id as any;
  return {
    id: a._id.toString(),
    parent_id: a.parent_id?.toString(),
    child_id: child?._id?.toString() ?? a.child_id?.toString(),
    dentist_id: dentist?._id?.toString() ?? a.dentist_id?.toString(),
    appointment_date: a.appointment_date,
    appointment_time: a.appointment_time,
    reason: a.reason,
    status: a.status,
    is_emergency: a.is_emergency ?? false,
    created_at: a.createdAt,
    children: child?._id ? { name: child.name, avatar_emoji: child.avatar_emoji } : null,
    dentists: dentist?._id ? { name: dentist.name, clinic_name: dentist.clinic_name, city: dentist.city } : null,
  };
}

app.get('/api/dentists/:id/booked-slots', async (req, res) => {
  try {
    const { date } = req.query;
    if (!date || typeof date !== 'string') {
      res.status(400).json({ error: 'date query parameter is required' }); return;
    }
    const appts = await Appointment.find({
      dentist_id: req.params.id,
      appointment_date: date,
      status: { $ne: 'cancelled' },
    });
    res.json(appts.map((a: any) => a.appointment_time));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── REVIEWS / RATINGS ─────────────────────────────────────────────────────────
// Recompute a dentist's average rating + review count from its reviews.
async function recomputeDentistRating(dentistId: string) {
  const agg = await Review.aggregate([
    { $match: { dentist_id: new mongoose.Types.ObjectId(dentistId) } },
    { $group: { _id: '$dentist_id', avg: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  const avg = agg[0]?.avg ?? null;
  const count = agg[0]?.count ?? 0;
  await Dentist.findByIdAndUpdate(dentistId, {
    rating: avg != null ? Math.round(avg * 10) / 10 : null,
    num_reviews: count,
  });
}

// Public list of a dentist's reviews (newest first).
app.get('/api/dentists/:id/reviews', async (req, res) => {
  try {
    const reviews = await Review.find({ dentist_id: req.params.id })
      .populate('parent_id', 'full_name email')
      .sort({ createdAt: -1 });
    res.json(reviews.map((r: any) => ({
      id: r._id.toString(),
      parent_id: (r.parent_id?._id ?? r.parent_id)?.toString() ?? null,
      reviewer_name: r.parent_id?.full_name || r.parent_id?.email || 'Parent',
      rating: r.rating,
      comment: r.comment,
      created_at: r.createdAt,
    })));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// A patient submits (or updates) their rating for a dentist they've visited.
app.post('/api/dentists/:id/reviews', requireAuth, requireRole('patient'), async (req, res) => {
  const dentistId = req.params.id;
  const { rating, comment } = req.body ?? {};
  const num = Number(rating);
  if (!Number.isInteger(num) || num < 1 || num > 5) {
    res.status(400).json({ error: 'Rating must be a whole number from 1 to 5' }); return;
  }
  try {
    const dentist = await Dentist.findById(dentistId);
    if (!dentist) { res.status(404).json({ error: 'Dentist not found' }); return; }

    // You can only rate a dentist you've actually had a completed visit with.
    const visited = await Appointment.findOne({
      parent_id: (req as any).userId,
      dentist_id: dentistId,
      status: 'completed',
    });
    if (!visited) {
      res.status(403).json({ error: 'You can review a dentist only after a completed visit.' }); return;
    }

    const review = await Review.findOneAndUpdate(
      { dentist_id: dentistId, parent_id: (req as any).userId },
      { rating: num, comment: (comment ?? '').toString().trim() },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    await recomputeDentistRating(dentistId);
    const updated = await Dentist.findById(dentistId);

    res.status(201).json({
      review: { id: review._id.toString(), rating: review.rating, comment: review.comment },
      rating: updated?.rating ?? null,
      num_reviews: updated?.num_reviews ?? 0,
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Whether the current patient is allowed to review this dentist (has a completed visit).
app.get('/api/dentists/:id/can-review', requireAuth, async (req, res) => {
  try {
    if ((req as any).userRole !== 'patient') { res.json({ can_review: false }); return; }
    const visited = await Appointment.findOne({
      parent_id: (req as any).userId,
      dentist_id: req.params.id,
      status: 'completed',
    });
    res.json({ can_review: !!visited });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.get('/api/appointments', requireAuth, async (req, res) => {
  try {
    const appts = await Appointment.find({ parent_id: (req as any).userId })
      .populate('child_id', 'name avatar_emoji')
      .populate('dentist_id', 'name clinic_name city')
      .sort({ appointment_date: -1 });
    res.json(appts.map(fmtAppt));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.post('/api/appointments', requireAuth, async (req, res) => {
  const { child_id, dentist_id, appointment_date, appointment_time, reason, is_emergency } = req.body ?? {};
  if (!child_id || !dentist_id || !appointment_date || !appointment_time) {
    res.status(400).json({ error: 'child_id, dentist_id, appointment_date and appointment_time are required' }); return;
  }
  try {
    const existing = await Appointment.findOne({
      dentist_id,
      appointment_date,
      appointment_time,
      status: { $ne: 'cancelled' },
    });
    if (existing) {
      res.status(400).json({ error: 'This time slot is already booked for this dentist. Please choose a different slot.' });
      return;
    }
    const appt = await (await Appointment.create({
      parent_id: (req as any).userId, child_id, dentist_id,
      appointment_date, appointment_time, reason: reason ?? '',
      status: 'pending', is_emergency: !!is_emergency,
    })).populate(['child_id', 'dentist_id']);
    res.status(201).json(fmtAppt(appt));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/appointments/:id', requireAuth, async (req, res) => {
  try {
    const appt = await Appointment.findOneAndUpdate(
      { _id: req.params.id, parent_id: (req as any).userId },
      { status: req.body.status },
      { new: true }
    );
    if (!appt) { res.status(404).json({ error: 'Appointment not found' }); return; }
    res.json({ id: appt._id.toString(), status: appt.status });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── ADMIN ─────────────────────────────────────────────────────────────────────
app.get('/api/admin/doctors', requireAuth, requireRole('admin'), async (_req, res) => {
  try {
    const dentists = await Dentist.find().sort({ createdAt: -1 });
    res.json(dentists.map(fmtDentist));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/doctors', requireAuth, requireRole('admin'), async (req, res) => {
  const { name, specialty, clinic_name, city, address, bio, rating, experience_years, consultation_fee, available_today, phone, login_email, login_password } = req.body ?? {};
  if (!name?.trim() || !clinic_name?.trim() || !city?.trim()) {
    res.status(400).json({ error: 'name, clinic_name, and city are required' }); return;
  }
  if (!login_email?.trim() || !login_password?.trim()) {
    res.status(400).json({ error: 'Doctor login email and password are required' }); return;
  }
  if (login_password.length < 6) {
    res.status(400).json({ error: 'Password must be at least 6 characters' }); return;
  }
  try {
    const existing = await User.findOne({ email: login_email.trim().toLowerCase() });
    if (existing) { res.status(400).json({ error: 'A user with this email already exists' }); return; }
    const hashed = await bcrypt.hash(login_password, 12);
    const doctorUser = await User.create({ email: login_email.trim().toLowerCase(), password: hashed, full_name: name.trim(), role: 'doctor' });
    const dentist = await Dentist.create({
      name: name.trim(), specialty: specialty || 'Pediatric Dentist',
      clinic_name: clinic_name.trim(), city: city.trim(),
      address: address || '', bio: bio || '',
      rating: rating ?? 4.5, experience_years: experience_years ?? 5,
      consultation_fee: consultation_fee ?? 500,
      available_today: available_today ?? false,
      phone: phone || '', user_id: doctorUser._id,
    });
    res.status(201).json(fmtDentist(dentist));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/doctors/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const { name, specialty, clinic_name, city, address, bio, rating, experience_years, consultation_fee, available_today, phone, login_password } = req.body ?? {};
  try {
    const update: any = {};
    if (name !== undefined) update.name = name;
    if (specialty !== undefined) update.specialty = specialty;
    if (clinic_name !== undefined) update.clinic_name = clinic_name;
    if (city !== undefined) update.city = city;
    if (address !== undefined) update.address = address;
    if (bio !== undefined) update.bio = bio;
    if (rating !== undefined) update.rating = rating;
    if (experience_years !== undefined) update.experience_years = experience_years;
    if (consultation_fee !== undefined) update.consultation_fee = consultation_fee;
    if (available_today !== undefined) update.available_today = available_today;
    if (phone !== undefined) update.phone = phone;

    const dentist = await Dentist.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!dentist) { res.status(404).json({ error: 'Doctor not found' }); return; }

    // Reset password if provided
    if (login_password?.trim()) {
      if (login_password.length < 6) { res.status(400).json({ error: 'Password must be at least 6 characters' }); return; }
      if (dentist.user_id) {
        const hashed = await bcrypt.hash(login_password, 12);
        await User.findByIdAndUpdate(dentist.user_id, { password: hashed });
      }
    }

    res.json(fmtDentist(dentist));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admin/doctors/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const deleted = await Dentist.findByIdAndDelete(req.params.id);
    if (!deleted) { res.status(404).json({ error: 'Doctor not found' }); return; }
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/appointments', requireAuth, requireRole('admin'), async (_req, res) => {
  try {
    const appts = await Appointment.find()
      .populate('child_id', 'name avatar_emoji')
      .populate('dentist_id', 'name clinic_name city')
      .populate('parent_id', 'full_name email')
      .sort({ createdAt: -1 });
    res.json(appts.map((a: any) => ({
      ...fmtAppt(a),
      parent_id: a.parent_id?._id?.toString() ?? a.parent_id?.toString(),
      parent: a.parent_id?._id ? { full_name: a.parent_id.full_name, email: a.parent_id.email } : null,
    })));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/admin/appointments/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const { status } = req.body ?? {};
  if (!['pending', 'confirmed', 'cancelled', 'completed'].includes(status)) {
    res.status(400).json({ error: 'Invalid status' }); return;
  }
  try {
    const appt = await Appointment.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!appt) { res.status(404).json({ error: 'Appointment not found' }); return; }
    res.json({ id: appt._id.toString(), status: appt.status });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/children', requireAuth, requireRole('admin'), async (_req, res) => {
  try {
    const [children, counts] = await Promise.all([
      Child.find().populate('parent_id', 'full_name email').sort({ createdAt: -1 }),
      Appointment.aggregate([{ $group: { _id: '$child_id', n: { $sum: 1 } } }]),
    ]);
    const countMap = new Map(counts.map((c: any) => [c._id?.toString(), c.n]));
    res.json(children.map((c: any) => ({
      id: c._id.toString(),
      name: c.name, date_of_birth: c.date_of_birth, avatar_emoji: c.avatar_emoji,
      created_at: c.createdAt,
      parent_id: c.parent_id?._id?.toString() ?? c.parent_id?.toString(),
      parent: c.parent_id?._id ? { full_name: c.parent_id.full_name, email: c.parent_id.email } : null,
      appointment_count: countMap.get(c._id.toString()) ?? 0,
    })));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/metrics', requireAuth, requireRole('admin'), async (req, res) => {
  const windowMin = Math.min(7 * 1440, Math.max(1, Number(req.query.window) || 5));
  const now = Date.now();
  const since = now - windowMin * 60_000;

  // DB round-trip
  let dbPingMs: number | null = null;
  try {
    const t0 = process.hrtime.bigint();
    await mongoose.connection.db?.admin().ping();
    dbPingMs = +(Number(process.hrtime.bigint() - t0) / 1e6).toFixed(1);
  } catch { /* leave null */ }

  let recentApi: ApiSample[], recentWeb: WebSample[], storedRequests: number;
  try {
    ({ api: recentApi, web: recentWeb } = await loadSamples(since));
    storedRequests = (await ApiMetric.estimatedDocumentCount()) + pendingApi.length;
  } catch (err: any) { res.status(500).json({ error: err.message }); return; }

  // Per-endpoint table
  const byRoute = new Map<string, ApiSample[]>();
  for (const s of recentApi) {
    const key = `${s.method} ${s.route}`;
    (byRoute.get(key) ?? byRoute.set(key, []).get(key)!).push(s);
  }
  const endpoints = [...byRoute.entries()].map(([key, list]) => ({
    endpoint: key,
    ...summarize(list.map((s) => s.ms)),
    errors: list.filter((s) => s.status >= 400).length,
    last_ms: +list[list.length - 1].ms.toFixed(1),
  })).sort((a, b) => b.p95 - a.p95);

  // Time series; bucket size grows with the window to keep ~30-100 points
  const bucketMs = windowMin <= 10 ? 10_000 : windowMin <= 60 ? 60_000 : windowMin <= 1440 ? 15 * 60_000 : 2 * 3600_000;
  const firstBucket = Math.floor(since / bucketMs) * bucketMs;
  const apiBuckets = new Map<number, number[]>();
  const webBuckets = new Map<number, number[]>();
  const bucketOf = (t: number) => Math.floor(t / bucketMs) * bucketMs;
  for (const s of recentApi) (apiBuckets.get(bucketOf(s.t)) ?? apiBuckets.set(bucketOf(s.t), []).get(bucketOf(s.t))!).push(s.ms);
  for (const s of recentWeb) if (s.kind !== 'api') (webBuckets.get(bucketOf(s.t)) ?? webBuckets.set(bucketOf(s.t), []).get(bucketOf(s.t))!).push(s.ms);
  const series: { t: number; avg: number | null; p95: number | null; requests: number; page_ms: number | null }[] = [];
  for (let b = firstBucket; b <= now; b += bucketMs) {
    const inB = apiBuckets.get(b) ?? [];
    const webB = webBuckets.get(b) ?? [];
    const sum = summarize(inB);
    series.push({
      t: b,
      avg: inB.length ? sum.avg : null,
      p95: inB.length ? sum.p95 : null,
      requests: inB.length,
      page_ms: webB.length ? summarize(webB).avg : null,
    });
  }

  // Webpage timings grouped by page
  const pageGroups = new Map<string, WebSample[]>();
  for (const s of recentWeb.filter((w) => w.kind !== 'api')) {
    const key = `${s.kind}|${s.page}`;
    (pageGroups.get(key) ?? pageGroups.set(key, []).get(key)!).push(s);
  }
  const avgOf = (vals: (number | undefined)[]) => {
    const v = vals.filter((x): x is number => x !== undefined);
    return v.length ? +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : null;
  };
  const pages = [...pageGroups.entries()].map(([key, list]) => {
    const [kind, page] = key.split('|');
    return {
      kind, page, ...summarize(list.map((s) => s.ms)),
      ttfb: avgOf(list.map((s) => s.ttfb)), fcp: avgOf(list.map((s) => s.fcp)), dcl: avgOf(list.map((s) => s.dcl)),
    };
  }).sort((a, b) => b.avg - a.avg);

  const apiAll = summarize(recentApi.map((s) => s.ms));
  const pageLoads = recentWeb.filter((s) => s.kind === 'page_load');
  const navs = recentWeb.filter((s) => s.kind === 'navigation');
  const clientApi = recentWeb.filter((s) => s.kind === 'api');

  res.json({
    generated_at: now,
    window_min: windowMin,
    uptime_s: Math.round((now - serverStartedAt) / 1000),
    total_requests: storedRequests,
    retention_days: METRICS_RETENTION_DAYS,
    db_ping_ms: dbPingMs,
    api: {
      ...apiAll,
      errors: recentApi.filter((s) => s.status >= 400).length,
      rpm: +(recentApi.length / windowMin).toFixed(1),
    },
    web: {
      page_load: { ...summarize(pageLoads.map((s) => s.ms)), ttfb: avgOf(pageLoads.map((s) => s.ttfb)), fcp: avgOf(pageLoads.map((s) => s.fcp)) },
      navigation: summarize(navs.map((s) => s.ms)),
      client_api: summarize(clientApi.map((s) => s.ms)),
    },
    series,
    endpoints,
    pages,
    recent: recentApi.slice(-25).reverse().map((s) => ({ ...s, ms: +s.ms.toFixed(1) })),
  });
});

// ── DOCTOR ────────────────────────────────────────────────────────────────────
app.get('/api/doctor/profile', requireAuth, requireRole('doctor'), async (req, res) => {
  try {
    const dentist = await Dentist.findOne({ user_id: (req as any).userId });
    if (!dentist) { res.status(404).json({ error: 'No dentist profile linked to this account' }); return; }
    res.json(fmtDentist(dentist));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Doctor edits their own public clinic listing.
app.patch('/api/doctor/profile', requireAuth, requireRole('doctor'), async (req, res) => {
  try {
    const dentist = await Dentist.findOne({ user_id: (req as any).userId });
    if (!dentist) { res.status(404).json({ error: 'No dentist profile linked to this account' }); return; }

    const b = req.body ?? {};
    const str = (v: any) => (typeof v === 'string' ? v.trim() : undefined);

    // Required fields must stay non-empty if provided.
    const name = str(b.name);
    const clinic_name = str(b.clinic_name);
    const city = str(b.city);
    if (name === '') { res.status(400).json({ error: 'Name cannot be empty' }); return; }
    if (clinic_name === '') { res.status(400).json({ error: 'Clinic name cannot be empty' }); return; }
    if (city === '') { res.status(400).json({ error: 'City cannot be empty' }); return; }

    if (name !== undefined) dentist.name = name;
    if (clinic_name !== undefined) dentist.clinic_name = clinic_name;
    if (city !== undefined) dentist.city = city;
    if (str(b.specialty) !== undefined) dentist.specialty = str(b.specialty) || 'Pediatric Dentist';
    if (b.address !== undefined) dentist.address = str(b.address) ?? '';
    if (b.bio !== undefined) dentist.bio = str(b.bio) ?? '';
    if (b.phone !== undefined) dentist.phone = str(b.phone) ?? '';
    if (b.consultation_fee !== undefined) {
      const fee = Number(b.consultation_fee);
      if (!Number.isFinite(fee) || fee < 0) { res.status(400).json({ error: 'Consultation fee must be a positive number' }); return; }
      dentist.consultation_fee = fee;
    }
    if (b.experience_years !== undefined) {
      const yrs = Number(b.experience_years);
      if (!Number.isFinite(yrs) || yrs < 0) { res.status(400).json({ error: 'Experience must be a positive number' }); return; }
      dentist.experience_years = yrs;
    }
    if (b.available_today !== undefined) dentist.available_today = !!b.available_today;

    await dentist.save();
    res.json(fmtDentist(dentist));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.get('/api/doctor/appointments', requireAuth, requireRole('doctor'), async (req, res) => {
  try {
    const dentist = await Dentist.findOne({ user_id: (req as any).userId });
    if (!dentist) { res.status(404).json({ error: 'No dentist profile linked to this account' }); return; }
    const appts = await Appointment.find({ dentist_id: dentist._id })
      .populate('child_id', 'name avatar_emoji date_of_birth')
      .populate('parent_id', 'full_name email')
      .sort({ appointment_date: -1 });
    res.json(appts.map((a: any) => {
      const child = a.child_id as any;
      const parent = a.parent_id as any;
      return {
        id: a._id.toString(),
        parent: parent?._id ? { id: parent._id.toString(), full_name: parent.full_name, email: parent.email } : null,
        child: child?._id ? { id: child._id.toString(), name: child.name, avatar_emoji: child.avatar_emoji, date_of_birth: child.date_of_birth } : null,
        appointment_date: a.appointment_date,
        appointment_time: a.appointment_time,
        reason: a.reason,
        status: a.status,
        is_emergency: a.is_emergency ?? false,
        created_at: a.createdAt,
      };
    }));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/doctor/appointments/:id', requireAuth, requireRole('doctor'), async (req, res) => {
  try {
    const dentist = await Dentist.findOne({ user_id: (req as any).userId });
    if (!dentist) { res.status(404).json({ error: 'No dentist profile linked' }); return; }
    const appt = await Appointment.findOneAndUpdate(
      { _id: req.params.id, dentist_id: dentist._id },
      { status: req.body.status },
      { new: true }
    );
    if (!appt) { res.status(404).json({ error: 'Appointment not found' }); return; }
    res.json({ id: appt._id.toString(), status: appt.status });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── PATIENT HISTORY ───────────────────────────────────────────────────────────
app.get('/api/patient/history', requireAuth, async (req, res) => {
  try {
    const appts = await Appointment.find({ parent_id: (req as any).userId })
      .populate('child_id', 'name avatar_emoji')
      .populate('dentist_id', 'name clinic_name city specialty')
      .sort({ appointment_date: -1 });
    res.json(appts.map(fmtAppt));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── TIPS ──────────────────────────────────────────────────────────────────────
app.get('/api/tips', async (_req, res) => {
  try {
    const tips = await Tip.find().sort({ createdAt: 1 });
    res.json(tips.map((t: any) => ({
      id: t._id.toString(), title: t.title, content: t.content,
      emoji: t.emoji, category: t.category, created_at: t.createdAt,
    })));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── CHAT ──────────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are Buddy, a friendly and knowledgeable pediatric dental assistant.
You help parents with questions about their children's oral health.
Keep answers concise, warm, and easy to understand.
Always recommend consulting a qualified dentist for medical decisions.
Focus on pediatric dental topics: brushing, flossing, diet, tooth development, common issues, and dental visits.`;

app.post('/api/chat', async (req, res) => {
  const { messages } = req.body ?? {};
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'messages array is required' }); return;
  }

  const ollamaHost = process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434';
  const model = process.env.OLLAMA_MODEL ?? 'qwen2.5:0.5b';

  try {
    const response = await fetch(`${ollamaHost}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...messages.map((m: { role: string; content: string }) => ({
            role: m.role === 'user' ? 'user' : 'assistant',
            content: m.content,
          })),
        ],
        stream: false,
      }),
    });

    if (!response.ok) { 
      const errText = await response.text().catch(() => '');
      throw new Error(`Ollama service error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const reply = data.message?.content ?? 'I am having trouble formulating a response.';
    res.json({ reply });
  } catch (err: any) {
    console.error('Ollama chat error:', err.message);
    res.status(500).json({
      error: `Could not reach Ollama model (${model}). Ensure Ollama is running on ${ollamaHost}. Error: ${err.message}`,
    });
  }
});

// ── TEETH PHOTO CHECK ─────────────────────────────────────────────────────────
// Photo → "Good/Bad Teeth" image classifier (steven123/Check_GoodBad_Teeth, converted to 8-bit ONNX
// by scripts/convert_teeth_model.py and committed under server/models/) + parent-reported red-flag symptoms → normal / abnormal / emergency.
// Photos are analysed in memory and never stored.

const TeethCheckSchema = new mongoose.Schema(
  {
    parent_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    child_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Child', default: null },
    category: { type: String, enum: ['normal', 'abnormal', 'emergency'], required: true },
    model_label: { type: String, default: null },
    model_confidence: { type: Number, default: null },
    low_confidence: { type: Boolean, default: false },
    symptoms: { type: [String], default: [] },
    reasons: { type: [String], default: [] },
    inference_ms: { type: Number, default: null },
  },
  { timestamps: true }
);
const TeethCheck = (mongoose.models['TeethCheck'] as mongoose.Model<any>) || mongoose.model('TeethCheck', TeethCheckSchema);

// Symptoms are decided by rules, not the model: a photo cannot show swelling, fever or an injury's severity
const SYMPTOMS: Record<string, { label: string; level: 'emergency' | 'abnormal' }> = {
  swelling:    { label: 'Swelling of the face, cheek or gums', level: 'emergency' },
  injury:      { label: 'Tooth knocked out, broken or pushed in after a fall or hit', level: 'emergency' },
  bleeding:    { label: "Bleeding that won't stop after 10 minutes of pressure", level: 'emergency' },
  fever:       { label: 'Fever together with tooth or mouth pain', level: 'emergency' },
  severe_pain: { label: "Pain that keeps the child awake or isn't helped by painkillers", level: 'abnormal' },
  pain:        { label: 'Toothache or sensitivity to hot, cold or sweet', level: 'abnormal' },
  sores:       { label: 'Mouth sores or ulcers lasting more than 2 weeks', level: 'abnormal' },
};

// Below this the model is close to a coin-flip, so the parent is asked for a clearer photo
const TEETH_LOW_CONFIDENCE = 0.65;

let teethClassifier: Promise<any> | null = null;
function getTeethClassifier() {
  if (!teethClassifier) {
    teethClassifier = (async () => {
      const { pipeline, env } = await import('@huggingface/transformers');
      env.allowRemoteModels = false;
      env.localModelPath = new URL('./models/', import.meta.url).pathname;
      // 8-bit weights (onnx/model_quantized.onnx), committed to the repo
      return pipeline('image-classification', 'teeth-goodbad', { dtype: 'q8' });
    })().catch((err) => { teethClassifier = null; throw err; });
  }
  return teethClassifier;
}

async function classifyTeeth(image: Buffer) {
  const { RawImage } = await import('@huggingface/transformers');
  const classifier = await getTeethClassifier();
  const raw = await RawImage.fromBlob(new Blob([new Uint8Array(image)]));
  const out: { label: string; score: number }[] = await classifier(raw, { top_k: 2 });
  const bad = out.find((o) => o.label === 'Bad Teeth')?.score ?? 0;
  return { bad, good: 1 - bad, label: bad >= 0.5 ? 'Bad Teeth' : 'Good Teeth' };
}

app.get('/api/teeth-check/symptoms', (_req, res) => {
  res.json(Object.entries(SYMPTOMS).map(([id, s]) => ({ id, ...s })));
});

app.post(TEETH_CHECK_PATH, requireAuth, async (req, res) => {
  const { image, child_id, symptoms: rawSymptoms } = req.body ?? {};
  const match = typeof image === 'string' && image.match(/^data:image\/(jpeg|png|webp);base64,(.+)$/);
  if (!match) { res.status(400).json({ error: 'A JPEG, PNG or WebP photo is required' }); return; }
  const symptoms = (Array.isArray(rawSymptoms) ? rawSymptoms : []).filter((s: any) => typeof s === 'string' && SYMPTOMS[s]);

  if (child_id) {
    const child = await Child.findOne({ _id: child_id, parent_id: (req as any).userId }).catch(() => null);
    if (!child) { res.status(404).json({ error: 'Child not found' }); return; }
  }

  let prediction: Awaited<ReturnType<typeof classifyTeeth>>;
  const t0 = process.hrtime.bigint();
  try {
    prediction = await classifyTeeth(Buffer.from(match[2], 'base64'));
  } catch (err: any) {
    console.error('Teeth model error:', err.message);
    const missing = /could not locate|not found|no such file/i.test(err.message);
    res.status(503).json({
      error: missing
        ? 'The teeth-check model is not installed on the server. Run scripts/convert_teeth_model.py.'
        : 'Could not analyse this photo. Please try a different photo.',
    });
    return;
  }
  const inferenceMs = +(Number(process.hrtime.bigint() - t0) / 1e6).toFixed(1);

  const confidence = Math.max(prediction.bad, prediction.good);
  const lowConfidence = confidence < TEETH_LOW_CONFIDENCE;
  const emergencySymptoms = symptoms.filter((s: string) => SYMPTOMS[s].level === 'emergency');
  const abnormalSymptoms = symptoms.filter((s: string) => SYMPTOMS[s].level === 'abnormal');

  const reasons: string[] = [];
  let category: 'normal' | 'abnormal' | 'emergency';
  if (emergencySymptoms.length) {
    category = 'emergency';
    reasons.push(...emergencySymptoms.map((s: string) => SYMPTOMS[s].label));
  } else if ((prediction.label === 'Bad Teeth' && !lowConfidence) || abnormalSymptoms.length) {
    category = 'abnormal';
    if (prediction.label === 'Bad Teeth' && !lowConfidence) reasons.push('The photo shows possible signs of tooth or gum problems');
    reasons.push(...abnormalSymptoms.map((s: string) => SYMPTOMS[s].label));
  } else {
    category = 'normal';
    reasons.push(lowConfidence ? 'The photo was unclear, and no warning symptoms were reported' : 'No visible problems were detected in the photo, and no warning symptoms were reported');
  }

  try {
    const saved = await TeethCheck.create({
      parent_id: (req as any).userId, child_id: child_id || null, category,
      model_label: prediction.label, model_confidence: +confidence.toFixed(4), low_confidence: lowConfidence,
      symptoms, reasons, inference_ms: inferenceMs,
    });
    res.json({
      id: saved._id.toString(), category, reasons, low_confidence: lowConfidence,
      model: { label: prediction.label, confidence: +confidence.toFixed(3), scores: { bad: +prediction.bad.toFixed(3), good: +prediction.good.toFixed(3) } },
      inference_ms: inferenceMs,
      created_at: saved.createdAt,
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.get('/api/teeth-checks', requireAuth, async (req, res) => {
  try {
    const checks = await TeethCheck.find({ parent_id: (req as any).userId })
      .populate('child_id', 'name avatar_emoji').sort({ createdAt: -1 }).limit(50);
    res.json(checks.map((c: any) => ({
      id: c._id.toString(), category: c.category, reasons: c.reasons, symptoms: c.symptoms,
      low_confidence: c.low_confidence, model_label: c.model_label, model_confidence: c.model_confidence,
      child: c.child_id?._id ? { id: c.child_id._id.toString(), name: c.child_id.name, avatar_emoji: c.child_id.avatar_emoji } : null,
      created_at: c.createdAt,
    })));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── SEED ──────────────────────────────────────────────────────────────────────
const DENTISTS = [
  { name: 'Dr. Priya Sharma', specialty: 'Pediatric Dentist', clinic_name: 'SmileCare Kids', city: 'Mumbai', address: '12 Marine Drive, Mumbai', bio: 'Dr. Sharma has 12 years of experience specializing in pediatric dentistry. She creates a fun, comfortable environment for children.', rating: 4.9, experience_years: 12, consultation_fee: 800, available_today: true, phone: '+91-9876543210' },
  { name: 'Dr. Arjun Mehta', specialty: 'Pediatric & Preventive Dentist', clinic_name: 'Happy Teeth Clinic', city: 'Delhi', address: '45 Connaught Place, New Delhi', bio: 'Dr. Mehta focuses on preventive care and early intervention to ensure children maintain healthy smiles for life.', rating: 4.8, experience_years: 10, consultation_fee: 700, available_today: true, phone: '+91-9876543211' },
  { name: 'Dr. Sunita Rao', specialty: 'Pediatric Orthodontist', clinic_name: 'BrightSmile Center', city: 'Bangalore', address: '78 MG Road, Bangalore', bio: 'Dr. Rao specializes in early orthodontic treatment for children, helping guide proper jaw and teeth development.', rating: 4.7, experience_years: 15, consultation_fee: 1000, available_today: false, phone: '+91-9876543212' },
  { name: 'Dr. Kavya Nair', specialty: 'Pediatric Dentist', clinic_name: 'Kids Dental Hub', city: 'Chennai', address: '23 Anna Nagar, Chennai', bio: 'Dr. Nair is passionate about making dental visits enjoyable for children. She uses the latest pain-free techniques.', rating: 4.9, experience_years: 8, consultation_fee: 600, available_today: true, phone: '+91-9876543213' },
  { name: 'Dr. Rahul Gupta', specialty: 'Pediatric & Family Dentist', clinic_name: 'Family Smile Clinic', city: 'Pune', address: '56 FC Road, Pune', bio: 'Dr. Gupta provides comprehensive dental care for the whole family with a special focus on children under 12.', rating: 4.6, experience_years: 9, consultation_fee: 650, available_today: false, phone: '+91-9876543214' },
  { name: 'Dr. Meena Iyer', specialty: 'Pediatric Dentist', clinic_name: 'Little Smiles Dental', city: 'Hyderabad', address: '89 Banjara Hills, Hyderabad', bio: 'Dr. Iyer creates a welcoming, child-friendly atmosphere. She specializes in treating dental anxiety in young patients.', rating: 4.8, experience_years: 11, consultation_fee: 750, available_today: true, phone: '+91-9876543215' },
];

const TIPS = [
  { title: 'Start brushing early', content: "Begin brushing your baby's gums with a soft cloth even before teeth appear. Once teeth erupt, use a tiny smear of fluoride toothpaste.", emoji: '🦷', category: 'Habits' },
  { title: 'Two minutes, twice a day', content: 'Children should brush for at least 2 minutes, twice daily — once in the morning and once before bed. Use a timer or fun song to make it engaging.', emoji: '⏱️', category: 'Habits' },
  { title: 'Limit sugary snacks', content: 'Bacteria in the mouth feed on sugar and produce acids that cause cavities. Limit juice, candy, and sticky snacks — opt for water, cheese, and fresh fruit instead.', emoji: '🍎', category: 'Diet' },
  { title: 'First dental visit by age 1', content: 'The American Academy of Pediatric Dentistry recommends the first dental visit by age 1 or within 6 months of the first tooth appearing.', emoji: '📅', category: 'Visits' },
  { title: 'Floss daily from age 2', content: 'As soon as your child has two teeth that touch, start flossing. Use child-sized flossers to make it easier and fun.', emoji: '🧵', category: 'Habits' },
  { title: 'Fluoride protects teeth', content: 'Fluoride strengthens tooth enamel and prevents cavities. Use a rice-grain amount for children under 3, and a pea-size amount from ages 3–6.', emoji: '💧', category: 'Protection' },
  { title: 'Avoid bottle at bedtime', content: 'Putting a baby to bed with a bottle of milk or juice can cause severe tooth decay. Use water in bedtime bottles instead.', emoji: '🍼', category: 'Habits' },
  { title: 'Wear a mouthguard for sports', content: 'Custom-fitted mouthguards protect teeth during contact sports. They can prevent knocked-out or broken teeth.', emoji: '⚽', category: 'Protection' },
  { title: 'Watch for thumb-sucking', content: 'Thumb-sucking is normal up to age 2–3, but persistent habits after age 4 can affect tooth alignment.', emoji: '👍', category: 'Development' },
  { title: 'Drink plenty of water', content: 'Water is the best drink for teeth. It rinses away food particles and fluoridated tap water strengthens enamel.', emoji: '💧', category: 'Diet' },
  { title: 'Check for early signs', content: "Look for white or brown spots on your child's teeth — early signs of cavities. Catching them early makes treatment much simpler.", emoji: '🔍', category: 'Visits' },
  { title: 'Make brushing fun', content: "Let your child pick their own toothbrush with their favourite character. Play music or brush together to make it an enjoyable routine.", emoji: '🎵', category: 'Habits' },
];

const DEMO_USERS = [
  { email: 'admin@dentibuddy.com',   password: 'admin123',   full_name: 'Admin User',   role: 'admin'   },
  { email: 'doctor@dentibuddy.com',  password: 'doctor123',  full_name: 'Dr. Demo Doctor', role: 'doctor' },
  { email: 'patient@dentibuddy.com', password: 'patient123', full_name: 'Demo Patient', role: 'patient' },
];

app.post('/api/seed', async (_req, res) => {
  try {
    // Note: we no longer seed fake dentists — the directory only shows real website signups.
    const tipCount = await Tip.countDocuments();
    let dentistsAdded = 0, tipsAdded = 0;
    if (tipCount === 0) { await Tip.insertMany(TIPS); tipsAdded = TIPS.length; }

    const usersCreated: { email: string; password: string; role: string; full_name: string }[] = [];
    for (const demo of DEMO_USERS) {
      const exists = await User.findOne({ email: demo.email });
      if (!exists) {
        const hashed = await bcrypt.hash(demo.password, 12);
        await User.create({ email: demo.email, password: hashed, full_name: demo.full_name, role: demo.role });
        usersCreated.push({ email: demo.email, password: demo.password, role: demo.role, full_name: demo.full_name });
      }
    }

    // Give the demo doctor a real linked clinic profile so its dashboard (and a bookable listing) works.
    const doctorUser = await User.findOne({ email: 'doctor@dentibuddy.com' });
    if (doctorUser) {
      const existing = await Dentist.findOne({ user_id: doctorUser._id });
      if (!existing) {
        await Dentist.create({
          name: doctorUser.full_name || 'Dr. Demo Doctor',
          clinic_name: 'DentiBuddy Demo Clinic',
          city: 'Chennai',
          specialty: 'Pediatric Dentist',
          rating: null,
          self_registered: true,
          user_id: doctorUser._id,
        });
        dentistsAdded = 1;
      }
    }

    res.json({
      message: 'Seed complete',
      dentistsAdded,
      tipsAdded,
      demoUsers: DEMO_USERS.map(u => ({ email: u.email, password: u.password, role: u.role, name: u.full_name })),
      newUsersCreated: usersCreated.length,
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀  API server → http://localhost:${PORT}`);
  console.log(`    Seed sample data: POST http://localhost:${PORT}/api/seed\n`);
});

connectDB().catch((err) => {
  console.error('\n❌  MongoDB connection failed:', err.message);
  console.error('    Fix: update MONGODB_URI password in .env and whitelist your IP in Atlas\n');
});
