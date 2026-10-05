// Runtime checks at the network edge. The TypeScript types (./types, copied from the
// bot) say what /api promises; these confirm it, so a server on another version gives
// a clear "this server answered something unexpected" instead of a crash deep in a list.
//
// What the screens draw is validated; what they don't use passes through. Values a newer
// bot might add (a new stage, a new kind) are kept as plain strings, not rejected, and a
// single malformed row is dropped rather than failing the whole list.
import { z } from "zod";
import type { MediaRequest } from "./types";

const opt = <T extends z.ZodTypeAny>(s: T) => s.optional().catch(undefined);

export const SessionSchema = z.looseObject({
  user: z.looseObject({ id: z.string(), name: z.string(), avatar: z.string().nullable().catch(null), via: opt(z.enum(["discord", "plex"])) }),
  member: z.boolean(),
  joinPending: z.boolean().catch(false),
  admin: opt(z.boolean()),
  plexName: z.string().nullable().optional().catch(null),
  inGuild: z.boolean().nullable().optional().catch(null),
  accessUnknown: opt(z.boolean()),
});
export type AppSession = z.infer<typeof SessionSchema>;

const TitleSchema = z.looseObject({
  id: z.string(),
  kind: z.string(),            // "movie" | "tv" | "audiobook" | "ebook" today
  title: z.string(),
  year: opt(z.string()),
  poster: z.string().nullable().catch(null),
});

const SeasonInfoSchema = z.looseObject({
  n: z.number(),
  episodes: z.number().catch(0),
  have: opt(z.number()),
  status: opt(z.string()),     // SeasonStatus today; an unknown one is treated as not requestable
});

/** A title from search or its own page: what it is, and whether it can still be asked for. */
export const TitleDetailSchema = TitleSchema.extend({
  backdrop: z.string().nullable().optional().catch(null),
  overview: opt(z.string()),
  genres: opt(z.array(z.string())),
  runtime: z.number().nullable().optional().catch(null),
  author: opt(z.string()),
  seasons: opt(z.array(SeasonInfoSchema)),
  availability: z.string().catch("none"),
  plexUrl: z.string().nullable().optional().catch(null),
  yourRequest: z.looseObject({ slot: z.number(), stage: z.string() }).nullable().optional().catch(null),
  leaving: z.looseObject({ daysLeft: opt(z.number()), warning: opt(z.boolean()), exempt: opt(z.boolean()), practice: opt(z.boolean()) })
    .nullable().optional().catch(null),
});
export type AppTitle = z.infer<typeof TitleDetailSchema>;

/** Search results: one odd row is left out, not the reason the search fails. */
export const TitlesSchema = z.array(z.unknown()).transform((rows) =>
  rows.flatMap((row) => {
    const parsed = TitleDetailSchema.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  }),
);

/** A shelf of what's already there (GET /api/library?kind=movie|tv|book). */
export const LibraryItemSchema = TitleDetailSchema.extend({ addedAt: z.string().catch("") });
export type AppLibraryItem = z.infer<typeof LibraryItemSchema>;
export const LibrarySchema = z.array(z.unknown()).transform((rows) =>
  rows.flatMap((row) => { const p = LibraryItemSchema.safeParse(row); return p.success ? [p.data] : []; }));

export const PopularSchema = z.looseObject({ movies: TitlesSchema.catch([]), tv: TitlesSchema.catch([]) });

const ProgressSchema = z.looseObject({
  percent: z.number().nullable().optional().catch(null),
  detail: z.string().nullable().optional().catch(null),
  problem: z.string().nullable().optional().catch(null),
  seasons: opt(z.array(z.looseObject({ n: z.number(), have: z.number().catch(0), total: z.number().catch(0) }))),
  /** "upcoming": when it comes out (ISO date). */
  releaseDate: z.string().nullable().optional().catch(null),
});

/** One line on a ticket's timeline. "note" is admins only; "reply" went to the member. */
const TicketEntrySchema = z.looseObject({
  id: z.string().catch(""), at: z.string().catch(""), by: z.string().catch(""),
  kind: z.string().catch("note"),   // "member" | "note" | "reply" | "action" | "status" today
  text: z.string().catch(""),
});
export type AppTicketEntry = z.infer<typeof TicketEntrySchema>;
const timeline = z.array(z.unknown()).transform((rows) =>
  rows.flatMap((r) => { const p = TicketEntrySchema.safeParse(r); return p.success ? [p.data] : []; }));

