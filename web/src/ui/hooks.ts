import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

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

/** Runs load() when deps change; reload() runs it again (e.g. after a transaction). */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[]): [Async<T>, () => void] {
  const [state, setState] = useState<Async<T>>({ status: "loading" });
  const [tick, setTick] = useState(0);
  const seq = useRef(0);
  useEffect(() => {
    const my = ++seq.current;
    setState((s) => (s.status === "ready" ? s : { status: "loading" }));
    load().then(
      (value) => my === seq.current && setState({ status: "ready", value }),
      (error: Error) => my === seq.current && setState({ status: "error", error }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return [state, reload];
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
