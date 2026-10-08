import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useAuth } from "@/context/auth-context";
import { MobileShell, PageHeader } from "@/components/mobile-shell";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { AlertTriangle, Camera, CheckCircle2, ImagePlus, Info, Loader2, RotateCcw, Siren, Stethoscope } from "lucide-react";

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
  inference_ms: number;
}

interface HistoryItem {
  id: string;
  category: Category;
  low_confidence: boolean;
  child: { name: string; avatar_emoji: string } | null;
  created_at: string;
}

const CATEGORY_UI: Record<Category, { title: string; advice: string; Icon: typeof CheckCircle2; cls: string }> = {
  normal: {
    title: "Looks normal",
    advice: "No visible problems were found. Keep brushing twice a day and continue regular check-ups every 6 months.",
    Icon: CheckCircle2,
    cls: "border-mint bg-mint/15 text-mint-foreground",
  },
  abnormal: {
    title: "Consultation recommended",
    advice: "Something may need attention. Book a visit with a pediatric dentist in the next few days.",
    Icon: AlertTriangle,
    cls: "border-sunshine bg-sunshine/20 text-yellow-800 dark:text-sunshine",
  },
  emergency: {
    title: "Emergency — see a dentist today",
    advice: "These symptoms need urgent care. Contact a dentist now or go to the nearest emergency service.",
    Icon: Siren,
    cls: "border-destructive bg-destructive/10 text-destructive",
  },
};

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
    queryFn: () => api.get<{ id: string; label: string; level: string }[]>("/teeth-check/symptoms"),
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

  const toggle = (id: string) => setSymptoms((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <MobileShell>
      <div className="max-w-screen-md mx-auto px-5 pb-6 lg:px-6 lg:py-8">
        <PageHeader title="Teeth Check" subtitle="Take a photo of your child's teeth for a quick check" />

        <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
        <input ref={uploadInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onFile} />

        {result ? (
          <ResultCard result={result} onReset={reset} />
        ) : (
          <div className="space-y-5">
            {/* Photo */}
            <section className="rounded-2xl bg-card border border-border p-4 shadow-[var(--shadow-card)]">
              <p className="text-sm font-semibold mb-3">1. Photo of the teeth</p>
              {photo ? (
                <div className="space-y-3">
                  <img src={photo} alt="Selected teeth photo" className="w-full max-h-80 object-contain rounded-xl bg-muted" />
                  <Button variant="outline" size="sm" className="rounded-xl gap-1.5" onClick={() => setPhoto(null)}>
                    <RotateCcw className="h-3.5 w-3.5" /> Choose another photo
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => cameraInput.current?.click()} className="rounded-xl border-2 border-dashed border-border hover:border-primary p-5 flex flex-col items-center gap-2 text-sm font-medium transition-colors">
                    <Camera className="h-6 w-6 text-primary" /> Take photo
                  </button>
                  <button onClick={() => uploadInput.current?.click()} className="rounded-xl border-2 border-dashed border-border hover:border-primary p-5 flex flex-col items-center gap-2 text-sm font-medium transition-colors">
                    <ImagePlus className="h-6 w-6 text-primary" /> Upload photo
                  </button>
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-3 flex gap-1.5">
                <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                Use good light, ask your child to open wide or smile, and keep the teeth in focus and filling most of the photo.
              </p>
            </section>

            {/* Child */}
            {children.length > 0 && (
              <section className="rounded-2xl bg-card border border-border p-4 shadow-[var(--shadow-card)]">
                <p className="text-sm font-semibold mb-3">2. Which child? <span className="font-normal text-muted-foreground">(optional)</span></p>
                <div className="flex flex-wrap gap-2">
                  {children.map((c: any) => (
                    <button
                      key={c.id}
                      onClick={() => setChildId(childId === c.id ? "" : c.id)}
                      className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${childId === c.id ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border hover:border-primary"}`}
                    >
                      {c.avatar_emoji} {c.name}
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Symptoms */}
            <section className="rounded-2xl bg-card border border-border p-4 shadow-[var(--shadow-card)]">
              <p className="text-sm font-semibold mb-1">{children.length > 0 ? "3" : "2"}. Any of these symptoms?</p>
              <p className="text-xs text-muted-foreground mb-3">A photo can't show everything — tick anything your child has right now.</p>
              <div className="space-y-2">
                {symptomList.map((s) => (
                  <label key={s.id} className="flex items-start gap-3 rounded-xl border border-border p-3 cursor-pointer hover:bg-muted/40">
                    <input type="checkbox" checked={symptoms.includes(s.id)} onChange={() => toggle(s.id)} className="h-4 w-4 mt-0.5 rounded" />
                    <span className="text-sm">{s.label}</span>
                  </label>
                ))}
              </div>
            </section>

            <Button className="w-full h-12 rounded-2xl text-base gap-2" disabled={!photo || check.isPending} onClick={() => check.mutate()}>
              {check.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Checking…</> : "Check teeth"}
            </Button>
            <Disclaimer />
          </div>
        )}

        {history.length > 0 && (
          <section className="mt-8">
            <p className="text-sm font-semibold mb-2">Previous checks</p>
            <div className="space-y-2">
              {history.slice(0, 10).map((h) => {
                const ui = CATEGORY_UI[h.category];
                return (
                  <div key={h.id} className="rounded-xl bg-card border border-border px-4 py-3 flex items-center gap-3">
                    <ui.Icon className={`h-4 w-4 shrink-0 ${ui.cls.split(" ").filter((c) => c.startsWith("text-") || c.startsWith("dark:text-")).join(" ")}`} />
                    <span className="text-sm font-medium">{ui.title}</span>
                    <span className="text-xs text-muted-foreground ml-auto text-right">
                      {h.child ? `${h.child.avatar_emoji} ${h.child.name} · ` : ""}{new Date(h.created_at).toLocaleDateString()}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </MobileShell>
  );
}

function ResultCard({ result, onReset }: { result: CheckResult; onReset: () => void }) {
  const ui = CATEGORY_UI[result.category];
  return (
    <div className="space-y-4">
      <div className={`rounded-2xl border-2 p-5 ${ui.cls}`}>
        <div className="flex items-center gap-2 mb-2">
          <ui.Icon className="h-6 w-6" />
          <p className="text-lg font-bold">{ui.title}</p>
        </div>
        <p className="text-sm text-foreground">{ui.advice}</p>
      </div>

      <div className="rounded-2xl bg-card border border-border p-4 space-y-3">
        <p className="text-sm font-semibold">Why</p>
        <ul className="list-disc pl-5 text-sm space-y-1">
          {result.reasons.map((r) => <li key={r}>{r}</li>)}
        </ul>
        {result.low_confidence && (
          <p className="text-xs rounded-lg bg-muted p-2.5 flex gap-1.5">
            <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            The photo was hard to read. For a more reliable check, retake it in better light with the teeth filling the frame.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Photo check: {result.model.label === "Bad Teeth" ? "possible problem" : "no visible problem"} ({Math.round(result.model.confidence * 100)}% confidence)
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        {result.category !== "normal" && (
          <Button asChild className="rounded-2xl gap-2 flex-1">
            <Link to={result.category === "emergency" ? "/emergency" : "/dentists"}>
              {result.category === "emergency" ? <Siren className="h-4 w-4" /> : <Stethoscope className="h-4 w-4" />}
              {result.category === "emergency" ? "Emergency help" : "Find a dentist"}
            </Link>
          </Button>
        )}
        <Button variant="outline" className="rounded-2xl gap-2 flex-1" onClick={onReset}>
          <RotateCcw className="h-4 w-4" /> Check another photo
        </Button>
      </div>
      <Disclaimer />
    </div>
  );
}

function Disclaimer() {
  return (
    <p className="text-[11px] text-muted-foreground text-center">
      This is an automated screening aid, not a diagnosis. If you are worried about your child, see a dentist.
    </p>
  );
}
