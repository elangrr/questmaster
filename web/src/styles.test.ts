// Guards the sizing system: sizes come from the tokens at the top of
// styles.css, not from one-off values scattered through the app.
import { describe, expect, it } from "vitest";
import css from "./styles.css?raw";

const components = import.meta.glob<string>("./ui/*.tsx", { query: "?raw", import: "default", eager: true });

/** CSS outside the token block, with line numbers, keyframes blocks removed. */
function ruleLines(): { n: number; text: string }[] {
  const lines = css.split("\n");
  const start = lines.findIndex((l) => l.includes("/* tokens:start */"));
  const end = lines.findIndex((l) => l.includes("/* tokens:end */"));
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  const out: { n: number; text: string }[] = [];
  let inKeyframes = 0;
  lines.forEach((text, i) => {
    if (i >= start && i <= end) return;
    // Keyframes hold motion distances and SVG coordinates, not layout sizes.
    if (/@keyframes/.test(text)) inKeyframes = 1;
    if (inKeyframes) {
      if (/@keyframes/.test(text) && /\}\s*\}\s*$/.test(text)) inKeyframes = 0; // one-line keyframes
      else if (/^\}/.test(text)) inKeyframes = 0;
      return;
    }
    out.push({ n: i + 1, text });
  });
  return out;
}

describe("styles.css sizing", () => {
  it("has no raw px outside the token block (media queries, keyframes and justified lines excepted)", () => {
    const offenders = ruleLines()
      .filter(({ text }) => /\d+(\.\d+)?px/.test(text.replace(/\/\*.*?\*\//g, "")))
      .filter(({ text }) => !/^\s*@media/.test(text) && !/\/\*\s*px:/.test(text))
      .map(({ n, text }) => `${n}: ${text.trim()}`);
    expect(offenders).toEqual([]);
  });

  it("sets every font size from a type token", () => {
    const offenders = ruleLines()
      .flatMap(({ n, text }) => [...text.matchAll(/font-size:\s*([^;}]+)/g)].map((m) => ({ n, v: m[1].trim(), text })))
      .filter(({ v, text }) => !/^var\(--fs-[a-z]+\)$/.test(v) && v !== "inherit" && !/\/\*\s*px:/.test(text))
      .map(({ n, v }) => `${n}: font-size ${v}`);
    expect(offenders).toEqual([]);
  });

  it("uses only scale values for spacing tokens", () => {
    const scale = [...css.matchAll(/--s-\d+:\s*(\d+)px/g)].map((m) => Number(m[1]));
    expect(scale).toEqual([4, 8, 12, 16, 24, 32, 48]);
  });

  it("keeps rem/em font sizes out of the rules", () => {
    expect(ruleLines().filter(({ text }) => /font(-size)?:[^;]*\d(\.\d+)?r?em\b/.test(text)).map(({ n }) => n)).toEqual([]);
  });
});

describe("components sizing", () => {
  const files = Object.keys(components);
  const source = (f: string) => components[f];

  it("sizes no <svg> with width/height attributes (CSS tokens size them)", () => {
    const offenders = files.flatMap((f) =>
      source(f)
        .split("\n")
        .map((l, i) => ({ l, i }))
        .filter(({ l }) => /<svg\b[^>]*\s(width|height)=/.test(l))
        .map(({ i }) => `${f}:${i + 1}`),
    );
    expect(offenders).toEqual([]);
  });

  it("puts no px sizes in inline styles", () => {
    const offenders = files.flatMap((f) =>
      source(f)
        .split("\n")
        .map((l, i) => ({ l, i }))
        .filter(({ l }) => /style=\{\{[^}]*\d+px/.test(l) || /(fontSize|padding|margin|width|height):\s*\d/.test(l))
        .map(({ i }) => `${f}:${i + 1}`),
    );
    expect(offenders).toEqual([]);
  });
});