/** The member's ticket on their request: its conversation, without the admins' notes. */
const MemberTicketSchema = z.looseObject({
  id: z.string(), reason: z.string(),
  status: opt(z.string()),
  /** An admin asked something and waits on the member's answer. */
  waiting: opt(z.boolean()),
  thread: opt(timeline),
});
export type AppMemberTicket = z.infer<typeof MemberTicketSchema>;

export const MediaRequestSchema = z.looseObject({
  id: opt(z.string()),
  slot: z.number(),
  title: TitleSchema,
  stage: z.string(),           // RequestStage today; an unknown one is shown as written
  requestedAt: z.string(),
  updatedAt: z.string(),
  seasons: opt(z.union([z.array(z.number()), z.literal("all"), z.literal("latest")])),
  format: opt(z.string()),
  note: opt(z.string()),
  progress: ProgressSchema.nullable().optional().catch(null),
  help: MemberTicketSchema.nullable().optional().catch(null),
});
export type AppRequest = z.infer<typeof MediaRequestSchema>;

/** A list where one bad row is left out, not the reason the whole screen fails. */
export const MediaRequestsSchema = z.array(z.unknown()).transform((rows) =>
  rows.flatMap((row) => {
    const parsed = MediaRequestSchema.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  }),
);

/** The server at a glance (GET /api/status): is Plex up, how many watching, library sizes. */
export const StatusSchema = z.looseObject({
  online: z.boolean(),
  streams: z.number().catch(0),
  libraries: z.array(z.looseObject({ title: z.string(), kind: z.string(), count: z.number().catch(0) })).catch([]),
});
export type AppStatus = z.infer<typeof StatusSchema>;

const ArrivalSchema = z.looseObject({ title: TitleDetailSchema, addedAt: z.string(), detail: z.string().nullable().optional().catch(null) });
export type AppArrival = z.infer<typeof ArrivalSchema>;
/** Just arrived on Plex and the shelf, newest first. */
export const ArrivalsSchema = z.array(z.unknown()).transform((rows) =>
  rows.flatMap((row) => { const p = ArrivalSchema.safeParse(row); return p.success ? [p.data] : []; }));

const OnAirSchema = z.looseObject({
  member: z.string(), title: z.string(), subtitle: z.string().nullable().optional().catch(null),
  poster: z.string().nullable().catch(null), progress: z.number().catch(0), device: z.string().catch(""),
});
/** Who's watching and the household's standings (GET /api/community). */
export const CommunitySchema = z.looseObject({
  onAir: z.array(z.unknown()).transform((rows) => rows.flatMap((r) => { const p = OnAirSchema.safeParse(r); return p.success ? [p.data] : []; })).catch([]),
  leaderboard: z.array(z.looseObject({ name: z.string(), hours: z.number().catch(0), streak: z.number().catch(0) })).catch([]),
  you: z.looseObject({
    rank: z.number().nullable().catch(null), hours: z.number().catch(0), streak: z.number().catch(0),
    longestStreak: z.number().catch(0), daysIdle: z.number().catch(0), removalAfterDays: z.number().catch(0),
    topThree: z.boolean().catch(false), watchPartyMinutes: z.number().catch(0),
  }).nullable().catch(null),
});
export type AppCommunity = z.infer<typeof CommunitySchema>;

/** Your watch-party credit (GET /api/watchparty). */
export const WatchPartySchema = z.looseObject({ seconds: z.number().catch(0), sessions: z.number().catch(0), last: z.string().nullable().catch(null) });

/** An admin action's answer: whether it worked, and a sentence about it. */
export const AckSchema = z.looseObject({ ok: z.boolean().catch(true), message: z.string().catch("") });
export type Ack = z.infer<typeof AckSchema>;

export const HelpAnswerSchema = AckSchema.extend({ help: z.looseObject({ id: z.string(), reason: z.string() }) });

/** A request card on Manage (GET /api/admin/requests). */
const AdminRequestSchema = z.looseObject({
  id: z.string(),
  slot: z.number(),
  title: z.string(),
  kind: z.string(),
  poster: z.string().nullable().catch(null),
  seasons: z.union([z.array(z.number()), z.literal("all"), z.literal("latest")]).nullable().optional().catch(null),
  requester: z.string().catch("Someone"),
  requestedAt: z.string(),
  status: z.string(),
  resolvedBy: z.string().nullable().optional().catch(null),
  resolvedAt: z.string().nullable().optional().catch(null),
});
export type AppAdminRequest = z.infer<typeof AdminRequestSchema>;
const AdminRowsSchema = z.array(z.unknown()).transform((rows) =>
  rows.flatMap((row) => { const p = AdminRequestSchema.safeParse(row); return p.success ? [p.data] : []; }));
