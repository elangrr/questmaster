// Writes a gnodev genesis transactions file (one JSON tx per line) that puts
// the QuestMaster realm into a known state: quests in every state that can be
// reached at genesis height (no blocks pass, so no timeout payout), a closing
// quest, a quest with hostile text, and more than one page of open quests.
// Genesis transactions need no signature, only the caller's public key; these
// are the standard gnodev test accounts. No key is created or used.
//
// Usage: node e2e/seed-txs.mjs <realm path> > txs.jsonl
import { HOSTILE_DETAILS, HOSTILE_LINK, HOSTILE_REASON, HOSTILE_TITLE } from "./hostile.mjs";

const realm = process.argv[2];
if (!realm) {
  console.error("usage: node e2e/seed-txs.mjs <realm path>");
  process.exit(2);
}
const POSTER = ["g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5", "A+FhNtsXHjLfSJk1lB8FbiL4mGPjc50Kt81J7EKDnJ2y"];
const BUILDER = ["g1us8428u2a5satrlxzagqqa5m6vmuze025anjlj", "AmG6kzznyo1uNqWPAYU6wDpsmzQKDaEOrVRaZ08vOyX0"];
const OTHER = ["g1u7y667z64x2h7vc6fmpcprgey4ck233jaww9zq", "AnK+a6mcFDjY6b/v6p7r8QFW1M1PgIoQxBgrwOoyY7v3"];


const out = [];
function tx(who, fn, send, ...args) {
  out.push(JSON.stringify({
    tx: {
      msg: [{ "@type": "/vm.m_call", caller: who[0], send, pkg_path: realm, func: fn, args: args.map(String) }],
      fee: { gas_wanted: "50000000", gas_fee: "50000ugnot" },
      signatures: [{ pub_key: { "@type": "/tm.PubKeySecp256k1", value: who[1] }, signature: "" }],
      memo: "",
    },
  }));
}
let id = 0;
function post(title, details, reward, work = 20000, who = POSTER) {
  tx(who, "PostQuest", `${reward}ugnot`, title, details, work);
  return ++id;
}

// 1: paid by approval
const paid = post("Translate the README to Indonesian", "Keep the headings.\nUse plain words.", 2500000);
tx(BUILDER, "ClaimQuest", "", paid);
tx(BUILDER, "SubmitWork", "", paid, "https://github.com/example/questmaster/pull/7");
tx(POSTER, "ApproveWork", "", paid);
// 2: cancelled while open
const cancelled = post("Old idea", "", 1000000);
tx(POSTER, "CancelQuest", "", cancelled);
// 3: claimed
const claimed = post("Write a gnokey cheat sheet", "One page, the ten most used commands.", 3000000);
tx(BUILDER, "ClaimQuest", "", claimed);
// 4: submitted
const submitted = post("Add a dark theme to the demo page", "", 5000000);
tx(BUILDER, "ClaimQuest", "", submitted);
tx(BUILDER, "SubmitWork", "", submitted, "https://github.com/example/questmaster/pull/9");
// 5: closing (claimed, then closed by the poster)
const closing = post("Draw a logo", "A small tavern sign.", 2000000);
tx(OTHER, "ClaimQuest", "", closing);
tx(POSTER, "CancelQuest", "", closing);
// 6: closed and refunded (closing, then the builder unclaims)
const refunded = post("Record a short video", "", 1500000);
tx(BUILDER, "ClaimQuest", "", refunded);
tx(POSTER, "CancelQuest", "", refunded);
tx(BUILDER, "UnclaimQuest", "", refunded);
// 7: hostile text, rejected once (open again, with a reason)
const hostile = post(HOSTILE_TITLE, HOSTILE_DETAILS, 1234567);
tx(BUILDER, "ClaimQuest", "", hostile);
tx(BUILDER, "SubmitWork", "", hostile, HOSTILE_LINK);
tx(POSTER, "RejectWork", "", hostile, HOSTILE_REASON);
// 8..31: 24 open quests from another poster, so the open list has two pages
for (let i = 1; i <= 24; i++) post(`Small task ${i}`, `Details of small task ${i}.`, 1000000 + i * 10000, 1000, OTHER);

process.stdout.write(out.join("\n") + "\n");
