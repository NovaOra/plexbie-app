// Manage's desk from what the sections already load: one query per section, on the same
// keys the full views use (so nothing is asked twice), then the website's own queue logic
// (manageQueue.ts, copied as it is) turns them into the queue, the monitors and the menu.
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import type {
  AdminAllRequests, AdminCleanup, AdminInvite, AdminJoin, AdminPerson, AdminRequests, AdminTickets, BlockedRow, DiscordOverview,
  HealthCheck, MessagePerson, PlexInvite,
} from "../../../api/types";
import { useApi } from "../../../auth/session";
import { useMe } from "../../me/useMe";
import { useAdminKey } from "../useAdmin";
import { deriveDesk, DESK_FEEDS, type Desk, type DeskData, type Feed } from "./manageQueue";

/** How often the desk asks again, as the website's does. */
const EVERY = 60_000;

/** The clock the queue's ages are told by: a little behind at most. */
export function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** Every feed the desk is made from, and the desk. `enabled`: only once the bot has said this is an admin. */
export function useDesk(enabled: boolean): { desk: Desk; data: DeskData; queries: Record<Feed | "discord", UseQueryResult<unknown>>; refetch: (feeds?: Feed[]) => Promise<unknown> } {
  const client = useApi();
  const key = useAdminKey();
  const me = useMe().data?.user.name ?? null;
  const now = useNow();
  const opts = { refetchInterval: EVERY, enabled };
  const queries = {
    requests: useQuery({ queryKey: key("requests"), queryFn: ({ signal }) => client.adminRequests(signal), ...opts }),
    all: useQuery({ queryKey: key("all"), queryFn: ({ signal }) => client.adminAll("", signal), ...opts }),
    tickets: useQuery({ queryKey: key("tickets"), queryFn: ({ signal }) => client.adminTickets(signal), ...opts }),
    joins: useQuery({ queryKey: key("joins"), queryFn: ({ signal }) => client.adminJoins(signal), ...opts }),
    invites: useQuery({ queryKey: key("invites"), queryFn: ({ signal }) => client.adminInvites(signal), ...opts }),
    plexinvites: useQuery({ queryKey: key("plexinvites"), queryFn: ({ signal }) => client.plexInvites(signal), ...opts }),
    people: useQuery({ queryKey: key("people"), queryFn: ({ signal }) => client.adminPeople(signal), ...opts }),
    cleanup: useQuery({ queryKey: key("cleanup"), queryFn: ({ signal }) => client.adminCleanup(signal), ...opts }),
    discord: useQuery({ queryKey: key("discord"), queryFn: ({ signal }) => client.adminDiscord(signal), ...opts }),
    messages: useQuery({ queryKey: key("messages"), queryFn: ({ signal }) => client.adminMessages(signal), ...opts }),
    health: useQuery({ queryKey: key("health"), queryFn: ({ signal }) => client.adminHealth(signal), ...opts }),
    blocked: useQuery({ queryKey: [...key("health"), "blocked"], queryFn: ({ signal }) => client.adminBlocked(signal), ...opts }),
  };
  const q = queries;
  // The app's checked answers are the bot's /api shapes (src/api/types.ts) with a little more
  // tolerance; the queue logic reads them as the bot's.
  const data: DeskData = {
    requests: q.requests.data as AdminRequests | undefined,
    all: q.all.data as AdminAllRequests | undefined,
    tickets: q.tickets.data as AdminTickets | undefined,
    joins: q.joins.data as AdminJoin[] | undefined,
    invites: q.invites.data as AdminInvite[] | undefined,
    plexinvites: q.plexinvites.data as PlexInvite[] | undefined,
    people: q.people.data as AdminPerson[] | undefined,
    cleanup: q.cleanup.data as AdminCleanup | undefined,
    discord: q.discord.data as DiscordOverview | undefined,
    messages: q.messages.data as MessagePerson[] | undefined,
    health: q.health.data as HealthCheck[] | undefined,
    blocked: q.blocked.data?.rows as BlockedRow[] | undefined,
  };
  // A feed that couldn't be loaded at all (it failed, or it waits for a connection) is missing, not loading.
  const failed = Object.fromEntries(DESK_FEEDS.map((f) => [f, q[f].data === undefined && (!!q[f].error || q[f].fetchStatus === "paused")]));
  const stamp = [...DESK_FEEDS.map((f) => `${q[f].dataUpdatedAt}:${failed[f] ? 1 : 0}`), q.discord.dataUpdatedAt].join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const desk = useMemo(() => deriveDesk(data, now, { me, failed }), [stamp, now, me]);
  const refetch = (feeds: Feed[] = DESK_FEEDS) => Promise.all(feeds.map((f) => q[f].refetch()));
  return { desk, data, queries, refetch };
}