export const AdminRequestsSchema = z.looseObject({
  pending: AdminRowsSchema.catch([]), older: AdminRowsSchema.catch([]), recent: AdminRowsSchema.catch([]),
});
export type AppAdminRequests = z.infer<typeof AdminRequestsSchema>;

/** A list where a malformed row is left out rather than failing the whole section. */
const rowsOf = <T extends z.ZodTypeAny>(row: T) => z.array(z.unknown()).transform((rows) =>
  rows.flatMap((r) => { const p = row.safeParse(r); return p.success ? [p.data as z.infer<T>] : []; }));

/** A request on Manage → All requests: what its member sees, plus who asked and why it looks stuck. */
export const AdminRequestRowSchema = MediaRequestSchema.extend({
  requester: z.string().catch("Someone"),
  status: z.string().catch(""),
  approvedBy: z.string().nullable().optional().catch(null),
  approvedAt: z.string().nullable().optional().catch(null),
  /** When it reached the stage it's at, as far as the bot has seen. */
  stageSince: z.string().nullable().optional().catch(null),
  finishedAt: z.string().nullable().optional().catch(null),
  /** Why it looks stuck, in words; empty when it doesn't. */
  stuck: z.array(z.string()).catch([]),
});
export type AppAdminRequestRow = z.infer<typeof AdminRequestRowSchema>;
/** GET /api/admin/all[?q=][&all=1]: every request from the last 30 days (and anything still on its
 *  way), every request since No. 0001 with all=1, or (with q) any request ever. */
export const AdminAllRequestsSchema = z.looseObject({
  rows: rowsOf(AdminRequestRowSchema).catch([]),
  counts: z.looseObject({
    active: z.number().catch(0), stuck: z.number().catch(0), finished: z.number().catch(0),
    waiting: z.number().catch(0), declined: z.number().catch(0),
  }).nullable().optional().catch(null),
  query: z.string().nullable().optional().catch(null),
  everything: z.boolean().catch(false),
  /** How many requests there have ever been (0 from an older bot). */
  total: z.number().catch(0),
});
export type AppAdminAllRequests = z.infer<typeof AdminAllRequestsSchema>;
const AdminTicketSchema = z.looseObject({
  id: z.string(), status: z.string().catch("open"), reason: z.string().catch(""),
  note: z.string().nullable().optional().catch(null), who: z.string().nullable().optional().catch(null),
  /** Set when an admin opened it from All requests. */
  opened_by: z.string().nullable().optional().catch(null),
  created_at: z.string().catch(""), resolved_by: z.string().nullable().optional().catch(null),
  resolved_at: z.string().nullable().optional().catch(null), reply: z.string().nullable().optional().catch(null),
});
export type AppAdminTicket = z.infer<typeof AdminTicketSchema>;
/** GET /api/admin/request/<key>: one request in full, its tickets, and what admins did from it. */
export const AdminRequestDetailSchema = AdminRequestRowSchema.extend({
  via: z.string().catch("Discord"),
  seerrId: z.number().nullable().optional().catch(null),
  tickets: rowsOf(AdminTicketSchema).catch([]),
  activity: z.array(z.looseObject({ at: z.string().catch(""), by: z.string().catch(""), did: z.string().catch("") })).catch([]),
});
export type AppAdminRequestDetail = z.infer<typeof AdminRequestDetailSchema>;

