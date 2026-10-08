import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Activity, AlertTriangle, CheckCircle2, Database, Gauge, Globe, MousePointerClick, Server, Timer, XCircle } from "lucide-react";

interface Summary { count: number; avg: number; p50: number; p95: number; p99: number; max: number }

interface Metrics {
  generated_at: number;
  window_min: number;
  uptime_s: number;
  total_requests: number;
  retention_days: number;
  db_ping_ms: number | null;
  api: Summary & { errors: number; rpm: number };
  web: {
    page_load: Summary & { ttfb: number | null; fcp: number | null };
    navigation: Summary;
    client_api: Summary;
  };
  series: { t: number; avg: number | null; p95: number | null; requests: number; page_ms: number | null }[];
  endpoints: (Summary & { endpoint: string; errors: number; last_ms: number })[];
  pages: (Summary & { kind: string; page: string; ttfb: number | null; fcp: number | null; dcl: number | null })[];
  recent: { t: number; method: string; route: string; status: number; ms: number }[];
}

const WINDOWS = [
  { min: 1, label: "1m" },
  { min: 5, label: "5m" },
  { min: 15, label: "15m" },
  { min: 60, label: "1h" },
  { min: 1440, label: "24h" },
  { min: 10080, label: "7d" },
];

// Latency budgets per kind of measurement → good / slow / poor, always shown with icon + label
const BUDGETS = {
  api: [200, 800],
  db: [50, 200],
  page: [2500, 4000],
  nav: [300, 1000],
} as const;

type Level = "good" | "slow" | "poor";
function levelOf(ms: number | null | undefined, kind: keyof typeof BUDGETS): Level | null {
  if (ms === null || ms === undefined) return null;
  const [good, slow] = BUDGETS[kind];
  return ms <= good ? "good" : ms <= slow ? "slow" : "poor";
}

const LEVEL_STYLE: Record<Level, { cls: string; label: string; Icon: typeof CheckCircle2 }> = {
  good: { cls: "text-mint-foreground bg-mint/20", label: "Good", Icon: CheckCircle2 },
  slow: { cls: "text-yellow-700 dark:text-sunshine bg-sunshine/20", label: "Slow", Icon: AlertTriangle },
  poor: { cls: "text-destructive bg-destructive/10", label: "Poor", Icon: XCircle },
};

function fmtMs(ms: number | null | undefined) {
  if (ms === null || ms === undefined) return "—";
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)} s`;
  return `${ms < 10 ? ms.toFixed(1) : Math.round(ms)} ms`;
}

function fmtUptime(s: number) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m ${s % 60}s`;
}

