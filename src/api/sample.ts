// "Look around with sample data": an invented household, so the app can be tried,
// reviewed and screen-recorded without signing in to a real server. The titles are the
// website's sample catalog (the bot's web/src/api/sampleTitles.json), all copyright-free:
// Blender Foundation open movies (CC BY) and public-domain films, shows and books, with
// their own posters and covers. The people are made up. Nothing here is ever sent anywhere.
import { ApiError, type Api, type NewRequest } from "./client";
import type {
  AppAdminAllRequests, AppAdminCleanup, AppAdminHelp, AppAdminInvite, AppAdminJoin, AppAdminPerson, AppAdminRequestDetail, AppAdminRequestRow,
  AppAdminRequests, AppAdminTicketDetail, AppAdminTicketRow, AppMemberTicket, AppPlexInvite, AppRequest, AppSession, AppTicketEntry, AppTitle,
} from "./schemas";

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

export const SAMPLE_SERVER = "sample://plexbie";

const sampleSession: AppSession = {
  user: { id: "sample", name: "Alex Kim", avatar: null, via: "discord" },
  member: true,
  joinPending: false,
  admin: true,
};

const PEPPER_CARROT = "https://media.plexbie.com/posters/pepper-carrot-v1.jpg";   // David Revoy, CC BY 4.0
const TEARS_OF_STEEL = "https://media.plexbie.com/posters/tears-of-steel-v1.jpg";   // Blender Foundation, CC BY 3.0
const SINTEL = "https://media.plexbie.com/posters/sintel-v1.jpg";   // Blender Foundation, CC BY 3.0
const ZOMBIES = "https://media.plexbie.com/posters/zombies-of-the-stratosphere-v1.jpg";   // public domain
const WAR_OF_THE_WORLDS = "https://media.plexbie.com/posters/war-of-the-worlds-v1.jpg";   // public domain

/** What sample search and title pages know about: the website's sample catalog, with what
 *  this household has of each. The descriptions are our own words. Books have made-up ids. */
const makeTitles = (): AppTitle[] => [
  { kind: "tv", id: "95396", title: "Pepper & Carrot", year: "2017", poster: PEPPER_CARROT, availability: "available", genres: ["Animation", "Fantasy", "Comedy"],
    overview: "A young witch and her ginger cat stumble through potion contests, spell exams and a magic school that's never quite ready for them.",
    seasons: [{ n: 1, episodes: 9, status: "available" }, { n: 2, episodes: 10, status: "requested" }, { n: 3, episodes: 0, status: "upcoming" }],
    yourRequest: { slot: 214, stage: "downloading" } },
  { kind: "tv", id: "225180", title: "Zombies of the Stratosphere", year: "1952", poster: ZOMBIES, availability: "none", genres: ["Science Fiction", "Action"],
    overview: "A rocket-suited hero races to stop Martian invaders from blowing the Earth out of its orbit.",
    seasons: [{ n: 1, episodes: 12, status: "none" }] },
  { kind: "tv", id: "136315", title: "The Daily Dweebs", year: "2017", poster: "https://media.plexbie.com/posters/daily-dweebs-v1.jpg", availability: "available",
    genres: ["Animation", "Comedy", "Family"], overview: "A very small dog with very big feelings takes on the everyday disasters of a suburban back garden.",
    seasons: [{ n: 1, episodes: 8, status: "available" }, { n: 2, episodes: 10, status: "available" }, { n: 3, episodes: 10, have: 4, status: "partial" },
      { n: 4, episodes: 10, status: "none" }, { n: 5, episodes: 8, status: "none" }] },
  { kind: "tv", id: "126308", title: "Undersea Kingdom", year: "1936", poster: "https://media.plexbie.com/posters/undersea-kingdom-v1.jpg", availability: "requested",
    genres: ["Adventure", "Science Fiction"], overview: "A navy officer and a professor take a rocket submarine down to the lost city of Atlantis, and straight into its civil war.",
    seasons: [{ n: 1, episodes: 12, status: "requested" }] },
  { kind: "tv", id: "95480", title: "King of the Rocket Men", year: "1949", poster: "https://media.plexbie.com/posters/king-of-the-rocket-men-v1.jpg", availability: "available",
    genres: ["Science Fiction", "Action"], overview: "A scientist straps on a rocket suit to stop the mysterious Dr. Vulcan from stealing the world's most dangerous inventions.",
    seasons: [{ n: 1, episodes: 12, status: "available" }] },
  { kind: "tv", id: "83867", title: "Radar Men from the Moon", year: "1952", poster: "https://media.plexbie.com/posters/radar-men-from-the-moon-v1.jpg", availability: "available",
    genres: ["Science Fiction", "Action"], overview: "Commando Cody flies to the Moon to stop an invasion launched from its atomic-powered cities.",
    seasons: [{ n: 1, episodes: 12, have: 9, status: "partial" }] },
  { kind: "movie", id: "693134", title: "Tears of Steel", year: "2012", poster: TEARS_OF_STEEL, availability: "requested", runtime: 12,
    genres: ["Science Fiction", "Action"], overview: "In a future Amsterdam, a band of scientists and fighters makes a last stand against giant robots, armed with a painful memory.", yourRequest: { slot: 209, stage: "requested" } },
  { kind: "movie", id: "1184918", title: "Sintel", year: "2010", poster: SINTEL, availability: "available", runtime: 15,
    genres: ["Animation", "Fantasy"], overview: "A young woman crosses a cold world looking for the baby dragon she once raised." },
  { kind: "audiobook", id: "OL-war-of-the-worlds", title: "The War of the Worlds", year: "1898", poster: WAR_OF_THE_WORLDS, availability: "none",
    author: "H. G. Wells", overview: "Cylinders fall on the English countryside, and what climbs out of them has no interest in talking." },
  { kind: "audiobook", id: "OL-wizard-of-oz", title: "The Wonderful Wizard of Oz", year: "1900", poster: "https://media.plexbie.com/posters/wizard-of-oz-v1.jpg", availability: "available",
    author: "L. Frank Baum", overview: "A cyclone carries a Kansas girl to a strange land, and the only way home runs down a yellow brick road." },
  { kind: "ebook", id: "OL-dracula", title: "Dracula", year: "1897", poster: "https://media.plexbie.com/posters/dracula-v1.jpg", availability: "available",
    author: "Bram Stoker", overview: "A young solicitor travels to Transylvania to sell a house to a count who never seems to eat, sleep or cast a reflection." },
  { kind: "ebook", id: "OL-great-gatsby", title: "The Great Gatsby", year: "1925", poster: "https://media.plexbie.com/posters/great-gatsby-v1.jpg", availability: "available",
    author: "F. Scott Fitzgerald", overview: "One summer of parties on Long Island, thrown by a man who only ever wanted one guest." },
  // Blender Foundation open movies (CC BY) and public-domain films, with their real posters.
  { kind: "movie", id: "346648", title: "Big Buck Bunny", year: "2008", poster: "https://media.plexbie.com/posters/big-buck-bunny-v1.jpg", availability: "requested", runtime: 10,
    genres: ["Animation", "Comedy", "Family"], overview: "A gentle giant of a rabbit plans some very sweet revenge on three bullying rodents.",
    yourRequest: { slot: 205, stage: "upcoming" } },
  { kind: "movie", id: "329865", title: "Elephants Dream", year: "2006", poster: "https://media.plexbie.com/posters/elephants-dream-v1.jpg", availability: "requested", runtime: 11,
    genres: ["Animation", "Science Fiction"], overview: "Two men wander a vast machine world that seems to rearrange itself around them." },
  { kind: "movie", id: "545611", title: "Cosmos Laundromat", year: "2015", poster: "https://media.plexbie.com/posters/cosmos-laundromat-v1.jpg", availability: "available", runtime: 12,
    genres: ["Animation", "Comedy"], overview: "A sheep fed up with his windswept island meets a strange salesman who offers him a new life. Then another." },
  { kind: "movie", id: "666277", title: "Spring", year: "2019", poster: "https://media.plexbie.com/posters/spring-v1.jpg", availability: "available", runtime: 8,
    genres: ["Animation", "Fantasy"], overview: "A shepherd girl and her dog face the ancient spirits that carry spring back into the mountains." },
  { kind: "movie", id: "569094", title: "Sprite Fright", year: "2021", poster: "https://media.plexbie.com/posters/sprite-fright-v1.jpg", availability: "available", runtime: 10,
    genres: ["Animation", "Horror", "Comedy"], overview: "Rowdy teenagers on a forest weekend meet the tiny, very polite mushroom sprites who live there. It doesn't stay polite." },
  { kind: "movie", id: "872585", title: "Charge", year: "2022", poster: "https://media.plexbie.com/posters/charge-v1.jpg", availability: "available", runtime: 4,
    genres: ["Animation", "Action"], overview: "An old man guards the last working power station in a frozen wasteland, and a robot thief wants what's inside." },
  { kind: "movie", id: "900005", title: "Coffee Run", year: "2020", poster: "https://media.plexbie.com/posters/coffee-run-v1.jpg", availability: "available", runtime: 3,
    genres: ["Animation", "Comedy"], overview: "Fuelled by caffeine, a young woman races through the memories of a life she's leaving behind." },
  { kind: "movie", id: "900001", title: "Plan 9 from Outer Space", year: "1957", poster: "https://media.plexbie.com/posters/plan-9-v1.jpg", availability: "available", runtime: 79,
    genres: ["Science Fiction", "Horror"], overview: "Visitors from space raise the dead to stop humanity building the ultimate weapon." },
  { kind: "movie", id: "900002", title: "House on Haunted Hill", year: "1959", poster: "https://media.plexbie.com/posters/house-on-haunted-hill-v1.jpg", availability: "available", runtime: 75,
    genres: ["Horror", "Mystery"], overview: "A millionaire offers five strangers ten thousand dollars each to survive one night in a haunted house." },
  { kind: "movie", id: "900003", title: "Night of the Living Dead", year: "1968", poster: "https://media.plexbie.com/posters/night-of-the-living-dead-v1.jpg", availability: "available", runtime: 96,
    genres: ["Horror"], overview: "Strangers barricade themselves inside a farmhouse as the dead begin to walk." },
  { kind: "movie", id: "900004", title: "Carnival of Souls", year: "1962", poster: "https://media.plexbie.com/posters/carnival-of-souls-v1.jpg", availability: "available", runtime: 78,
    genres: ["Horror", "Mystery"], overview: "After surviving a car crash, a church organist is drawn to an abandoned pavilion by a pale stranger." },
];

