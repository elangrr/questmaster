// Network defaults (Onyx). Shared by the app (src/config.ts) and the build
// (vite.config.ts fills the GnoConnect tags in index.html from them), so a
// plain `npm run build` with no .env is complete. VITE_* variables override.
export const defaults = {
  VITE_CHAIN_ID: "onyx-1",
  VITE_NETWORK_NAME: "Onyx testnet",
  VITE_RPC_URL: "https://rpc.onyx.testnets.gno.land:443",
} as const;
