import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { config } from "../config";
import { account, connect, getAdena, rememberConnection, restoreAccount, switchNetwork, wasConnected, WalletError, type Adena } from "../lib/wallet";

interface WalletState {
  installed: boolean;
  address: string | null;
  chainId: string | null;
  onRightNetwork: boolean;
  /** Reconnecting silently after a page load (the user connected here before). */
  restoring: boolean;
  busy: boolean;
  error: string | null;
  connect(): Promise<void>;
  switchNetwork(): Promise<void>;
  disconnect(): void;
}

const Ctx = createContext<WalletState | null>(null);

/** How long to look for Adena after page load: it injects itself after the page. */
const FIND_ADENA_MS = 5_000;

// Adena's On() adds a window listener and returns true; it cannot be removed.
// So listen once per Adena object for the life of the page, and send the
// events to whichever provider is mounted now.
const listening = new WeakSet<Adena>();
let onWalletEvent: () => void = () => {};

export function WalletProvider({ children }: { children: ReactNode }) {
  const [installed, setInstalled] = useState(() => getAdena() !== null);
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(() => wasConnected());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const addressRef = useRef(address);
  addressRef.current = address;

  // Adena injects itself after page load; look again briefly. If it never
  // shows up, there is nothing to restore.
  useEffect(() => {
    if (installed) return;
    const t = setInterval(() => getAdena() && setInstalled(true), 500);
    const stop = setTimeout(() => {
      clearInterval(t);
      setRestoring(false);
    }, FIND_ADENA_MS);
    return () => {
      clearInterval(t);
      clearTimeout(stop);
    };
  }, [installed]);

  // Silent restore: GetAccount only, which never opens a popup. A locked
  // wallet or a site Adena no longer knows falls back to "Connect wallet".
  useEffect(() => {
    if (!restoring || !installed) return;
    let live = true;
    void restoreAccount().then((r) => {
      if (!live) return;
      if (r.status === "connected") {
        setAddress(r.account.address);
        setChainId(r.account.chainId);
      } else if (r.status === "not-connected") {
        rememberConnection(false);
      }
      setRestoring(false);
    });
    return () => {
      live = false;
    };
  }, [restoring, installed]);

  const refresh = useCallback(async () => {
    const acc = await account();
    setAddress(acc.address);
    setChainId(acc.chainId);
  }, []);

  // Account or network changed in Adena: read the account again (only while connected here).
  useEffect(() => {
    onWalletEvent = () => {
      if (addressRef.current) void refresh().catch(() => setAddress(null));
    };
  }, [refresh]);
  useEffect(() => {
    const a = getAdena();
    if (!a?.On || listening.has(a)) return;
    listening.add(a);
    a.On("changedAccount", () => onWalletEvent());
    a.On("changedNetwork", () => onWalletEvent());
  }, [installed]);

  const run = useCallback(async (f: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await f();
    } catch (e) {
      setError(e instanceof WalletError ? e.message : "Something went wrong with the wallet.");
    } finally {
      setBusy(false);
    }
  }, []);

  const value = useMemo<WalletState>(
    () => ({
      installed,
      address,
      chainId,
      onRightNetwork: chainId === config.chainId,
      restoring,
      busy,
      error,
      connect: () =>
        run(async () => {
          const acc = await connect();
          setAddress(acc.address);
          setChainId(acc.chainId);
          rememberConnection(true);
        }),
      switchNetwork: () =>
        run(async () => {
          await switchNetwork();
          await refresh();
        }),
      disconnect: () => {
        rememberConnection(false);
        setAddress(null);
        setChainId(null);
        setError(null);
      },
    }),
    [installed, address, chainId, restoring, busy, error, run, refresh],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWallet(): WalletState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWallet outside WalletProvider");
  return v;
}
