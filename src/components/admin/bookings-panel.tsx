import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Calendar, Clock, Search, Siren, User } from "lucide-react";

export interface AdminBooking {
  id: string;
  appointment_date: string;
  appointment_time: string;
  reason: string;
  status: "pending" | "confirmed" | "cancelled" | "completed";
  is_emergency: boolean;
  created_at: string;
  children: { name: string; avatar_emoji: string } | null;
  dentists: { name: string; clinic_name: string; city: string } | null;
  parent: { full_name: string; email: string } | null;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  pending:   { bg: "bg-sunshine/20",    text: "text-yellow-700",      label: "Pending" },
  confirmed: { bg: "bg-mint/20",        text: "text-mint-foreground", label: "Confirmed" },
  completed: { bg: "bg-primary/10",     text: "text-primary",         label: "Completed" },
  cancelled: { bg: "bg-destructive/10", text: "text-destructive",     label: "Cancelled" },
};

const FILTERS = ["all", "pending", "confirmed", "completed", "cancelled"] as const;

export function useAdminBookings(enabled: boolean) {
  return useQuery<AdminBooking[]>({
    queryKey: ["admin-appointments"],
    queryFn: () => api.get("/admin/appointments"),
    enabled,
    refetchInterval: 10_000,
  });
}

export function BookingsPanel({ enabled }: { enabled: boolean }) {
  const qc = useQueryClient();
  const { data: bookings = [], isLoading, dataUpdatedAt } = useAdminBookings(enabled);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [q, setQ] = useState("");

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.patch(`/admin/appointments/${id}`, { status }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-appointments"] }); toast.success("Booking updated"); },
    onError: (e: any) => toast.error(e.message ?? "Failed to update booking"),
  });

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: bookings.length };
    for (const b of bookings) c[b.status] = (c[b.status] ?? 0) + 1;
    return c;
  }, [bookings]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return bookings.filter((b) => {
      if (filter !== "all" && b.status !== filter) return false;
      if (!needle) return true;
      return [b.children?.name, b.dentists?.name, b.dentists?.clinic_name, b.parent?.full_name, b.parent?.email, b.reason]
        .some((v) => v?.toLowerCase().includes(needle));
    });
  }, [bookings, filter, q]);

  if (isLoading) return <p className="text-center text-muted-foreground py-16">Loading…</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-xs font-semibold rounded-full px-3 py-1.5 border transition-colors capitalize ${
                filter === f ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {f} <span className="opacity-70">({counts[f] ?? 0})</span>
            </button>
          ))}
        </div>
        <div className="relative sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search child, parent, dentist…" className="h-9 rounded-xl bg-card pl-9" />
        </div>
      </div>
      <LiveNote updatedAt={dataUpdatedAt} />

      {filtered.length === 0 ? (
        <p className="text-center text-muted-foreground py-16">{bookings.length === 0 ? "No bookings yet." : "No bookings match this filter."}</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {filtered.map((b) => {
            const style = STATUS_STYLES[b.status];
            return (
              <div key={b.id} className="rounded-2xl bg-card border border-border p-4 shadow-[var(--shadow-card)]">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex gap-3 min-w-0">
                    <div className="h-11 w-11 rounded-xl bg-secondary flex items-center justify-center text-2xl shrink-0">
                      {b.children?.avatar_emoji ?? "🧒"}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{b.children?.name ?? "Unknown child"}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        with {b.dentists?.name ?? "Removed dentist"}{b.dentists?.clinic_name ? ` · ${b.dentists.clinic_name}` : ""}
                      </p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold uppercase rounded-full px-2.5 py-1 shrink-0 ${style.bg} ${style.text}`}>{style.label}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {b.appointment_date}</span>
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {b.appointment_time}</span>
                  <span className="flex items-center gap-1 min-w-0"><User className="h-3 w-3 shrink-0" /> <span className="truncate">{b.parent?.full_name || b.parent?.email || "Unknown parent"}</span></span>
                  {b.is_emergency && <span className="flex items-center gap-1 text-destructive font-semibold"><Siren className="h-3 w-3" /> Emergency</span>}
                </div>
                {b.reason && <p className="mt-2 text-xs text-foreground/80 line-clamp-2">“{b.reason}”</p>}
                <div className="mt-3 pt-3 border-t border-border flex items-center justify-between gap-2">
                  <span className="text-[11px] text-muted-foreground">Booked {new Date(b.created_at).toLocaleString()}</span>
                  <select
                    value={b.status}
                    disabled={statusMutation.isPending}
                    onChange={(e) => statusMutation.mutate({ id: b.id, status: e.target.value })}
                    className="text-xs rounded-lg border border-border bg-background px-2 py-1"
                    aria-label="Change status"
                  >
                    {FILTERS.slice(1).map((s) => <option key={s} value={s}>{STATUS_STYLES[s].label}</option>)}
                  </select>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function LiveNote({ updatedAt }: { updatedAt: number }) {
  return (
    <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-mint opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-mint" />
      </span>
      Live · refreshes every 10s{updatedAt ? ` · last updated ${new Date(updatedAt).toLocaleTimeString()}` : ""}
    </p>
  );
}