/** A ticket on Manage → Tickets (GET /api/admin/tickets). */
const AdminTicketRowSchema = z.looseObject({
  id: z.string(), requestKey: z.string().nullable().catch(null), slot: z.number().catch(0), title: z.string().catch(""),
  kind: z.string().catch(""), seasons: z.union([z.array(z.number()), z.literal("all"), z.literal("latest")]).nullable().optional().catch(null),
  who: z.string().catch("Someone"), reason: z.string().catch(""), status: z.string().catch("open"), waiting: z.boolean().catch(false),
  owner: z.string().nullable().optional().catch(null), openedBy: z.string().nullable().optional().catch(null),
  /** "name": Plexbie's search by ID found nothing; it asks whether to search by name. */
  offer: z.string().nullable().optional().catch(null),
  createdAt: z.string().catch(""), updatedAt: z.string().catch(""),
  last: z.looseObject({ by: z.string().nullable().catch(null), kind: z.string().nullable().catch(null), text: z.string().catch("") }).nullable().optional().catch(null),
  count: z.number().catch(0),
});
export type AppAdminTicketRow = z.infer<typeof AdminTicketRowSchema>;
/** Needing an admin first, then waiting on the member, then the last 50 solved. */
export const AdminTicketsSchema = z.looseObject({
  rows: rowsOf(AdminTicketRowSchema).catch([]),
  counts: z.looseObject({ action: z.number().catch(0), waiting: z.number().catch(0), solved: z.number().catch(0) })
    .catch({ action: 0, waiting: 0, solved: 0 }),
});
export type AppAdminTickets = z.infer<typeof AdminTicketsSchema>;
/** GET /api/admin/ticket/<id>: one ticket, its whole timeline, and its request as All requests shows it. */
export const AdminTicketDetailSchema = AdminTicketRowSchema.extend({
  note: z.string().nullable().optional().catch(null),
  statusThen: z.string().nullable().optional().catch(null),
  thread: timeline.catch([]),
  request: AdminRequestRowSchema.nullable().catch(null),
});
export type AppAdminTicketDetail = z.infer<typeof AdminTicketDetailSchema>;

/** Someone asking to join (GET /api/admin/joins). Decided by messageId, the Discord card. */
const AdminJoinSchema = z.looseObject({
  key: z.string(), messageId: z.string().catch(""), name: z.string().catch("Someone"), via: z.string().catch("discord"),
  email: z.string().catch(""), status: z.string(), askedAt: z.string().catch(""),
});
export type AppAdminJoin = z.infer<typeof AdminJoinSchema>;
export const AdminJoinsSchema = rowsOf(AdminJoinSchema);

/** A member's "Something wrong?" (GET /api/admin/help). */
const AdminHelpSchema = z.looseObject({
  id: z.string(), slot: z.number().catch(0), title: z.string().catch(""), kind: z.string().catch(""),
  seasons: z.union([z.array(z.number()), z.literal("all")]).nullable().optional().catch(null),
  who: z.string().catch("Someone"), reason: z.string().catch(""), note: z.string().catch(""),
  status_then: z.string().catch(""), status: z.string(), created_at: z.string().catch(""),
  actions: z.array(z.looseObject({ at: z.string().catch(""), by: z.string().catch(""), did: z.string().catch("") })).optional().catch([]),
  /** "name": Plexbie's search by ID found nothing; it asks whether to search by name. */
  offer: z.string().nullable().optional().catch(null),
});
export type AppAdminHelp = z.infer<typeof AdminHelpSchema>;
export const AdminHelpListSchema = rowsOf(AdminHelpSchema);

/** Someone the server is shared with (GET /api/admin/people), closest to removal first. */
const AdminPersonSchema = z.looseObject({
  plexName: z.string(),
  discordName: z.string().nullable().catch(null),
  discordId: z.string().nullable().optional().catch(null),
  linked: z.boolean().catch(false),
  lastWatched: z.string().nullable().catch(null),
  daysIdle: z.number().catch(0),
  warned: z.boolean().catch(false),
  topThree: z.boolean().catch(false),
  removalIn: z.number().nullable().catch(null),
  warnAfter: z.number().catch(0),
  tracked: opt(z.boolean()),
  hasAccess: z.boolean().nullable().optional().catch(null),
  owner: opt(z.boolean()),
  displayName: z.string().nullable().optional().catch(null),
  neverRemove: opt(z.boolean()),
  candidates: opt(z.array(z.string())),
});
export type AppAdminPerson = z.infer<typeof AdminPersonSchema>;
export const AdminPeopleSchema = rowsOf(AdminPersonSchema);

/** Discord members who can be linked to a Plex account (GET /api/admin/links). */
export const LinkCandidatesSchema = z.looseObject({
  discord: rowsOf(z.looseObject({ id: z.string(), name: z.string(), username: z.string().catch("") })).catch([]),
});

/** An invite link (GET /api/admin/invites). The link itself is only ever in NewInvite. */
const AdminInviteSchema = z.looseObject({
  id: z.string(), label: z.string().catch("Someone"), email: z.string().nullable().catch(null),
  createdBy: z.string().nullable().catch(null), createdAt: z.string().catch(""), expiresAt: z.string().catch(""),
  status: z.string(), usedBy: z.string().nullable().catch(null), usedAt: z.string().nullable().catch(null),
});
export type AppAdminInvite = z.infer<typeof AdminInviteSchema>;
export const AdminInvitesSchema = rowsOf(AdminInviteSchema);
/** Only a web link: it's shared with the share sheet, so nothing else (an app scheme, a file) gets through. */
export const NewInviteSchema = z.looseObject({
  url: z.string().url().refine((u) => /^https?:\/\/[^/\s]+\/invite\/[A-Za-z0-9_-]+$/.test(u), "Not an invite link"),
  invite: AdminInviteSchema,
});
export type AppNewInvite = z.infer<typeof NewInviteSchema>;

