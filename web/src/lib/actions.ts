// The nine actions: who may use each in which state, the exact /vm.m_call
// message sent to the wallet, the equivalent gnokey command and gnoweb link.
// The rules mirror p/escrow (as deployed) and the realm's "what can happen next".

import { config, gnokeyGas, realmWebPath } from "../config";
import { QuestState, type Quest } from "./amino";

export type ActionName =
  | "PostQuest"
  | "ClaimQuest"
  | "UnclaimQuest"
  | "ReleaseQuest"
  | "SubmitWork"
  | "ApproveWork"
  | "RejectWork"
  | "CancelQuest"
  | "ClaimPayout";

export interface MsgCall {
  type: "/vm.m_call";
  value: { caller: string; send: string; pkg_path: string; func: ActionName; args: string[] };
}

/** The message for Adena's DoContract. Only PostQuest sends coins. */
export function buildMsg(caller: string, func: ActionName, args: string[], sendUgnot?: bigint): MsgCall {
  if (func === "PostQuest" && (sendUgnot === undefined || sendUgnot <= 0n)) throw new Error("PostQuest needs a reward");
  if (func !== "PostQuest" && sendUgnot !== undefined) throw new Error(`${func} takes no coins`);
  return {
    type: "/vm.m_call",
    value: {
      caller,
      send: func === "PostQuest" ? `${sendUgnot}ugnot` : "",
      pkg_path: config.realmPath,
      func,
      args: args.map(String),
    },
  };
}

