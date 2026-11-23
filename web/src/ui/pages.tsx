import { useEffect, useState } from "react";
import { config, gnowebPage, rules } from "../config";
import { argsFor, actionsFor, roleOf, type ActionOption } from "../lib/actions";
import { QuestState, type Quest } from "../lib/amino";
import { approx, gnot, thousands, timeLeft, windowToBlocks, type WindowUnit } from "../lib/format";
import { read } from "../lib/rpc";
import { checkDetails, checkLink, checkReason, checkReward, checkTitle, checkWorkBlocks } from "../lib/validate";
import { useAsync } from "./hooks";
import { Addr, Empty, ErrorBox, Gnot, Loading, Pager, PlainText, QuestTable, SafeLink, StateBadge } from "./parts";
import { TxPanel, TxSent } from "./TxPanel";
import { useWallet } from "./WalletContext";

function pageFrom(query: URLSearchParams): number {
  const n = Number(query.get("page") ?? "1");
  return Number.isInteger(n) && n >= 1 && n <= 100_000 ? n : 1;
}

export const ReviewWarning = () => (
  <div className="callout warn" role="note">
    <strong>Posters: check your quest.</strong> If you do not approve or reject a submission within the review window ({approx(rules.reviewBlocks)}),
    the builder is paid automatically.
  </div>
);

// ---------------------------------------------------------------- board

