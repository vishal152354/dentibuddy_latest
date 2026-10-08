import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { LiveNote } from "@/components/admin/bookings-panel";

export interface AdminChild {
  id: string;
  name: string;
  date_of_birth: string | null;
  avatar_emoji: string;
  created_at: string;
  parent: { full_name: string; email: string } | null;
  appointment_count: number;
}

export function useAdminChildren(enabled: boolean) {
  return useQuery<AdminChild[]>({
    queryKey: ["admin-children"],
    queryFn: () => api.get("/admin/children"),
    enabled,
    refetchInterval: 10_000,
  });
}

function ageFrom(dob: string | null) {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return null;
  const months = (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
  if (months < 24) return `${Math.max(0, Math.floor(months))} mo`;
  return `${Math.floor(months / 12)} yrs`;
}

export function ChildrenPanel({ enabled }: { enabled: boolean }) {
  const { data: children = [], isLoading, dataUpdatedAt } = useAdminChildren(enabled);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return children;
    return children.filter((c) =>
      [c.name, c.parent?.full_name, c.parent?.email].some((v) => v?.toLowerCase().includes(needle)),
    );
  }, [children, q]);

  const parentCount = new Set(children.map((c) => c.parent?.email)).size;

  if (isLoading) return <p className="text-center text-muted-foreground py-16">Loading…</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{children.length}</span> children registered by{" "}
          <span className="font-semibold text-foreground">{parentCount}</span> parent{parentCount === 1 ? "" : "s"}
        </p>
        <div className="relative sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search child or parent…" className="h-9 rounded-xl bg-card pl-9" />
        </div>
      </div>
      <LiveNote updatedAt={dataUpdatedAt} />

      {filtered.length === 0 ? (
        <p className="text-center text-muted-foreground py-16">{children.length === 0 ? "No children added yet." : "No children match your search."}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((c) => {
            const age = ageFrom(c.date_of_birth);
            return (
              <div key={c.id} className="rounded-2xl bg-card border border-border p-4 shadow-[var(--shadow-card)] flex gap-3">
                <div className="h-12 w-12 rounded-xl bg-secondary flex items-center justify-center text-2xl shrink-0">{c.avatar_emoji}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold truncate">{c.name}</p>
                    {age && <span className="text-[10px] font-bold uppercase rounded-full bg-mint/20 text-mint-foreground px-2 py-0.5 shrink-0">{age}</span>}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">Parent: {c.parent?.full_name || "—"}</p>
                  <p className="text-xs text-muted-foreground truncate">{c.parent?.email ?? "Unknown"}</p>
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    {c.appointment_count} booking{c.appointment_count === 1 ? "" : "s"} · added {new Date(c.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
