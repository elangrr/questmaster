/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { defaults } from "./src/defaults.ts";

// Fills %VITE_*% placeholders in index.html (the GnoConnect tags) from the
// environment, falling back to the Onyx defaults, so they are never left empty.
function htmlDefaults(mode: string): Plugin {
  const env = { ...defaults, ...Object.fromEntries(Object.entries(loadEnv(mode, ".", "VITE_")).filter(([, v]) => v.trim() !== "")) };
  return {
    name: "html-defaults",
    transformIndexHtml: {
      order: "pre",
      handler: (html) => html.replace(/%(VITE_[A-Z_]+)%/g, (m, k: string) => (k in env ? escapeAttr(String(env[k as keyof typeof env])) : m)),
    },
  };
}
const escapeAttr = (v: string) => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

// base "./" makes every asset URL relative, so the built app works from any
// sub-path (for example https://<user>.github.io/questmaster/) without a rebuild.
export default defineConfig(({ mode }) => ({
  base: "./",
  plugins: [htmlDefaults(mode), react()],
  build: { outDir: "dist", sourcemap: false },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // Let src/styles.test.ts read styles.css as text (?raw) for the sizing lint.
    css: true,
  },
}));