export function Board({ query }: { query: URLSearchParams }) {
  const page = pageFrom(query);
  const [data, reload] = useAsync(async () => {
    const totals = await read.totals();
    const ids = await read.openIds((page - 1) * rules.pageSize, rules.pageSize);
    return { totals, quests: await read.quests(ids) };
  }, [page]);

  return (
    <>
      <section className="intro">
        <h1>Small tasks, paid in GNOT</h1>
        <p>
          A poster describes a task and locks the reward on chain. A builder takes it, does the work and sends a link. When the poster approves, the
          realm pays the builder. Nobody else can move the locked GNOT.
        </p>
        <div className="intro-actions">
          <a className="btn btn-primary" href="#/post">
            Post a quest
          </a>
          <a className="btn" href="#/how">
            How it works
          </a>
        </div>
      </section>

      {data.status === "loading" && <Loading what="Reading the board" />}
      {data.status === "error" && <ErrorBox error={data.error} onRetry={reload} />}
      {data.status === "ready" && (
        <>
          <section className="stats" aria-label="Board totals">
            <div className="stat">
              <span className="stat-value">{data.value.totals.openQuests}</span>
              <span className="stat-label">open quests</span>
            </div>
            <div className="stat">
              <span className="stat-value">{gnot(data.value.totals.locked)}</span>
              <span className="stat-label">GNOT locked</span>
            </div>
            <div className="stat">
              <span className="stat-value">{gnot(data.value.totals.paid)}</span>
              <span className="stat-label">GNOT paid out</span>
            </div>
            <div className="stat">
              <span className="stat-value">{data.value.totals.paidQuests}</span>
              <span className="stat-label">quests paid</span>
            </div>
          </section>

          <section>
            <h2>Open quests</h2>
            {data.value.quests.length === 0 ? (
              page > 1 ? (
                <Empty>
                  This page is empty. <a href="#/">Back to the first page</a>
                </Empty>
              ) : (
                <Empty>
                  No open quests right now. <a href="#/post">Post the first one.</a>
                </Empty>
              )
            ) : (
              <>
                <QuestTable quests={data.value.quests} show="open" />
                <Pager page={page} total={data.value.totals.openQuests} pageSize={rules.pageSize} base="/" />
              </>
            )}
          </section>
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------- paid

export function Paid({ query }: { query: URLSearchParams }) {
  const page = pageFrom(query);
  const [data, reload] = useAsync(async () => {
    const totals = await read.totals();
    const ids = await read.paidIds((page - 1) * rules.pageSize, rules.pageSize);
    return { totals, quests: await read.quests(ids) };
  }, [page]);
  return (
    <section>
      <h1>Paid quests</h1>
      {data.status === "loading" && <Loading />}
      {data.status === "error" && <ErrorBox error={data.error} onRetry={reload} />}
      {data.status === "ready" && (
        <>
          <p className="lead">
            Every quest below was paid by the realm to its builder: {data.value.totals.paidQuests} {data.value.totals.paidQuests === 1 ? "quest" : "quests"},{" "}
            <Gnot ugnot={data.value.totals.paid} /> in total.
          </p>
          {data.value.quests.length === 0 ? (
            <Empty>No quest has been paid yet.</Empty>
          ) : (
            <>
              <QuestTable quests={data.value.quests} show="paid" />
              <Pager page={page} total={data.value.totals.paidQuests} pageSize={rules.pageSize} base="/paid" />
            </>
          )}
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- address

export function AddressPage({ address, query }: { address: string; query: URLSearchParams }) {
  const page = pageFrom(query);
  const as = query.get("as") === "builder" ? "builder" : "poster";
  const valid = /^g1[02-9ac-hj-np-z]{38}$/.test(address);
  const [data, reload] = useAsync(async () => {
    if (!valid) return null;
    const off = (page - 1) * rules.pageSize;
    const [count, ids] =
      as === "poster"
        ? await Promise.all([read.posterCount(address), read.posterIds(address, off, rules.pageSize)])
        : await Promise.all([read.builderCount(address), read.builderIds(address, off, rules.pageSize)]);
    return { count, quests: await read.quests(ids) };
  }, [address, as, page]);
  return (
    <section>
      <h1>Quests of an address</h1>
      <AddressSearch initial={address} />
      {!valid ? (
        <Empty>That is not a valid g1 address.</Empty>
      ) : (
        <>
          <p className="mono wrap muted">{address}</p>
          <div className="tabs" role="tablist">
            <a role="tab" aria-selected={as === "poster"} className={as === "poster" ? "tab active" : "tab"} href={`#/address/${address}?as=poster`}>
              Posted
            </a>
            <a role="tab" aria-selected={as === "builder"} className={as === "builder" ? "tab active" : "tab"} href={`#/address/${address}?as=builder`}>
              Worked on
            </a>
          </div>
          {as === "builder" && <p className="muted">Every quest this address has taken, with its current state. A quest stays here after the builder gives it up or is rejected.</p>}
          {data.status === "loading" && <Loading />}
          {data.status === "error" && <ErrorBox error={data.error} onRetry={reload} />}
          {data.status === "ready" && data.value && (
            data.value.quests.length === 0 ? (
              <Empty>No quests yet.</Empty>
            ) : (
              <>
                <QuestTable quests={data.value.quests} show="any" />
                <Pager page={page} total={data.value.count} pageSize={rules.pageSize} base={`/address/${address}?as=${as}`} />
              </>
            )
          )}
        </>
      )}
    </section>
  );
}

export function AddressSearch({ initial = "" }: { initial?: string }) {
  const [v, setV] = useState(initial);
  return (
    <form
      className="inline-form"
      onSubmit={(e) => {
        e.preventDefault();
        window.location.hash = `/address/${v.trim()}`;
      }}
    >
      <label htmlFor="addr-search" className="sr-only">
        Address
      </label>
      <input id="addr-search" className="input mono" placeholder="g1… address" value={v} onChange={(e) => setV(e.target.value)} spellCheck={false} autoComplete="off" />
      <button className="btn" type="submit">
        Show quests
      </button>
    </form>
  );
}

export function Mine() {
  const w = useWallet();
  useEffect(() => {
    if (w.address) window.location.replace(`#/address/${w.address}`);
  }, [w.address]);
  if (w.address) return null;
  return (
    <section>
      <h1>My quests</h1>
      <p>Connect Adena to see the quests you posted and the ones you worked on, or type any address.</p>
      {w.installed && (
        <p>
          <button className="btn btn-primary" onClick={() => void w.connect()} disabled={w.busy}>
            Connect Adena
          </button>
        </p>
      )}
      <AddressSearch />
    </section>
  );
}

// ---------------------------------------------------------------- quest

export function QuestPage({ id }: { id: string }) {
  const valid = /^[1-9]\d{0,18}$/.test(id);
  const [data, reload] = useAsync(async () => {
    if (!valid) return null;
    const [q, h] = await Promise.all([read.quest(BigInt(id)), read.height()]);
    return { q, h };
  }, [id]);
  if (!valid) return <Empty>There is no quest with that number. <a href="#/">Back to the board</a></Empty>;
  if (data.status === "loading") return <Loading what="Reading the quest" />;
  if (data.status === "error") return <ErrorBox error={data.error} onRetry={reload} />;
  if (!data.value) return null;
  return <QuestView q={data.value.q} h={data.value.h} onChanged={reload} />;
}

function QuestView({ q, h, onChanged }: { q: Quest; h: bigint; onChanged: () => void }) {
  const w = useWallet();
  const [lastTx, setLastTx] = useState<{ what: string; hash: string } | null>(null);
  const role = roleOf(q, w.address);
  const options = actionsFor(q, h, w.address);
  return (
    <article className="quest">
      <p className="crumbs">
        <a href="#/">Board</a> <span aria-hidden="true">/</span> Quest {q.id.toString()}
      </p>
      <header className="quest-head">
        <h1 className="quest-title">{q.title}</h1>
        <StateBadge q={q} />
      </header>

      {q.closing && q.state !== QuestState.Paid && q.state !== QuestState.Cancelled && (
        <div className="callout" role="note">
          <strong>Closing.</strong> The reward returns to the poster when the current builder's turn ends, unless the work is approved.
        </div>
      )}
      {q.state === QuestState.Submitted && role === "poster" && <ReviewWarning />}

      <dl className="facts">
        <div><dt>Reward</dt><dd><Gnot ugnot={q.reward} /></dd></div>
        <div><dt>Poster</dt><dd><Addr a={q.poster} />{role === "poster" && <span className="you">you</span>}</dd></div>
        {q.builder && <div><dt>Builder</dt><dd><Addr a={q.builder} />{role === "builder" && <span className="you">you</span>}</dd></div>}
        <div><dt>Work window</dt><dd>{thousands(q.workBlocks)} blocks ({approx(q.workBlocks)})</dd></div>
        {q.state === QuestState.Claimed && (
          <div><dt>Work deadline</dt><dd>block {thousands(q.workDeadline)} ({timeLeft(q.workDeadline, h)})</dd></div>
        )}
        {q.state === QuestState.Submitted && (
          <div><dt>Review deadline</dt><dd>block {thousands(q.reviewDeadline)} ({timeLeft(q.reviewDeadline, h)})</dd></div>
        )}
        {q.workLink && <div><dt>Work</dt><dd><SafeLink url={q.workLink} /></dd></div>}
        <div><dt>Times rejected</dt><dd>{q.rejectCount}</dd></div>
        <div><dt>Posted at block</dt><dd>{thousands(q.createdAt)}</dd></div>
        <div><dt>Current block</dt><dd>{thousands(h)}</dd></div>
      </dl>

      <section>
        <h2>Details</h2>
        {q.details.trim() === "" ? <p className="muted">No details given.</p> : <PlainText text={q.details} />}
      </section>

      {q.rejectCount > 0 && (
        <section>
          <h2>Last reject reason</h2>
          <PlainText text={q.lastRejectReason} />
        </section>
      )}

      <section>
        <h2>What can happen next</h2>
        {lastTx && <TxSent hash={lastTx.hash} what={lastTx.what} />}
        {q.state === QuestState.Paid && <p>Nothing: this quest is finished and the builder was paid <Gnot ugnot={q.reward} />.</p>}
        {q.state === QuestState.Cancelled && <p>Nothing: this quest was cancelled and the reward went back to the poster.</p>}
        <ul className="actions">
          {options.map((o) => (
            <ActionItem
              key={o.func}
              q={q}
              o={o}
              onDone={(hash) => {
                setLastTx({ what: o.label, hash });
                onChanged();
              }}
            />
          ))}
        </ul>
        <p className="muted small">
          Times are approximate, at about {rules.blockMillis / 1000} seconds per block; deadlines are exact block heights.{" "}
          <a href={gnowebPage(`quest/${q.id}`)} target="_blank" rel="noopener noreferrer">This quest on gnoweb</a>
        </p>
      </section>
    </article>
  );
}

function ActionItem({ q, o, onDone }: { q: Quest; o: ActionOption; onDone: (hash: string) => void }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const problem = o.input === "link" ? checkLink(input) : o.input === "reason" ? checkReason(input) : null;
  const disabled = o.blocked !== null && o.blocked !== "Connect a wallet to do this.";
  return (
    <li className={`action ${disabled ? "blocked" : ""}`}>
      <div className="action-row">
        <div>
          <strong>{o.label}</strong> <span className="muted">· {o.who}</span>
          <p className="action-explain">{o.explain}</p>
          {o.blocked && <p className="muted small">{o.blocked}</p>}
        </div>
        <button className="btn" aria-expanded={open} onClick={() => setOpen(!open)} disabled={disabled}>
          {open ? "Hide" : "Do this"}
        </button>
      </div>
      {open && (
        <div className="action-body">
          {o.input === "link" && (
            <Field label="Link to the work" hint={`Starts with https://, at most ${rules.maxLinkLen} characters.`} error={input ? problem : null}>
              <input className="input mono" value={input} onChange={(e) => setInput(e.target.value)} placeholder="https://" spellCheck={false} />
            </Field>
          )}
          {o.input === "reason" && (
            <Field label="Why do you reject it?" hint={`Shown publicly on the quest. At most ${rules.maxReasonLen} characters.`} error={input ? problem : null}>
              <textarea className="input" rows={3} value={input} onChange={(e) => setInput(e.target.value)} />
            </Field>
          )}
          <TxPanel
            spec={{ func: o.func, args: argsFor(o.func, q.id, input), questId: q.id, label: o.label, problem: o.input ? problem : null }}
            onDone={(hash) => {
              setOpen(false);
              onDone(hash);
            }}
          />
        </div>
      )}
    </li>
  );
}

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string | null; children: React.ReactElement }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}

// ---------------------------------------------------------------- post

export function Post() {
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [reward, setReward] = useState("5");
  const [amount, setAmount] = useState("1");
  const [unit, setUnit] = useState<WindowUnit>("days");
  const [posted, setPosted] = useState<string | null>(null);

  const blocks = windowToBlocks(Number(amount), unit);
  const r = checkReward(reward);
  const errs = {
    title: checkTitle(title),
    details: checkDetails(details),
    reward: r.error,
    window: !Number.isFinite(Number(amount)) || Number(amount) <= 0 ? "Choose how long the builder has." : checkWorkBlocks(blocks),
  };
  const firstError = errs.title ?? errs.details ?? errs.reward ?? errs.window;

  return (
    <section className="post">
      <h1>Post a quest</h1>
      <p className="lead">Describe a small task and lock the reward. It stays locked until you approve the work, cancel the quest, or the rules return it.</p>
      <ReviewWarning />
      <form onSubmit={(e) => e.preventDefault()} className="form">
        <Field label="Title" hint={`One line, at most ${rules.maxTitleLen} characters (${Array.from(title).length} used).`} error={title ? errs.title : null}>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Fix a typo in the docs" />
        </Field>
        <Field label="Details" hint={`What should the builder do, and how will you judge it? At most ${rules.maxDetailsLen} characters (${Array.from(details).length} used).`} error={errs.details}>
          <textarea className="input" rows={5} value={details} onChange={(e) => setDetails(e.target.value)} />
        </Field>
        <div className="form-row">
          <Field label="Reward (GNOT)" hint="At least 1 GNOT." error={errs.reward}>
            <input className="input num" inputMode="decimal" value={reward} onChange={(e) => setReward(e.target.value)} />
          </Field>
          <div className="field">
            <span className="field-label" id="window-label">Work window</span>
            <div className="window-input" role="group" aria-labelledby="window-label">
              <input className="input num" inputMode="decimal" aria-label="Work window amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
              <select className="input" aria-label="Work window unit" value={unit} onChange={(e) => setUnit(e.target.value as WindowUnit)}>
                <option value="hours">hours</option>
                <option value="days">days</option>
              </select>
            </div>
            <span className="field-hint">
              {Number.isFinite(blocks) && blocks > 0 ? `${thousands(blocks)} blocks at about ${rules.blockMillis / 1000} s each. ` : ""}From 1 hour to about 89 days.
            </span>
            {errs.window && <span className="field-error">{errs.window}</span>}
          </div>
        </div>
      </form>

      <div className="cost" aria-label="What leaves your wallet">
        <h2>What leaves your wallet</h2>
        <ul>
          <li>
            The reward: <strong>{r.ugnot !== null ? gnot(r.ugnot) : "?"} GNOT</strong>, locked in the realm.
          </li>
          <li>A storage deposit of about 0.65 to 0.8 GNOT, kept by the chain for storing the quest.</li>
          <li>The network fee, which Adena shows before you sign (about 0.1 GNOT with the gnokey command).</li>
        </ul>
        <p className="muted small">This is the {config.networkName} with test GNOT, not real money.</p>
      </div>

      {posted ? (
        <>
          <TxSent hash={posted} what="your quest" />
          <p>
            It appears on the board once the block is in. <a href="#/">Go to the board</a>
          </p>
        </>
      ) : (
        <TxPanel
          spec={{ func: "PostQuest", args: [title, details, String(blocks)], sendUgnot: r.ugnot ?? undefined, label: "Post and lock the reward", problem: firstError }}
          onDone={(hash) => setPosted(hash)}
        />
      )}
    </section>
  );
}

// ---------------------------------------------------------------- how it works

export function How() {
  return (
    <section className="prose">
      <h1>How it works</h1>
      <ol className="steps">
        <li><strong>Post.</strong> The poster writes a title, details and a work window, and sends the reward (at least 1 GNOT). The GNOT is locked in the realm.</li>
        <li><strong>Take.</strong> Anyone except the poster takes the quest. One builder at a time.</li>
        <li><strong>Submit.</strong> The builder sends a link to the work (https only) before the work window ends.</li>
        <li><strong>Review.</strong> The poster approves (the builder is paid at once) or rejects with a reason (the quest opens again; the reject count is public).</li>
        <li><strong>Paid.</strong> The reward goes to the builder.</li>
      </ol>
      <h2>Two deadlines keep it fair</h2>
      <ul>
        <li><strong>Work window</strong>, chosen by the poster ({thousands(rules.minWorkBlocks)} to {thousands(rules.maxWorkBlocks)} blocks): if nothing is submitted in time, anyone can release the quest so someone else can take it.</li>
        <li><strong>Review window</strong> ({thousands(rules.reviewBlocks)} blocks, {approx(rules.reviewBlocks)}): if the poster neither approves nor rejects in time, the builder can claim the reward.</li>
      </ul>
      <h2>Cancel or close</h2>
      <p>A poster can cancel an open quest and get the reward back at once. Once a builder has it, the poster can close it instead: the builder keeps their turn, and if it ends without approval the reward goes back to the poster. Nobody can take a closing quest again.</p>
      <h2>Safety</h2>
      <p>There is no admin function: nobody, not even the authors, can move the locked GNOT except through these rules. Every quest pays out at most once, exactly the stored reward.</p>
      <ReviewWarning />
    </section>
  );
}
