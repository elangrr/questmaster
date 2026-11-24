import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { POLL_MAX_AGE_MS, sameValue, startPoller } from "../lib/live";
import type { ReadOpts } from "../lib/rpc";

/** Current hash route, e.g. "/quest/3" for "#/quest/3". */
function getRoute(): string {
  const h = window.location.hash.replace(/^#/, "");
  return h === "" ? "/" : h;
}

export function useRoute(): string {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener("hashchange", cb);
      return () => window.removeEventListener("hashchange", cb);
    },
    getRoute,
    () => "/",
  );
}

export function go(route: string): void {
  window.location.hash = route;
}

export type Async<T> = { status: "loading" } | { status: "error"; error: Error } | { status: "ready"; value: T };

export interface Live<T> {
  state: Async<T>;
  /** Load again in the foreground (the Retry button): shows loading or an error. */
  reload(): void;
  /** Read again in the background now; resolves once the result is on screen (or was dropped). Rejects when the read fails. */
  refresh(): Promise<void>;
}

export interface LiveOpts<T> {
  /** Re-read in the background every pollMs while the tab is visible; null to stop. */
  pollMs: number | null;
  /** Stop polling while the shown value says nothing more can change (for example a paid quest). */
  stopWhen?: (shown: T) => boolean;
  /** May a background result replace the shown value? (For example: not a stale read from a lagging node.) */
  accept?: (next: T, shown: T) => boolean;
}

/**
 * Loads once per deps (with a skeleton or error box), then keeps the value
 * current with quiet background reads:
 *  - a background result that equals what is shown changes nothing (no re-render);
 *  - a failed background read keeps the last good value (the next tick tries again);
 *  - results apply in the order their reads started, so an older read never
 *    overwrites a newer one; results for old deps are dropped.
 * load() gets read options (fresh reads when polling) and the value shown now.
 */
export function useLive<T>(load: (o: ReadOpts | undefined, shown: T | undefined) => Promise<T>, deps: unknown[], opts: LiveOpts<T>): Live<T> {
  const [state, setState] = useState<Async<T>>({ status: "loading" });
  const [tick, setTick] = useState(0);
  const seq = useRef(0); // every read gets a number
  const applied = useRef(0); // the newest read whose result was applied
  const epoch = useRef(0); // bumped when deps change or on reload(): older reads are dropped
  const shown = useRef<T | undefined>(undefined);
  const loadRef = useRef(load);
  loadRef.current = load;
  const acceptRef = useRef(opts.accept);
  acceptRef.current = opts.accept;

  const show = useCallback((s: Async<T>) => {
    shown.current = s.status === "ready" ? s.value : undefined;
    setState(s);
  }, []);

  useEffect(() => {
    const ep = ++epoch.current;
    const my = ++seq.current;
    setState((s) => (s.status === "ready" ? s : { status: "loading" }));
    loadRef.current(undefined, undefined).then(
      (value) => {
        if (ep !== epoch.current || my < applied.current) return;
        applied.current = my;
        show({ status: "ready", value });
      },
      (error: Error) => {
        if (ep !== epoch.current || my < applied.current) return;
        applied.current = my;
        show({ status: "error", error });
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const refresh = useCallback(async () => {
    const ep = epoch.current;
    const my = ++seq.current;
    const before = shown.current;
    const value = await loadRef.current({ maxAgeMs: POLL_MAX_AGE_MS }, before);
    if (ep !== epoch.current || my < applied.current) return;
    applied.current = my;
    const prev = shown.current;
    if (prev !== undefined && (sameValue(prev, value) || (acceptRef.current && !acceptRef.current(value, prev)))) return;
    show({ status: "ready", value });
  }, [show]);

  // An error box is retried in the background too, at a quarter of the pace.
  const pollMs =
    opts.pollMs === null || (state.status === "ready" && opts.stopWhen?.(state.value)) ? null : state.status === "error" ? opts.pollMs * 4 : opts.pollMs;
  useEffect(() => {
    if (!pollMs) return;
    const p = startPoller(refresh, pollMs);
    return () => p.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollMs, refresh, ...deps]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { state, reload, refresh };
}

export type Theme = "light" | "dark" | "system";

export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const t = localStorage.getItem("qm-theme");
      return t === "light" || t === "dark" ? t : "system";
    } catch {
      return "system";
    }
  });
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
    try {
      if (theme === "system") localStorage.removeItem("qm-theme");
      else localStorage.setItem("qm-theme", theme);
    } catch {
      /* private mode: the choice just isn't remembered */
    }
  }, [theme]);
  return [theme, setTheme];
}
