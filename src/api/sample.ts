// "Look around with sample data": an invented household, so the app can be tried,
// reviewed and screen-recorded without signing in to a real server. The titles and
// posters are real public TMDB / Open Library records, as on the website's sample mode;
// the people are made up. Nothing here is ever sent anywhere.
import { ApiError, type Api, type NewRequest } from "./client";
import type {
  AppAdminAllRequests, AppAdminCleanup, AppAdminHelp, AppAdminInvite, AppAdminJoin, AppAdminPerson, AppAdminRequestDetail, AppAdminRequestRow,
  AppAdminRequests, AppAdminTicketDetail, AppAdminTicketRow, AppMemberTicket, AppPlexInvite, AppRequest, AppSession, AppTicketEntry, AppTitle,
} from "./schemas";

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

export const SAMPLE_SERVER = "sample://plexbie";

export const sampleSession: AppSession = {
  user: { id: "sample", name: "Alex Kim", avatar: null, via: "discord" },
  member: true,
  joinPending: false,
  admin: true,
};

export const sampleRequests: AppRequest[] = [
  {
    id: "5001", slot: 214, stage: "downloading", seasons: [2], requestedAt: ago(60 * 26), updatedAt: ago(14), help: { id: "h1", reason: "Stuck downloading" },
    title: { id: "95396", kind: "tv", title: "Severance", year: "2022", poster: "https://image.tmdb.org/t/p/w342/pPHpeI2X1qEd1CS1SeyrdhZ4qnT.jpg" },
    progress: { percent: 62, detail: "Season pack, 9 episodes, about 4 min left" },
  },
  {
    id: "5002", slot: 211, stage: "unpacking", format: "audiobook", requestedAt: ago(60 * 49), updatedAt: ago(60 * 3),
    title: { id: "OL-hailmary", kind: "audiobook", title: "Project Hail Mary", year: "2021", poster: "https://covers.openlibrary.org/b/id/11200092-L.jpg" },
    progress: { percent: null, detail: "Unpacking in SABnzbd" },
  },
  {
    slot: 209, stage: "requested", requestedAt: ago(60 * 5), updatedAt: ago(60 * 5),
    title: { id: "693134", kind: "movie", title: "Dune: Part Two", year: "2024", poster: "https://image.tmdb.org/t/p/w342/6izwz7rsy95ARzTR3poZ8H6c5pp.jpg" },
  },
  {
    slot: 205, stage: "upcoming", requestedAt: ago(60 * 24 * 3), updatedAt: ago(60 * 24 * 3),
    title: { id: "346648", kind: "movie", title: "Paddington 2", year: "2017", poster: null },
    progress: { releaseDate: "2026-10-27", detail: "Out to stream Oct 27. Plexbie gets it then. In cinemas since Sep 30." },
  },
  {
    slot: 197, stage: "available", requestedAt: ago(60 * 24 * 6), updatedAt: ago(60 * 24 * 4),
    title: { id: "1184918", kind: "movie", title: "The Wild Robot", year: "2024", poster: "https://image.tmdb.org/t/p/w342/wTnV3PCVW5O92JMrFvvrRcV39RU.jpg" },
  },
  {
    slot: 188, stage: "declined", requestedAt: ago(60 * 24 * 12), updatedAt: ago(60 * 24 * 11),
    note: "Season 2 isn't out yet. Ask again when it airs.",
    title: { id: "225180", kind: "tv", title: "Blue Eye Samurai", year: "2023", poster: "https://image.tmdb.org/t/p/w342/fXm3JT4WLQVnwukdvghtAblc1wc.jpg" },
  },
];

const SEVERANCE = "https://image.tmdb.org/t/p/w342/pPHpeI2X1qEd1CS1SeyrdhZ4qnT.jpg";
const DUNE = "https://image.tmdb.org/t/p/w342/6izwz7rsy95ARzTR3poZ8H6c5pp.jpg";
const ROBOT = "https://image.tmdb.org/t/p/w342/wTnV3PCVW5O92JMrFvvrRcV39RU.jpg";
const SAMURAI = "https://image.tmdb.org/t/p/w342/fXm3JT4WLQVnwukdvghtAblc1wc.jpg";
const HAIL_MARY = "https://covers.openlibrary.org/b/id/11200092-L.jpg";