/** An invite on plex.tv nobody has accepted yet (GET /api/admin/plexinvites). */
const PlexInviteSchema = z.looseObject({ email: z.string(), name: z.string().catch(""), sentAt: z.string().catch(""), who: z.string().nullable().catch(null) });
export type AppPlexInvite = z.infer<typeof PlexInviteSchema>;
export const PlexInvitesSchema = rowsOf(PlexInviteSchema);

/** Media cleanup: its settings and the titles on the clock (GET /api/admin/cleanup). */
export const CleanupSettingsSchema = z.looseObject({
  enabled: z.boolean().catch(false), practice: z.boolean().catch(true),
  inactivityDays: z.number().catch(90), warnDaysBefore: z.number().catch(7),
  excludedLibraries: z.array(z.string()).catch([]), channelId: z.string().nullable().optional().catch(null),
});
export type AppCleanupSettings = z.infer<typeof CleanupSettingsSchema>;
const CleanupRowSchema = z.looseObject({
  ratingKey: z.string(), title: z.string().catch(""), type: z.string().catch(""), daysLeft: z.number().catch(0),
  reason: z.string().catch(""), lastActivity: opt(z.string()),
});
export type AppCleanupRow = z.infer<typeof CleanupRowSchema>;
const KeptSchema = z.looseObject({ ratingKey: z.string(), title: z.string().catch(""), type: z.string().nullable().optional().catch(null) });
export type AppKept = z.infer<typeof KeptSchema>;
export const AdminCleanupSchema = z.looseObject({
  settings: CleanupSettingsSchema,
  libraries: z.array(z.string()).optional().catch([]),
  channels: rowsOf(z.looseObject({ id: z.string(), name: z.string() })).optional().catch([]),
  warning: rowsOf(CleanupRowSchema).catch([]),
  upcoming: rowsOf(CleanupRowSchema).catch([]),
  exempt: rowsOf(KeptSchema).catch([]),
});
export type AppAdminCleanup = z.infer<typeof AdminCleanupSchema>;

/** Each connected service and whether it answers (GET /api/admin/health). */
export const HealthSchema = rowsOf(z.looseObject({ name: z.string(), ok: z.boolean(), ms: z.number().catch(0), detail: z.string().nullable().optional().catch(null) }));

/** Discord tools (GET /api/admin/discord): channels to post in, who brought whom, a live watch party. */
export const DiscordOverviewSchema = z.looseObject({
  /** DMs to Plexbie: whether it answers them itself, and what it lacks to keep a thread per person. */
  inbox: z.looseObject({ autoreply: z.boolean().catch(true), threadsMissing: z.string().nullable().catch(null) }).nullable().optional().catch(null),
  channels: rowsOf(z.looseObject({ id: z.string(), name: z.string() })).catch([]),
  joins: rowsOf(z.looseObject({
    who: z.string(), by: z.string().catch(""), via: z.string().catch("discord"), code: z.string().nullable().catch(null),
    at: z.string().nullable().catch(null), role: z.string().nullable().catch(null),
  })).catch([]),
  party: z.looseObject({
    channel: z.string().nullable().catch(null), streamer: z.string().catch("Someone"), title: z.string().nullable().catch(null),
    startedAt: z.string().nullable().catch(null), people: z.array(z.string()).catch([]),
  }).nullable().catch(null),
});
export type AppDiscordOverview = z.infer<typeof DiscordOverviewSchema>;

