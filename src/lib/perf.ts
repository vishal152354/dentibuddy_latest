import { getApiBaseUrl } from "@/lib/api";

// Collects browser-side timings and ships them to /api/metrics/web in small batches
// so the admin dashboard can show real page and API latency as users see it.

type Sample = {
  kind: "page_load" | "navigation" | "api";
  page: string;
  ms: number;
  ttfb?: number;
  fcp?: number;
  dcl?: number;
  status?: number;
};

const FLUSH_MS = 5000;
const queue: Sample[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let started = false;

/** Collapse ids in paths so /dentists/6ac1... and /dentists/6ac2... group together. */
export function normalizePath(path: string): string {
  return path
    .split("?")[0]
    .replace(/[0-9a-f]{24}/gi, ":id")
    .replace(/\/\d+(?=\/|$)/g, "/:n");
}

export function recordSample(s: Sample) {
  if (typeof window === "undefined") return;
  queue.push(s);
  if (!timer) timer = setTimeout(flush, FLUSH_MS);
}

function flush() {
  timer = null;
  if (!queue.length) return;
  const samples = queue.splice(0, 100);
  const url = `${getApiBaseUrl()}/metrics/web`;
  const body = JSON.stringify({ samples });
  try {
    if (navigator.sendBeacon?.(url, new Blob([body], { type: "application/json" }))) return;
  } catch { /* fall through to fetch */ }
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
  if (queue.length) timer = setTimeout(flush, FLUSH_MS);
}

/** Report the initial full page load once the load event has finished. */
export function startPerfReporting() {
  if (typeof window === "undefined" || started) return;
  started = true;

  const report = () => {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (!nav || nav.loadEventEnd <= 0) return;
    const fcp = performance.getEntriesByName("first-contentful-paint")[0]?.startTime;
    recordSample({
      kind: "page_load",
      page: normalizePath(location.pathname),
      ms: nav.loadEventEnd - nav.startTime,
      ttfb: nav.responseStart - nav.startTime,
      dcl: nav.domContentLoadedEventEnd - nav.startTime,
      fcp,
    });
  };

  // loadEventEnd is only populated after the load handler returns
  if (document.readyState === "complete") setTimeout(report, 0);
  else window.addEventListener("load", () => setTimeout(report, 0), { once: true });

  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
}
