// The app's only way to the bot: typed calls over the bot's /api, nothing rendered from
// the website. Every call carries the session token as a Bearer header (never a cookie,
// never in a URL) and the X-Plexbie header the bot asks of every writer.
//
// Reads retry on a dropped connection, a 5xx or a 429 (two more tries, backing off);
// writes never retry on their own, because a repeated approve or request is not harmless.
import { z } from "zod";
import {
  AckSchema, AdminCleanupSchema, AdminHelpListSchema, InviteCheckSchema, ConversationSchema, DiscordOverviewSchema, HealthSchema, MessagePeopleSchema, AdminInvitesSchema, AdminJoinsSchema, AdminPeopleSchema, AdminRequestsSchema, LinkCandidatesSchema, NewInviteSchema, PlexInvitesSchema, ArrivalsSchema, CommunitySchema, HelpAnswerSchema, StatusSchema, MediaRequestSchema, MediaRequestsSchema, MobileInfoSchema, NothingSchema, LibrarySchema, PopularSchema, SessionSchema, TitleDetailSchema, TitlesSchema, TokenSchema, WatchPartySchema, AppReleaseSchema, DownloadLinkSchema, DiscoverSchema, ShelfPageSchema, SearchAllSchema, PrefsSchema, AdminAllRequestsSchema, AdminRequestDetailSchema, AdminTicketsSchema, AdminTicketDetailSchema, BlockedListSchema, BlockedPreviewSchema, ArrLibrarySchema, ArrEpisodesSchema,
} from "./schemas";
import type { AppCleanupSettings } from "./schemas";
import type { BlockedChoice, BookFormat, HelpReason, MediaKind } from "./types";

export interface NewRequest { kind: MediaKind; id: string; seasons?: number[] | "all" | "latest"; format?: BookFormat }
export type HelpSearch = "again" | "episodes" | "name";

export class ApiError extends Error {
  constructor(
    readonly status: number,                 // 0: never reached the server
    message: string,
    readonly kind: "network" | "timeout" | "http" | "shape" = "http",
  ) {
    super(message);
    this.name = "ApiError";
  }
  get signedOut() { return this.status === 401; }
}

export interface Connection {
  /** e.g. https://plexbie.example.com, no trailing slash. */
  server: string;
  /** The session token from the app sign-in, if signed in. */
  token: string | null;
}

const TIMEOUT_MS = 15_000;
const RETRY_DELAYS_MS = [400, 1200];

const wait = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

interface Answer { status: number; retryAfter: number; text: string }

/** One round trip, body included: the timeout covers a stalled body as well as a silent server. */
async function once(conn: Connection, path: string, init: RequestInit, outer?: AbortSignal): Promise<Answer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const cancel = () => controller.abort();
  outer?.addEventListener("abort", cancel);
  const headers: Record<string, string> = { Accept: "application/json", "X-Plexbie": "1" };
  if (init.body) headers["Content-Type"] = "application/json";
  if (conn.token) headers.Authorization = `Bearer ${conn.token}`;
  try {
    const res = await fetch(`${conn.server}${path}`, { ...init, headers, signal: controller.signal });
    const text = await res.text();
    return { status: res.status, retryAfter: Number(res.headers.get("Retry-After")), text };
  } catch {
    if (outer?.aborted) throw new ApiError(0, "Cancelled.", "network");
    const timedOut = controller.signal.aborted;
    // Deliberately not the error's own text: it can repeat the URL.
    throw new ApiError(0, timedOut ? "The server took too long to answer." : "Couldn't reach the server.", timedOut ? "timeout" : "network");
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener("abort", cancel);
  }
}

function serverMessage(a: Answer): string {
  if (a.status === 401) return "Your sign-in has ended. Sign in again.";
  try {
    const body = JSON.parse(a.text);
    // {"error": …} from most routes; an admin action that didn't happen says {"ok": false, "message": …}.
    const err = body?.error ?? (body?.ok === false ? body?.message : undefined);
    // A short plain sentence from the bot ("Already approved."); anything else is replaced.
    if (typeof err === "string" && err.length <= 200 && !/[<>]/.test(err)) return err;
  } catch { /* not JSON */ }
  return `The server said no (${a.status}).`;
}