/** The short wait a server would take. A call still waiting when its visit ends (resetSample)
 *  lands nowhere: it fails, so the next visit never shows what it did. */
const pause = (ms: number) => {
  const visit = house;
  return new Promise<void>((ok, fail) => setTimeout(() => (visit === house ? ok() : fail(new ApiError(0, "That sample visit has ended.", "network"))), ms));
};
const days = (n: number) => new Date(Date.now() + n * 864e5).toISOString();
const ok = (message: string) => ({ ok: true, message });

/** The films and shows on the sample Plex server outside the skipped Kids library, for "Keep a title forever". */
export const samplePlexTitles = [
  { ratingKey: "r1", title: "Carnival of Souls", type: "movie", year: 1962 },
  { ratingKey: "r2", title: "The Daily Dweebs", type: "show", year: 2017 },
  { ratingKey: "r3", title: "Sintel", type: "movie", year: 2010 },
  { ratingKey: "r5", title: "Radar Men from the Moon", type: "show", year: 1952 },
  { ratingKey: "r6", title: "Pepper & Carrot", type: "show", year: 2017 },
  { ratingKey: "r8", title: "Cosmos Laundromat", type: "movie", year: 2015 },
  { ratingKey: "r10", title: "King of the Rocket Men", type: "show", year: 1949 },
  { ratingKey: "r11", title: "Spring", type: "movie", year: 2019 },
  { ratingKey: "r12", title: "Sprite Fright", type: "movie", year: 2021 },
  { ratingKey: "r13", title: "Charge", type: "movie", year: 2022 },
  { ratingKey: "r14", title: "Coffee Run", type: "movie", year: 2020 },
  { ratingKey: "r15", title: "Plan 9 from Outer Space", type: "movie", year: 1957 },
  { ratingKey: "r16", title: "House on Haunted Hill", type: "movie", year: 1959 },
  { ratingKey: "r17", title: "Night of the Living Dead", type: "movie", year: 1968 },
];

const BLOCKED_NOTE = "Radar Men from the Moon finished downloading, but Sonarr won’t import it by itself. Look at the files on this ticket before you import it.";

/** Manage → All requests: everyone's approved requests, as an admin sees them. */
const ELEPHANTS_DREAM: AppTitle = { id: "329865", kind: "movie", title: "Elephants Dream", year: "2006", poster: "https://media.plexbie.com/posters/elephants-dream-v1.jpg", availability: "requested" };
const sampleArchive: AppAdminRequestRow[] = [
  { id: "4001", slot: 1, stage: "declined", requestedAt: ago(60 * 24 * 400), updatedAt: ago(60 * 24 * 400),
    title: { id: "900001", kind: "movie", title: "Plan 9 from Outer Space", year: "1957", poster: "https://media.plexbie.com/posters/plan-9-v1.jpg", availability: "available" }, requester: "Jordan Lee",
    status: "declined", stuck: [] },
  { id: "4100", slot: 120, stage: "available", seasons: [1], requestedAt: ago(60 * 24 * 70), updatedAt: ago(60 * 24 * 66),
    title: { id: "95480", kind: "tv", title: "King of the Rocket Men", year: "1949", poster: "https://media.plexbie.com/posters/king-of-the-rocket-men-v1.jpg", availability: "available" }, requester: "Marcus T.", status: "approved",
    approvedBy: "Alex Kim", approvedAt: ago(60 * 24 * 70), stageSince: ago(60 * 24 * 66), finishedAt: ago(60 * 24 * 66), stuck: [] },
];

/** Each ticket's conversation, who has it, and whether it waits on the member. */
const ME = sampleSession.user.name;
let entries = 0;
const entry = (kind: string, by: string, text: string, minutes = 0): AppTicketEntry =>
  ({ id: `e${++entries}`, at: ago(minutes), by, kind, text });
