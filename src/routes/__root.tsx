import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

import appCss from "../styles.css?url";
import { AuthProvider } from "@/context/auth-context";
import { Toaster } from "@/components/ui/sonner";
import { useEffect } from "react";
import { startPerfReporting, recordSample, normalizePath } from "@/lib/perf";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "DentiBuddy — Pediatric Dental Care for Kids" },
      { name: "description", content: "Find pediatric dentists, book visits, ask our AI dental buddy, and keep your child's smile bright." },
      { name: "author", content: "DentiBuddy" },
      { name: "theme-color", content: "#5cb8e6" },
      { property: "og:title", content: "DentiBuddy — Pediatric Dental Care for Kids" },
      { property: "og:description", content: "Find pediatric dentists, book visits, ask our AI dental buddy, and keep your child's smile bright." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Lovable" },
      { name: "twitter:title", content: "DentiBuddy — Pediatric Dental Care for Kids" },
      { name: "twitter:description", content: "Find pediatric dentists, book visits, ask our AI dental buddy, and keep your child's smile bright." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/73b19bd0-e53a-4ceb-924b-2e941f38696d/id-preview-31b9b1bf--14722986-5afa-42e7-8cdc-b71bd2134436.lovable.app-1778604756217.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/73b19bd0-e53a-4ceb-924b-2e941f38696d/id-preview-31b9b1bf--14722986-5afa-42e7-8cdc-b71bd2134436.lovable.app-1778604756217.png" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Apply saved/system theme before first paint to avoid a flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('denti_theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark');}}catch(e){}})();`,
          }}
        />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  // Measure in-app route changes: navigation start -> new route rendered
  useEffect(() => {
    startPerfReporting();
    let navStart: number | null = null;
    const offStart = router.subscribe("onBeforeNavigate", (e) => {
      navStart = e.pathChanged ? performance.now() : null;
    });
    const offEnd = router.subscribe("onRendered", (e) => {
      if (navStart === null) return;
      recordSample({ kind: "navigation", page: normalizePath(e.toLocation.pathname), ms: performance.now() - navStart });
      navStart = null;
    });
    return () => { offStart(); offEnd(); };
  }, [router]);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Outlet />
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}