export function PerformancePanel({ enabled }: { enabled: boolean }) {
  const [windowMin, setWindowMin] = useState(5);
  // Long windows scan far more stored samples, so poll them less often
  const refreshMs = windowMin <= 60 ? 2000 : 15000;
  const { data, isLoading, isError, error } = useQuery<Metrics>({
    queryKey: ["admin-metrics", windowMin],
    queryFn: () => api.get(`/admin/metrics?window=${windowMin}`),
    enabled,
    refetchInterval: refreshMs,
    placeholderData: (prev) => prev,
  });

  if (isLoading) return <p className="text-center text-muted-foreground py-16">Loading metrics…</p>;
  if (isError || !data) return <p className="text-center text-destructive py-16">{(error as Error)?.message ?? "Failed to load metrics"}</p>;

  const errorRate = data.api.count ? (data.api.errors / data.api.count) * 100 : 0;
  const chartData = data.series.map((s) => ({
    ...s,
    label: windowMin > 1440
      ? new Date(s.t).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })
      : new Date(s.t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: windowMin > 10 ? undefined : "2-digit" }),
  }));

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-mint opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-mint" />
          </span>
          Live · updates every {refreshMs / 1000}s · server up {fmtUptime(data.uptime_s)} · {data.total_requests.toLocaleString()} API requests stored (kept {data.retention_days} days)
        </p>
        <div className="inline-flex rounded-xl border border-border bg-card p-0.5" role="group" aria-label="Time window">
          {WINDOWS.map((w) => (
            <button
              key={w.min}
              onClick={() => setWindowMin(w.min)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-[10px] transition-colors ${windowMin === w.min ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      {/* Server-side tiles */}
      <Section title="Server & API" subtitle={`Measured on the API server, last ${WINDOWS.find((w) => w.min === windowMin)?.label ?? `${windowMin}m`}`}>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Tile icon={Server} label="Avg API latency" value={fmtMs(data.api.count ? data.api.avg : null)} level={levelOf(data.api.count ? data.api.avg : null, "api")} sub={`p50 ${fmtMs(data.api.p50)}`} />
          <Tile icon={Gauge} label="p95 API latency" value={fmtMs(data.api.count ? data.api.p95 : null)} level={levelOf(data.api.count ? data.api.p95 : null, "api")} sub={`p99 ${fmtMs(data.api.p99)} · max ${fmtMs(data.api.max)}`} />
          <Tile icon={Database} label="Database ping" value={fmtMs(data.db_ping_ms)} level={levelOf(data.db_ping_ms, "db")} sub="MongoDB round-trip" />
          <Tile icon={Activity} label="Throughput" value={`${data.api.rpm} /min`} sub={`${data.api.count} requests`} />
          <Tile
            icon={AlertTriangle}
            label="Error rate"
            value={`${errorRate.toFixed(1)}%`}
            level={data.api.count ? (errorRate < 1 ? "good" : errorRate < 5 ? "slow" : "poor") : null}
            sub={`${data.api.errors} responses ≥ 400`}
          />
        </div>
      </Section>

      {/* Browser-side tiles */}
      <Section title="Webpage" subtitle="Measured in users' browsers">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Tile icon={Globe} label="Avg page load" value={fmtMs(data.web.page_load.count ? data.web.page_load.avg : null)} level={levelOf(data.web.page_load.count ? data.web.page_load.avg : null, "page")} sub={`${data.web.page_load.count} loads · p95 ${fmtMs(data.web.page_load.count ? data.web.page_load.p95 : null)}`} />
          <Tile icon={Timer} label="Time to first byte" value={fmtMs(data.web.page_load.ttfb)} sub={`First paint ${fmtMs(data.web.page_load.fcp)}`} />
          <Tile icon={MousePointerClick} label="In-app navigation" value={fmtMs(data.web.navigation.count ? data.web.navigation.avg : null)} level={levelOf(data.web.navigation.count ? data.web.navigation.avg : null, "nav")} sub={`${data.web.navigation.count} route changes`} />
          <Tile icon={Activity} label="API from browser" value={fmtMs(data.web.client_api.count ? data.web.client_api.avg : null)} level={levelOf(data.web.client_api.count ? data.web.client_api.avg : null, "api")} sub={`p95 ${fmtMs(data.web.client_api.count ? data.web.client_api.p95 : null)} · incl. network`} />
        </div>
      </Section>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="API latency over time" subtitle="Server-side, average and p95 per interval">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="0" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={{ stroke: "var(--border)" }} minTickGap={32} />
              <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} unit=" ms" width={60} />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }} />
              <Legend iconType="plainline" wrapperStyle={{ fontSize: 11, color: "var(--muted-foreground)" }} />
              <Line name="Average" dataKey="avg" stroke="var(--chart-avg)" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }} connectNulls isAnimationActive={false} />
              <Line name="p95" dataKey="p95" stroke="var(--chart-p95)" strokeWidth={2} strokeDasharray="5 3" dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }} connectNulls isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Webpage latency over time" subtitle="Browser page loads and route changes, average per interval">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={{ stroke: "var(--border)" }} minTickGap={32} />
              <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} unit=" ms" width={60} />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }} />
              <Line name="Page latency" dataKey="page_ms" stroke="var(--chart-avg)" strokeWidth={2} dot={{ r: 3, strokeWidth: 0, fill: "var(--chart-avg)" }} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }} connectNulls isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Endpoint table */}
      <TableCard title="API endpoints" subtitle="Sorted by slowest p95" empty={!data.endpoints.length}>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-muted-foreground border-b border-border">
              <th className="py-2 pr-3 font-medium">Endpoint</th>
              <Th>Calls</Th><Th>Avg</Th><Th>p50</Th><Th>p95</Th><Th>Max</Th><Th>Last</Th><Th>Errors</Th>
            </tr>
          </thead>
          <tbody>
            {data.endpoints.map((e) => (
              <tr key={e.endpoint} className="border-b border-border/60 last:border-0">
                <td className="py-2 pr-3 font-mono text-[11px] whitespace-nowrap">{e.endpoint}</td>
                <Td>{e.count}</Td><Td>{fmtMs(e.avg)}</Td><Td>{fmtMs(e.p50)}</Td>
                <Td><LevelValue ms={e.p95} kind="api" /></Td>
                <Td>{fmtMs(e.max)}</Td><Td>{fmtMs(e.last_ms)}</Td>
                <Td className={e.errors ? "text-destructive font-semibold" : ""}>{e.errors}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableCard>

      {/* Page table */}
      <TableCard title="Pages" subtitle="Full loads and in-app route changes" empty={!data.pages.length}>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-muted-foreground border-b border-border">
              <th className="py-2 pr-3 font-medium">Page</th>
              <th className="py-2 pr-3 font-medium">Type</th>
              <Th>Views</Th><Th>Avg</Th><Th>p95</Th><Th>TTFB</Th><Th>First paint</Th><Th>DOM ready</Th>
            </tr>
          </thead>
          <tbody>
            {data.pages.map((p) => (
              <tr key={`${p.kind}${p.page}`} className="border-b border-border/60 last:border-0">
                <td className="py-2 pr-3 font-mono text-[11px] whitespace-nowrap">{p.page || "/"}</td>
                <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">{p.kind === "page_load" ? "Full load" : "Navigation"}</td>
                <Td>{p.count}</Td>
                <Td><LevelValue ms={p.avg} kind={p.kind === "page_load" ? "page" : "nav"} /></Td>
                <Td>{fmtMs(p.p95)}</Td><Td>{fmtMs(p.ttfb)}</Td><Td>{fmtMs(p.fcp)}</Td><Td>{fmtMs(p.dcl)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableCard>

      {/* Live request feed */}
      <TableCard title="Latest API requests" subtitle="Most recent first" empty={!data.recent.length}>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-muted-foreground border-b border-border">
              <th className="py-2 pr-3 font-medium">Time</th>
              <th className="py-2 pr-3 font-medium">Request</th>
              <Th>Status</Th><Th>Latency</Th>
            </tr>
          </thead>
          <tbody>
            {data.recent.map((r, i) => (
              <tr key={`${r.t}-${i}`} className="border-b border-border/60 last:border-0">
                <td className="py-1.5 pr-3 text-muted-foreground whitespace-nowrap tabular-nums">{new Date(r.t).toLocaleTimeString()}</td>
                <td className="py-1.5 pr-3 font-mono text-[11px] whitespace-nowrap">{r.method} {r.route}</td>
                <Td className={r.status >= 400 ? "text-destructive font-semibold" : ""}>{r.status}</Td>
                <Td><LevelValue ms={r.ms} kind="api" /></Td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableCard>
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-[11px] text-muted-foreground">{subtitle}</span>
      </div>
      {children}
    </div>
  );
}

function Tile({ icon: Icon, label, value, sub, level }: { icon: typeof Server; label: string; value: string; sub?: string; level?: Level | null }) {
  const s = level ? LEVEL_STYLE[level] : null;
  return (
    <div className="rounded-2xl bg-card border border-border p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5"><Icon className="h-3.5 w-3.5" /> {label}</span>
        {s && (
          <span className={`text-[10px] font-bold uppercase rounded-full px-2 py-0.5 flex items-center gap-1 ${s.cls}`}>
            <s.Icon className="h-2.5 w-2.5" /> {s.label}
          </span>
        )}
      </div>
      <p className="text-2xl font-bold tabular-nums tracking-tight">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5 tabular-nums">{sub}</p>}
    </div>
  );
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-card border border-border p-4 shadow-[var(--shadow-card)]">
      <p className="text-sm font-semibold">{title}</p>
      <p className="text-[11px] text-muted-foreground mb-3">{subtitle}</p>
      {children}
    </div>
  );
}

function TableCard({ title, subtitle, empty, children }: { title: string; subtitle: string; empty: boolean; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-card border border-border p-4 shadow-[var(--shadow-card)]">
      <p className="text-sm font-semibold">{title}</p>
      <p className="text-[11px] text-muted-foreground mb-2">{subtitle}</p>
      {empty ? (
        <p className="text-xs text-muted-foreground py-6 text-center">No data in this time window yet.</p>
      ) : (
        <div className="overflow-x-auto -mx-1 px-1">{children}</div>
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="py-2 pl-3 font-medium text-right whitespace-nowrap">{children}</th>;
}

function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`py-1.5 pl-3 text-right tabular-nums whitespace-nowrap ${className}`}>{children}</td>;
}

function LevelValue({ ms, kind }: { ms: number; kind: keyof typeof BUDGETS }) {
  const lvl = levelOf(ms, kind)!;
  const { Icon } = LEVEL_STYLE[lvl];
  const color = lvl === "good" ? "text-foreground" : lvl === "slow" ? "text-yellow-700 dark:text-sunshine" : "text-destructive";
  return (
    <span className={`inline-flex items-center gap-1 ${color}`} title={LEVEL_STYLE[lvl].label}>
      {lvl !== "good" && <Icon className="h-3 w-3" />}
      {fmtMs(ms)}
    </span>
  );
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((p: any) => p.value !== null && p.value !== undefined);
  const requests = payload[0]?.payload?.requests;
  return (
    <div className="rounded-xl border border-border bg-popover px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold mb-1">{label}</p>
      {rows.length === 0 && <p className="text-muted-foreground">No samples</p>}
      {rows.map((p: any) => (
        <p key={p.dataKey} className="flex items-center gap-2 tabular-nums">
          <span className="h-0.5 w-3 rounded" style={{ background: p.stroke }} />
          <span className="text-muted-foreground">{p.name}</span>
          <span className="ml-auto font-semibold text-foreground">{fmtMs(p.value)}</span>
        </p>
      ))}
      {typeof requests === "number" && <p className="text-muted-foreground mt-1">{requests} API requests</p>}
    </div>
  );
}