type SampleTicket = { requestKey: string | null; owner: string | null; waiting: boolean; thread: AppTicketEntry[] };

/** Manage → Messages: conversations with Plexbie, both ways. */
type SampleMsg = { id: string; at: string; direction: string; channel: string; delivered: boolean; title: string | null; text: string;
  context: string; error: string | null; by?: string | null; ticket?: string | null };
let convos = 0;
const convo = (minutes: number, channel: string, text: string, title: string | null, direction: "out" | "in",
  more: Partial<SampleMsg> = {}): SampleMsg => ({ id: `20261005T1200000000${String(++convos).padStart(2, "0")}-abcdef`, at: ago(minutes), direction, channel,
  delivered: true, title, text, context: direction === "in" ? (title ? "ticket answer" : "Discord DM") : "", error: null, ...more });
const SAMPLE_NAMES: Record<string, string> = { dsample: "Alex Kim", pgrandad: "grandad" };

/**
 * Everything a visit can change, built afresh for each one: every "Look around" opens the
 * same household, whatever the last visit decided (resetSample).
 */
function makeSampleState() {
  entries = 0;
  convos = 0;
  const titles = makeTitles();
  const requests: AppRequest[] = [
    {
      id: "5001", slot: 214, stage: "downloading", seasons: [2], requestedAt: ago(60 * 26), updatedAt: ago(14), help: { id: "h1", reason: "Stuck downloading" },
      title: { id: "95396", kind: "tv", title: "Pepper & Carrot", year: "2017", poster: PEPPER_CARROT },
      progress: { percent: 62, detail: "Season pack, 9 episodes, about 4 min left" },
    },
    {
      id: "5002", slot: 211, stage: "unpacking", format: "audiobook", requestedAt: ago(60 * 49), updatedAt: ago(60 * 3),
      title: { id: "OL-war-of-the-worlds", kind: "audiobook", title: "The War of the Worlds", year: "1898", poster: WAR_OF_THE_WORLDS },
      progress: { percent: null, detail: "Unpacking in SABnzbd" },
    },
    {
      slot: 209, stage: "requested", requestedAt: ago(60 * 5), updatedAt: ago(60 * 5),
      title: { id: "693134", kind: "movie", title: "Tears of Steel", year: "2012", poster: "https://media.plexbie.com/posters/tears-of-steel-v1.jpg" },
    },
    {
      slot: 205, stage: "upcoming", requestedAt: ago(60 * 24 * 3), updatedAt: ago(60 * 24 * 3),
      title: { id: "346648", kind: "movie", title: "Big Buck Bunny", year: "2008", poster: "https://media.plexbie.com/posters/big-buck-bunny-v1.jpg" },
      progress: { releaseDate: "2026-10-27", detail: "Out to stream Oct 27. Plexbie gets it then." },
    },
    {
      slot: 197, stage: "available", requestedAt: ago(60 * 24 * 6), updatedAt: ago(60 * 24 * 4),
      title: { id: "1184918", kind: "movie", title: "Sintel", year: "2010", poster: "https://media.plexbie.com/posters/sintel-v1.jpg" },
    },
    {
      slot: 188, stage: "declined", requestedAt: ago(60 * 24 * 12), updatedAt: ago(60 * 24 * 11),
      note: "Someone in the household already asked for this one.",
      title: { id: "225180", kind: "tv", title: "Zombies of the Stratosphere", year: "1952", poster: ZOMBIES },
    },
  ];
  const admin: AppAdminRequests = {
    pending: [
      { id: "7001", slot: 216, title: "Zombies of the Stratosphere", kind: "tv", poster: ZOMBIES, seasons: [1], requester: "Sam", requestedAt: ago(35), status: "pending" },
      { id: "7002", slot: 215, title: "Undersea Kingdom", kind: "tv", poster: "https://media.plexbie.com/posters/undersea-kingdom-v1.jpg", seasons: [1], requester: "Priya",
        requestedAt: ago(60 * 3), status: "pending" },
      { id: "7003", slot: 209, title: "Tears of Steel", kind: "movie", poster: TEARS_OF_STEEL, seasons: null, requester: ME, requestedAt: ago(60 * 5), status: "pending" },
    ],
    older: [],
    recent: [
      { id: "6990", slot: 205, title: "Big Buck Bunny", kind: "movie", poster: "https://media.plexbie.com/posters/big-buck-bunny-v1.jpg", seasons: null, requester: "Alex Kim",
        requestedAt: ago(60 * 24 * 3), status: "approved", resolvedBy: "Jordan", resolvedAt: ago(60 * 24 * 3 - 20) },
    ],
  };
  const cleanup: AppAdminCleanup = {
    settings: { enabled: true, practice: true, inactivityDays: 90, warnDaysBefore: 7, excludedLibraries: ["Kids"], channelId: "c1" },
    libraries: ["Films", "TV", "Kids"],
    channels: [{ id: "c1", name: "general" }, { id: "c2", name: "movie-night" }],
    warning: [{ ratingKey: "r1", title: "Carnival of Souls", type: "movie", daysLeft: 4, reason: "added", lastActivity: ago(60 * 24 * 86) }],
    upcoming: [{ ratingKey: "r2", title: "The Daily Dweebs", type: "show", daysLeft: 23, reason: "watched", lastActivity: ago(60 * 24 * 67) }],
    exempt: [{ ratingKey: "r3", title: "Sintel", type: "movie", year: 2010 }],
  };
  const joins: AppAdminJoin[] = [
    { key: "d301", messageId: "9301", name: "Jordan", via: "discord", email: "jordan@example.com", status: "pending", askedAt: ago(90) },
    { key: "p302", messageId: "9302", name: "Rosa M", via: "plex", email: "", status: "approved", askedAt: ago(60 * 30) },
  ];
  const help: AppAdminHelp[] = [
    { id: "h1", slot: 214, title: "Pepper & Carrot", kind: "tv", seasons: [2], who: "Alex Kim", reason: "Stuck downloading",
      note: "It’s been at 62% since this morning.", status_then: "Downloading, 62%", status: "open", created_at: ago(40), actions: [] },
    { id: "h2", slot: 210, title: "Elephants Dream", kind: "movie", seasons: null, who: "Jordan Lee", reason: "Can’t be found", offer: "name",
      note: "Searching by its IDs found nothing Plexbie could grab for Elephants Dream: 212 releases came back. Search by name instead?",
      status_then: "Nothing found", status: "open", created_at: ago(12), actions: [] },
    // A download Sonarr won't import by itself, as Plexbie opens it (the bot's core/blocked_imports).
    { id: "h4", slot: 217, title: "Radar Men from the Moon", kind: "tv", seasons: [1], who: "Jordan Lee", reason: "Downloaded, but won’t import",
      note: BLOCKED_NOTE, status_then: "Downloaded, import blocked", status: "open", created_at: ago(8), actions: [], opened_by: "Plexbie" } as AppAdminHelp,
  ];
  const people: AppAdminPerson[] = [
    { plexName: "sam.p", displayName: "Sam", discordName: "Sam", discordId: "201", linked: true, lastWatched: ago(4),
      daysIdle: 0, warned: false, topThree: true, removalIn: null, warnAfter: 45 },
    { plexName: "marcus.t", displayName: "Marcus", discordName: "Marcus", discordId: "205", linked: true, lastWatched: ago(60 * 24 * 52),
      daysIdle: 52, warned: true, topThree: false, removalIn: 8, warnAfter: 45 },
    { plexName: "rosa_m", discordName: null, linked: false, lastWatched: ago(60 * 24 * 12), daysIdle: 12, warned: false,
      topThree: false, removalIn: 48, warnAfter: 45 },
    { plexName: "priya.n", discordName: "Priya", discordId: "202", linked: true, lastWatched: ago(60 * 3), daysIdle: 0,
      warned: false, topThree: true, removalIn: null, warnAfter: 45 },
    { plexName: "grandad", discordName: null, linked: false, lastWatched: ago(60 * 24 * 30), daysIdle: 30, warned: false,
      topThree: false, removalIn: 30, warnAfter: 45, neverRemove: true },
  ];
  const invites: AppAdminInvite[] = [
    { id: "i1", label: "Mum", email: "mum@example.com", createdBy: "Alex Kim", createdAt: ago(60 * 24), expiresAt: days(6),
      status: "active", usedBy: null, usedAt: null },
    { id: "i0", label: "Rosa", email: null, createdBy: "Alex Kim", createdAt: ago(60 * 24 * 9), expiresAt: days(-2),
      status: "used", usedBy: "rosa_m", usedAt: ago(60 * 24 * 8) },
  ];
  const plexInvites: AppPlexInvite[] = [
    { email: "jordan@example.com", name: "", sentAt: ago(60 * 5), who: "Jordan" },
    { email: "", name: "riley.plex", sentAt: ago(60 * 24 * 2), who: null },
  ];
  const all: AppAdminRequestRow[] = [
    { id: "6002", slot: 210, stage: "searching", title: ELEPHANTS_DREAM, requestedAt: ago(60 * 50), updatedAt: ago(60 * 48),
      progress: { detail: "Looking for a copy" }, help: { id: "h2", reason: "Can’t be found" }, requester: "Jordan Lee", status: "approved",
      approvedBy: "Alex Kim", approvedAt: ago(60 * 48), stageSince: ago(60 * 48), stuck: ["Help asked: Can’t be found", "Nothing found for over a day"] },
    ...requests.map((r): AppAdminRequestRow => ({
      ...r, id: r.id ?? `s${r.slot}`, requester: ME,
      status: r.stage === "requested" ? "pending" : r.stage === "declined" ? "declined" : "approved",
      approvedBy: ["requested", "declined"].includes(r.stage) ? null : admin.recent.find((x) => x.slot === r.slot)?.resolvedBy ?? "Alex Kim",
      approvedAt: ["requested", "declined"].includes(r.stage) ? null : admin.recent.find((x) => x.slot === r.slot)?.resolvedAt ?? r.requestedAt,
      stageSince: r.updatedAt, finishedAt: r.stage === "available" ? r.updatedAt : null,
      help: r.id === "5001" ? { id: "h1", reason: "Stuck downloading" } : r.help,
      stuck: r.id === "5001" ? ["Help asked: Stuck downloading", "Download hasn’t moved in 6 hours"] : [],
    })),
    // Everyone else's requests still waiting for a decision, as Manage → Requests has them.
    ...admin.pending.filter((p) => !requests.some((r) => r.slot === p.slot)).map((p): AppAdminRequestRow => {
      const t = titles.find((x) => x.kind === p.kind && x.title === p.title)!;
      return { id: p.id, slot: p.slot, stage: "requested", seasons: p.seasons ?? undefined, requestedAt: p.requestedAt, updatedAt: p.requestedAt,
        title: { id: t.id, kind: t.kind, title: t.title, year: t.year, poster: t.poster }, requester: p.requester, status: "pending",
        approvedBy: null, approvedAt: null, stageSince: p.requestedAt, finishedAt: null, stuck: [] };
    }),
  ];
  const tickets: Record<string, SampleTicket> = {
    h4: { requestKey: null, owner: null, waiting: false, thread: [entry("note", "Plexbie", BLOCKED_NOTE, 8)] },
    h1: { requestKey: "5001", owner: "Priya N.", waiting: true, thread: [
      entry("member", "Alex Kim", "Stuck downloading. It’s been at 62% since this morning.", 40),
      entry("status", "Priya N.", "Took it", 34),
      entry("note", "Priya N.", "That release stalled at the source. There’s a 4K copy that’s healthy.", 31),
      entry("reply", "Priya N.", "Found a copy that works. Is the 4K version OK, or would you rather wait for 1080p?", 30),
      entry("status", "Priya N.", "Waiting on them", 30),
    ] },
    h2: { requestKey: "6002", owner: null, waiting: false, thread: [
      entry("member", "Jordan Lee", "Can’t be found. Searching by its IDs found nothing Plexbie could grab for Elephants Dream: 212 releases came back. Search by name instead?", 12),
    ] },
  };
  const conversations: Record<string, SampleMsg[]> = {
    dsample: [
      convo(60 * 25, "discord", "Pepper & Carrot season 2 is approved.", "Request approved", "out"),
      convo(60 * 5, "discord", "Good news! Pepper & Carrot is now ready to start on Plex.", null, "out"),
      convo(40, "web", "Stuck downloading. It’s been at 62% since this morning.", "Something wrong with Pepper & Carrot", "in"),
      convo(30, "discord", "Found a copy that works. Is the 4K version OK, or would you rather wait for 1080p?", "🛠️ About your request: Pepper & Carrot", "out"),
      convo(22, "discord", "4K is great, thank you!", "Answer about Pepper & Carrot", "in"),
      convo(6, "discord", "oh and the subtitles on episode 3 are out of sync", null, "in"),
    ],
    pgrandad: [convo(60 * 24, "none", "Your Plex access is about to lapse.", "Heads up", "out",
      { delivered: false, error: "No phone alerts turned on and no email to send to" })],
  };
  return {
    requests, titles, admin, cleanup, joins, help, people, invites, plexInvites, all, tickets,
    languages: [] as string[],         // the language chips, remembered for the visit
    activity: {} as Record<string, { at: string; by: string; did: string }[]>,
    convos: conversations,
    done: { pgrandad: { at: ago(60 * 7), by: "Priya N." } } as Record<string, { at: string; by: string }>,
    autoreply: true,
    blocked: true,                     // h4's download, until it's imported
  };
}
let house = makeSampleState();
/** A new visit to the sample household (Look around, and leaving it): nothing the last one did stays. */
export function resetSample() { house = makeSampleState(); }