/** Everyone Plexbie has messaged, and how (GET /api/admin/messages). */
export const MessagePeopleSchema = rowsOf(z.looseObject({
  /** count: from Plexbie; received: from them (a DM, "Something wrong?", a ticket answer). */
  id: z.string(), name: z.string().catch("Someone"), count: z.number().catch(0), received: z.number().catch(0), failed: z.number().catch(0),
  via: z.array(z.string()).catch([]),
  last: z.looseObject({ at: z.string().catch(""), text: z.string().catch(""), channel: z.string().catch("none"), delivered: z.boolean().catch(true),
    direction: z.string().catch("out") }),
  /** Their messages no admin has marked done. */
  unread: z.number().catch(0),
  /** Who marked the conversation done, and when (the history stays). */
  done: z.looseObject({ at: z.string().catch(""), by: z.string().nullable().catch(null) }).nullable().optional().catch(null),
  /** Their open ticket, for "Add to their ticket". */
  ticket: z.looseObject({ id: z.string(), title: z.string().catch(""), slot: z.number().catch(0) }).nullable().optional().catch(null),
}));
export type AppMessagePerson = z.infer<typeof MessagePeopleSchema>[number];
/** One person's messages with Plexbie (GET /api/admin/messages/{who}); "in" ones they sent. */
export const ConversationSchema = rowsOf(z.looseObject({
  id: z.string(), at: z.string(), direction: z.string().catch("out"), channel: z.string().catch("none"), delivered: z.boolean().catch(true),
  /** The admin who wrote it; and for one they sent, the ticket an admin put it on. */
  by: z.string().nullable().optional().catch(null), ticket: z.string().nullable().optional().catch(null),
  title: z.string().nullable().catch(null), text: z.string().catch(""), context: z.string().catch(""), error: z.string().nullable().catch(null),
}));
export type AppLoggedMessage = z.infer<typeof ConversationSchema>[number];

/** For calls whose answer the app doesn't use (an acknowledgement). */
export const NothingSchema = z.unknown().transform(() => null);

/** What a server says about app sign-in (GET /api/mobile on the bot). */
export const MobileInfoSchema = z.looseObject({
  version: z.string(),
  auth: z.array(z.string()),
  push: opt(z.array(z.string())),
  /** The server's own address, when it has moved: the app follows it (auth/session.tsx). */
  home: z.string().nullable().optional().catch(null),
});
export type MobileInfo = z.infer<typeof MobileInfoSchema>;

/** The token exchange answer (POST /auth/mobile/token on the bot). Header-safe characters only. */
export const TokenSchema = z.object({ token: z.string().regex(/^[A-Za-z0-9._~-]{32,512}$/), expiresAt: z.number() });

// Compile-time guard: what the bot says it sends (types.ts) must still satisfy what the
// app requires. If the bot's MediaRequest changes incompatibly, this line stops compiling.
type Needed = Pick<z.input<typeof MediaRequestSchema>, "slot" | "stage" | "requestedAt" | "updatedAt"> & {
  title: Pick<z.input<typeof TitleSchema>, "id" | "kind" | "title" | "poster">;
};
export const _botShapeStillFits = (r: MediaRequest): Needed => r;

/** The Android app's newest version (GET /api/app/latest); null before the first release. */
export const AppReleaseSchema = z.looseObject({
  version: z.string(), versionCode: z.number(), size: z.number().catch(0), notes: z.string().catch(""), sha256: z.string().catch(""),
  /** The same version for iPhones (through SideStore/AltStore), when the release has one. */
  ios: z.looseObject({ size: z.number().catch(0) }).nullable().optional().catch(null),
}).nullable();
export type AppRelease = NonNullable<z.infer<typeof AppReleaseSchema>>;
export const DownloadLinkSchema = z.looseObject({ url: z.string(), version: z.string().catch("") });


/** The Request tab's shelves (GET /api/discover/<kind>): Trending, Popular, Coming soon, Top rated, and genres. */
export const DiscoverSchema = z.looseObject({
  shelves: z.array(z.looseObject({ key: z.string(), title: z.string(), titles: TitlesSchema, more: z.boolean().catch(false) })).catch([]),
  genres: z.array(z.looseObject({ id: z.number(), name: z.string() })).catch([]),
  /** This member's language choice (none: everything) and the options. */
  languages: z.array(z.string()).catch([]),
  languageOptions: z.array(z.looseObject({ code: z.string(), name: z.string() })).catch([]),
});
export type AppDiscover = z.infer<typeof DiscoverSchema>;
export const ShelfPageSchema = z.looseObject({ titles: TitlesSchema, more: z.boolean().catch(false), page: z.number().catch(1) });

/** One search box for everything (GET /api/search/all): films, shows and books. */
export const SearchAllSchema = z.looseObject({ movie: TitlesSchema.catch([]), tv: TitlesSchema.catch([]), book: TitlesSchema.catch([]) });
/** This member's choices (GET /api/prefs). */
export const PrefsSchema = z.looseObject({
  languages: z.array(z.string()).catch([]),
  languageOptions: z.array(z.looseObject({ code: z.string(), name: z.string() })).catch([]),
});
