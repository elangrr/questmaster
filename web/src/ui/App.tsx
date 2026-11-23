import { useEffect, useRef } from "react";
import { config, gnowebPage } from "../config";
import { Icon } from "./icons";
import { shortAddr } from "../lib/format";
import { useRoute, useTheme, type Theme } from "./hooks";
import { Agents, AddressPage, Board, How, Mine, Paid, Post, QuestPage } from "./pages";
import { Empty } from "./parts";
import { PriceFootnote } from "./price";
import { Mark } from "./visuals";
import { useWallet, WalletProvider } from "./WalletContext";

function parse(route: string): { path: string; query: URLSearchParams } {
  const i = route.indexOf("?");
  return i < 0 ? { path: route, query: new URLSearchParams() } : { path: route.slice(0, i), query: new URLSearchParams(route.slice(i + 1)) };
}

function Routes() {
  const { path, query } = parse(useRoute());
  let m: RegExpExecArray | null;
  if (path === "/" || path === "") return <Board query={query} />;
  if (path === "/paid") return <Paid query={query} />;
  if (path === "/post") return <Post />;
  if (path === "/how") return <How />;
  if (path === "/agents") return <Agents />;
  if (path === "/mine") return <Mine />;
  if ((m = /^\/quest\/([^/]+)$/.exec(path))) return <QuestPage id={m[1]} />;
  if ((m = /^\/address\/([^/]*)$/.exec(path))) return <AddressPage address={m[1]} query={query} />;
  return (
    <Empty>
      This page does not exist. <a href="#/">Go to the board</a>
    </Empty>
  );
}

/** The document title for a route (screen readers announce it on navigation). */
function titleFor(path: string): string {
  const site = "QuestMaster";
  let m: RegExpExecArray | null;
  if (path === "/" || path === "") return `${site} · small tasks, paid in GNOT`;
  const fixed: Record<string, string> = { "/paid": "Paid quests", "/post": "Post a quest", "/how": "How it works", "/agents": "For AI agents", "/mine": "My quests" };
  if (fixed[path]) return `${fixed[path]} · ${site}`;
  if ((m = /^\/quest\/(\d+)$/.exec(path))) return `Quest ${m[1]} · ${site}`;
  if ((m = /^\/address\/(g1[0-9a-z]{38})$/.exec(path))) return `${shortAddr(m[1])} · ${site}`;
  return `Page not found · ${site}`;
}

/**
 * Re-mounts on each route so the page fades in once (no motion under reduced
 * motion). On every route change after the first: new title, back to the top,
 * and focus on the main region so keyboard and screen-reader users land on the
 * new page instead of an unmounted link.
 */
function PageFrame() {
  const { path } = parse(useRoute());
  const first = useRef(true);
  useEffect(() => {
    document.title = titleFor(path);
    if (first.current) {
      first.current = false;
      return;
    }
    window.scrollTo(0, 0);
    document.getElementById("main")?.focus({ preventScroll: true });
  }, [path]);
  return (
    <div key={path} className="page-enter">
      <Routes />
    </div>
  );
}

function NavLink({ to, children }: { to: string; children: string }) {
  const { path } = parse(useRoute());
  const active = to === "/" ? path === "/" || path === "" : path.startsWith(to);
  return (
    <a href={`#${to}`} className={active ? "nav-link active" : "nav-link"} aria-current={active ? "page" : undefined}>
      {children}
    </a>
  );
}

function WalletButton() {
  const w = useWallet();
  if (!w.installed)
    return (
      <a className="btn btn-small" href="https://adena.app" target="_blank" rel="noopener noreferrer">
        Get Adena
      </a>
    );
  if (!w.address)
    return (
      <button className="btn btn-small btn-primary" onClick={() => void w.connect()} disabled={w.busy}>
        Connect wallet
      </button>
    );
  if (!w.onRightNetwork)
    return (
      <button className="btn btn-small btn-warn" onClick={() => void w.switchNetwork()} disabled={w.busy} title={`Adena is on ${w.chainId}`}>
        Switch to {config.chainId}
      </button>
    );
  return (
    <a className="btn btn-small wallet-addr mono" href={`#/address/${w.address}`} title={w.address}>
      {shortAddr(w.address)}
    </a>
  );
}

function ThemeToggle() {
  const [theme, setTheme] = useTheme();
  const next: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };
  return (
    <button className="btn btn-small btn-ghost" onClick={() => setTheme(next[theme])} aria-label={`Theme: ${theme}. Change theme`} title={`Theme: ${theme}`}>
      <Icon name={theme === "dark" ? "moon" : theme === "light" ? "sun" : "auto"} />
    </button>
  );
}

function Shell() {
  const w = useWallet();
  return (
    <>
      {/* Hash routing: a plain #main link would change the route, so focus the region directly. */}
      <a
        className="skip"
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("main")?.focus();
        }}
      >
        Skip to content
      </a>
      <header className="top">
        <div className="top-inner">
          <a className="brand" href="#/">
            <Mark />
            QuestMaster
          </a>
          {/* Wide screens: one row. Narrower: brand and actions on top, then one
              scrollable row with the network label and the links (never two rows of links). */}
          <div className="top-nav">
            <span className="net" title={`Chain ${config.chainId}, ${config.rpcUrl}`}>
              {config.networkName} · test GNOT
            </span>
            <nav className="nav" aria-label="Main">
            <NavLink to="/">Board</NavLink>
            <NavLink to="/paid">Paid</NavLink>
            <NavLink to="/mine">My quests</NavLink>
            <NavLink to="/post">Post</NavLink>
            <NavLink to="/how">How it works</NavLink>
            <NavLink to="/agents">AI agents</NavLink>
            </nav>
          </div>
          <div className="top-actions">
            <ThemeToggle />
            <WalletButton />
          </div>
        </div>
        {w.error && (
          <p className="top-error" role="alert">
            {w.error}
          </p>
        )}
      </header>
      <main id="main" className="main" tabIndex={-1}>
        <PageFrame />
      </main>
      <footer className="foot">
        <div className="foot-inner">
        <p>
          Built on <a href="https://gno.land" target="_blank" rel="noopener noreferrer">gno.land</a> ·{" "}
          <a href={config.sourceUrl} target="_blank" rel="noopener noreferrer">Source</a> · Realm{" "}
          <a className="mono" href={gnowebPage()} target="_blank" rel="noopener noreferrer" aria-label={config.realmPath} title={config.realmPath}>
            <span className="path-full">{config.realmPath}</span>
            <span className="path-short" aria-hidden="true">
              {config.realmPath.replace(/g1[0-9a-z]{38}/, (a) => shortAddr(a))}
            </span>
          </a>
        </p>
        <p className="muted">Not an official Gno.land product. Testnet only: {config.networkName} ({config.chainId}), test GNOT.</p>
        <PriceFootnote />
        </div>
      </footer>
    </>
  );
}

export function App() {
  return (
    <WalletProvider>
      <Shell />
    </WalletProvider>
  );
}
