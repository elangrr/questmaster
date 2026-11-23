// Size audit shared by e2e/audit.spec.ts (full report on request) and the
// sizing guard in e2e/app.spec.ts. It visits every page and state, and for
// each "role" (a kind of thing on screen) records the computed sizes.
import type { Page } from "@playwright/test";

export const OTHER = "g1u7y667z64x2h7vc6fmpcprgey4ck233jaww9zq";
export const BUILDER = "g1us8428u2a5satrlxzagqqa5m6vmuze025anjlj";

/** Pages and states. `prep` runs after load (for example to open an action). */
export const PAGES: { name: string; route: string; prep?: (p: Page) => Promise<void> }[] = [
  { name: "board", route: "/" },
  { name: "board-p2", route: "/?page=2" },
  { name: "paid", route: "/paid" },
  { name: "address-poster", route: `/address/${OTHER}` },
  { name: "address-builder", route: `/address/${BUILDER}?as=builder` },
  { name: "quest-open", route: "/quest/31", prep: async (p) => void (await p.locator(".action", { hasText: "Take this quest" }).getByRole("button", { name: "Other ways" }).click()) },
  { name: "quest-claimed", route: "/quest/3" },
  { name: "quest-submitted", route: "/quest/4" },
  { name: "quest-closing", route: "/quest/5" },
  { name: "quest-paid", route: "/quest/1" },
  { name: "quest-cancelled", route: "/quest/2" },
  { name: "quest-hostile", route: "/quest/7" },
  { name: "post", route: "/post" },
  { name: "how", route: "/how" },
  { name: "agents", route: "/agents" },
  { name: "missing", route: "/nothing-here" },
];

/** Roles: one kind of thing, which should look the same everywhere. */
export const ROLES: Record<string, string> = {
  "hero title": "main .hero h1",
  "page title": "main h1:not(#hero-title)",
  "section title": "main h2:not(.sr-only):not(.card-title)",
  "card title": "main h3, main .card-title, main .rec-headline, main .state-box strong",
  lead: "main .lead, main .hero [data-enter] > p",
  body: "main .prose p:not(.muted):not(.small):not(.lead), main .plain, main .action-explain, main .callout, main .rec-note, main .state-box p, main .step-card p, main .rule-card p, main .facts dd, main table.quests td",
  "small/muted": "main .small, main .field-hint, main .field-error, main .crumbs, main .rec-line, main .hero-fact, main .deadline-head, main .txstep",
  "step label": "main .step",
  caption: "main .stat-label, main dl.facts dt, main .rec-stat dt, main table.quests th",
  "field label": "main .field-label",
  "stat value": "main .stat-value, main .rec-stat dd, main .big-reward .amount",
  amount: "main .amount:not(.big-reward .amount)",
  "dollar hint": "main .usd",
  badge: "main .badge, header .net, main .reject-count, main .you",
  "button (regular)": "main .btn:not(.btn-small)",
  "button (small)": ".btn-small:not(.btn-ghost)",
  "icon button": ".btn-ghost",
  "input/select": "main input.input, main select.input",
  "nav link": "header .nav-link",
  tab: "main .tab",
  "code block": "main pre.cmd",
  "mono inline": "main .mono:not(pre):not(.input), main .addr, footer .mono",
  footer: "footer p",
  "logo mark": "header .mark",
  "step dot": "main .step-dot",
  "small icon": "main .rec-mark, main .txstep-dot, main .callout-icon",
  card: "main .stat, main .record-card, main .step-card, main .rule-card, main .plain, main .cost, main .prompt, main .hero-visual, main .state-box",
  inset: "main .callout, main .rec-note, main .ok, main pre.cmd:not(.code-card .cmd), main .txstep, main .rec-stat",
};

/** Roles whose box height is part of the contract (controls and icons). */
export const HEIGHT_ROLES = new Set(["badge", "button (regular)", "button (small)", "icon button", "input/select", "nav link", "tab", "logo mark", "step dot", "small icon"]);
/** Roles whose padding and radius are part of the contract. */
export const BOX_ROLES = new Set(["card", "inset"]);
/** Roles whose text size is part of the contract (everything else). */
export const TEXT_ROLES = (r: string) => !BOX_ROLES.has(r) && !["logo mark", "small icon"].includes(r);

export interface Sample {
  role: string;
  page: string;
  width: number;
  theme: string;
  cls: string;
  fontSize: string;
  lineHeight: string;
  fontWeight: string;
  height: number;
  width_: number;
  padding: string;
  radius: string;
  border: string;
  marginTop: string;
}

export async function collect(page: Page, pageName: string, width: number, theme: string): Promise<Sample[]> {
  return page.evaluate(
    ({ roles, pageName, width, theme }) => {
      const out: any[] = [];
      for (const [role, sel] of Object.entries(roles)) {
        for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 && r.height === 0) continue; // hidden
          const cs = getComputedStyle(el);
          out.push({
            role,
            page: pageName,
            width,
            theme,
            cls: (el.tagName.toLowerCase() + "." + Array.from(el.classList).join(".")).replace(/\.$/, ""),
            fontSize: cs.fontSize,
            lineHeight: cs.lineHeight,
            fontWeight: cs.fontWeight,
            height: Math.round(r.height * 10) / 10,
            width_: Math.round(r.width),
            padding: `${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}`,
            radius: cs.borderTopLeftRadius,
            border: cs.borderTopWidth,
            marginTop: cs.marginTop,
          });
        }
      }
      return out;
    },
    { roles: ROLES, pageName, width, theme },
  );
}

/** Layout facts per page: overflow, gutters, content width. */
export async function layout(page: Page) {
  return page.evaluate(() => {
    const main = document.querySelector<HTMLElement>("main")!;
    const cs = getComputedStyle(main);
    const top = document.querySelector<HTMLElement>(".top-inner");
    return {
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      mainPadding: cs.paddingLeft,
      mainMax: cs.maxWidth,
      headerPadding: top ? getComputedStyle(top).paddingLeft : "",
      headerHeight: Math.round(document.querySelector("header")!.getBoundingClientRect().height),
      smallTargets: Array.from(document.querySelectorAll<HTMLElement>("a, button, input, select, summary, [role=tab]"))
        .filter((e) => {
          const r = e.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) return false;
          // Plain text links inside sentences are not controls; everything else must be 44 px.
          if (e.tagName === "A" && !e.classList.contains("btn") && !e.classList.contains("nav-link") && !e.classList.contains("tab") && !e.classList.contains("brand")) return false;
          if (e.classList.contains("skip") && r.left < 0) return false; // off-screen until focused
          return r.height < 44;
        })
        .map((e) => `${e.tagName.toLowerCase()}.${Array.from(e.classList).join(".")}:${Math.round(e.getBoundingClientRect().height)}`),
    };
  });
}