async function request<T>(conn: Connection, path: string, schema: z.ZodType<T>, init: RequestInit = {}, signal?: AbortSignal): Promise<T> {
  const idempotent = !init.method || init.method === "GET";
  for (let attempt = 0; ; attempt += 1) {
    const last = !idempotent || attempt >= RETRY_DELAYS_MS.length;
    let a: Answer;
    try {
      a = await once(conn, path, init, signal);
    } catch (e) {
      if (last || signal?.aborted) throw e;
      await wait(RETRY_DELAYS_MS[attempt]);
      continue;
    }
    if (a.status >= 200 && a.status < 300) {
      let body: unknown = null;
      if (a.status !== 204 && a.text) {
        try { body = JSON.parse(a.text); } catch { throw new ApiError(a.status, "The server answered with something that isn't JSON.", "shape"); }
      }
      const parsed = schema.safeParse(body);
      if (!parsed.success) throw new ApiError(a.status, "This server answered in a shape the app doesn't know. Is it up to date?", "shape");
      return parsed.data;
    }
    const retryable = a.status >= 500 || a.status === 429;
    if (last || !retryable) throw new ApiError(a.status, serverMessage(a), "http");
    await wait(Number.isFinite(a.retryAfter) && a.retryAfter > 0 ? Math.min(a.retryAfter * 1000, 5000) : RETRY_DELAYS_MS[attempt]);
  }
}

const json = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });

