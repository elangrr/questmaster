// The one place that says which network and realm the app talks to.
// Values come from VITE_* variables (see .env); the defaults are Onyx.

import { defaults } from "./defaults";

function env(name: string, fallback: string): string {
  const v = (import.meta.env as Record<string, string | undefined>)[name];
  return v && v.trim() !== "" ? v.trim() : fallback;
}

export const config = {
  chainId: env("VITE_CHAIN_ID", defaults.VITE_CHAIN_ID),
  networkName: env("VITE_NETWORK_NAME", defaults.VITE_NETWORK_NAME),
  rpcUrl: env("VITE_RPC_URL", defaults.VITE_RPC_URL),
  realmPath: env("VITE_REALM_PATH", "gno.land/r/g1llc3lq3zmjtjdk29dk52munrzxt5ne746cl7r8/questmaster"),
  gnowebUrl: env("VITE_GNOWEB_URL", "https://onyx.testnets.gno.land"),
  explorerTxUrl: env("VITE_EXPLORER_TX_URL", "https://gnoscan.io/transactions/details?txhash={hash}&chainId=onyx-1"),
  explorerAccountUrl: env("VITE_EXPLORER_ACCOUNT_URL", "https://gnoscan.io/account/{address}?chainId=onyx-1"),
  sourceUrl: env("VITE_SOURCE_URL", "https://github.com/elangrr/questmaster"),
  /** The network's package-approval status page ({path} = package path); "" if none. */
  pkgStatusUrl: env("VITE_PKG_STATUS_URL", "https://gpas.onyx.testnets.gno.land/?path={path}"),
  /**
   * Where the approximate dollar hint gets the GNOT price: "coingecko" (the
   * default) or "off" (no request, no dollar figures). VITE_GNOT_USD, when
   * set to a number, is used instead and nothing is fetched.
   */
  gnotUsdSource: env("VITE_GNOT_USD_SOURCE", "coingecko").toLowerCase(),
  gnotUsdManual: env("VITE_GNOT_USD", ""),
};

/** The official approval status page for the realm, or null. */
export function pkgStatusPage(): string | null {
  return config.pkgStatusUrl ? config.pkgStatusUrl.replace("{path}", encodeURIComponent(config.realmPath)) : null;
}

/** The realm's web path on gnoweb, e.g. /r/g1…/questmaster. */
export function realmWebPath(): string {
  return config.realmPath.replace(/^gno\.land/, "");
}

/** A gnoweb page of the realm, e.g. gnowebPage("quest/3"). */
export function gnowebPage(page = ""): string {
  return config.gnowebUrl + realmWebPath() + (page ? ":" + page : "");
}

export function explorerTx(hash: string): string {
  return config.explorerTxUrl.replace("{hash}", encodeURIComponent(hash));
}

export function explorerAccount(address: string): string {
  return config.explorerAccountUrl.replace("{address}", encodeURIComponent(address));
}

// Realm and escrow constants (p/escrow and r/questmaster as deployed).
export const rules = {
  minRewardUgnot: 1_000_000n,
  maxTitleLen: 80,
  maxDetailsLen: 1000,
  maxLinkLen: 300,
  maxReasonLen: 300,
  minWorkBlocks: 1_000,
  maxWorkBlocks: 2_200_000,
  reviewBlocks: 172_800,
  blockMillis: 3_500, // approximate, for displayed times only
  pageSize: 20,
};

// Gas for the gnokey commands shown to users (same values as the realm's help
// page). Adena estimates gas itself, so these are not sent with wallet calls.
export const gnokeyGas = { wanted: "10000000", fee: "100000ugnot" };
