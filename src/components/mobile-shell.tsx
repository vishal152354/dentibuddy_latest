import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { Home, Calendar, MessageCircle, Siren, User, Stethoscope, Lightbulb, ShieldCheck, ClipboardList, History, ScanFace } from "lucide-react";
import { ReactNode, useEffect } from "react";
import { useAuth } from "@/context/auth-context";
import { ThemeToggle } from "@/components/theme-toggle";

const patientMobileTabs = [
  { to: "/home", label: "Home", icon: Home },
  { to: "/appointments", label: "Visits", icon: Calendar },
  { to: "/chatbot", label: "Buddy", icon: MessageCircle },
  { to: "/emergency", label: "SOS", icon: Siren },
  { to: "/profile", label: "Me", icon: User },
] as const;

const patientDesktopNav = [
  { to: "/home", label: "Home", icon: Home },
  { to: "/dentists", label: "Dentists", icon: Stethoscope },
  { to: "/appointments", label: "Visits", icon: Calendar },
  { to: "/history", label: "History", icon: History },
  { to: "/teeth-check", label: "Teeth Check", icon: ScanFace },
  { to: "/chatbot", label: "Buddy AI", icon: MessageCircle },
  { to: "/emergency", label: "Emergency", icon: Siren },
  { to: "/tips", label: "Tips", icon: Lightbulb },
] as const;

const adminDesktopNav = [
  { to: "/home", label: "Home", icon: Home },
  { to: "/admin", label: "Admin Panel", icon: ShieldCheck },
  { to: "/profile", label: "Profile", icon: User },
] as const;

const adminMobileTabs = [
  { to: "/home", label: "Home", icon: Home },
  { to: "/admin", label: "Admin", icon: ShieldCheck },
  { to: "/profile", label: "Me", icon: User },
] as const;

const doctorDesktopNav = [
  { to: "/doctor", label: "Home", icon: Home },
  { to: "/doctor/appointments", label: "Appointments", icon: ClipboardList },
  { to: "/profile", label: "Profile", icon: User },
] as const;

const doctorMobileTabs = [
  { to: "/doctor", label: "Home", icon: Home },
  { to: "/doctor/appointments", label: "Appointments", icon: ClipboardList },
  { to: "/profile", label: "Me", icon: User },
] as const;

type NavItem = { to: string; label: string; icon: React.ComponentType<{ className?: string }> };

export function MobileShell({ children, hideTabs = false }: { children: ReactNode; hideTabs?: boolean }) {
  const loc = useLocation();
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  if (loading || !user) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background">
        <div className="text-muted-foreground text-sm">Loading…</div>
      </div>
    );
  }

  const role = user.role;
  const desktopNav: readonly NavItem[] =
    role === 'admin' ? adminDesktopNav :
    role === 'doctor' ? doctorDesktopNav :
    patientDesktopNav;
  const mobileTabs: readonly NavItem[] =
    role === 'admin' ? adminMobileTabs :
    role === 'doctor' ? doctorMobileTabs :
    patientMobileTabs;

  return (
    <div className="min-h-dvh lg:min-h-screen flex flex-col bg-background">

      {/* ── DESKTOP: sticky top nav ── */}
      <header className="hidden lg:block sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur-md">
        <div className="max-w-screen-xl mx-auto px-6 h-16 flex items-center gap-2">
          <Link to="/home" className="flex items-center gap-2.5 shrink-0 mr-6">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center text-white text-lg shadow-[var(--shadow-soft)]">
              🦷
            </div>
            <span className="text-lg font-bold tracking-tight">DentiBuddy</span>
          </Link>

          {role === 'admin' && (
            <span className="text-xs font-semibold uppercase tracking-wider bg-primary/10 text-primary px-2.5 py-1 rounded-full mr-2">
              Admin
            </span>
          )}
          {role === 'doctor' && (
            <span className="text-xs font-semibold uppercase tracking-wider bg-mint text-mint-foreground px-2.5 py-1 rounded-full mr-2">
              Doctor
            </span>
          )}

          <nav className="flex items-center gap-0.5 flex-1">
            {desktopNav.map((item) => {
              const active =
                item.to === "/home" || item.to === "/doctor"
                  ? loc.pathname === item.to
                  : loc.pathname.startsWith(item.to);
              const Icon = item.icon;
              const isEmergency = item.to === "/emergency";
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition-colors ${
                    isEmergency
                      ? active
                        ? "bg-coral/15 text-coral"
                        : "text-coral/70 hover:bg-coral/10 hover:text-coral"
                      : active
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  }`}
                >
                  <Icon className={`h-4 w-4 shrink-0 ${active ? "stroke-[2.5]" : ""}`} />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <ThemeToggle className="ml-auto mr-1" />

          <Link
            to="/profile"
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition-colors ${
              loc.pathname.startsWith("/profile")
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            }`}
          >
            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center shadow-[var(--shadow-soft)]">
              <User className="h-3.5 w-3.5 text-white" />
            </div>
            <span>Profile</span>
          </Link>
        </div>
      </header>

      {/* ── MOBILE: compact top bar ── */}
      <div className="lg:hidden sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur-md">
        <div className="px-5 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center text-white text-base shadow-[var(--shadow-soft)]">
              🦷
            </div>
            <span className="font-bold text-base">DentiBuddy</span>
          </div>
          <div className="flex items-center gap-1.5">
            {role === 'admin' && (
              <span className="text-xs font-semibold uppercase tracking-wider bg-primary/10 text-primary px-2.5 py-1 rounded-full">Admin</span>
            )}
            {role === 'doctor' && (
              <span className="text-xs font-semibold uppercase tracking-wider bg-mint text-mint-foreground px-2.5 py-1 rounded-full">Doctor</span>
            )}
            <ThemeToggle />
          </div>
        </div>
      </div>

      {/* ── MAIN CONTENT ── */}
      <main className={`flex-1 ${!hideTabs ? "pb-20 lg:pb-0" : ""}`}>
        {children}
      </main>

      {/* ── MOBILE: bottom tab bar ── */}
      {!hideTabs && (
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur-md">
          <ul className="flex items-center justify-around w-full">
            {mobileTabs.map((t) => {
              const active = t.to === "/home" || t.to === "/doctor" ? loc.pathname === t.to : loc.pathname.startsWith(t.to);
              const Icon = t.icon;
              return (
                <li key={t.to} className="flex-1">
                  <Link
                    to={t.to}
                    className={`flex flex-col items-center justify-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors w-full ${
                      active ? "text-primary font-semibold" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className={`h-5 w-5 ${active ? "stroke-[2.5]" : ""}`} />
                    <span>{t.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 pt-6 pb-4 lg:pt-0 lg:pb-0 lg:mb-8">
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">{title}</h1>
        {subtitle && (
          <p className="text-sm lg:text-base text-muted-foreground mt-0.5 lg:mt-1.5">{subtitle}</p>
        )}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}