/** One server, one signed-in person. Build it from the session; it holds no state. */
export function api(conn: Connection) {
  return {
    /** Who the token belongs to. A token the bot no longer accepts is a 401 (signed out); null is kept as "nobody" too. */
    session: (signal?: AbortSignal) => request(conn, "/api/session", SessionSchema.nullable(), {}, signal),
    myRequests: (signal?: AbortSignal) => request(conn, "/api/requests", MediaRequestsSchema, {}, signal),
    status: (signal?: AbortSignal) => request(conn, "/api/status", StatusSchema, {}, signal),
    arrivals: (signal?: AbortSignal) => request(conn, "/api/arrivals", ArrivalsSchema, {}, signal),
    community: (signal?: AbortSignal) => request(conn, "/api/community", CommunitySchema, {}, signal),
    watchparty: (signal?: AbortSignal) => request(conn, "/api/watchparty", WatchPartySchema, {}, signal),
    library: (kind: "movie" | "tv" | "book", signal?: AbortSignal) =>
      request(conn, `/api/library?${new URLSearchParams({ kind })}`, LibrarySchema, {}, signal),
    search: (q: string, kind: MediaKind, signal?: AbortSignal) =>
      request(conn, `/api/search?${new URLSearchParams({ q, kind })}`, TitlesSchema, {}, signal),
    popular: (signal?: AbortSignal) => request(conn, "/api/popular", PopularSchema, {}, signal),
    searchAll: (q: string, signal?: AbortSignal) =>
      request(conn, `/api/search/all?${new URLSearchParams({ q })}`, SearchAllSchema, {}, signal),
    prefs: (signal?: AbortSignal) => request(conn, "/api/prefs", PrefsSchema, {}, signal),
    discover: (kind: "movie" | "tv", signal?: AbortSignal) => request(conn, `/api/discover/${kind}`, DiscoverSchema, {}, signal),
    shelf: (kind: "movie" | "tv", key: string, page: number, signal?: AbortSignal) =>
      request(conn, `/api/discover/${kind}/${encodeURIComponent(key)}?page=${page}`, ShelfPageSchema, {}, signal),
    /** Which languages this member's Request shelves show (none: everything). Kept with their account. */
    saveLanguages: (languages: string[]) =>
      request(conn, "/api/prefs", z.looseObject({ languages: z.array(z.string()).catch([]) }), json({ languages })),
    similar: (kind: MediaKind, id: string, signal?: AbortSignal) =>
      request(conn, `/api/titles/${kind}/${encodeURIComponent(id)}/similar`, TitlesSchema, {}, signal),
    appLatest: (signal?: AbortSignal) => request(conn, "/api/app/latest", AppReleaseSchema, {}, signal),
    /** A link to the newest app, good for ten minutes, for the phone's browser to download. */
    appDownloadLink: async () =>
      new URL((await request(conn, "/api/app/download-link", DownloadLinkSchema, json({}))).url, conn.server).toString(),
    title: (kind: MediaKind, id: string, signal?: AbortSignal) =>
      request(conn, `/api/titles/${kind}/${encodeURIComponent(id)}`, TitleDetailSchema, {}, signal),
    /** Sends a request. Never retried by the client: asking twice isn't harmless. */
    request: (body: NewRequest) => request(conn, "/api/requests", MediaRequestSchema.partial({ title: true, requestedAt: true, updatedAt: true }), json(body)),
    askHelp: (requestId: string, reason: HelpReason, note: string) =>
      request(conn, `/api/requests/${encodeURIComponent(requestId)}/help`, HelpAnswerSchema, json({ reason, note })),
    join: (email: string) => request(conn, "/api/join", NothingSchema, json({ email })),
    adminRequests: (signal?: AbortSignal) => request(conn, "/api/admin/requests", AdminRequestsSchema, {}, signal),
    /** Everyone's requests and where each is now: the last 30 days, every one with `everything`; with q, any request ever. */
    adminAll: (q: string, signal?: AbortSignal, everything = false) =>
      request(conn, `/api/admin/all?${new URLSearchParams({ q, ...(everything ? { all: "1" } : {}) })}`, AdminAllRequestsSchema, {}, signal),
    adminRequest: (key: string, signal?: AbortSignal) =>
      request(conn, `/api/admin/request/${encodeURIComponent(key)}`, AdminRequestDetailSchema, {}, signal),
    /** An admin's ticket on someone's request; with `tell`, `message` goes to the person who asked. */
    requestTicket: (key: string, note: string, tell: boolean, message = "") =>
      request(conn, `/api/admin/request/${encodeURIComponent(key)}/ticket`, HelpAnswerSchema, json({ note, tell, message })),
    // Manage → Tickets: a ticket is a conversation an admin can take, note on, reply in, and solve.
    adminTickets: (signal?: AbortSignal) => request(conn, "/api/admin/tickets", AdminTicketsSchema, {}, signal),
    adminBlocked: (signal?: AbortSignal) => request(conn, "/api/admin/blocked", BlockedListSchema, {}, signal),
    blockedPreview: (app: string, downloadId: string, signal?: AbortSignal) =>
      request(conn, `/api/admin/blocked/${encodeURIComponent(app)}/${encodeURIComponent(downloadId)}`, BlockedPreviewSchema, {}, signal),
    /** Imports it through Sonarr's/Radarr's Manual Import (after the admin held the button). */
    blockedImport: (app: string, downloadId: string, files?: BlockedChoice[]) =>
      request(conn, `/api/admin/blocked/${encodeURIComponent(app)}/${encodeURIComponent(downloadId)}/import`, AckSchema, json(files ? { files } : {})),
    /** Shows (Sonarr) or films (Radarr) in the library, for "Wrong show?". */
    arrLibrary: (app: string, q: string, signal?: AbortSignal) =>
      request(conn, `/api/admin/arr/${encodeURIComponent(app)}/library?q=${encodeURIComponent(q)}`, ArrLibrarySchema, {}, signal),
    arrEpisodes: (seriesId: number, signal?: AbortSignal) =>
      request(conn, `/api/admin/arr/sonarr/series/${seriesId}/episodes`, ArrEpisodesSchema, {}, signal),
    adminTicket: (id: string, signal?: AbortSignal) =>
      request(conn, `/api/admin/ticket/${encodeURIComponent(id)}`, AdminTicketDetailSchema, {}, signal),
    /** "note": only admins see it. "reply": sent to the member, who can answer. */
    ticketComment: (id: string, kind: "note" | "reply", text: string) =>
      request(conn, `/api/admin/ticket/${encodeURIComponent(id)}/comment`, AckSchema, json({ kind, text })),
    /** "resolved" can carry a last word to the member. */
    ticketStatus: (id: string, status: "open" | "waiting" | "resolved", message = "") =>
      request(conn, `/api/admin/ticket/${encodeURIComponent(id)}/status`, AckSchema, json({ status, message })),
    /** Takes the ticket, or lets it go when it's already yours. */
    ticketTake: (id: string) => request(conn, `/api/admin/ticket/${encodeURIComponent(id)}/take`, AckSchema, json({})),
    /** The member answering their ticket. */
    answerTicket: (requestId: string, text: string) =>
      request(conn, `/api/requests/${encodeURIComponent(requestId)}/help/reply`, AckSchema, json({ text })),
    requestSearch: (key: string, how: HelpSearch) =>
      request(conn, `/api/admin/request/${encodeURIComponent(key)}/search/${how}`, AckSchema, json({})),
    decide: (id: string, approve: boolean) =>
      request(conn, `/api/admin/requests/${encodeURIComponent(id)}/${approve ? "approve" : "decline"}`, AckSchema, json({})),
    // Manage: join requests, help, people, invites. Writes are never retried by the client.
    adminJoins: (signal?: AbortSignal) => request(conn, "/api/admin/joins", AdminJoinsSchema, {}, signal),
    decideJoin: (messageId: string, approve: boolean) =>
      request(conn, `/api/admin/joins/${encodeURIComponent(messageId)}/${approve ? "approve" : "decline"}`, AckSchema, json({})),
    adminHelp: (signal?: AbortSignal) => request(conn, "/api/admin/help", AdminHelpListSchema, {}, signal),
    /** again: by the title's IDs; episodes: a show episode by episode; name: NZBHydra by name. */
    helpSearch: (id: string, how: HelpSearch) =>
      request(conn, `/api/admin/help/${encodeURIComponent(id)}/${{ again: "search", episodes: "episodes", name: "name" }[how]}`, AckSchema, json({})),
    helpResolve: (id: string, reply: string) => request(conn, `/api/admin/help/${encodeURIComponent(id)}/resolve`, AckSchema, json({ reply })),
    adminPeople: (signal?: AbortSignal) => request(conn, "/api/admin/people", AdminPeopleSchema, {}, signal),
    linkCandidates: (signal?: AbortSignal) => request(conn, "/api/admin/links", LinkCandidatesSchema, {}, signal),
    linkPerson: (plexName: string, discordId: string) => request(conn, "/api/admin/people/link", AckSchema, json({ plexName, discordId })),
    unlinkPerson: (plexName: string) => request(conn, "/api/admin/people/unlink", AckSchema, json({ plexName })),
    renamePerson: (plexName: string, name: string) => request(conn, "/api/admin/people/rename", AckSchema, json({ plexName, name })),
    keepPerson: (plexName: string, keep: boolean) => request(conn, "/api/admin/people/keep", AckSchema, json({ plexName, keep })),
    matchPerson: (plexName: string, account: string) => request(conn, "/api/admin/people/match", AckSchema, json({ plexName, account })),
    removePerson: (plexName: string) => request(conn, "/api/admin/people/remove", AckSchema, json({ plexName })),
    adminInvites: (signal?: AbortSignal) => request(conn, "/api/admin/invites", AdminInvitesSchema, {}, signal),
    createInvite: (body: { label: string; email?: string; days: number }) => request(conn, "/api/admin/invites", NewInviteSchema, json(body)),
    renewInvite: (id: string) => request(conn, `/api/admin/invites/${encodeURIComponent(id)}/renew`, NewInviteSchema, json({})),
    revokeInvite: (id: string) => request(conn, `/api/admin/invites/${encodeURIComponent(id)}/revoke`, AckSchema, json({})),
    deleteInvite: (id: string) => request(conn, `/api/admin/invites/${encodeURIComponent(id)}/delete`, AckSchema, json({})),
    plexInvites: (signal?: AbortSignal) => request(conn, "/api/admin/plexinvites", PlexInvitesSchema, {}, signal),
    plexInviteChange: (email: string, next: string) => request(conn, "/api/admin/plex-invites/change", AckSchema, json({ email, new: next })),
    plexInviteCancel: (email: string) => request(conn, "/api/admin/plex-invites/cancel", AckSchema, json({ email })),
    adminCleanup: (signal?: AbortSignal) => request(conn, "/api/admin/cleanup", AdminCleanupSchema, {}, signal),
    exempt: (ratingKey: string, keep: boolean) => request(conn, "/api/admin/cleanup/exempt", AckSchema, json({ ratingKey, keep })),
    cleanupSettings: (change: Partial<AppCleanupSettings>) => request(conn, "/api/admin/cleanup/settings", AckSchema, json(change)),
    cleanupScan: () => request(conn, "/api/admin/cleanup/scan", AckSchema, json({})),
    adminHealth: (signal?: AbortSignal) => request(conn, "/api/admin/health", HealthSchema, {}, signal),
    adminDiscord: (signal?: AbortSignal) => request(conn, "/api/admin/discord", DiscordOverviewSchema, {}, signal),
    say: (channelId: string, message: string, allowMassPings: boolean) =>
      request(conn, "/api/admin/say", AckSchema, json({ channelId, message, allowMassPings })),
    adminMessages: (signal?: AbortSignal) => request(conn, "/api/admin/messages", MessagePeopleSchema, {}, signal),
    conversation: (who: string, signal?: AbortSignal) =>
      request(conn, `/api/admin/messages/${encodeURIComponent(who)}`, ConversationSchema, {}, signal),
    /** Alerts in this app on this phone: register its Expo push token with the bot, or remove it. */
    /** Answer someone as Plexbie, signed with your name. */
    messageReply: (who: string, text: string) =>
      request(conn, `/api/admin/messages/${encodeURIComponent(who)}/reply`, AckSchema, json({ text })),
    messageDone: (who: string, done: boolean) =>
      request(conn, `/api/admin/messages/${encodeURIComponent(who)}/done`, AckSchema, json({ done })),
    /** Put something they sent Plexbie on their open ticket. */
    messageToTicket: (key: string) => request(conn, `/api/admin/message/${encodeURIComponent(key)}/to-ticket`, AckSchema, json({})),
    inboxSettings: (autoreply: boolean) => request(conn, "/api/admin/inbox", AckSchema, json({ autoreply })),
    /** `channel`: the Android notification channel alerts should use (see push.ts);
     *  `live`: whether this phone wants live progress for its requests (live.ts). */
    registerPush: (token: string, platform: string, channel?: string, live?: boolean) =>
      request(conn, "/api/push/app", NothingSchema, json({ token, platform, channel, live })),
    unregisterPush: (token: string) => request(conn, "/api/push/app/remove", NothingSchema, json({ token })),
    /** A test alert to every phone and browser this person has alerts on in. `ok` false: there were none. */
    pushTest: () => request(conn, "/api/push/test", AckSchema, json({})),
    /** Ends this session on the server too, so a copied token stops working. */
    logout: () => request(conn, "/api/logout", NothingSchema, { method: "POST" }),
  };
}

/** Calls that happen before anyone is signed in. */
export const pub = {
  /** Does this server speak to the app? 404 means a bot from before the app existed. */
  mobileInfo: (server: string) => request({ server, token: null }, "/api/mobile", MobileInfoSchema),
  exchange: (server: string, code: string, verifier: string) =>
    request({ server, token: null }, "/auth/mobile/token", TokenSchema, json({ code, verifier })),
  /** What an invite link's code is: who it's from, and whether it still works. The code goes in the body, never the URL. */
  inviteCheck: (server: string, code: string) =>
    request({ server, token: null }, "/api/invite/check", InviteCheckSchema, json({ token: code })),
};

export type Api = ReturnType<typeof api>;
