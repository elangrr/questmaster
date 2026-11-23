// Small motion helpers. No animation library: CSS for most things, rAF for
// the count-up. Everything checks prefers-reduced-motion and settles at once
// when it is set.

import { useEffect, useRef, useState, type RefObject } from "react";

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** Counts from 0 to `target` once (about 900 ms, ease-out); the final value at once under reduced motion. */
export function useCountUp(target: number, duration = 900): number {
  const [v, setV] = useState(() => (prefersReducedMotion() ? target : 0));
  const done = useRef(false);
  useEffect(() => {
    if (done.current || prefersReducedMotion() || target === 0) {
      setV(target);
      return;
    }
    done.current = true;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setV(target * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else setV(target);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return v;
}

/** True while the element is on screen (used to pause looping visuals off-screen). */
export function useInView<T extends Element>(ref: RefObject<T | null>): boolean {
  const [inView, setInView] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.1 });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return inView;
}

/** True when the page is visible (hidden tabs pause loops too). */
export function usePageVisible(): boolean {
  const [v, setV] = useState(() => typeof document === "undefined" || document.visibilityState !== "hidden");
  useEffect(() => {
    const f = () => setV(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", f);
    return () => document.removeEventListener("visibilitychange", f);
  }, []);
  return v;
}
