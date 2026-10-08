import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { MobileShell } from "@/components/mobile-shell";
import { HABITS, HabitCheckIn, useHabits, type ChildHabits } from "@/components/habit-checkin";
import { CalendarCheck, Flame, Lock, Medal, Sprout, Star, Trophy } from "lucide-react";

export const Route = createFileRoute("/achievements")({
  component: AchievementsPage,
  ssr: false,
});

const BADGE_ICONS: Record<string, typeof Trophy> = {
  first: Sprout, streak3: Flame, streak7: CalendarCheck, perfect5: Star, streak14: Medal, streak30: Trophy,
};

function AchievementsPage() {
  const { data, isLoading } = useHabits();
  const [selected, setSelected] = useState<string | null>(null);
  const entry = data?.children.find((c) => c.child.id === selected) ?? data?.children[0];

  return (
    <MobileShell>
      <div className="relative isolate overflow-x-hidden min-h-[calc(100dvh-3.5rem-5rem)] lg:h-[calc(100dvh-4rem)] lg:overflow-y-auto">
        <BackgroundWash />
        <div className="max-w-screen-xl mx-auto px-4 lg:px-6 flex flex-col gap-3 lg:gap-4 lg:h-full pt-3 pb-4 lg:py-5">
          {/* Title row */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="glass h-10 w-10 lg:h-11 lg:w-11 rounded-2xl flex items-center justify-center text-primary shrink-0">
              <Trophy className="h-5 w-5" strokeWidth={1.75} />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl lg:text-2xl font-semibold tracking-tight leading-tight">Achievements</h1>
              <p className="text-xs lg:text-sm text-muted-foreground truncate">Daily habit streaks for each child</p>
            </div>
          </div>

          {isLoading ? (
            <p className="text-center text-muted-foreground py-16 text-sm">Loading…</p>
          ) : !entry || !data ? (
            <Link to="/children" className="glass rounded-3xl p-8 text-center text-sm text-muted-foreground hover:text-foreground">
              Add a child to start tracking daily habits and streaks.
            </Link>
          ) : (
            <>
              {data.children.length > 1 && (
                <div className="flex gap-2 overflow-x-auto no-scrollbar shrink-0 -mx-4 px-4 lg:mx-0 lg:px-0">
                  {data.children.map((c) => {
                    const on = c.child.id === entry.child.id;
                    return (
                      <button
                        key={c.child.id}
                        onClick={() => setSelected(c.child.id)}
                        className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium flex items-center gap-2 transition-colors ${on ? "bg-primary text-primary-foreground" : "glass hover:ring-1 hover:ring-primary/40"}`}
                      >
                        {c.child.name}
                        <span className={`flex items-center gap-0.5 text-xs tabular-nums ${on ? "opacity-90" : "text-muted-foreground"}`}>
                          <Flame className="h-3 w-3" /> {c.current}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="flex-1 lg:min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-3 lg:gap-4">
                <div className="lg:col-span-5 flex flex-col gap-3 lg:gap-4 lg:min-h-0">
                  <StreakCard entry={entry} minHabits={data.min_habits} />
                  <HistoryStrip entry={entry} minHabits={data.min_habits} />
                </div>
                <div className="lg:col-span-7 flex flex-col gap-3 lg:gap-4 lg:min-h-0">
                  <section className="glass rounded-3xl p-4 flex flex-col lg:flex-1 lg:min-h-0">
                    <HabitCheckIn key={entry.child.id} entry={entry} minHabits={data.min_habits} className="lg:flex-1 lg:min-h-0" />
                    <p className="text-[11px] text-muted-foreground mt-2 shrink-0">
                      Tick what {entry.child.name} did today, then save. You can save once per day, and {data.min_habits} or more habits keep the streak going.
                    </p>
                  </section>
                  <Badges entry={entry} />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </MobileShell>
  );
}

function BackgroundWash() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
      <div className="absolute -top-24 -left-24 h-80 w-80 rounded-full bg-primary/25 dark:bg-primary/20 blur-3xl" />
      <div className="absolute top-1/3 right-[-6rem] h-96 w-96 rounded-full bg-mint/40 dark:bg-mint/10 blur-3xl" />
      <div className="absolute bottom-[-8rem] left-1/3 h-80 w-80 rounded-full bg-sunshine/25 dark:bg-primary/10 blur-3xl" />
    </div>
  );
}

function StreakCard({ entry, minHabits }: { entry: ChildHabits; minHabits: number }) {
  const t = entry.today;
  const status = !t
    ? `Save today's habits to ${entry.current ? "keep the streak going" : "start a streak"}.`
    : t.habits.length >= minHabits
      ? "Today counts. Come back tomorrow to keep going."
      : `Today had fewer than ${minHabits} habits, so the streak starts again tomorrow.`;

  return (
    <section className="glass relative rounded-3xl p-5 overflow-hidden shrink-0">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" aria-hidden />
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Current streak · {entry.child.name}</p>
      <div className="flex items-end gap-3 mt-2">
        <span className="text-6xl font-semibold tracking-tight tabular-nums leading-none">{entry.current}</span>
        <span className="text-sm text-muted-foreground pb-1.5">{entry.current === 1 ? "day" : "days"}</span>
        <Flame className={`h-9 w-9 ml-auto ${entry.current ? "text-coral" : "text-muted-foreground/40"}`} strokeWidth={1.5} />
      </div>
      <p className="text-sm text-muted-foreground mt-3">{status}</p>
      <div className="grid grid-cols-3 gap-2 mt-4">
        {[
          { label: "Best streak", value: entry.longest },
          { label: "Perfect days", value: entry.perfect_days },
          { label: "Days logged", value: entry.total_days },
        ].map((s) => (
          <div key={s.label} className="glass-inset rounded-2xl px-3 py-2.5">
            <p className="text-lg font-semibold tabular-nums">{s.value}</p>
            <p className="text-[11px] text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Last 14 days: empty = not logged, light = logged below the streak minimum, solid = counted, inner ring = perfect day. */
function HistoryStrip({ entry, minHabits }: { entry: ChildHabits; minHabits: number }) {
  return (
    <section className="glass rounded-3xl p-4 shrink-0 lg:flex-1 lg:min-h-0 flex flex-col">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-3">Last 14 days</p>
      <div className="grid grid-cols-7 gap-1.5 lg:gap-2">
        {entry.last14.map((d) => {
          const [y, m, day] = d.date.split("-").map(Number);
          const weekday = new Date(Date.UTC(y, m - 1, day)).toLocaleDateString(undefined, { weekday: "narrow", timeZone: "UTC" });
          const counted = d.count !== null && d.count >= minHabits;
          const perfect = d.count === HABITS.length;
          return (
            <div key={d.date} className="flex flex-col items-center gap-1">
              <div
                title={`${d.date}: ${d.count === null ? "not logged" : `${d.count}/${HABITS.length} habits`}`}
                className={`w-full aspect-square rounded-lg flex items-center justify-center text-[11px] tabular-nums ${
                  d.count === null ? "glass-inset text-muted-foreground/60"
                    : counted ? `bg-mint text-mint-foreground font-medium ${perfect ? "ring-2 ring-inset ring-mint-foreground/40" : ""}`
                    : "bg-mint/25 text-foreground/70"
                }`}
              >
                {day}
              </div>
              <span className="text-[10px] text-muted-foreground">{weekday}</span>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-mint" /> {minHabits}+ habits</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-mint ring-1 ring-inset ring-mint-foreground/50" /> All {HABITS.length}</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-mint/25" /> Fewer</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm glass-inset" /> Not logged</span>
      </div>
    </section>
  );
}

function Badges({ entry }: { entry: ChildHabits }) {
  const earned = entry.badges.filter((b) => b.earned).length;
  return (
    <section className="glass rounded-3xl p-4 shrink-0">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Badges</p>
        <span className="text-[11px] text-muted-foreground tabular-nums">{earned}/{entry.badges.length} earned</span>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {entry.badges.map((b) => {
          const Icon = BADGE_ICONS[b.id] ?? Medal;
          return (
            <div
              key={b.id}
              title={`${b.title}: ${b.detail}${b.earned ? "" : " (not earned yet)"}`}
              className={`rounded-2xl p-2.5 flex flex-col items-center text-center gap-1.5 ${b.earned ? "glass-inset ring-1 ring-sunshine/60" : "glass-inset opacity-55"}`}
            >
              <span className={`h-9 w-9 rounded-full flex items-center justify-center ${b.earned ? "bg-sunshine/25 text-yellow-700 dark:text-sunshine" : "bg-foreground/5 text-muted-foreground"}`}>
                {b.earned ? <Icon className="h-4 w-4" strokeWidth={1.75} /> : <Lock className="h-3.5 w-3.5" />}
              </span>
              <span className="text-[11px] font-medium leading-tight">{b.title}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
