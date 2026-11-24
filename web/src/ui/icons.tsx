// One small icon set, drawn here: 24-unit grid, 1.75 stroke, round caps,
// currentColor. Sized by CSS (.icon uses the icon tokens), never by attributes.

const PATHS = {
  sun: "M12 4V2.5M12 21.5V20M4 12H2.5M21.5 12H20M6.3 6.3 5.3 5.3M18.7 18.7l-1-1M6.3 17.7l-1 1M18.7 5.3l-1 1M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  moon: "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z",
  auto: "M12 3a9 9 0 1 0 0 18V3Z M12 3a9 9 0 1 1 0 18",
  "arrow-right": "M5 12h14M13 6l6 6-6 6",
  "arrow-left": "M19 12H5M11 6l-6 6 6 6",
  check: "M5 12.5l4.5 4.5L19 7",
  alert: "M12 7v6M12 17h.01",
  undo: "M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3",
  chevron: "M8 10l4 4 4-4",
  pause: "M9 6v12M15 6v12",
  play: "M8 5.5v13l11-6.5-11-6.5Z",
  lock: "M7 11h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2Zm2 0V8a3 3 0 0 1 6 0v3",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v4.5l3 1.5",
  "external-link": "M14 5h5v5M19 5l-9 9M10 7H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-4",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className = "" }: { name: IconName; className?: string }) {
  return (
    <svg className={`icon ${className}`} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={PATHS[name]} />
    </svg>
  );
}