/** What sample search and title pages know about. The descriptions are our own words. */
const sampleTitles: AppTitle[] = [
  { kind: "tv", id: "95396", title: "Severance", year: "2022", poster: SEVERANCE, availability: "available", genres: ["Drama", "Mystery"],
    overview: "Office workers whose memories are split between work and home start to wonder what they do all day.",
    seasons: [{ n: 1, episodes: 9, status: "available" }, { n: 2, episodes: 10, status: "requested" }],
    yourRequest: { slot: 214, stage: "downloading" } },
  { kind: "tv", id: "225180", title: "Blue Eye Samurai", year: "2023", poster: SAMURAI, availability: "none", genres: ["Animation", "Action"],
    overview: "An animated revenge story set in Edo-period Japan.",
    seasons: [{ n: 1, episodes: 8, status: "none" }, { n: 2, episodes: 0, status: "upcoming" }] },
  { kind: "movie", id: "693134", title: "Dune: Part Two", year: "2024", poster: DUNE, availability: "requested", runtime: 166,
    genres: ["Science Fiction"], overview: "The second half of the desert-planet epic.", yourRequest: { slot: 209, stage: "requested" } },
  { kind: "movie", id: "1184918", title: "The Wild Robot", year: "2024", poster: ROBOT, availability: "available", runtime: 102,
    genres: ["Animation", "Family"], overview: "A robot stranded on a wild island learns to look after a gosling." },
  { kind: "audiobook", id: "OL-hailmary", title: "Project Hail Mary", year: "2021", poster: HAIL_MARY, availability: "none",
    author: "Andy Weir", overview: "A lone astronaut wakes up with no memory and one job." },
  { kind: "ebook", id: "OL-hailmary", title: "Project Hail Mary", year: "2021", poster: HAIL_MARY, availability: "none",
    author: "Andy Weir", overview: "A lone astronaut wakes up with no memory and one job." },
];

const sampleAdmin: AppAdminRequests = {
  pending: [
    { id: "7001", slot: 216, title: "Blue Eye Samurai", kind: "tv", poster: SAMURAI, seasons: [1], requester: "Sam", requestedAt: ago(35), status: "pending" },
    { id: "7002", slot: 215, title: "The Wild Robot", kind: "movie", poster: ROBOT, seasons: null, requester: "Priya", requestedAt: ago(60 * 3), status: "pending" },
  ],
  older: [],
  recent: [
    { id: "6990", slot: 209, title: "Dune: Part Two", kind: "movie", poster: DUNE, seasons: null, requester: "Alex Kim", requestedAt: ago(60 * 5),
      status: "approved", resolvedBy: "Jordan", resolvedAt: ago(60 * 4) },
  ],
};

const pause = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
const days = (n: number) => new Date(Date.now() + n * 864e5).toISOString();
const ok = (message: string) => ({ ok: true, message });

const sampleCleanup: AppAdminCleanup = {
  settings: { enabled: true, practice: true, inactivityDays: 90, warnDaysBefore: 7, excludedLibraries: ["Kids"], channelId: "c1" },
  libraries: ["Films", "TV", "Kids"],
  channels: [{ id: "c1", name: "general" }, { id: "c2", name: "movie-night" }],
  warning: [{ ratingKey: "r1", title: "Old Documentary", type: "movie", daysLeft: 4, reason: "added", lastActivity: ago(60 * 24 * 86) }],
  upcoming: [{ ratingKey: "r2", title: "Some Sitcom", type: "show", daysLeft: 23, reason: "watched", lastActivity: ago(60 * 24 * 67) }],
  exempt: [{ ratingKey: "r3", title: "The Wild Robot", type: "movie" }],
};

let sampleJoins: AppAdminJoin[] = [
  { key: "d301", messageId: "9301", name: "Jordan", via: "discord", email: "jordan@example.com", status: "pending", askedAt: ago(90) },
  { key: "p302", messageId: "9302", name: "Rosa M", via: "plex", email: "", status: "approved", askedAt: ago(60 * 30) },
];
let sampleLanguages: string[] = [];        // the language chips, remembered for the visit
let sampleHelp: AppAdminHelp[] = [
  { id: "h1", slot: 214, title: "Severance", kind: "tv", seasons: [2], who: "Alex Kim", reason: "Stuck downloading",
    note: "It’s been at 62% since this morning.", status_then: "Downloading, 62%", status: "open", created_at: ago(40), actions: [] },
  { id: "h2", slot: 216, title: "Arrival", kind: "movie", seasons: null, who: "Jordan Lee", reason: "Can’t be found", offer: "name",
    note: "Searching by its IDs found nothing Plexbie could grab for Arrival: 212 releases came back. Search by name instead?",
    status_then: "Nothing found", status: "open", created_at: ago(12), actions: [] },
];
let samplePeople: AppAdminPerson[] = [
  { plexName: "sam.p", displayName: "Sam", discordName: "Sam", discordId: "201", linked: true, lastWatched: ago(60 * 24 * 52),
    daysIdle: 52, warned: true, topThree: false, removalIn: 8, warnAfter: 45 },
  { plexName: "rosa_m", discordName: null, linked: false, lastWatched: ago(60 * 24 * 12), daysIdle: 12, warned: false,
    topThree: false, removalIn: 48, warnAfter: 45 },
  { plexName: "priya.n", discordName: "Priya", discordId: "202", linked: true, lastWatched: ago(60 * 3), daysIdle: 0,
    warned: false, topThree: true, removalIn: null, warnAfter: 45 },
  { plexName: "grandad", discordName: null, linked: false, lastWatched: ago(60 * 24 * 30), daysIdle: 30, warned: false,
    topThree: false, removalIn: 30, warnAfter: 45, neverRemove: true },
];
let sampleInvites: AppAdminInvite[] = [
  { id: "i1", label: "Mum", email: "mum@example.com", createdBy: "Alex Kim", createdAt: ago(60 * 24), expiresAt: days(6),
    status: "active", usedBy: null, usedAt: null },
  { id: "i0", label: "Rosa", email: null, createdBy: "Alex Kim", createdAt: ago(60 * 24 * 9), expiresAt: days(-2),
    status: "used", usedBy: "rosa_m", usedAt: ago(60 * 24 * 8) },
];
let samplePlexInvites: AppPlexInvite[] = [{ email: "jordan@exmaple.com", name: "", sentAt: ago(60 * 5), who: "Jordan" }];
const newInvite = (label: string, email: string | null, d: number) => {
  const invite: AppAdminInvite = { id: `i${Date.now()}`, label, email, createdBy: "you", createdAt: new Date().toISOString(),
    expiresAt: days(d), status: "active", usedBy: null, usedAt: null };
  sampleInvites = [invite, ...sampleInvites];
  return { url: `https://plexbie.example/invite/sample${Date.now().toString(36)}`, invite };
};

