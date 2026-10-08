import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/auth-context";
import { MobileShell } from "@/components/mobile-shell";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { HabitCheckIn, pad2, useHabits } from "@/components/habit-checkin";
import {
  AlertTriangle, Camera, Check, CheckCircle2, ChevronLeft, ChevronRight, ImagePlus, Info, Loader2,
  RotateCcw, ScanFace, ScanLine, Siren, Stethoscope,
} from "lucide-react";

export const Route = createFileRoute("/teeth-check")({
  component: TeethCheckPage,
  ssr: false,
});

type Category = "normal" | "abnormal" | "emergency";

interface CheckResult {
  id: string;
  category: Category;
  reasons: string[];
  low_confidence: boolean;
  model: { label: string; confidence: number; scores: { bad: number; good: number } };
}

interface HistoryItem {
  id: string;
  category: Category;
  child: { name: string } | null;
  created_at: string;
}

interface Symptom { id: string; label: string; short: string; level: "emergency" | "abnormal" }

const CATEGORY_UI: Record<Category, { title: string; short: string; advice: string; Icon: typeof CheckCircle2; card: string; ink: string; dot: string }> = {
  normal: {
    title: "Looks normal",
    short: "Normal",
    advice: "No visible problems found. Keep up brushing twice a day and regular 6-monthly check-ups.",
    Icon: CheckCircle2,
    card: "border-mint/60 bg-mint/10",
    ink: "text-mint-foreground dark:text-mint",
    dot: "bg-mint",
  },
  abnormal: {
    title: "Consultation recommended",
    short: "See a dentist",
    advice: "Something may need attention. Book a visit with a pediatric dentist in the next few days.",
    Icon: AlertTriangle,
    card: "border-sunshine/70 bg-sunshine/10",
    ink: "text-yellow-800 dark:text-sunshine",
    dot: "bg-sunshine",
  },
  emergency: {
    title: "See a dentist today",
    short: "Emergency",
    advice: "These symptoms need urgent care. Contact a dentist now or go to the nearest emergency service.",
    Icon: Siren,
    card: "border-destructive/60 bg-destructive/10",
    ink: "text-destructive",
    dot: "bg-destructive",
  },
};

const FACTS = [
  "Children have 20 baby teeth. By adulthood that grows to 32 permanent teeth.",
  "The first baby tooth usually appears at around 6 months of age.",
  "Tooth enamel is the hardest substance in the human body — harder than bone.",
  "Baby teeth hold space for adult teeth. Losing them early to decay can lead to crowding.",
  "Tooth decay is one of the most common long-term illnesses in children, and it's largely preventable.",
  "Most children start losing their baby teeth at around age 6.",
  "A child's first dental visit is recommended by their first birthday.",
  "Saliva protects teeth by washing away food and neutralising acids after meals.",
];

const STATS = [
  { value: "20", label: "baby teeth" },
  { value: "2 × 2", label: "minutes a day" },
  { value: "6 mo", label: "between check-ups" },
];




/** Downscale on the device so uploads stay small (phone photos are several MB). */
async function resizeToDataUrl(file: File, maxSide = 768): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.85);
}

function TeethCheckPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const cameraInput = useRef<HTMLInputElement>(null);
  const uploadInput = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [childId, setChildId] = useState("");
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [result, setResult] = useState<CheckResult | null>(null);

  const { data: children = [] } = useQuery({
    queryKey: ["children", user?.id],
    enabled: !!user,
    queryFn: () => api.get<any[]>("/children"),
  });
  const { data: symptomList = [] } = useQuery({
    queryKey: ["teeth-symptoms"],
    queryFn: () => api.get<Symptom[]>("/teeth-check/symptoms"),
    staleTime: Infinity,
  });
  const { data: history = [] } = useQuery({
    queryKey: ["teeth-checks", user?.id],
    enabled: !!user,
    queryFn: () => api.get<HistoryItem[]>("/teeth-checks"),
  });

  const check = useMutation({
    mutationFn: () => api.post<CheckResult>("/teeth-check", { image: photo, child_id: childId || null, symptoms }),
    onSuccess: (r) => {
      setResult(r);
      qc.invalidateQueries({ queryKey: ["teeth-checks"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Could not check the photo"),
  });

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      setPhoto(await resizeToDataUrl(file));
      setResult(null);
    } catch {
      toast.error("That file couldn't be read as an image");
    }
  }

  function reset() {
    setPhoto(null);
    setResult(null);
    setSymptoms([]);
  }

  const { data: habits } = useHabits();

  const toggle = (id: string) => setSymptoms((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const last = history[0];
  // Habit tiles follow the child picked for the check, defaulting to the first child
  const habitEntry = habits?.children.find((c) => c.child.id === childId) ?? habits?.children[0];
  const habitsWidget = (layout: "grid" | "row", className: string) =>
    habitEntry ? (
      <HabitCheckIn key={habitEntry.child.id} entry={habitEntry} minHabits={habits!.min_habits} layout={layout} className={className} />
    ) : habits ? (
      <Link to="/children" className={`glass rounded-2xl p-4 text-sm flex items-center justify-center text-center text-muted-foreground hover:text-foreground ${className}`}>
        Add a child to track daily habits and streaks
      </Link>
    ) : null;

  return (
    <MobileShell>
      {/* isolate keeps the background wash above the shell's background; the page fills the viewport so it works without scrolling */}
      <div className="relative isolate overflow-x-hidden h-[calc(100dvh-3.5rem-5rem)] lg:h-[calc(100dvh-4rem)] overflow-y-auto">
        <BackgroundWash />

        <div className="max-w-screen-xl mx-auto px-4 lg:px-6 flex flex-col gap-2.5 lg:gap-4 h-full pt-3 pb-2 lg:py-5">
          {/* Title row */}
          <div className="flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="glass h-10 w-10 lg:h-11 lg:w-11 rounded-2xl flex items-center justify-center text-primary shrink-0">
                <ScanFace className="h-5 w-5" strokeWidth={1.75} />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl lg:text-2xl font-semibold tracking-tight leading-tight">Teeth Check</h1>
                <p className="text-xs lg:text-sm text-muted-foreground truncate">A quick photo screening to see if a dentist visit is needed</p>
              </div>
            </div>
            {last && <LastCheckChip item={last} />}
          </div>

          <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
          <input ref={uploadInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onFile} />

          {/* Mobile-only fact strip */}
          <FactWidget compact className="lg:hidden shrink-0" />

          {/* min-h-0 only on desktop: on a very small phone the card keeps its size and the page scrolls instead of overlapping */}
          <div className="flex-1 lg:min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-3 lg:gap-4">
            {/* ── Scanner ── */}
            <section className="glass lg:col-span-7 lg:min-h-0 rounded-3xl p-3 lg:p-4 flex flex-col gap-2 lg:gap-3">
              {result ? (
                <ResultPanel result={result} photo={photo} onReset={reset} />
              ) : (
                <>
                  <PhotoZone
                    photo={photo}
                    onCamera={() => cameraInput.current?.click()}
                    onUpload={() => uploadInput.current?.click()}
                    onClear={() => setPhoto(null)}
                  />

                  {children.length > 0 && (
                    <div className="flex items-center gap-2 shrink-0 overflow-x-auto no-scrollbar">
                      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground shrink-0">For</span>
                      {children.map((c: any) => (
                        <button
                          key={c.id}
                          onClick={() => setChildId(childId === c.id ? "" : c.id)}
                          className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${childId === c.id ? "bg-primary text-primary-foreground" : "glass-inset hover:border-primary/60"}`}
                        >
                          {c.name}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="shrink-0">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-1.5">
                      Symptoms right now <span className="normal-case tracking-normal font-normal">· a photo can't show these</span>
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {symptomList.map((s) => {
                        const on = symptoms.includes(s.id);
                        return (
                          <button
                            key={s.id}
                            onClick={() => toggle(s.id)}
                            title={s.label}
                            aria-pressed={on}
                            className={`rounded-full px-2.5 py-0.5 lg:py-1 text-[11px] lg:text-xs font-medium transition-colors flex items-center gap-1.5 ${
                              on
                                ? s.level === "emergency" ? "bg-destructive text-destructive-foreground" : "bg-sunshine text-sunshine-foreground"
                                : "glass-inset hover:border-primary/60"
                            }`}
                          >
                            {on ? <Check className="h-3 w-3" /> : s.level === "emergency" && <span className="h-1.5 w-1.5 rounded-full bg-destructive/80" aria-label="urgent" />}
                            {s.short}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <Button className="w-full h-11 lg:h-12 rounded-2xl text-[15px] font-medium gap-2 shrink-0" disabled={!photo || check.isPending} onClick={() => check.mutate()}>
                    {check.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Checking…</> : <><ScanLine className="h-4 w-4" /> Check teeth</>}
                  </Button>
                  <Disclaimer />
                </>
              )}
            </section>

            {/* ── Widgets (desktop) ── */}
            <aside className="hidden lg:flex lg:col-span-5 min-h-0 flex-col gap-4">
              <FactWidget className="shrink-0" />
              <div className="grid grid-cols-3 gap-3 shrink-0">
                {STATS.map((s) => (
                  <div key={s.label} className="glass rounded-2xl px-3 py-3 text-center">
                    <p className="text-xl font-semibold tracking-tight tabular-nums">{s.value}</p>
                    <p className="text-[11px] text-muted-foreground">{s.label}</p>
                  </div>
                ))}
              </div>
              {habitsWidget("grid", "flex-1 min-h-0")}
            </aside>
          </div>

          {/* Mobile-only habit row */}
          {habitsWidget("row", "lg:hidden shrink-0")}
        </div>
      </div>
    </MobileShell>
  );
}

/** Soft blurred colour fields behind the glass so the frosting has something to diffuse. */
function BackgroundWash() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
      <div className="absolute -top-24 -left-24 h-80 w-80 rounded-full bg-primary/25 dark:bg-primary/20 blur-3xl" />
      <div className="absolute top-1/3 right-[-6rem] h-96 w-96 rounded-full bg-mint/40 dark:bg-mint/10 blur-3xl" />
      <div className="absolute bottom-[-8rem] left-1/3 h-80 w-80 rounded-full bg-accent dark:bg-primary/10 blur-3xl" />
    </div>
  );
}

function PhotoZone({ photo, onCamera, onUpload, onClear }: { photo: string | null; onCamera: () => void; onUpload: () => void; onClear: () => void }) {
  if (photo) {
    return (
      <div className="relative flex-1 min-h-[7rem] rounded-2xl bg-black/5 dark:bg-black/30 overflow-hidden">
        <img src={photo} alt="Selected teeth photo" className="absolute inset-0 w-full h-full object-contain" />
        <button onClick={onClear} className="glass absolute top-2 right-2 rounded-full px-3 py-1.5 text-xs font-medium flex items-center gap-1.5">
          <RotateCcw className="h-3.5 w-3.5" /> Retake
        </button>
      </div>
    );
  }
  return (
    <div className="glass-inset relative flex-1 min-h-[7rem] rounded-2xl flex flex-col items-center justify-center gap-3 p-4 text-center">
      {/* Viewfinder corners */}
      {["top-3 left-3 border-t-2 border-l-2 rounded-tl-lg", "top-3 right-3 border-t-2 border-r-2 rounded-tr-lg", "bottom-3 left-3 border-b-2 border-l-2 rounded-bl-lg", "bottom-3 right-3 border-b-2 border-r-2 rounded-br-lg"].map((c) => (
        <span key={c} className={`absolute h-6 w-6 lg:h-8 lg:w-8 border-primary/50 ${c}`} aria-hidden />
      ))}
      <div className="h-11 w-11 lg:h-14 lg:w-14 rounded-2xl glass flex items-center justify-center text-primary">
        <Camera className="h-5 w-5 lg:h-6 lg:w-6" strokeWidth={1.75} />
      </div>
      <div>
        <p className="text-sm lg:text-base font-medium">Photograph the teeth</p>
        <p className="text-[11px] lg:text-xs text-muted-foreground mt-0.5 max-w-xs">Good light, teeth in focus and filling the frame</p>
      </div>
      <div className="flex gap-2">
        <Button onClick={onCamera} className="rounded-xl gap-2 h-9"><Camera className="h-4 w-4" /> Take photo</Button>
        <Button onClick={onUpload} variant="outline" className="glass rounded-xl gap-2 h-9 border-0"><ImagePlus className="h-4 w-4" /> Upload</Button>
      </div>
    </div>
  );
}

function ResultPanel({ result, photo, onReset }: { result: CheckResult; photo: string | null; onReset: () => void }) {
  const ui = CATEGORY_UI[result.category];
  const pct = Math.round(result.model.confidence * 100);
  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3">
      <div className={`rounded-2xl border p-4 flex gap-4 items-center ${ui.card}`}>
        {photo && <img src={photo} alt="" className="h-20 w-20 lg:h-24 lg:w-24 rounded-xl object-cover shrink-0 ring-1 ring-white/30" />}
        <div className="min-w-0">
          <p className={`text-lg lg:text-xl font-semibold tracking-tight flex items-center gap-2 ${ui.ink}`}><ui.Icon className="h-5 w-5 shrink-0" /> {ui.title}</p>
          <p className="text-sm text-foreground/85 mt-1">{ui.advice}</p>
        </div>
      </div>

      <div className="glass-inset flex-1 min-h-0 overflow-y-auto rounded-2xl p-4 space-y-3">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Why</p>
        <ul className="space-y-1.5">
          {result.reasons.map((r) => (
            <li key={r} className="text-sm flex gap-2.5"><span className={`mt-[7px] h-1.5 w-1.5 rounded-full shrink-0 ${ui.dot}`} />{r}</li>
          ))}
        </ul>
        {result.low_confidence && (
          <p className="text-xs text-muted-foreground flex gap-1.5">
            <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            The photo was hard to read. Retake it in better light with the teeth filling the frame.
          </p>
        )}
        <div>
          <div className="flex justify-between text-[11px] text-muted-foreground mb-1.5">
            <span>Photo screening: {result.model.label === "Bad Teeth" ? "possible problem" : "no visible problem"}</span>
            <span className="tabular-nums">{pct}% confidence</span>
          </div>
          <div className="h-1 rounded-full bg-foreground/10 overflow-hidden">
            <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      <div className="flex gap-2 shrink-0">
        {result.category !== "normal" && (
          <Button asChild className="rounded-2xl gap-2 flex-1 h-11">
            <Link to={result.category === "emergency" ? "/emergency" : "/dentists"}>
              {result.category === "emergency" ? <Siren className="h-4 w-4" /> : <Stethoscope className="h-4 w-4" />}
              {result.category === "emergency" ? "Emergency help" : "Find a dentist"}
            </Link>
          </Button>
        )}
        <Button variant="outline" className="glass border-0 rounded-2xl gap-2 flex-1 h-11" onClick={onReset}>
          <RotateCcw className="h-4 w-4" /> New check
        </Button>
      </div>
      <Disclaimer />
    </div>
  );
}

function Disclaimer() {
  return (
    <p className="text-[10px] text-muted-foreground text-center -mt-1 shrink-0">
      Screening aid, not a diagnosis.<span className="hidden lg:inline"> If you're worried, see a dentist.</span>
    </p>
  );
}

function FactWidget({ compact = false, className = "" }: { compact?: boolean; className?: string }) {
  const [i, setI] = useState(() => Math.floor(Math.random() * FACTS.length));
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setI((n) => (n + 1) % FACTS.length), 7000);
    return () => clearInterval(t);
  }, [paused]);

  const go = (d: number) => setI((n) => (n + d + FACTS.length) % FACTS.length);
  const counter = `${pad2(i + 1)} / ${pad2(FACTS.length)}`;

  if (compact) {
    return (
      <button onClick={() => go(1)} className={`glass w-full text-left rounded-2xl px-4 py-2.5 ${className}`} aria-label="Next fact">
        <span className="flex items-center justify-between text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          <span>Did you know</span>
          <span className="tabular-nums">{counter}</span>
        </span>
        <span key={i} className="block text-xs leading-snug mt-0.5 animate-in fade-in duration-500 line-clamp-2">{FACTS[i]}</span>
      </button>
    );
  }

  return (
    <div
      className={`glass relative rounded-3xl p-5 overflow-hidden ${className}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" aria-hidden />
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Did you know</p>
        <div className="flex items-center gap-2">
          <span className="text-[11px] tabular-nums text-muted-foreground">{counter}</span>
          <button onClick={() => go(-1)} className="glass-inset h-7 w-7 rounded-full flex items-center justify-center hover:text-primary" aria-label="Previous fact"><ChevronLeft className="h-4 w-4" /></button>
          <button onClick={() => go(1)} className="glass-inset h-7 w-7 rounded-full flex items-center justify-center hover:text-primary" aria-label="Next fact"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>
      <p key={i} className="text-[17px] font-medium leading-snug tracking-tight min-h-[3rem] animate-in fade-in slide-in-from-right-2 duration-500">
        {FACTS[i]}
      </p>
      <div className="flex gap-1 mt-4">
        {FACTS.map((_, n) => (
          <button key={n} onClick={() => setI(n)} className={`h-0.5 flex-1 rounded-full transition-colors ${n === i ? "bg-primary" : "bg-foreground/15"}`} aria-label={`Fact ${n + 1}`} />
        ))}
      </div>
    </div>
  );
}

function LastCheckChip({ item }: { item: HistoryItem }) {
  const ui = CATEGORY_UI[item.category];
  return (
    <div className="glass hidden sm:flex items-center gap-2 rounded-full px-3 py-1.5 text-xs shrink-0" title="Most recent check">
      <span className={`h-1.5 w-1.5 rounded-full ${ui.dot}`} />
      <span className="text-muted-foreground">Last check</span>
      <span className="font-medium">{ui.short}</span>
      <span className="text-muted-foreground">
        · {item.child ? `${item.child.name}, ` : ""}{new Date(item.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
      </span>
    </div>
  );
}
