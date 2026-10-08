import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import { MobileShell } from "@/components/mobile-shell";
import { useTheme } from "@/components/theme-toggle";
import { api } from "@/lib/api";
import { Calendar, MessageCircle, Siren, Stethoscope, Lightbulb, Plus, ChevronRight, Star, ScanFace } from "lucide-react";

export const Route = createFileRoute("/home")({
  component: HomePage,
  ssr: false,
});

function HomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // The patient home (dentists, "my kids", booking) is not for doctors/admins.
  useEffect(() => {
    if (user?.role === "doctor") navigate({ to: "/doctor" });
    else if (user?.role === "admin") navigate({ to: "/admin" });
  }, [user, navigate]);

  const { data: children = [] } = useQuery({
    queryKey: ["children", user?.id],
    enabled: !!user,
    queryFn: () => api.get<any[]>("/children"),
  });

  const { data: appointments = [] } = useQuery({
    queryKey: ["appointments", user?.id],
    enabled: !!user,
    queryFn: () => api.get<any[]>("/appointments"),
  });

  const { data: featuredDentists = [] } = useQuery({
    queryKey: ["dentists"],
    queryFn: () => api.get<any[]>("/dentists"),
  });

  const { data: tips = [] } = useQuery({
    queryKey: ["tips"],
    queryFn: () => api.get<any[]>("/tips"),
  });

  const today = new Date().toISOString().slice(0, 10);
  const nextAppt = appointments
    .filter((a: any) => a.appointment_date >= today && a.status !== "cancelled")
    .sort((a: any, b: any) => a.appointment_date.localeCompare(b.appointment_date))[0] ?? null;

  const tip = tips.length > 0 ? tips[Math.floor(Math.random() * Math.min(tips.length, 20))] : null;
  const topDentists = featuredDentists.slice(0, 6);

  const firstName = (user?.full_name ?? user?.email ?? "there").split(" ")[0];

  return (
    <MobileShell>
      {/* Hero section */}
      <div className="bg-gradient-to-b from-primary/15 via-primary/5 to-transparent">
        <div className="max-w-screen-xl mx-auto px-5 py-6 lg:px-6 lg:py-10">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[auto_1fr_auto] lg:gap-8 lg:items-center">
            <div>
              <p className="text-sm uppercase tracking-wide text-muted-foreground font-medium">Hi parent 👋</p>
              <h1 className="text-4xl font-bold mt-1">Hello, {firstName}</h1>
              <p className="text-muted-foreground mt-2">Let's keep little smiles bright today.</p>

              {nextAppt ? (
                <Link to="/appointments" className="mt-5 inline-flex items-center gap-3 rounded-2xl bg-card border border-border px-5 py-4 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-soft)] transition-shadow">
                  <div className="h-11 w-11 rounded-xl bg-mint flex items-center justify-center text-mint-foreground shrink-0">
                    <Calendar className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Next visit</p>
                    <p className="font-semibold">{nextAppt.children?.name} · {nextAppt.dentists?.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(nextAppt.appointment_date).toDateString()} at {nextAppt.appointment_time?.slice(0, 5)}
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0 ml-4" />
                </Link>
              ) : (
                <Link to="/dentists" className="mt-5 inline-flex items-center gap-3 rounded-2xl bg-card border border-border px-5 py-4 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-soft)] transition-shadow">
                  <div className="h-11 w-11 rounded-xl bg-sunshine flex items-center justify-center text-sunshine-foreground shrink-0">
                    <Plus className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-semibold">No upcoming visit</p>
                    <p className="text-xs text-muted-foreground">Click to book a pediatric dentist</p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground ml-4" />
                </Link>
              )}
            </div>

            {/* Preventive-care feature card fills the hero on desktop */}
            <PreventiveCareCard className="hidden lg:flex justify-self-center" />

            {/* Quick actions */}
            <div className="grid grid-cols-4 gap-3 lg:grid-cols-2 lg:shrink-0">
              <Quick to="/dentists" icon={<Stethoscope className="h-5 w-5" />} label="Dentists" tone="bg-secondary text-primary" />
              <Quick to="/chatbot" icon={<MessageCircle className="h-5 w-5" />} label="Buddy AI" tone="bg-mint text-mint-foreground" />
              <Quick to="/emergency" icon={<Siren className="h-5 w-5" />} label="Emergency" tone="bg-coral text-coral-foreground" />
              <Quick to="/tips" icon={<Lightbulb className="h-5 w-5" />} label="Tips" tone="bg-sunshine text-sunshine-foreground" />
              <Link to="/teeth-check" className="col-span-4 lg:col-span-2 flex items-center gap-3 rounded-2xl bg-card border border-border p-3 shadow-[var(--shadow-card)] hover:border-primary transition-colors">
                <span className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0"><ScanFace className="h-5 w-5" /></span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">Teeth Check</span>
                  <span className="block text-xs text-muted-foreground truncate">Snap a photo to see if a dentist visit is needed</span>
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto shrink-0" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Main content grid */}
      <div className="max-w-screen-xl mx-auto px-5 py-5 lg:px-6 lg:py-8 grid grid-cols-1 lg:grid-cols-3 gap-5 lg:gap-8">
        {/* Left: Top rated dentists */}
        <div className="lg:col-span-2 space-y-5 lg:space-y-8">
          <section>
            <SectionHeader title="Top rated nearby" actionLabel="See all dentists" actionTo="/dentists" />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-4">
              {topDentists.map((d: any) => (
                <Link
                  key={d.id}
                  to="/dentists/$id"
                  params={{ id: d.id }}
                  className="flex items-center gap-3 rounded-2xl bg-card border border-border p-4 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-soft)] transition-shadow"
                >
                  <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-primary/20 to-mint flex items-center justify-center text-2xl shrink-0">
                    👩‍⚕️
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{d.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{d.clinic_name} · {d.city}</p>
                    <p className="text-xs font-medium text-primary mt-1">₹{d.consultation_fee} · {d.experience_years}+ yrs</p>
                  </div>
                  <div className="flex items-center gap-1 text-sm font-semibold shrink-0">
                    {d.rating ? (
                      <><Star className="h-3.5 w-3.5 fill-sunshine text-sunshine" /> {d.rating}</>
                    ) : (
                      <span className="text-xs font-medium text-muted-foreground">New</span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        </div>

        {/* Right: Children + Tip */}
        <div className="space-y-6">
          <section>
            <SectionHeader title="My kids" actionLabel="Manage" actionTo="/children" />
            <div className="space-y-2">
              {children.map((c: any) => (
                <div key={c.id} className="flex items-center gap-3 rounded-2xl bg-card border border-border px-4 py-3 shadow-[var(--shadow-card)]">
                  <div className="h-10 w-10 rounded-xl bg-secondary flex items-center justify-center text-xl shrink-0">
                    {c.avatar_emoji ?? "🧒"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{c.name}</p>
                    {c.date_of_birth && (
                      <p className="text-xs text-muted-foreground">
                        {Math.max(0, new Date().getFullYear() - new Date(c.date_of_birth).getFullYear())} yrs old
                      </p>
                    )}
                  </div>
                </div>
              ))}
              <Link
                to="/children"
                className="flex items-center gap-3 rounded-2xl border-2 border-dashed border-border px-4 py-3 text-muted-foreground hover:text-primary hover:border-primary transition-colors"
              >
                <Plus className="h-4 w-4" />
                <span className="text-sm font-medium">Add a child</span>
              </Link>
            </div>
          </section>

          {tip && (
            <section>
              <div className="rounded-2xl bg-gradient-to-br from-mint to-accent p-5 shadow-[var(--shadow-card)]">
                <div className="flex items-center gap-2 text-mint-foreground/80 text-xs font-medium uppercase tracking-wide mb-2">
                  <Lightbulb className="h-3.5 w-3.5" /> Tip of the day
                </div>
                <p className="font-semibold text-mint-foreground">{tip.emoji} {tip.title}</p>
                <p className="mt-1.5 text-sm text-mint-foreground/80 leading-relaxed">{tip.content}</p>
              </div>
            </section>
          )}
        </div>
      </div>
    </MobileShell>
  );
}

function PreventiveCareCard({ className = "" }: { className?: string }) {
  // "Preventive care" feature card: glowing gradient-outlined tooth on faint orbit
  // rings. Dark & dramatic in dark mode; a soft frosted panel that camouflages into
  // the hero in light mode.
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const cardStyle: React.CSSProperties = isDark
    ? {
        background: "radial-gradient(130% 120% at 50% -10%, #17263f 0%, #0d1728 55%, #0a1220 100%)",
        border: "1px solid rgba(255,255,255,0.07)",
        boxShadow: "0 24px 60px -24px rgba(2,8,20,0.7)",
      }
    : {
        background: "radial-gradient(130% 120% at 50% -10%, rgba(255,255,255,0.55) 0%, rgba(233,244,255,0.45) 55%, rgba(219,234,254,0.32) 100%)",
        border: "1px solid rgba(56,132,199,0.14)",
        boxShadow: "0 20px 50px -30px rgba(30,64,110,0.35)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
      };

  const ringStroke = isDark ? "rgba(150,175,205,0.13)" : "rgba(30,80,130,0.13)";
  const ringStrokeFaint = isDark ? "rgba(150,175,205,0.08)" : "rgba(30,80,130,0.07)";
  const labelColor = isDark ? "text-slate-400" : "text-slate-500";

  return (
    <div
      className={`relative flex-col justify-between w-[380px] xl:w-[430px] h-[340px] xl:h-[370px] rounded-[28px] p-7 overflow-hidden ${className}`}
      style={cardStyle}
    >
      <span className={`relative z-10 text-[11px] font-semibold tracking-[0.28em] ${labelColor}`}>
        PREVENTIVE CARE
      </span>

      <svg
        className="absolute inset-0 m-auto pointer-events-none"
        width="300"
        height="280"
        viewBox="0 0 300 280"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="pcTooth" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4fe0cf" />
            <stop offset="55%" stopColor="#5bd6b8" />
            <stop offset="100%" stopColor="#f2c94c" />
          </linearGradient>
          <radialGradient id="pcGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(79,224,207,0.28)" />
            <stop offset="100%" stopColor="rgba(79,224,207,0)" />
          </radialGradient>
        </defs>

        {/* faint orbit rings */}
        <g stroke={ringStroke} strokeWidth="1" fill="none">
          <circle cx="150" cy="130" r="50" />
          <circle cx="150" cy="130" r="76" />
          <circle cx="150" cy="130" r="102" />
          <circle cx="150" cy="130" r="128" stroke={ringStrokeFaint} />
        </g>

        {/* glow behind the tooth */}
        <circle cx="150" cy="126" r="78" fill="url(#pcGlow)" />

        {/* orbit dots */}
        <circle cx="150" cy="54" r="3.5" fill="#4fe0cf" style={{ filter: "drop-shadow(0 0 5px rgba(79,224,207,0.9))" }} />
        <circle cx="248" cy="156" r="4.5" fill="#f2c94c" style={{ filter: "drop-shadow(0 0 5px rgba(242,201,76,0.9))" }} />

        {/* tooth — centered at ~ (150,126) */}
        <g transform="translate(89 55)" style={{ filter: "drop-shadow(0 0 7px rgba(79,224,207,0.5)) drop-shadow(0 0 4px rgba(242,201,76,0.25))" }}>
          <path
            d="M60 8C36 8 20 26 20 54c0 20 3 40 10 62 3.6 11 10 19 17 19 7 0 10-8 12-19 1-5 3-5 4 0 2 11 5 19 12 19 7 0 13.4-8 17-19 7-22 10-42 10-62C122 26 106 8 82 8 74 8 68 8 60 8Z"
            fill="rgba(79,224,207,0.05)"
            stroke="url(#pcTooth)"
            strokeWidth="4"
            strokeLinejoin="round"
          />
          {/* inner highlight arc */}
          <path d="M45 40c-6 8-9 18-8 30" stroke="#7fe9dc" strokeOpacity="0.85" strokeWidth="3.5" strokeLinecap="round" fill="none" />
        </g>
      </svg>

      <span className={`relative z-10 text-center text-[11px] tracking-[0.24em] ${labelColor}`}>
        CARED FOR, EVERY DAY
      </span>
    </div>
  );
}

function Quick({ to, icon, label, tone }: { to: string; icon: React.ReactNode; label: string; tone: string }) {
  return (
    <Link to={to as any} className="flex flex-col items-center gap-2">
      <div className={`h-16 w-16 rounded-2xl ${tone} flex items-center justify-center shadow-[var(--shadow-card)]`}>
        {icon}
      </div>
      <span className="text-xs font-medium">{label}</span>
    </Link>
  );
}

function SectionHeader({ title, actionLabel, actionTo }: { title: string; actionLabel?: string; actionTo?: string }) {
  return (
    <div className="flex items-end justify-between mb-4">
      <h2 className="text-xl font-bold tracking-tight">{title}</h2>
      {actionTo && (
        <Link to={actionTo as any} className="text-sm font-medium text-primary hover:underline">
          {actionLabel} →
        </Link>
      )}
    </div>
  );
}
