// Everything the desk's rows and detail can do, with the same calls the full views make.
// A key stays busy until the sections it touched have been read back, so the row it acted
// on is gone (or changed) before it can be pressed again.
import { useQueryClient } from "@tanstack/react-query";
import type { Ack } from "../../../api/schemas";
import type { AdminCleanupRow, AdminInvite, AdminJoin, AdminPerson, AdminRequest, AdminRequestRow, AdminTicketRow, HealthCheck, MessagePerson, PlexInvite } from "../../../api/types";
import { useApi } from "../../../auth/session";
import { useAct, useAdminKey, type Section } from "../useAdmin";

const joinName = (j: AdminJoin) => j.name.replace(/\s*\(Plex sign-in\)$/i, "");

export function useDeskActions() {
  const client = useApi();
  const qc = useQueryClient();
  const key = useAdminKey();
  const { act, isBusy } = useAct();
  const readBack = (sections: Section[]) => Promise.all(sections.map((s) =>
    qc.refetchQueries({ queryKey: key(s) }).catch(() => undefined)));
  /** Runs it, reads back what it touched, and toasts `done` (or the bot's own sentence). */
  const say = (id: string, call: () => Promise<Ack>, done: string | null, ...sections: Section[]) =>
    act(id, async () => {
      const out = await call();
      if (out.ok !== false) await readBack(sections);
      return out;
    }, { done: (o) => (done ? { text: done, detail: o.message || undefined } : { text: o.message || "Done" }) });
  return {
    busy: isBusy,
    approve: (r: AdminRequest, yes: boolean) =>
      say(`request:${r.id}`, () => client.decide(r.id, yes), `${yes ? "Approved" : "Declined"} ${r.title}`, "requests", "all"),
    invite: (j: AdminJoin, yes: boolean) =>
      say(`join:${j.key}`, () => client.decideJoin(j.messageId, yes), yes ? `Invited ${joinName(j)} to Plex` : `Denied ${joinName(j)}`, "joins"),
    // Its toast says what the bot did (taken, or already yours), not what was guessed here.
    take: (t: AdminTicketRow) => say(`ticket:${t.id}`, () => client.ticketTake(t.id, "take"), null, "tickets"),
    searchTicket: (t: AdminTicketRow) => say(`ticket:${t.id}`, () => client.helpSearch(t.id, "again"), "Searching again", "tickets", "all"),
    searchRequest: (r: AdminRequestRow) => say(`stuck:${r.id}`, () => client.requestSearch(r.id!, "again"), "Searching again", "all"),
    reopen: (t: AdminTicketRow) =>
      say(`ticket:${t.id}`, () => client.ticketStatus(t.id, "open"), t.status === "open" ? "Back with the admins" : "Reopened", "tickets"),
    chatDone: (p: MessagePerson, done: boolean) => say(`chat:${p.id}`, () => client.messageDone(p.id, done), done ? "Marked done" : "Marked unread", "messages"),
    keepPerson: (p: AdminPerson) =>
      say(`person:${p.plexName}`, () => client.keepPerson(p.plexName, true), `${p.displayName || p.plexName} won’t be removed`, "people"),
    keepTitle: (c: AdminCleanupRow) => say(`leaving:${c.ratingKey}`, () => client.exempt(c.ratingKey, true), `Keeping ${c.title}`, "cleanup"),
    cancelPlex: (i: PlexInvite) => say(`plex:${i.email || `${i.name}|${i.sentAt}`}`, () => client.plexInviteCancel(i.email),
      `Cancelled the Plex invite to ${i.email || i.name}`, "plexinvites"),
    cancelLink: (i: AdminInvite) => say(`link:${i.id}`, () => client.revokeInvite(i.id), `Cancelled ${i.label}’s invite link`, "invites"),
    checkAgain: (h: HealthCheck) => say(`down:${h.name}`, async () => ({ ok: true, message: "" }), "Checked again", "health"),
  };
}
export type DeskActions = ReturnType<typeof useDeskActions>;
