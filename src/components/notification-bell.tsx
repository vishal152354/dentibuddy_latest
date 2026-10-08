import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Bell, BellRing, CheckCheck } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface AppNotification {
  id: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  created_at: string;
}

const POLL_MS = 30_000;
// Only alert for notifications this fresh, so logging in doesn't replay old reminders
const ALERT_WINDOW_MS = 20 * 60_000;
const ALERTED_KEY = "denti_alerted_notifications";

function loadAlerted(): Set<string> {
  try { return new Set(JSON.parse(sessionStorage.getItem(ALERTED_KEY) ?? "[]")); } catch { return new Set(); }
}
function saveAlerted(ids: Set<string>) {
  try { sessionStorage.setItem(ALERTED_KEY, JSON.stringify([...ids].slice(-100))); } catch { /* storage unavailable */ }
}

function timeAgo(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  return h < 24 ? `${h} h ago` : new Date(iso).toLocaleDateString();
}

const systemNotificationsSupported = () => typeof window !== "undefined" && "Notification" in window && window.isSecureContext;

export function NotificationBell() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    systemNotificationsSupported() ? Notification.permission : "unsupported",
  );
  const alerted = useRef<Set<string>>(loadAlerted());

  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.get<{ unread: number; items: AppNotification[] }>("/notifications"),
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: true,
  });

  const markAll = useMutation({
    mutationFn: () => api.post("/notifications/read-all", {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const markOne = useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}/read`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  function openNotification(n: AppNotification) {
    if (!n.read) markOne.mutate(n.id);
    setOpen(false);
    if (n.link) navigate({ to: n.link });
  }

  // Surface new reminders as a toast and, when allowed, a system notification
  useEffect(() => {
    for (const n of data?.items ?? []) {
      if (n.read || alerted.current.has(n.id)) continue;
      if (Date.now() - new Date(n.created_at).getTime() > ALERT_WINDOW_MS) continue;
      alerted.current.add(n.id);
      toast(n.title, {
        description: n.body,
        icon: <BellRing className="h-4 w-4 text-primary" />,
        duration: 15_000,
        action: n.link ? { label: "View", onClick: () => openNotification(n) } : undefined,
      });
      if (systemNotificationsSupported() && Notification.permission === "granted") {
        try {
          const sys = new Notification(n.title, { body: n.body, tag: n.id, icon: "/favicon.ico" });
          sys.onclick = () => { window.focus(); openNotification(n); sys.close(); };
        } catch { /* some browsers only allow notifications from a service worker */ }
      }
    }
    saveAlerted(alerted.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  async function enableSystemAlerts() {
    if (!systemNotificationsSupported()) return;
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === "granted") toast.success("Desktop alerts turned on");
  }

  const unread = data?.unread ?? 0;
  const items = data?.items ?? [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="relative h-9 w-9 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        >
          <Bell className="h-[18px] w-[18px]" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-coral text-coral-foreground text-[10px] font-bold flex items-center justify-center tabular-nums">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <p className="text-sm font-semibold">Notifications</p>
          {unread > 0 && (
            <button onClick={() => markAll.mutate()} className="text-xs text-primary font-medium flex items-center gap-1 hover:underline">
              <CheckCheck className="h-3.5 w-3.5" /> Mark all read
            </button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {items.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8 px-4">
              No notifications yet. You'll get a reminder {15} minutes before each visit.
            </p>
          ) : (
            items.map((n) => (
              <button
                key={n.id}
                onClick={() => openNotification(n)}
                className={`w-full text-left px-4 py-3 border-b border-border/60 last:border-0 hover:bg-muted/50 transition-colors flex gap-3 ${n.read ? "" : "bg-primary/5"}`}
              >
                <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${n.read ? "bg-transparent" : "bg-primary"}`} />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{n.title}</span>
                  <span className="block text-xs text-muted-foreground mt-0.5">{n.body}</span>
                  <span className="block text-[11px] text-muted-foreground mt-1">{timeAgo(n.created_at)}</span>
                </span>
              </button>
            ))
          )}
        </div>
        {permission === "default" && (
          <div className="px-4 py-3 border-t border-border bg-muted/40">
            <button onClick={enableSystemAlerts} className="text-xs font-medium text-primary hover:underline flex items-center gap-1.5">
              <BellRing className="h-3.5 w-3.5" /> Turn on desktop alerts for visit reminders
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