/** Quote an argument for a POSIX shell (single quotes). */
export function shellQuote(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

/** The same call as a copy-paste gnokey command. */
export function gnokeyCommand(func: ActionName, args: string[], sendUgnot?: bigint): string {
  const parts = [
    "gnokey maketx call",
    `-pkgpath ${shellQuote(config.realmPath)}`,
    `-func ${shellQuote(func)}`,
    ...args.map((a) => `-args ${shellQuote(a)}`),
  ];
  if (sendUgnot !== undefined) parts.push(`-send ${shellQuote(`${sendUgnot}ugnot`)}`);
  parts.push(
    `-gas-fee ${gnokeyGas.fee}`,
    `-gas-wanted ${gnokeyGas.wanted}`,
    "-broadcast",
    `-chainid ${config.chainId}`,
    `-remote ${config.rpcUrl}`,
    "YOUR_KEY_NAME",
  );
  return parts.join(" \\\n  ");
}

/** gnoweb's form for the same call, with the quest number (and send) prefilled. */
export function gnowebActionLink(func: ActionName, id?: bigint, sendUgnot?: bigint): string {
  const q = new URLSearchParams();
  if (id !== undefined) q.set("id", id.toString());
  if (sendUgnot !== undefined) q.set(".send", `${sendUgnot}ugnot`);
  const rest = q.toString();
  return `${config.gnowebUrl}${realmWebPath()}$help&func=${func}${rest ? "&" + rest : ""}`;
}

export type Role = "poster" | "builder" | "other" | "none"; // none = no wallet

/** The reason shown when no wallet is connected. */
export const NOT_CONNECTED = "Connect a wallet to do this.";

export function roleOf(q: Quest, address: string | null): Role {
  if (!address) return "none";
  if (address === q.poster) return "poster";
  if (q.builder !== "" && address === q.builder) return "builder";
  return "other";
}

export interface ActionOption {
  func: Exclude<ActionName, "PostQuest">;
  label: string;
  /** What it does, in plain words. */
  explain: string;
  /** Who may use it. */
  who: string;
  /** null when the connected wallet may use it now; else why not. */
  blocked: string | null;
  /** Extra input the action needs. */
  input?: "link" | "reason";
}

/**
 * The moves valid in the quest's state right now (at height h), with the
 * connected wallet's permission for each. Moves that are not possible in this
 * state are not listed; moves possible for someone else are listed, blocked.
 */
export function actionsFor(q: Quest, h: bigint, address: string | null): ActionOption[] {
  const role = roleOf(q, address);
  const need = (who: "poster" | "builder" | "anyone" | "notPoster"): string | null => {
    if (role === "none") return NOT_CONNECTED;
    if (who === "anyone") return null;
    if (who === "notPoster") return role === "poster" ? "You posted this quest; someone else must take it." : null;
    if (who === "poster") return role === "poster" ? null : "Only the poster can do this.";
    return role === "builder" ? null : "Only the builder who took this quest can do this.";
  };
  const out: ActionOption[] = [];
  const closeExplain =
    "Stops the quest. No coins move now. The builder keeps their turn; if it ends without approval (they give it up, the work deadline passes, or you reject the work), the reward goes back to you. It cannot be undone.";

  switch (q.state) {
    case QuestState.Open:
      out.push({ func: "ClaimQuest", label: "Take this quest", who: "Anyone except the poster", explain: `Start working. You have ${q.workBlocks.toLocaleString()} blocks to submit your work.`, blocked: need("notPoster") });
      out.push({ func: "CancelQuest", label: "Cancel quest", who: "The poster", explain: "Closes the quest and refunds the reward to the poster at once.", blocked: need("poster") });
      break;
    case QuestState.Claimed: {
      const inTime = h <= q.workDeadline;
      out.push({
        func: "SubmitWork", label: "Submit work", who: "The builder", input: "link",
        explain: `Send a link to the finished work (starting with https://), until block ${q.workDeadline.toLocaleString()}.`,
        blocked: inTime ? need("builder") : "The work deadline has passed.",
      });
      out.push({
        func: "UnclaimQuest", label: "Give the quest back", who: "The builder",
        explain: q.closing ? "The quest is closing, so it ends and the reward goes back to the poster." : "The quest opens again for others.",
        blocked: need("builder"),
      });
      if (!q.closing) out.push({ func: "CancelQuest", label: "Close quest", who: "The poster", explain: closeExplain, blocked: need("poster") });
      out.push({
        func: "ReleaseQuest", label: q.closing ? "End the quest" : "Release the quest", who: "Anyone, after the work deadline",
        explain: q.closing
          ? "The work deadline passed without a submission; the quest ends and the reward goes back to the poster."
          : "The work deadline passed without a submission; the quest opens again for others.",
        blocked: h > q.workDeadline ? need("anyone") : `Possible from block ${(q.workDeadline + 1n).toLocaleString()}.`,
      });
      break;
    }
    case QuestState.Submitted: {
      out.push({ func: "ApproveWork", label: "Approve and pay", who: "The poster", explain: "Accept the work; the builder is paid the reward at once.", blocked: need("poster") });
      out.push({
        func: "RejectWork", label: "Reject the work", who: "The poster, until the review deadline", input: "reason",
        explain: q.closing ? "Refuse the work with a reason. The quest is closing, so it ends and the reward goes back to the poster." : "Refuse the work with a reason. The quest opens again; the reason and the reject count are public.",
        blocked: h <= q.reviewDeadline ? need("poster") : "The review deadline has passed.",
      });
      if (!q.closing) out.push({ func: "CancelQuest", label: "Close quest", who: "The poster", explain: closeExplain, blocked: need("poster") });
      out.push({
        func: "ClaimPayout", label: "Claim the reward", who: "The builder, after the review deadline",
        explain: "The poster did not answer in time; the builder takes the reward.",
        blocked: h > q.reviewDeadline ? need("builder") : `Possible from block ${(q.reviewDeadline + 1n).toLocaleString()} if the poster does not answer.`,
      });
      break;
    }
    default:
      break; // Paid and Cancelled are final
  }
  return out;
}

/** Arguments for an action on a quest (input = link or reason when needed). */
export function argsFor(func: ActionName, id: bigint, input?: string): string[] {
  if (func === "SubmitWork" || func === "RejectWork") return [id.toString(), input ?? ""];
  return [id.toString()];
}
