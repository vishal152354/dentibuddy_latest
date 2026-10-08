import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { MobileShell, PageHeader } from "@/components/mobile-shell";
import { useAuth } from "@/context/auth-context";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Star, MapPin, Phone, BadgeCheck, KeyRound, Mail, UserCheck, Stethoscope, CalendarCheck, Baby, Gauge } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookingsPanel, useAdminBookings } from "@/components/admin/bookings-panel";
import { ChildrenPanel, useAdminChildren } from "@/components/admin/children-panel";
import { PerformancePanel } from "@/components/admin/performance-panel";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
  ssr: false,
});

interface Doctor {
  id: string;
  name: string;
  specialty: string;
  clinic_name: string;
  city: string;
  address: string;
  bio: string;
  rating: number;
  experience_years: number;
  consultation_fee: number;
  available_today: boolean;
  phone: string;
  user_id: string | null;
}

const EMPTY_FORM = {
  name: '', specialty: 'Pediatric Dentist', clinic_name: '', city: '',
  address: '', bio: '', rating: '4.5', experience_years: '5',
  consultation_fee: '500', available_today: false, phone: '',
  login_email: '', login_password: '', new_password: '',
};

function AdminPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<'add' | 'edit' | null>(null);
  const [editing, setEditing] = useState<Doctor | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<Doctor | null>(null);
  const [tab, setTab] = useState('doctors');
  const isAdmin = user?.role === 'admin';
  const { data: bookings = [] } = useAdminBookings(isAdmin);
  const { data: children = [] } = useAdminChildren(isAdmin);

  useEffect(() => {
    if (user && user.role !== 'admin') navigate({ to: '/home' });
  }, [user, navigate]);

  const { data: doctors = [], isLoading } = useQuery<Doctor[]>({
    queryKey: ['admin-doctors'],
    queryFn: () => api.get('/admin/doctors'),
    enabled: user?.role === 'admin',
  });

  const addMutation = useMutation({
    mutationFn: (body: any) => api.post('/admin/doctors', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-doctors'] }); toast.success('Doctor added successfully'); closeDialog(); },
    onError: (e: any) => toast.error(e.message ?? 'Failed to add doctor'),
  });

  const editMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) => api.put(`/admin/doctors/${id}`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-doctors'] }); toast.success('Doctor updated'); closeDialog(); },
    onError: (e: any) => toast.error(e.message ?? 'Failed to update doctor'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/doctors/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-doctors'] }); toast.success('Doctor removed'); setDeleteTarget(null); },
    onError: (e: any) => toast.error(e.message ?? 'Failed to delete doctor'),
  });

  function openAdd() {
    setForm(EMPTY_FORM);
    setEditing(null);
    setDialog('add');
  }

  function openEdit(d: Doctor) {
    setForm({
      name: d.name, specialty: d.specialty, clinic_name: d.clinic_name,
      city: d.city, address: d.address, bio: d.bio,
      rating: String(d.rating), experience_years: String(d.experience_years),
      consultation_fee: String(d.consultation_fee),
      available_today: d.available_today, phone: d.phone,
      login_email: '', login_password: '', new_password: '',
    });
    setEditing(d);
    setDialog('edit');
  }

  function closeDialog() { setDialog(null); setEditing(null); }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const base = {
      name: form.name, specialty: form.specialty, clinic_name: form.clinic_name,
      city: form.city, address: form.address, bio: form.bio,
      rating: parseFloat(form.rating) || 4.5,
      experience_years: parseInt(form.experience_years) || 5,
      consultation_fee: parseInt(form.consultation_fee) || 500,
      available_today: form.available_today, phone: form.phone,
    };
    if (dialog === 'add') {
      addMutation.mutate({ ...base, login_email: form.login_email, login_password: form.login_password });
    } else if (editing) {
      const body: any = { ...base };
      if (form.new_password.trim()) body.login_password = form.new_password;
      editMutation.mutate({ id: editing.id, body });
    }
  }

  const busy = addMutation.isPending || editMutation.isPending;

  return (
    <MobileShell>
      <div className="max-w-screen-xl mx-auto px-5 pb-6 lg:px-6 lg:py-8">
        <PageHeader
          title="Admin Panel"
          subtitle="Doctors, bookings, children and live performance"
          right={tab === 'doctors' ? (
            <Button onClick={openAdd} className="rounded-2xl gap-2">
              <Plus className="h-4 w-4" /> Add Doctor
            </Button>
          ) : undefined}
        />

        <Tabs value={tab} onValueChange={setTab}>
          <div className="overflow-x-auto -mx-5 px-5 lg:mx-0 lg:px-0 mb-4">
            <TabsList className="h-10 rounded-xl">
              <TabsTrigger value="doctors" className="rounded-lg gap-1.5 px-3"><Stethoscope className="h-3.5 w-3.5" /> Doctors <Count n={doctors.length} /></TabsTrigger>
              <TabsTrigger value="bookings" className="rounded-lg gap-1.5 px-3"><CalendarCheck className="h-3.5 w-3.5" /> Bookings <Count n={bookings.length} /></TabsTrigger>
              <TabsTrigger value="children" className="rounded-lg gap-1.5 px-3"><Baby className="h-3.5 w-3.5" /> Children <Count n={children.length} /></TabsTrigger>
              <TabsTrigger value="performance" className="rounded-lg gap-1.5 px-3"><Gauge className="h-3.5 w-3.5" /> Performance</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="bookings"><BookingsPanel enabled={isAdmin} /></TabsContent>
          <TabsContent value="children"><ChildrenPanel enabled={isAdmin} /></TabsContent>
          <TabsContent value="performance"><PerformancePanel enabled={isAdmin && tab === 'performance'} /></TabsContent>

          <TabsContent value="doctors">
        {isLoading ? (
          <p className="text-center text-muted-foreground py-16">Loading…</p>
        ) : doctors.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-muted-foreground mb-4">No doctors yet. Add your first doctor.</p>
            <Button onClick={openAdd} className="rounded-2xl gap-2"><Plus className="h-4 w-4" /> Add First Doctor</Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {doctors.map((d) => (
              <div key={d.id} className="rounded-2xl bg-card border border-border p-5 shadow-[var(--shadow-card)]">
                <div className="flex gap-4">
                  <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-primary/20 to-mint flex items-center justify-center text-3xl shrink-0">
                    👩‍⚕️
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{d.name}</p>
                        <p className="text-xs text-muted-foreground">{d.specialty}</p>
                      </div>
                      <div className="flex items-center gap-1 text-sm font-bold shrink-0">
                        <Star className="h-3.5 w-3.5 fill-sunshine text-sunshine" /> {d.rating}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                      <MapPin className="h-3 w-3 shrink-0" /> {d.clinic_name} · {d.city}
                    </p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mb-2">
                      <Phone className="h-3 w-3 shrink-0" /> {d.phone || '—'}
                      <BadgeCheck className="h-3 w-3 ml-2 shrink-0" /> {d.experience_years} yrs
                    </p>
                    <div className="flex items-center gap-2">
                      {d.available_today && (
                        <span className="text-[10px] font-bold uppercase rounded-full bg-mint text-mint-foreground px-2.5 py-0.5">
                          Available
                        </span>
                      )}
                      {d.user_id ? (
                        <span className="text-[10px] font-bold uppercase rounded-full bg-primary/10 text-primary px-2.5 py-0.5 flex items-center gap-1">
                          <UserCheck className="h-2.5 w-2.5" /> Has Login
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold uppercase rounded-full bg-destructive/10 text-destructive px-2.5 py-0.5">
                          No Login
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 mt-4 pt-4 border-t border-border">
                  <Button variant="outline" size="sm" className="flex-1 rounded-xl gap-1.5" onClick={() => openEdit(d)}>
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>
                  <Button variant="destructive" size="sm" className="flex-1 rounded-xl gap-1.5" onClick={() => setDeleteTarget(d)}>
                    <Trash2 className="h-3.5 w-3.5" /> Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Add / Edit Dialog */}
      <Dialog open={dialog !== null} onOpenChange={(o) => { if (!o) closeDialog(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dialog === 'add' ? 'Add Doctor' : 'Edit Doctor'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Doctor profile fields */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Clinic Profile</p>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Full name *" value={form.name} onChange={(v) => setForm(f => ({ ...f, name: v }))} placeholder="Dr. Jane Doe" required />
                  <Field label="Specialty" value={form.specialty} onChange={(v) => setForm(f => ({ ...f, specialty: v }))} placeholder="Pediatric Dentist" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Clinic name *" value={form.clinic_name} onChange={(v) => setForm(f => ({ ...f, clinic_name: v }))} placeholder="SmileCare Kids" required />
                  <Field label="City *" value={form.city} onChange={(v) => setForm(f => ({ ...f, city: v }))} placeholder="Mumbai" required />
                </div>
                <Field label="Address" value={form.address} onChange={(v) => setForm(f => ({ ...f, address: v }))} placeholder="12 Marine Drive" />
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Bio</Label>
                  <Textarea value={form.bio} onChange={(e) => setForm(f => ({ ...f, bio: e.target.value }))} placeholder="Brief introduction…" rows={2} className="rounded-xl bg-card resize-none" />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Rating (0-5)" value={form.rating} onChange={(v) => setForm(f => ({ ...f, rating: v }))} type="number" placeholder="4.5" />
                  <Field label="Exp. (yrs)" value={form.experience_years} onChange={(v) => setForm(f => ({ ...f, experience_years: v }))} type="number" placeholder="5" />
                  <Field label="Fee (₹)" value={form.consultation_fee} onChange={(v) => setForm(f => ({ ...f, consultation_fee: v }))} type="number" placeholder="500" />
                </div>
                <Field label="Phone" value={form.phone} onChange={(v) => setForm(f => ({ ...f, phone: v }))} placeholder="+91-9876543210" />
                <div className="flex items-center gap-2">
                  <input id="available" type="checkbox" checked={form.available_today} onChange={(e) => setForm(f => ({ ...f, available_today: e.target.checked }))} className="h-4 w-4 rounded" />
                  <Label htmlFor="available" className="text-sm font-medium cursor-pointer">Available today</Label>
                </div>
              </div>
            </div>

            {/* Login credentials section */}
            <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
              {dialog === 'add' ? (
                <>
                  <div className="flex items-center gap-2 mb-1">
                    <KeyRound className="h-4 w-4 text-primary" />
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Doctor Login Credentials</p>
                  </div>
                  <p className="text-xs text-muted-foreground">Set the email and password the doctor will use to log in.</p>
                  <Field
                    label="Login email *"
                    value={form.login_email}
                    onChange={(v) => setForm(f => ({ ...f, login_email: v }))}
                    type="email"
                    placeholder="doctor@clinic.com"
                    required
                    icon={<Mail className="h-3.5 w-3.5" />}
                  />
                  <Field
                    label="Password * (min 6 chars)"
                    value={form.login_password}
                    onChange={(v) => setForm(f => ({ ...f, login_password: v }))}
                    type="password"
                    placeholder="••••••••"
                    required
                    icon={<KeyRound className="h-3.5 w-3.5" />}
                  />
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 mb-1">
                    <KeyRound className="h-4 w-4 text-primary" />
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Reset Password</p>
                  </div>
                  <p className="text-xs text-muted-foreground">Leave blank to keep the current password unchanged.</p>
                  <Field
                    label="New password (optional)"
                    value={form.new_password}
                    onChange={(v) => setForm(f => ({ ...f, new_password: v }))}
                    type="password"
                    placeholder="••••••••  (leave blank to keep current)"
                    icon={<KeyRound className="h-3.5 w-3.5" />}
                  />
                </>
              )}
            </div>

            <DialogFooter className="pt-1">
              <Button type="button" variant="outline" onClick={closeDialog} className="rounded-xl">Cancel</Button>
              <Button type="submit" disabled={busy} className="rounded-xl">
                {busy ? 'Saving…' : dialog === 'add' ? 'Add Doctor' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={deleteTarget !== null} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove Doctor</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to remove <strong>{deleteTarget?.name}</strong>? This cannot be undone.
          </p>
          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} className="rounded-xl">Cancel</Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              className="rounded-xl"
            >
              {deleteMutation.isPending ? 'Removing…' : 'Remove'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MobileShell>
  );
}

function Count({ n }: { n: number }) {
  return <span className="text-[10px] font-bold rounded-full bg-primary/10 text-primary px-1.5 py-0.5 tabular-nums">{n}</span>;
}

function Field({
  label, value, onChange, type = 'text', placeholder, required, icon,
}: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; required?: boolean; icon?: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      <div className="relative">
        {icon && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">{icon}</span>}
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          type={type}
          placeholder={placeholder}
          required={required}
          className={`h-10 rounded-xl bg-card ${icon ? 'pl-9' : ''}`}
        />
      </div>
    </div>
  );
}
