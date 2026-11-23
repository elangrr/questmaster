import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { config } from "../config";
import { account, connect, getAdena, switchNetwork, WalletError } from "../lib/wallet";

interface WalletState {
  installed: boolean;
  address: string | null;
  chainId: string | null;
  onRightNetwork: boolean;
  busy: boolean;
  error: string | null;
  connect(): Promise<void>;
  switchNetwork(): Promise<void>;
  disconnect(): void;
}

const Ctx = createContext<WalletState | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [installed, setInstalled] = useState(() => getAdena() !== null);
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Adena injects itself after page load; look again briefly.
  useEffect(() => {
    if (installed) return;
    const t = setInterval(() => getAdena() && setInstalled(true), 500);
    const stop = setTimeout(() => clearInterval(t), 5000);
    return () => {
      clearInterval(t);
      clearTimeout(stop);
    };
  }, [installed]);

  const refresh = useCallback(async () => {
    const acc = await account();
    setAddress(acc.address);
    setChainId(acc.chainId);
  }, []);

  useEffect(() => {
    const a = getAdena();
    if (!a?.On || !address) return;
    a.On("changedAccount", () => void refresh().catch(() => setAddress(null)));
    a.On("changedNetwork", () => void refresh().catch(() => setAddress(null)));
  }, [address, refresh]);

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
      busy,
      error,
      connect: () =>
        run(async () => {
          const acc = await connect();
          setAddress(acc.address);
          setChainId(acc.chainId);
        }),
      switchNetwork: () =>
        run(async () => {
          await switchNetwork();
          await refresh();
        }),
      disconnect: () => {
        setAddress(null);
        setChainId(null);
        setError(null);
      },
    }),
    [installed, address, chainId, busy, error, run, refresh],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWallet(): WalletState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWallet outside WalletProvider");
  return v;
}