const newInvite = (label: string, email: string | null, d: number) => {
  const invite: AppAdminInvite = { id: `i${Date.now()}`, label, email, createdBy: "you", createdAt: new Date().toISOString(),
    expiresAt: days(d), status: "active", usedBy: null, usedAt: null };
  house.invites = [invite, ...house.invites];
  return { url: `https://plexbie.example/invite/sample${Date.now().toString(36)}`, invite };
};

function allOf(q: string, everything = false): AppAdminAllRequests {
  const words = q.trim().toLowerCase().replace(/^(no\.|#)\s*/, "").replace(/^0+/, "");
  if (words) {
    const rows = [...house.all, ...sampleArchive]
      .filter((r) => `${r.title.title} ${r.requester}`.toLowerCase().includes(words) || String(r.slot) === words)
      .sort((a, b) => b.slot - a.slot);
    return { rows, counts: null, query: words, everything: false, total: house.all.length + sampleArchive.length };
  }
  const ended = (r: AppAdminRequestRow) => r.stage === "declined" || r.stage === "closed";
  const rows = [...house.all, ...(everything ? sampleArchive : [])].sort((a, b) => Number(!a.stuck.length) - Number(!b.stuck.length) || b.slot - a.slot);
  return { rows, query: null, everything, total: house.all.length + sampleArchive.length, counts: {
    active: rows.filter((r) => !["available", "requested"].includes(r.stage) && !ended(r)).length, stuck: rows.filter((r) => r.stuck.length).length,
    waiting: rows.filter((r) => r.stage === "requested").length, finished: rows.filter((r) => r.stage === "available").length, declined: rows.filter(ended).length } };
}

const BLOCKED_REF = { app: "sonarr" as const, downloadId: "SABnzbd_nzo_demo" };
const SAMPLE_EPISODES = ["Moon Rocket", "Molten Terror", "Bridge of Death", "Flight to Destruction", "Murder Car", "Hills of Death",
  "Camouflaged Destruction", "The Enemy Planet", "Battle in the Stratosphere", "Mass Execution", "Planned Pursuit", "Death of the Moon Man"]
  .map((title, i) => ({ id: 701 + i, label: `S01E${String(i + 1).padStart(2, "0")}`, season: 1, episode: i + 1, title, hasFile: false }));
const BLOCKED_WHY = "Found matching series via grab history, but release was matched to series by ID. Automatic import is not possible.";
const ticketOf = (id: string) => (house.tickets[id] ??= { requestKey: null, owner: null, waiting: false, thread: [] });
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
  const h = house.help.find((x) => x.id === help.id);
  const t = ticketOf(help.id);
  return {
    ...help, status: h?.status ?? "open", waiting: h?.status === "open" && t.waiting,
    thread: t.thread.filter((e) => ["member", "reply"].includes(e.kind) || (e.kind === "status" && ["Solved", "Reopened"].includes(e.text)))
      .map(({ id, at, by, kind, text }) => ({ id, at, kind, text, by: kind === "member" ? "You" : by })),
  };
}
const say = (id: string, kind: string, text: string, by = ME) => { const e = entry(kind, by, text); ticketOf(id).thread.push(e); return e; };
/** h2's member can’t be reached (closed DMs, no alerts, no email): an admin’s reply or
 *  “Solved” on it says so, and so does its timeline (the reply it was, `sent`, is marked
 *  missed); on any other ticket it arrives. */
const told = (h: { id: string; who: string }, said: string, done: string, sent?: AppTicketEntry) => {
  if (h.id !== "h2") return { ok: true, told: true, message: said };
  const why = "Plexbie couldn’t DM them on Discord, and no phone alert or email reached them either.";
  if (sent?.kind === "reply") sent.missed = true;
  say(h.id, "action", `This didn’t reach ${h.who}: ${why}`, "Plexbie");
  return { ok: true, told: false, message: `${done}, but it didn’t reach ${h.who}: ${why} Tell them another way.` };
};
/** A solved ticket stops making its request look stuck on All requests (and a reopened one starts again). */
const markHelp = (id: string, open: boolean) => {
  const h = house.help.find((x) => x.id === id);
  house.all = house.all.map((x) => {
    if (x.id !== house.tickets[id]?.requestKey) return x;
    const rest = x.stuck.filter((s) => !s.startsWith("Help asked"));
    return open && h ? { ...x, help: { id, reason: h.reason }, stuck: [`Help asked: ${h.reason}`, ...rest] } : { ...x, help: null, stuck: rest };
  });
};
const helpFor = (id: string) => {
  const h = house.help.find((x) => x.id === id);
  if (!h) throw new ApiError(404, "No such ticket.", "http");
  return h;
};

/** The sample "server": answers the same calls as api(), from the data above. */
export const sampleApi: Api = {
  session: async () => sampleSession,
  myRequests: async () => { await pause(450); return house.requests.map((r) => (r.help ? { ...r, help: memberTicket(r.help) } : r)); },
  library: async (kind) => {
    await pause(350);
    const want = kind === "book" ? ["audiobook", "ebook"] : [kind];
    return house.titles.filter((t) => want.includes(t.kind) && (t.availability === "available" || kind === "book"))
      .map((t, i) => ({ ...t, addedAt: ago(60 * 24 * (i + 1)) }));
  },
  watchparty: async () => ({ seconds: 95 * 60, sessions: 3, last: ago(60 * 24 * 2) }),
  status: async () => ({
    online: true, streams: 2,
    libraries: [{ title: "Films", kind: "movie", count: 1342 }, { title: "TV", kind: "show", count: 187 }, { title: "Audiobooks", kind: "book", count: 64 }],
  }),
  arrivals: async () => {
    await pause(300);
    const t = (k: string, id: string) => house.titles.find((x) => x.kind === k && x.id === id)!;
    return [
      { title: t("movie", "1184918"), addedAt: ago(60 * 3), detail: null },
      { title: t("movie", "872585"), addedAt: ago(60 * 9), detail: null },
      { title: t("tv", "95396"), addedAt: ago(60 * 20), detail: "Season 2, episodes 1–4" },
      { title: t("audiobook", "OL-wizard-of-oz"), addedAt: ago(60 * 30), detail: "Audiobook" },
      { title: t("movie", "569094"), addedAt: ago(60 * 26), detail: null },
    ];
  },
  community: async () => {
    await pause(350);
    return {
      onAir: [
        { member: "Priya", title: "Pepper & Carrot", subtitle: "S2 · E3 · The Potion Contest", poster: PEPPER_CARROT, progress: 0.42, device: "Apple TV" },
        { member: "Sam", title: "Sintel", subtitle: null, poster: SINTEL, progress: 0.78, device: "Living room TV" },
      ],
      leaderboard: [{ name: "Priya", hours: 412, streak: 9 }, { name: "Alex Kim", hours: 388, streak: 3 }, { name: "Sam", hours: 240, streak: 0 }],
      you: { rank: 2, hours: 388, streak: 3, longestStreak: 21, daysIdle: 0, removalAfterDays: 60, topThree: true, watchPartyMinutes: 95 },
    };
  },
  search: async (q, kind) => {
    await pause(300);
    const words = q.trim().toLowerCase();
    const kinds = kind === "audiobook" || kind === "ebook" ? ["audiobook", "ebook"] : [kind];    // a book search finds both kinds
    return house.titles.filter((t) => kinds.includes(t.kind) && (!words || t.title.toLowerCase().includes(words)));
  },
  popular: async () => ({ movies: house.titles.filter((t) => t.kind === "movie"), tv: house.titles.filter((t) => t.kind === "tv") }),
  discover: async (kind) => {
    await pause(300);
    const mine = house.titles.filter((t) => t.kind === kind);
    const genres = ["Action", "Adventure", "Animation", "Comedy", "Crime", "Documentary", "Drama", "Family", "Fantasy",
      "History", "Horror", "Music", "Mystery", "Romance", "Science Fiction", "Thriller", "War", "Western"].map((name, id) => ({ id: id + 1, name }));
    return { genres, languages: house.languages, languageOptions: [{ code: "en", name: "English" }, { code: "ja", name: "Japanese" }], shelves: [
      { key: "trending", title: "Trending this week", titles: mine, more: false },
      { key: "top", title: "Top rated", titles: [...mine].reverse(), more: false },
    ].filter((s) => s.titles.length) };
  },
  shelf: async (_kind, _key, page) => ({ titles: [], more: false, page }),
  searchAll: async (q) => {
    const [movie, tv, book] = await Promise.all((["movie", "tv", "audiobook"] as const).map((k) => sampleApi.search(q, k)));
    return { movie, tv, book };
  },
  prefs: async () => ({ languages: house.languages, languageOptions: [{ code: "en", name: "English" }, { code: "ja", name: "Japanese" }] }),
  saveLanguages: async (languages) => { house.languages = [...languages].sort(); return { languages: house.languages }; },
  similar: async (kind, id) => house.titles.filter((t) => t.kind === kind && t.id !== id),
  title: async (kind, id) => {
    await pause(250);
    const t = house.titles.find((x) => x.kind === kind && x.id === id);
    if (!t) throw new ApiError(404, "Not found.", "http");
    return t;
  },
  request: async (body: NewRequest) => {
    await pause(600);
    const t = house.titles.find((x) => x.kind === body.kind && x.id === body.id);
    if (!t) throw new ApiError(404, "Unknown title.", "http");
    // The next number nobody in the household has: not the member's own, and not anyone else's.
    const taken = [...house.requests, ...house.all, ...house.admin.pending, ...house.admin.recent, ...house.help].map((x) => x.slot);
    const r: AppRequest = {
      id: `s${Date.now()}`, slot: Math.max(...taken) + 1, stage: "requested",
      requestedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      title: { id: t.id, kind: t.kind, title: t.title, year: t.year, poster: t.poster },
      seasons: body.seasons, format: body.format,
    };
    house.requests.unshift(r);
    t.yourRequest = { slot: r.slot, stage: "requested" };
    return r;
  },
  askHelp: async (requestId, reason) => {
    await pause(500);
    const r = house.requests.find((x) => x.id === requestId);
    const label = { stuck: "Stuck downloading", notfound: "Can’t be found", quality: "Wrong version or quality", episodes: "Wrong or missing episodes",
      playback: "Won’t play on Plex", other: "Something else" }[reason] ?? reason;
    const help = { id: `h${requestId}`, reason: label };
    house.help = [{ id: help.id, slot: r?.slot ?? 0, title: r?.title.title ?? "", kind: r?.title.kind ?? "movie", seasons: null, who: ME,
      reason: label, note: "", status_then: r?.stage ?? "", status: "open", created_at: new Date().toISOString(), actions: [] }, ...house.help];
    house.tickets[help.id] = { requestKey: requestId, owner: null, waiting: false, thread: [entry("member", ME, label)] };
    if (r) r.help = memberTicket(help);
    return { ok: true, message: "Sent. An admin will take a look and get back to you.", help };
  },
  join: async () => { await pause(500); return null; },
  adminRequests: async () => { await pause(350); return house.admin; },
  decide: async (id, approve) => {
    await pause(500);
    const r = house.admin.pending.find((x) => x.id === id);
    if (!r) throw new ApiError(409, "Already decided.", "http");
    house.admin.pending = house.admin.pending.filter((x) => x.id !== id);
    house.admin.recent.unshift({ ...r, status: approve ? "approved" : "declined", resolvedBy: "you", resolvedAt: new Date().toISOString() });
    // Deciding one of the member's own requests moves it on everywhere else too.
    const stage = approve ? "approved" : "declined";
    for (const x of house.requests.filter((m) => m.slot === r.slot)) x.stage = stage;
    for (const x of house.titles.filter((t) => t.yourRequest?.slot === r.slot)) x.yourRequest = { slot: r.slot, stage };
    house.all = house.all.map((x) => (x.slot === r.slot ? { ...x, stage, status: stage,
      approvedBy: approve ? "you" : null, approvedAt: approve ? new Date().toISOString() : null } : x));
    return { ok: true, message: approve ? "Sent to Seerr." : "They've been told." };
  },
  adminJoins: async () => { await pause(300); return house.joins; },
  decideJoin: async (messageId, approve) => {
    await pause(500);
    house.joins = house.joins.map((j) => (j.messageId === messageId ? { ...j, status: approve ? "approved" : "denied" } : j));
    return ok(approve ? "Plex invite sent." : "They’ve been told.");
  },
  appLatest: async () => {
    await pause(300);
    return { version: "2.0.0", versionCode: 99, size: 47_350_955, sha256: "",
      notes: "**New in 2.0.0: an example**\n- Plexbie tells you when a new version is out.\n- Download it straight from the app." };
  },
  appDownloadLink: async () => "",                // nothing to download in the sample household
  adminAll: async (q, _signal, everything) => { await pause(350); return allOf(q, everything); },
  adminRequest: async (key) => {
    await pause(250);
    const r = [...house.all, ...sampleArchive].find((x) => x.id === key);
    if (!r) throw new ApiError(404, "No such request.", "http");
    const detail: AppAdminRequestDetail = {
      ...r, via: key === "5002" ? "the website" : "Discord", seerrId: null, activity: house.activity[key] ?? [],
      tickets: house.help.filter((h) => h.slot === r.slot).map((h) => ({
        id: h.id, status: h.status, reason: h.reason, note: h.note, who: h.who, opened_by: (h as { opened_by?: string }).opened_by ?? null,
        created_at: h.created_at, resolved_by: null, resolved_at: null, reply: null })),
    };
    return detail;
  },
  adminTickets: async () => {
    await pause(300);
    const rows = house.help.map(ticketRow);
    const newest = (rs: AppAdminTicketRow[]) => rs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const action = newest(rows.filter((t) => t.status === "open" && !t.waiting));
    const waiting = newest(rows.filter((t) => t.status === "open" && t.waiting));
    const solved = newest(rows.filter((t) => t.status !== "open"));
    return { rows: [...action, ...waiting, ...solved], counts: { action: action.length, waiting: waiting.length, solved: solved.length } };
  },
  adminBlocked: async () => {
    await pause(200);
    return { rows: house.blocked ? [{ ...BLOCKED_REF, title: "Radar Men from the Moon", year: 1952, messages: [BLOCKED_WHY], episodes: ["S01E01", "S01E02", "S01E03"], ticket: "h4" }] : [] };
  },
  blockedPreview: async () => {
    await pause(300);
    return { ...BLOCKED_REF, title: "Radar Men from the Moon", folder: "/data/usenet/complete/tv/Radar.Men.From.The.Moon.S01.1080p.WEB",
      messages: [BLOCKED_WHY], warnings: [],
      files: [1, 2, 3].map((n) => ({ name: `Radar.Men.From.The.Moon.S01E0${n}.1080p.WEB.mkv`, size: (1.1 + n / 10) * 2 ** 30,
        as: n === 3 ? [] : [`S01E0${n}`], quality: "WEBDL-1080p", qualityId: 3, languages: [{ id: 1, name: "English" }], releaseGroup: "WEB",
        rejections: n === 3 ? ["Unable to determine if file is a sample"] : [],
        notes: n === 3 ? ["Unable to determine if file is a sample", "Sonarr can’t tell which episode this is: pick it"] : [],
        episodes: n === 3 ? [] : [SAMPLE_EPISODES[n - 1]], seriesId: 41, movie: null, ready: n !== 3 })),
      others: [{ name: "Radar.Men.From.The.Moon.S01.nfo", size: 2048, danger: false }], ok: true,
      series: { id: 41, title: "Radar Men from the Moon", year: 1952 }, movie: null,
      options: { qualities: [{ id: 3, name: "WEBDL-1080p" }, { id: 7, name: "Bluray-1080p" }, { id: 18, name: "WEBDL-2160p" }],
        languages: [{ id: 1, name: "English" }, { id: 2, name: "French" }], episodes: SAMPLE_EPISODES } };
  },
  arrLibrary: async () => { await pause(200); return { rows: [{ id: 41, title: "Radar Men from the Moon", year: 1952 }, { id: 42, title: "King of the Rocket Men", year: 1949 }] }; },
  arrEpisodes: async () => { await pause(200); return { rows: SAMPLE_EPISODES }; },
  blockedImport: async () => {
    await pause(900);
    // Gone from the waiting list, and its ticket solved, as Plexbie does once it's imported.
    if (house.blocked) {
      house.blocked = false;
      say("h4", "reply", "It’s been imported, so Plex will have it shortly.", "Plexbie");
      say("h4", "status", "Solved", "Plexbie");
      ticketOf("h4").waiting = false;
      house.help = house.help.map((h) => (h.id === "h4" ? { ...h, status: "resolved" } : h));
      markHelp("h4", false);
    }
    return { ok: true, message: "Imported 3 files." };
  },
  adminTicket: async (id) => {
    await pause(250);
    const h = helpFor(id);
    const t = ticketOf(id);
    const detail: AppAdminTicketDetail = { ...ticketRow(h), note: h.note, statusThen: h.status_then, thread: [...t.thread],
      request: [...house.all, ...sampleArchive].find((x) => x.id === t.requestKey) ?? null, blocked: id === "h4" && house.blocked ? BLOCKED_REF : null };
    return detail;
  },
  ticketComment: async (id, kind, text) => {
    await pause(400);
    const h = helpFor(id);
    const sent = say(id, kind, text);
    return kind === "reply" ? told(h, `Sent to ${h.who} (Discord DM).`, "Added to the ticket", sent) : ok("Note added. Only admins see it.");
  },
  ticketStatus: async (id, status, message) => {
    await pause(400);
    const h = helpFor(id);
    const t = ticketOf(id);
    if (status === "waiting") { t.waiting = true; say(id, "status", "Waiting on them"); return ok(`Waiting on ${h.who}’s answer.`); }
    if (status === "resolved") {
      const sent = message?.trim() ? say(id, "reply", message.trim()) : undefined;
      say(id, "status", "Solved");
      t.waiting = false;
      house.help = house.help.map((x) => (x.id === id ? { ...x, status: "resolved" } : x));
      markHelp(id, false);
      return told(h, `Resolved, and ${h.who} has been told (Discord DM).`, "Resolved", sent);
    }
    if (h.status !== "open") { house.help = house.help.map((x) => (x.id === id ? { ...x, status: "open" } : x)); markHelp(id, true); say(id, "status", "Reopened"); }
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
    const r = house.requests.find((x) => x.id === requestId);
    if (!r?.help) throw new ApiError(404, "No such request.", "http");
    if (helpFor(r.help.id).status !== "open") throw new ApiError(409, "This ticket is closed. Ask for help again if it’s still wrong.", "http");
    say(r.help.id, "member", text, ME);
    ticketOf(r.help.id).waiting = false;
    return ok("Sent. The admins have it.");
  },
  requestTicket: async (key, note, tell, message) => {
    await pause(450);
    const r = house.all.find((x) => x.id === key);
    const help = { id: `h${Date.now()}`, reason: "Opened by an admin" };
    house.help = [{ id: help.id, slot: r?.slot ?? 0, title: r?.title.title ?? "", kind: r?.title.kind ?? "movie", seasons: null,
      who: r?.requester ?? "Someone", reason: help.reason, note, status_then: r?.stage ?? "", status: "open", created_at: new Date().toISOString(),
      actions: [], opened_by: ME }, ...house.help];
    house.tickets[help.id] = { requestKey: key, owner: null, waiting: false, thread: [entry("note", ME, note)] };
    if (tell && message?.trim()) say(help.id, "reply", message.trim());
    house.all = house.all.map((x) => (x.id === key ? { ...x, help, stuck: [`Help asked: ${help.reason}`, ...x.stuck] } : x));
    return { ok: true, message: `Ticket opened${tell ? `, and ${r?.requester ?? "they"} has been told (Discord DM)` : ""}. It’s on Manage → Tickets.`,
      help, ...(tell ? { told: true } : {}) };
  },
  requestSearch: async (key, how) => {
    await pause(500);
    const said = { again: "Searching again.", episodes: "Searching one episode at a time.", name: "Searching by name. Plexbie reports back in the admin channel." }[how];
    (house.activity[key] ??= []).push({ at: new Date().toISOString(), by: "you", did: said });
    return ok(said);
  },
  helpSearch: async (_id, how) => {
    await pause(600);
    return ok({ again: "Sonarr is searching for season 2 again.", episodes: "Sonarr is searching season 2 one episode at a time.",
      name: "Plexbie is searching NZBHydra for “Elephants Dream 2006”. It reports back here, and closes this if it finds it." }[how]);
  },
  adminPeople: async () => { await pause(350); return house.people; },
  linkCandidates: async () => ({ discord: [{ id: "203", name: "Rosa M", username: "rosam" }, { id: "204", name: "Dev", username: "devr" }] }),
  linkPerson: async (plexName, discordId) => {
    await pause(400);
    house.people = house.people.map((x) => (x.plexName === plexName ? { ...x, linked: true, discordId, discordName: discordId === "203" ? "Rosa M" : "Dev" } : x));
    return ok(`Linked ${plexName}.`);
  },
  unlinkPerson: async (plexName) => { await pause(400); house.people = house.people.map((x) => (x.plexName === plexName ? { ...x, linked: false, discordId: null, discordName: null } : x)); return ok(`Unlinked ${plexName}.`); },
  renamePerson: async (plexName, name) => { await pause(400); house.people = house.people.map((x) => (x.plexName === plexName ? { ...x, displayName: name } : x)); return ok(`Shown as ${name} from now on.`); },
  keepPerson: async (plexName, keep) => { await pause(400); house.people = house.people.map((x) => (x.plexName === plexName ? { ...x, neverRemove: keep } : x)); return ok(keep ? `${plexName} will never be removed.` : `${plexName} is back on the check.`); },
  matchPerson: async (plexName, account) => { await pause(400); return ok(`${plexName} is ${account} on Plex now.`); },
  removePerson: async (plexName) => { await pause(600); house.people = house.people.filter((x) => x.plexName !== plexName); return ok("Removed from Plex. They’ve been told."); },
  adminInvites: async () => { await pause(300); return house.invites; },
  createInvite: async ({ label, email, days: d }) => { await pause(500); return newInvite(label, email ?? null, d); },
  renewInvite: async (id) => {
    await pause(500);
    const old = house.invites.find((i) => i.id === id);
    if (!old) throw new ApiError(404, "No such invite.", "http");
    if (old.status !== "used") house.invites = house.invites.filter((i) => i.id !== id);
    return newInvite(old.label, old.email, 7);
  },
  revokeInvite: async (id) => { await pause(400); house.invites = house.invites.map((i) => (i.id === id ? { ...i, status: "revoked" } : i)); return ok("The link no longer works."); },
  deleteInvite: async (id) => { await pause(400); house.invites = house.invites.filter((i) => i.id !== id); return ok("Deleted."); },
  plexInvites: async () => { await pause(300); return house.plexInvites; },
  plexInviteChange: async (email, next) => {
    await pause(600);
    house.plexInvites = house.plexInvites.map((i) => (i.email === email ? { ...i, email: next, sentAt: new Date().toISOString() } : i));
    return ok(`Invite sent to ${next}.`);
  },
  plexInviteCancel: async (email) => { await pause(400); house.plexInvites = house.plexInvites.filter((i) => i.email !== email); return ok(`Plex invite to ${email} cancelled.`); },
  adminCleanup: async () => { await pause(350); return house.cleanup; },
  exempt: async (ratingKey, keep) => {
    await pause(400);
    const row = samplePlexTitles.find((r) => r.ratingKey === ratingKey);
    if (keep && row) {
      house.cleanup.warning = house.cleanup.warning.filter((r) => r.ratingKey !== ratingKey);
      house.cleanup.upcoming = house.cleanup.upcoming.filter((r) => r.ratingKey !== ratingKey);
      house.cleanup.exempt = [row, ...house.cleanup.exempt.filter((r) => r.ratingKey !== ratingKey)];
    } else if (!keep) house.cleanup.exempt = house.cleanup.exempt.filter((r) => r.ratingKey !== ratingKey);
    return ok(keep ? "Kept forever." : "Back on the clock.");
  },
  cleanupSearch: async (q) => {
    await pause(300);
    const words = q.trim().toLowerCase();
    if (words.length < 2) return [];
    return samplePlexTitles.filter((t) => t.title.toLowerCase().includes(words))
      .map((t) => ({ ...t, kept: house.cleanup.exempt.some((e) => e.ratingKey === t.ratingKey) }));
  },
  cleanupSettings: async (change) => { await pause(400); house.cleanup.settings = { ...house.cleanup.settings, ...change }; return ok("Saved."); },
  cleanupScan: async () => { await pause(1200); return ok("Scan done: 1 title in the warning window, 0 were removed."); },
  adminHealth: async () => {
    await pause(500);
    return [
      { name: "Plex", ok: true, ms: 42 }, { name: "Seerr", ok: true, ms: 88 }, { name: "Tautulli", ok: true, ms: 61 },
      { name: "Sonarr", ok: true, ms: 120 }, { name: "SABnzbd", ok: true, ms: 35 },
      { name: "Discord Public Bot", ok: false, ms: 0, detail: "Public Bot is on, so anyone with Plexbie's ID can add it to their own server. "
        + "Turn it off: Discord Developer Portal → your app → Installation → Install Link: None → Save, then Bot → Public Bot off → Save." },
    ];
  },
  signOutOthers: async () => { await pause(700); return { ...ok("Signed out every other website sign-in and 2 app sign-ins."), ended: 2 }; },
  adminDiscord: async () => ({
    channels: [{ id: "c1", name: "general" }, { id: "c2", name: "movie-night" }],
    inbox: { autoreply: house.autoreply, threadsMissing: null },
    joins: [
      { who: "Rosa M", by: "Alex Kim", via: "plexbie", code: "Rosa", at: ago(60 * 24 * 8), role: null },
      { who: "Jordan", by: "Priya", via: "discord", code: "k3Xa9", at: ago(60 * 24 * 20), role: "Plex member" },
    ],
    party: null,
  }),
  say: async () => { await pause(500); return ok("Posted in #general."); },
  adminMessages: async () => {
    await pause(250);
    return Object.entries(house.convos).map(([id, list]) => {
      const last = list[list.length - 1];
      const done = house.done[id] ?? null;
      return {
        id, name: SAMPLE_NAMES[id], count: list.filter((m) => m.direction === "out").length, received: list.filter((m) => m.direction === "in").length,
        unread: list.filter((m) => m.direction === "in" && !(done && done.at >= m.at)).length, done,
        ticket: id === "dsample" ? { id: "h1", title: "Pepper & Carrot", slot: 214 } : null,
        failed: list.filter((m) => !m.delivered).length, via: [...new Set(list.map((m) => m.channel))],
        last: { at: last.at, text: last.title ?? last.text, channel: last.channel, delivered: last.delivered, direction: last.direction },
      };
    }).sort((a, b) => b.last.at.localeCompare(a.last.at));
  },
  conversation: async (who) => { await pause(200); return (house.convos[who] ?? []).map((m) => ({ ...m })); },
  messageReply: async (who, text) => {
    await pause(450);
    house.convos[who]?.push(convo(0, who.startsWith("d") ? "discord" : "web", `${text}\n— ${ME} (admin)`, null, "out", { by: ME, context: "reply from an admin" }));
    house.done[who] = { at: new Date().toISOString(), by: ME };
    return ok(`Sent to ${SAMPLE_NAMES[who]} as a ${who.startsWith("d") ? "Discord DM" : "phone alert"}.`);
  },
  messageDone: async (who, done) => {
    await pause(250);
    if (done) house.done[who] = { at: new Date().toISOString(), by: ME }; else delete house.done[who];
    return ok(done ? "Marked done. It stays in the history." : "Marked unread.");
  },
  messageToTicket: async (key) => {
    await pause(350);
    const m = Object.values(house.convos).flat().find((x) => x.id === key);
    if (!m) throw new ApiError(404, "That message isn’t one someone sent Plexbie.", "http");
    m.ticket = "h1";
    say("h1", "member", m.text, ME);
    return ok("Added to their ticket on Pepper & Carrot.");
  },
  inboxSettings: async (autoreply) => { await pause(300); house.autoreply = autoreply; return ok(autoreply ? "Plexbie answers new DMs." : "Plexbie won’t answer DMs by itself."); },
  registerPush: async () => null,
  unregisterPush: async () => null,
  pushTest: async () => { await pause(300); return ok("Sent. It should pop up in a moment."); },
  logout: async () => null,
};
