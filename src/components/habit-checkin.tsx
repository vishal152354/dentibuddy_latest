import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/context/auth-context";

export const HABITS = [
  { id: "brush", title: "Brush twice", detail: "2 minutes, morning & night" },
  { id: "paste", title: "Right amount", detail: "Rice grain to pea size" },
  { id: "floss", title: "Floss daily", detail: "Once teeth touch" },
  { id: "water", title: "Water first", detail: "Instead of juice" },
  { id: "snack", title: "Smart snacks", detail: "Sweets with meals only" },
  { id: "night", title: "No bedtime bottle", detail: "Water only after brushing" },
];

export interface ChildHabits {
  child: { id: string; name: string };
  today: { habits: string[]; logged_at: string } | null;
  current: number;
  longest: number;
  total_days: number;
  perfect_days: number;
  badges: { id: string; title: string; detail: string; earned: boolean }[];
  last14: { date: string; count: number | null }[];
}

export interface HabitsResponse {
  today: string;
  min_habits: number;
  children: ChildHabits[];
}

export const pad2 = (n: number) => String(n).padStart(2, "0");

export function useHabits() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["habits", user?.id],
    enabled: !!user,
    queryFn: () => api.get<HabitsResponse>("/habits"),
  });
}

/**
 * Today's check-in for one child: tick habits, then save once. After saving, the day is locked.
 * Render with `key={child.id}` so the draft resets when switching children.
 */
export function HabitCheckIn({
  entry, minHabits, layout = "grid", className = "",
}: { entry: ChildHabits; minHabits: number; layout?: "grid" | "row"; className?: string }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<string[]>([]);
  const saved = entry.today;
  const done = saved ? saved.habits : draft;
  const row = layout === "row";

  const save = useMutation({
    mutationFn: () => api.post("/habits/log", { child_id: entry.child.id, habits: draft }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["habits"] });
      toast.success(
        draft.length >= minHabits
          ? `Saved — ${entry.child.name}'s streak continues`
          : `Saved. ${minHabits} or more habits keep the streak going`,
      );
    },
    onError: (e: any) => {
      toast.error(e.message ?? "Could not save");
      qc.invalidateQueries({ queryKey: ["habits"] });
    },
  });

  const toggle = (id: string) => {
    if (saved) return;
    setDraft((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]));
  };

  return (
    <div className={`flex flex-col ${className}`}>
      <div className={`flex items-center justify-between gap-2 shrink-0 ${row ? "mb-1.5" : "mb-2"}`}>
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground truncate">
          Good habits <span className="normal-case tracking-normal">· {entry.child.name}</span>
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] text-muted-foreground tabular-nums">{done.length}/{HABITS.length}</span>
          {saved ? (
            <span className="text-[11px] text-muted-foreground flex items-center gap-1" title="Habits can be saved once a day">
              <Lock className="h-3 w-3" /> Saved today
            </span>
          ) : (
            <button
              onClick={() => save.mutate()}
              disabled={save.isPending || draft.length === 0}
              className="rounded-full bg-primary text-primary-foreground px-2.5 py-0.5 text-[11px] font-medium disabled:opacity-50 flex items-center gap-1"
              title={draft.length ? "Habits can be saved once a day" : "Tick at least one habit first"}
            >
              {save.isPending && <Loader2 className="h-3 w-3 animate-spin" />} Save today
            </button>
          )}
        </div>
      </div>
      <div className={row ? "flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 snap-x" : "grid grid-cols-2 grid-rows-3 gap-3 flex-1 min-h-0"}>
        {HABITS.map((h, n) => {
          const on = done.includes(h.id);
          return (
            <button
              key={h.id}
              onClick={() => toggle(h.id)}
              aria-pressed={on}
              disabled={!!saved}
              title={`${h.title}: ${h.detail}`}
              className={`glass relative text-left rounded-2xl transition-all snap-start flex flex-col disabled:cursor-default ${row ? "w-32 shrink-0 px-3 py-2.5" : "min-h-0 p-3.5"} ${
                on ? "ring-1 ring-mint/70" : saved ? "opacity-60" : "hover:ring-1 hover:ring-primary/40"
              }`}
            >
              <span className="flex items-center justify-between">
                <span className="text-[11px] tabular-nums text-muted-foreground">{pad2(n + 1)}</span>
                <span className={`h-5 w-5 rounded-full flex items-center justify-center transition-colors ${on ? "bg-mint text-mint-foreground" : "glass-inset"}`}>
                  {on && <Check className="h-3 w-3" strokeWidth={3} />}
                </span>
              </span>
              <span className={`block font-medium mt-auto ${row ? "pt-1 text-xs" : "pt-2 text-sm"}`}>{h.title}</span>
              {/* On the phone row only the title fits; the detail is the tile's tooltip */}
              <span className={`text-[11px] text-muted-foreground leading-snug ${row ? "hidden" : "block"}`}>{h.detail}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