/** Manage → All requests: everyone's approved requests, as an admin sees them. */
const WHO: Record<string, string> = { "5001": "Jordan Lee", "5002": "Sam Ortiz", "5004": "Priya N.", "5005": "Alex Kim" };
const ARRIVAL: AppTitle = { id: "329865", kind: "movie", title: "Arrival", year: "2016", poster: null, availability: "requested" };
let sampleAll: AppAdminRequestRow[] = [
  { id: "6002", slot: 216, stage: "searching", title: ARRIVAL, requestedAt: ago(60 * 50), updatedAt: ago(60 * 48),
    progress: { detail: "Looking for a copy" }, help: { id: "h2", reason: "Can’t be found" }, requester: "Jordan Lee", status: "approved",
    approvedBy: "Alex Kim", approvedAt: ago(60 * 48), stageSince: ago(60 * 48), stuck: ["Help asked: Can’t be found", "Nothing found for over a day"] },
  ...sampleRequests.map((r): AppAdminRequestRow => ({
    ...r, id: r.id ?? `s${r.slot}`, requester: WHO[r.id ?? ""] ?? "Priya N.",
    status: r.stage === "requested" ? "pending" : r.stage === "declined" ? "declined" : "approved",
    approvedBy: ["requested", "declined"].includes(r.stage) ? null : "Alex Kim", approvedAt: ["requested", "declined"].includes(r.stage) ? null : r.requestedAt,
    stageSince: r.updatedAt, finishedAt: r.stage === "available" ? r.updatedAt : null,
    help: r.id === "5001" ? { id: "h1", reason: "Stuck downloading" } : r.help,
    stuck: r.id === "5001" ? ["Help asked: Stuck downloading", "Download hasn’t moved in 6 hours"] : [],
  })),
];
const sampleArchive: AppAdminRequestRow[] = [
  { id: "4001", slot: 1, stage: "declined", requestedAt: ago(60 * 24 * 400), updatedAt: ago(60 * 24 * 400),
    title: { id: "49051", kind: "movie", title: "The Hobbit: An Unexpected Journey", year: "2012", poster: null, availability: "available" }, requester: "Jordan Lee",
    status: "declined", stuck: [] },
  { id: "4100", slot: 120, stage: "available", seasons: [3], requestedAt: ago(60 * 24 * 70), updatedAt: ago(60 * 24 * 66),
    title: { id: "95480", kind: "tv", title: "Slow Horses", year: "2022", poster: null, availability: "available" }, requester: "Marcus T.", status: "approved",
    approvedBy: "Alex Kim", approvedAt: ago(60 * 24 * 70), stageSince: ago(60 * 24 * 66), finishedAt: ago(60 * 24 * 66), stuck: [] },
];
const sampleActivity: Record<string, { at: string; by: string; did: string }[]> = {};
function allOf(q: string, everything = false): AppAdminAllRequests {
  const words = q.trim().toLowerCase().replace(/^(no\.|#)\s*/, "").replace(/^0+/, "");
  if (words) {
    const rows = [...sampleAll, ...sampleArchive]
      .filter((r) => `${r.title.title} ${r.requester}`.toLowerCase().includes(words) || String(r.slot) === words)
      .sort((a, b) => b.slot - a.slot);
    return { rows, counts: null, query: words, everything: false, total: sampleAll.length + sampleArchive.length };
  }
  const ended = (r: AppAdminRequestRow) => r.stage === "declined" || r.stage === "closed";
  const rows = [...sampleAll, ...(everything ? sampleArchive : [])].sort((a, b) => Number(!a.stuck.length) - Number(!b.stuck.length) || b.slot - a.slot);
  return { rows, query: null, everything, total: sampleAll.length + sampleArchive.length, counts: {
    active: rows.filter((r) => !["available", "requested"].includes(r.stage) && !ended(r)).length, stuck: rows.filter((r) => r.stuck.length).length,
    waiting: rows.filter((r) => r.stage === "requested").length, finished: rows.filter((r) => r.stage === "available").length, declined: rows.filter(ended).length } };
}

/** Each ticket's conversation, who has it, and whether it waits on the member. */
const ME = sampleSession.user.name;
let entries = 0;
const entry = (kind: string, by: string, text: string, minutes = 0): AppTicketEntry =>
  ({ id: `e${++entries}`, at: ago(minutes), by, kind, text });
const sampleTickets: Record<string, { requestKey: string | null; owner: string | null; waiting: boolean; thread: AppTicketEntry[] }> = {
  h1: { requestKey: "5001", owner: "Priya N.", waiting: true, thread: [
    entry("member", "Alex Kim", "Stuck downloading. It’s been at 62% since this morning.", 40),
    entry("status", "Priya N.", "Took it", 34),
    entry("note", "Priya N.", "That release stalled at the source. There’s a 4K copy that’s healthy.", 31),
    entry("reply", "Priya N.", "Found a copy that works. Is the 4K version OK, or would you rather wait for 1080p?", 30),
    entry("status", "Priya N.", "Waiting on them", 30),
  ] },
  h2: { requestKey: "6002", owner: null, waiting: false, thread: [
    entry("member", "Jordan Lee", "Can’t be found. Searching by its IDs found nothing Plexbie could grab for Arrival: 212 releases came back. Search by name instead?", 12),
  ] },
};
const ticketOf = (id: string) => (sampleTickets[id] ??= { requestKey: null, owner: null, waiting: false, thread: [] });
function ticketRow(h: AppAdminHelp): AppAdminTicketRow {
  const t = ticketOf(h.id);
  const last = t.thread[t.thread.length - 1];
  return {
    id: h.id, requestKey: t.requestKey, slot: h.slot, title: h.title, kind: h.kind, seasons: h.seasons, who: h.who, reason: h.reason,
    status: h.status, waiting: h.status === "open" && t.waiting, owner: t.owner, openedBy: (h as { opened_by?: string }).opened_by ?? null, offer: h.offer ?? null,
    createdAt: h.created_at, updatedAt: last?.at ?? h.created_at, last: last ? { by: last.by, kind: last.kind, text: last.text } : null,
    count: t.thread.length,
  };
}
/** What the member sees of their ticket: their words and the admins' replies, not the notes. */
function memberTicket(help: { id: string; reason: string }): AppMemberTicket {
  const h = sampleHelp.find((x) => x.id === help.id);
  const t = ticketOf(help.id);
  return {
    ...help, status: h?.status ?? "open", waiting: h?.status === "open" && t.waiting,
    thread: t.thread.filter((e) => ["member", "reply"].includes(e.kind) || (e.kind === "status" && ["Solved", "Reopened"].includes(e.text)))
      .map((e) => (e.kind === "member" ? { ...e, by: "You" } : e)),
  };
}
const say = (id: string, kind: string, text: string, by = ME) => { ticketOf(id).thread.push(entry(kind, by, text)); };
/** A solved ticket stops making its request look stuck on All requests (and a reopened one starts again). */
const markHelp = (id: string, open: boolean) => {
  const h = sampleHelp.find((x) => x.id === id);
  sampleAll = sampleAll.map((x) => {
    if (x.id !== sampleTickets[id]?.requestKey) return x;
    const rest = x.stuck.filter((s) => !s.startsWith("Help asked"));
    return open && h ? { ...x, help: { id, reason: h.reason }, stuck: [`Help asked: ${h.reason}`, ...rest] } : { ...x, help: null, stuck: rest };
  });
};
const helpFor = (id: string) => {
  const h = sampleHelp.find((x) => x.id === id);
  if (!h) throw new ApiError(404, "No such ticket.", "http");
  return h;
};

/** The sample "server": answers the same calls as api(), from the data above. */
export const sampleApi: Api = {
  session: async () => sampleSession,
  myRequests: async () => { await pause(450); return sampleRequests.map((r) => (r.help ? { ...r, help: memberTicket(r.help) } : r)); },
  library: async (kind) => {
    await pause(350);
    const want = kind === "book" ? ["audiobook"] : [kind];
    return sampleTitles.filter((t) => want.includes(t.kind) && (t.availability === "available" || kind === "book"))
      .map((t, i) => ({ ...t, addedAt: ago(60 * 24 * (i + 1)) }));
  },
  watchparty: async () => ({ seconds: 95 * 60, sessions: 3, last: ago(60 * 24 * 2) }),
  status: async () => ({
    online: true, streams: 2,
    libraries: [{ title: "Films", kind: "movie", count: 1342 }, { title: "TV", kind: "show", count: 187 }, { title: "Audiobooks", kind: "book", count: 64 }],
  }),
  arrivals: async () => {
    await pause(300);
    const t = (k: string, id: string) => sampleTitles.find((x) => x.kind === k && x.id === id)!;
    return [
      { title: t("movie", "1184918"), addedAt: ago(60 * 3), detail: null },
      { title: t("tv", "95396"), addedAt: ago(60 * 20), detail: "Season 2, episodes 1–4" },
      { title: t("audiobook", "OL-hailmary"), addedAt: ago(60 * 30), detail: "Audiobook" },
    ];
  },
  community: async () => {
    await pause(350);
    return {
      onAir: [
        { member: "Priya", title: "Severance", subtitle: "S2 · E3 · Who Is Alive?", poster: SEVERANCE, progress: 0.42, device: "Apple TV" },
        { member: "Sam", title: "The Wild Robot", subtitle: null, poster: ROBOT, progress: 0.78, device: "Living room TV" },
      ],
      leaderboard: [{ name: "Priya", hours: 412, streak: 9 }, { name: "Alex Kim", hours: 388, streak: 3 }, { name: "Sam", hours: 240, streak: 0 }],
      you: { rank: 2, hours: 388, streak: 3, longestStreak: 21, daysIdle: 0, removalAfterDays: 60, topThree: true, watchPartyMinutes: 95 },
    };
  },
  search: async (q, kind) => {
    await pause(300);
    const words = q.trim().toLowerCase();
    return sampleTitles.filter((t) => t.kind === kind && (!words || t.title.toLowerCase().includes(words)));
  },
  popular: async () => ({ movies: sampleTitles.filter((t) => t.kind === "movie"), tv: sampleTitles.filter((t) => t.kind === "tv") }),
  discover: async (kind) => {
    await pause(300);
    const mine = sampleTitles.filter((t) => t.kind === kind);
    const genres = ["Action", "Adventure", "Animation", "Comedy", "Crime", "Documentary", "Drama", "Family", "Fantasy",
      "History", "Horror", "Music", "Mystery", "Romance", "Science Fiction", "Thriller", "War", "Western"].map((name, id) => ({ id: id + 1, name }));
    return { genres, languages: sampleLanguages, languageOptions: [{ code: "en", name: "English" }, { code: "ja", name: "Japanese" }], shelves: [
      { key: "trending", title: "Trending this week", titles: mine, more: false },
      { key: "top", title: "Top rated", titles: [...mine].reverse(), more: false },
    ].filter((s) => s.titles.length) };
  },
  shelf: async (_kind, _key, page) => ({ titles: [], more: false, page }),
  searchAll: async (q) => {
    const [movie, tv, book] = await Promise.all((["movie", "tv", "audiobook"] as const).map((k) => sampleApi.search(q, k)));
    return { movie, tv, book };
  },
  prefs: async () => ({ languages: sampleLanguages, languageOptions: [{ code: "en", name: "English" }, { code: "ja", name: "Japanese" }] }),
  saveLanguages: async (languages) => { sampleLanguages = [...languages].sort(); return { languages: sampleLanguages }; },
  similar: async (kind, id) => sampleTitles.filter((t) => t.kind === kind && t.id !== id),
  title: async (kind, id) => {
    await pause(250);
    const t = sampleTitles.find((x) => x.kind === kind && x.id === id);
    if (!t) throw new ApiError(404, "Not found.", "http");
    return t;
  },
  request: async (body: NewRequest) => {
    await pause(600);
    const t = sampleTitles.find((x) => x.kind === body.kind && x.id === body.id);
    if (!t) throw new ApiError(404, "Unknown title.", "http");
    const r: AppRequest = {
      id: `s${Date.now()}`, slot: Math.max(...sampleRequests.map((x) => x.slot)) + 1, stage: "requested",
      requestedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      title: { id: t.id, kind: t.kind, title: t.title, year: t.year, poster: t.poster },
      seasons: body.seasons, format: body.format,
    };
    sampleRequests.unshift(r);
    t.yourRequest = { slot: r.slot, stage: "requested" };
    return r;
  },
  askHelp: async (requestId, reason) => {
    await pause(500);
    const r = sampleRequests.find((x) => x.id === requestId);
    const label = { stuck: "Stuck downloading", notfound: "Can’t be found", quality: "Wrong version or quality", episodes: "Wrong or missing episodes",
      playback: "Won’t play on Plex", other: "Something else" }[reason] ?? reason;
    const help = { id: `h${requestId}`, reason: label };
    sampleHelp = [{ id: help.id, slot: r?.slot ?? 0, title: r?.title.title ?? "", kind: r?.title.kind ?? "movie", seasons: null, who: ME,
      reason: label, note: "", status_then: r?.stage ?? "", status: "open", created_at: new Date().toISOString(), actions: [] }, ...sampleHelp];
    sampleTickets[help.id] = { requestKey: requestId, owner: null, waiting: false, thread: [entry("member", ME, label)] };
    if (r) r.help = memberTicket(help);
    return { ok: true, message: "Sent. An admin will take a look and get back to you.", help };
  },
  join: async () => { await pause(500); return null; },
  adminRequests: async () => { await pause(350); return sampleAdmin; },
  decide: async (id, approve) => {
    await pause(500);
    const r = sampleAdmin.pending.find((x) => x.id === id);
    if (!r) throw new ApiError(409, "Already decided.", "http");
    sampleAdmin.pending = sampleAdmin.pending.filter((x) => x.id !== id);
    sampleAdmin.recent.unshift({ ...r, status: approve ? "approved" : "declined", resolvedBy: "you", resolvedAt: new Date().toISOString() });
    return { ok: true, message: approve ? "Sent to Seerr." : "They've been told." };
  },
  adminJoins: async () => { await pause(300); return sampleJoins; },
  decideJoin: async (messageId, approve) => {
    await pause(500);
    sampleJoins = sampleJoins.map((j) => (j.messageId === messageId ? { ...j, status: approve ? "approved" : "denied" } : j));
    return ok(approve ? "Plex invite sent." : "They’ve been told.");
  },
  appLatest: async () => {
    await pause(300);
    return { version: "2.0.0", versionCode: 99, size: 47_350_955, sha256: "",
      notes: "**New in 2.0.0: an example**\n- Plexbie tells you when a new version is out.\n- Download it straight from the app." };
  },
  appDownloadLink: async () => "",                // nothing to download in the sample household
  adminHelp: async () => { await pause(300); return sampleHelp; },
  adminAll: async (q, _signal, everything) => { await pause(350); return allOf(q, everything); },
  adminRequest: async (key) => {
    await pause(250);
    const r = [...sampleAll, ...sampleArchive].find((x) => x.id === key);
    if (!r) throw new ApiError(404, "No such request.", "http");
    const detail: AppAdminRequestDetail = {
      ...r, via: key === "5002" ? "the website" : "Discord", seerrId: null, activity: sampleActivity[key] ?? [],
      tickets: sampleHelp.filter((h) => h.slot === r.slot).map((h) => ({
        id: h.id, status: h.status, reason: h.reason, note: h.note, who: h.who, opened_by: (h as { opened_by?: string }).opened_by ?? null,
        created_at: h.created_at, resolved_by: null, resolved_at: null, reply: null })),
    };
    return detail;
  },
  adminTickets: async () => {
    await pause(300);
    const rows = sampleHelp.map(ticketRow);
    const newest = (rs: AppAdminTicketRow[]) => rs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const action = newest(rows.filter((t) => t.status === "open" && !t.waiting));
    const waiting = newest(rows.filter((t) => t.status === "open" && t.waiting));
    const solved = newest(rows.filter((t) => t.status !== "open"));
    return { rows: [...action, ...waiting, ...solved], counts: { action: action.length, waiting: waiting.length, solved: solved.length } };
  },
  adminTicket: async (id) => {
    await pause(250);
    const h = helpFor(id);
    const t = ticketOf(id);
    const detail: AppAdminTicketDetail = { ...ticketRow(h), note: h.note, statusThen: h.status_then, thread: [...t.thread],
      request: [...sampleAll, ...sampleArchive].find((x) => x.id === t.requestKey) ?? null };
    return detail;
  },
  ticketComment: async (id, kind, text) => {
    await pause(400);
    const h = helpFor(id);
    say(id, kind, text);
    return ok(kind === "reply" ? `Sent to ${h.who}.` : "Note added. Only admins see it.");
  },
  ticketStatus: async (id, status, message) => {
    await pause(400);
    const h = helpFor(id);
    const t = ticketOf(id);
    if (status === "waiting") { t.waiting = true; say(id, "status", "Waiting on them"); return ok(`Waiting on ${h.who}’s answer.`); }
    if (status === "resolved") {
      if (message?.trim()) say(id, "reply", message.trim());
      say(id, "status", "Solved");
      t.waiting = false;
      sampleHelp = sampleHelp.map((x) => (x.id === id ? { ...x, status: "resolved" } : x));
      markHelp(id, false);
      return ok(`Solved. ${h.who} has been told.`);
    }
    if (h.status !== "open") { sampleHelp = sampleHelp.map((x) => (x.id === id ? { ...x, status: "open" } : x)); markHelp(id, true); say(id, "status", "Reopened"); }
    else say(id, "status", "Back with the admins");
    t.waiting = false;
    return ok("Open.");
  },
  ticketTake: async (id) => {
    await pause(350);
    helpFor(id);
    const t = ticketOf(id);
    const mine = t.owner !== ME;
    t.owner = mine ? ME : null;
    say(id, "status", mine ? "Took it" : "Let it go");
    return ok(mine ? "It’s yours. You’ll get an alert when they answer." : "Let go. Anyone can take it.");
  },
  answerTicket: async (requestId, text) => {
    await pause(450);
    const r = sampleRequests.find((x) => x.id === requestId);
    if (!r?.help) throw new ApiError(404, "No such request.", "http");
    if (helpFor(r.help.id).status !== "open") throw new ApiError(409, "This ticket is closed. Ask for help again if it’s still wrong.", "http");
    say(r.help.id, "member", text, ME);
    ticketOf(r.help.id).waiting = false;
    return ok("Sent. The admins have it.");
  },
  requestTicket: async (key, note, tell, message) => {
    await pause(450);
    const r = sampleAll.find((x) => x.id === key);
    const help = { id: `h${Date.now()}`, reason: "Opened by an admin" };
    sampleHelp = [{ id: help.id, slot: r?.slot ?? 0, title: r?.title.title ?? "", kind: r?.title.kind ?? "movie", seasons: null,
      who: r?.requester ?? "Someone", reason: help.reason, note, status_then: r?.stage ?? "", status: "open", created_at: new Date().toISOString(),
      actions: [], opened_by: ME }, ...sampleHelp];
    sampleTickets[help.id] = { requestKey: key, owner: null, waiting: false, thread: [entry("note", ME, note)] };
    if (tell && message?.trim()) say(help.id, "reply", message.trim());
    sampleAll = sampleAll.map((x) => (x.id === key ? { ...x, help, stuck: [`Help asked: ${help.reason}`, ...x.stuck] } : x));
    return { ok: true, message: `Ticket opened${tell ? `, and ${r?.requester ?? "they"} has been told` : ""}. It’s on Manage → Tickets.`, help };
  },
  requestSearch: async (key, how) => {
    await pause(500);
    const said = { again: "Searching again.", episodes: "Searching one episode at a time.", name: "Searching by name. Plexbie reports back in the admin channel." }[how];
    (sampleActivity[key] ??= []).push({ at: new Date().toISOString(), by: "you", did: said });
    return ok(said);
  },
  helpSearch: async (_id, how) => {
    await pause(600);
    return ok({ again: "Sonarr is searching for season 2 again.", episodes: "Sonarr is searching season 2 one episode at a time.",
      name: "Plexbie is searching NZBHydra for “Arrival 2016”. It reports back here, and closes this if it finds it." }[how]);
  },
  helpResolve: async (id, reply) => {
    await pause(500);
    if (reply.trim()) say(id, "reply", reply.trim());
    say(id, "status", "Solved");
    sampleHelp = sampleHelp.map((h) => (h.id === id ? { ...h, status: "resolved" } : h));
    markHelp(id, false);
    return ok("They’ve been told.");
  },
  adminPeople: async () => { await pause(350); return samplePeople; },
  linkCandidates: async () => ({ discord: [{ id: "203", name: "Rosa M", username: "rosam" }, { id: "204", name: "Dev", username: "devr" }] }),
  linkPerson: async (plexName, discordId) => {
    await pause(400);
    samplePeople = samplePeople.map((x) => (x.plexName === plexName ? { ...x, linked: true, discordId, discordName: discordId === "203" ? "Rosa M" : "Dev" } : x));
    return ok(`Linked ${plexName}.`);
  },
  unlinkPerson: async (plexName) => { await pause(400); samplePeople = samplePeople.map((x) => (x.plexName === plexName ? { ...x, linked: false, discordId: null, discordName: null } : x)); return ok(`Unlinked ${plexName}.`); },
  renamePerson: async (plexName, name) => { await pause(400); samplePeople = samplePeople.map((x) => (x.plexName === plexName ? { ...x, displayName: name } : x)); return ok(`Shown as ${name} from now on.`); },
  keepPerson: async (plexName, keep) => { await pause(400); samplePeople = samplePeople.map((x) => (x.plexName === plexName ? { ...x, neverRemove: keep } : x)); return ok(keep ? `${plexName} will never be removed.` : `${plexName} is back on the check.`); },
  matchPerson: async (plexName, account) => { await pause(400); return ok(`${plexName} is ${account} on Plex now.`); },
  removePerson: async (plexName) => { await pause(600); samplePeople = samplePeople.filter((x) => x.plexName !== plexName); return ok("Removed from Plex. They’ve been told."); },
  adminInvites: async () => { await pause(300); return sampleInvites; },
  createInvite: async ({ label, email, days: d }) => { await pause(500); return newInvite(label, email ?? null, d); },
  renewInvite: async (id) => {
    await pause(500);
    const old = sampleInvites.find((i) => i.id === id);
    if (!old) throw new ApiError(404, "No such invite.", "http");
    if (old.status !== "used") sampleInvites = sampleInvites.filter((i) => i.id !== id);
    return newInvite(old.label, old.email, 7);
  },
  revokeInvite: async (id) => { await pause(400); sampleInvites = sampleInvites.map((i) => (i.id === id ? { ...i, status: "revoked" } : i)); return ok("The link no longer works."); },
  deleteInvite: async (id) => { await pause(400); sampleInvites = sampleInvites.filter((i) => i.id !== id); return ok("Deleted."); },
  plexInvites: async () => { await pause(300); return samplePlexInvites; },
  plexInviteChange: async (email, next) => {
    await pause(600);
    samplePlexInvites = samplePlexInvites.map((i) => (i.email === email ? { ...i, email: next, sentAt: new Date().toISOString() } : i));
    return ok(`Invite sent to ${next}.`);
  },
  plexInviteCancel: async (email) => { await pause(400); samplePlexInvites = samplePlexInvites.filter((i) => i.email !== email); return ok(`Plex invite to ${email} cancelled.`); },
  adminCleanup: async () => { await pause(350); return sampleCleanup; },
  exempt: async (ratingKey, keep) => {
    await pause(400);
    const row = [...sampleCleanup.warning, ...sampleCleanup.upcoming, ...sampleCleanup.exempt].find((r) => r.ratingKey === ratingKey);
    if (keep && row) {
      sampleCleanup.warning = sampleCleanup.warning.filter((r) => r.ratingKey !== ratingKey);
      sampleCleanup.upcoming = sampleCleanup.upcoming.filter((r) => r.ratingKey !== ratingKey);
      sampleCleanup.exempt = [{ ratingKey, title: row.title, type: "type" in row ? row.type : null }, ...sampleCleanup.exempt];
    } else if (!keep) sampleCleanup.exempt = sampleCleanup.exempt.filter((r) => r.ratingKey !== ratingKey);
    return ok(keep ? "Kept forever." : "Back on the clock.");
  },
  cleanupSettings: async (change) => { await pause(400); sampleCleanup.settings = { ...sampleCleanup.settings, ...change }; return ok("Saved."); },
  cleanupScan: async () => { await pause(1200); return ok("Scan done: 1 title in the warning window, 0 were removed."); },
  adminHealth: async () => {
    await pause(500);
    return [
      { name: "Plex", ok: true, ms: 42 }, { name: "Seerr", ok: true, ms: 88 }, { name: "Tautulli", ok: true, ms: 61 },
      { name: "Sonarr", ok: true, ms: 120 }, { name: "SABnzbd", ok: false, ms: 0, detail: "Not answering (timed out)" },
    ];
  },
  adminDiscord: async () => ({
    channels: [{ id: "c1", name: "general" }, { id: "c2", name: "movie-night" }],
    joins: [
      { who: "Rosa M", by: "Alex Kim", via: "plexbie", code: "Rosa", at: ago(60 * 24 * 8), role: null },
      { who: "Jordan", by: "Priya", via: "discord", code: "k3Xa9", at: ago(60 * 24 * 20), role: "Plex member" },
    ],
    party: null,
  }),
  say: async () => { await pause(500); return ok("Posted in #general."); },
  adminMessages: async () => [
    { id: "dsample", name: "Alex Kim", count: 2, received: 2, failed: 0, via: ["discord", "web"],
      last: { at: ago(22), text: "Answer about Severance", channel: "discord", delivered: true, direction: "in" } },
    { id: "p7", name: "Sam", count: 1, received: 0, failed: 0, via: ["discord"],
      last: { at: ago(60 * 5), text: "Severance season 2 is approved.", channel: "discord", delivered: true, direction: "out" } },
    { id: "pgrandad", name: "grandad", count: 1, received: 0, failed: 1, via: ["none"],
      last: { at: ago(60 * 24), text: "Your Plex access is about to lapse.", channel: "none", delivered: false, direction: "out" } },
  ],
  conversation: async (who) => (who === "dsample" ? [
    { id: "m3", at: ago(60 * 5), direction: "out", channel: "discord", delivered: true, title: null, text: "Good news! Severance is now ready to start on Plex.", context: "arrival", error: null },
    { id: "m4", at: ago(40), direction: "in", channel: "web", delivered: true, title: "Something wrong with Severance", text: "Stuck downloading. It’s been at 62% since this morning.", context: "Something wrong?", error: null },
    { id: "m5", at: ago(30), direction: "out", channel: "discord", delivered: true, title: "🛠️ About your request: Severance", text: "Found a copy that works. Is the 4K version OK, or would you rather wait for 1080p?", context: "ticket reply", error: null },
    { id: "m6", at: ago(22), direction: "in", channel: "discord", delivered: true, title: "Answer about Severance", text: "4K is great, thank you!", context: "ticket answer", error: null },
  ] : who === "p7"
    ? [{ id: "m1", at: ago(60 * 5), direction: "out", channel: "discord", delivered: true, title: "Request approved", text: "Severance season 2 is approved.", context: "decision", error: null }]
    : [{ id: "m2", at: ago(60 * 24), direction: "out", channel: "none", delivered: false, title: "Heads up", text: "Your Plex access is about to lapse.", context: "warning", error: "No phone alerts turned on and no email to send to" }]),
  registerPush: async () => null,
  unregisterPush: async () => null,
  logout: async () => null,
};
