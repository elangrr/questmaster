// Turns an audit folder (samples.json, layout.json) into report.md:
// per role, every distinct value found, per breakpoint, with where each comes from.
// Usage: node e2e/audit-report.mjs <folder>
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
const samples = JSON.parse(readFileSync(join(dir, "samples.json"), "utf8"));
const lay = JSON.parse(readFileSync(join(dir, "layout.json"), "utf8"));

const bp = (w) => (w < 700 ? "phone (360/390)" : w < 1100 ? "tablet (768/1024)" : "desktop (1280)");
const props = {
  "font-size / line-height / weight": (s) => `${s.fontSize} / ${s.lineHeight} / ${s.fontWeight}`,
  height: (s) => `${s.height}px`,
  padding: (s) => s.padding,
  radius: (s) => s.radius,
  border: (s) => s.border,
};
const heightRoles = new Set(["badge", "button (regular)", "button (small)", "icon button", "input/select", "nav link", "tab", "logo mark", "step dot", "small icon"]);
const boxRoles = new Set(["card", "inset"]);

let md = `# Size audit\n\n${samples.length} samples, ${new Set(samples.map((s) => s.page)).size} pages, widths ${[...new Set(samples.map((s) => s.width))].join(", ")}, light and dark.\n\n`;
const roles = [...new Set(samples.map((s) => s.role))];
let totalDistinct = 0;
for (const role of roles) {
  const rs = samples.filter((s) => s.role === role);
  md += `## ${role}\n\n| breakpoint | property | distinct values (where) |\n|---|---|---|\n`;
  for (const b of ["phone (360/390)", "tablet (768/1024)", "desktop (1280)"]) {
    const bs = rs.filter((s) => bp(s.width) === b);
    if (!bs.length) continue;
    for (const [name, f] of Object.entries(props)) {
      if (name === "height" && !heightRoles.has(role)) continue;
      if ((name === "padding" || name === "radius" || name === "border") && !boxRoles.has(role)) continue;
      const groups = new Map();
      for (const s of bs) {
        const v = f(s);
        if (!groups.has(v)) groups.set(v, new Set());
        groups.get(v).add(`${s.cls.split(".").slice(0, 3).join(".")}@${s.page}`);
      }
      totalDistinct += groups.size;
      const cells = [...groups.entries()]
        .map(([v, where]) => `**${v}** (${[...where].slice(0, 4).join(", ")}${where.size > 4 ? `, +${where.size - 4}` : ""})`)
        .join("<br>");
      md += `| ${b} | ${name}${groups.size > 1 ? ` ⚠ ${groups.size}` : ""} | ${cells} |\n`;
    }
  }
  md += "\n";
}

md += `## Layout\n\n| width | horizontal overflow (px) | main gutter | header gutter | header height | controls under 44 px (phone only) |\n|---|---|---|---|---|---|\n`;
for (const w of [...new Set(lay.map((l) => l.width))]) {
  const ls = lay.filter((l) => l.width === w);
  const over = ls.filter((l) => l.overflowX > 0).map((l) => `${l.page}:${l.overflowX}`);
  const small = w < 700 ? [...new Set(ls.flatMap((l) => l.smallTargets))].slice(0, 12).join(", ") : "";
  md += `| ${w} | ${over.length ? over.join(", ") : "0"} | ${[...new Set(ls.map((l) => l.mainPadding))].join(", ")} | ${[...new Set(ls.map((l) => l.headerPadding))].join(", ")} | ${[...new Set(ls.map((l) => l.headerHeight))].join(", ")} | ${small} |\n`;
}
md = md.replace("light and dark.\n\n", `light and dark. Distinct value groups: ${totalDistinct}.\n\n`);
writeFileSync(join(dir, "report.md"), md);
console.log(`wrote ${join(dir, "report.md")} (${totalDistinct} distinct value groups)`);
