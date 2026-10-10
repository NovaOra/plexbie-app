// The member's own tickets (GET /api/tickets), whatever each is about, and the words the
// website uses for one: what it's about, its heading, and where it is.
import { useQuery } from "@tanstack/react-query";
import { ApiError } from "../../api/client";
import type { AppMyTicket } from "../../api/schemas";
import { useApi, useServer } from "../../auth/session";
import { formatSlot } from "../requests/stage";

/** Open ones (those waiting on the member first), then those solved in the last 30 days.
 *  Checked again each minute while one is open; an alert says when an admin answers. */
export function useMyTickets(enabled = true) {
  const client = useApi();
  const server = useServer();
  return useQuery({
    queryKey: ["myTickets", server],
    queryFn: ({ signal }) => client.myTickets(signal),
    refetchInterval: (q) => (q.state.data?.some((t) => t.status === "open") ? 60_000 : false),
    enabled,
  });
}

/** A bot from before members had tickets of their own (older than 1.0.7): its catch-all
 *  answers 404 to the list, and 405 to a write. */
export const olderBot = (e: unknown) => e instanceof ApiError && (e.status === 404 || e.status === 405);

type About = Pick<AppMyTicket, "subject" | "title" | "year" | "slot">;

/** What it's about, on a list: "General", "Sintel (2010)" or "No. 0214 · Pepper & Carrot". */
export function aboutLine(t: About) {
  if (t.subject === "general" || !t.title) return "General";
  if (t.subject === "request") return t.slot ? `No. ${formatSlot(t.slot)} · ${t.title}` : t.title;
  return t.year ? `${t.title} (${t.year})` : t.title;
}

/** "Your ticket on Sintel", "Your ticket on No. 0214", or (a general one) "Your ticket". */
export function headingFor(t: About) {
  if (t.subject === "request" && t.slot) return `Your ticket on No. ${formatSlot(t.slot)}`;
  if (t.subject === "general" || !t.title) return "Your ticket";
  return `Your ticket on ${t.title}`;
}

/** Where it is, for the member, in Manage's colours: their move (hot), the admins' (wait), or done. */
export function myState(t: { status: string; waiting?: boolean }) {
  if (t.status !== "open") return { label: "Solved", tone: "done" as const };
  return t.waiting ? { label: "An admin asked you something", tone: "hot" as const } : { label: "Open", tone: "wait" as const };
}

/** A reason inside a sentence ("Your ticket: won’t play on Plex"): lower-cased, names kept. */
export const inLine = (reason: string) =>
  reason.toLowerCase().replace(/\b(plex|plexbie|sonarr|radarr|audiobookshelf)\b/g, (w) => w[0].toUpperCase() + w.slice(1));
