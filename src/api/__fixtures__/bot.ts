// Answers as the bot sends them. Those the bot has /api types for are typed with them
// (../types, copied from the bot by scripts/sync-types.mjs), so a change on the bot's side
// that these no longer match stops the type-check before it reaches a phone. /api/mobile and
// the token answer have no shared type; they copy what the bot's own sign-in tests expect.
//
// Titles are Blender open movies, Pepper & Carrot (David Revoy, CC BY 4.0) and a
// public-domain book; ids and people are made up.
import type { Arrival, Community, Discover, MediaRequest, ServerStatus, Session, Title } from "../types";

export const discordSession: Session = {
  user: { id: "123456789012345678", name: "pat", avatar: "https://cdn.discordapp.com/avatars/123456789012345678/a1b2c3.png", via: "discord" },
  member: true,
  joinPending: false,
  admin: true,
  discordId: "123456789012345678",
  plexName: "pat_plex",
  inGuild: true,
};

export const plexSession: Session = {
  user: { id: "42", name: "lee", avatar: null, via: "plex" },
  member: true,
  joinPending: false,
  plexName: "lee",
  plexAccountId: "42",
  email: "lee@example.com",
  accessUnknown: false,
};

export const bunny: Title = {
  kind: "movie",
  id: "900101",
  title: "Big Buck Bunny",
  year: "2008",
  poster: "/img/tmdb/w342/bunny.jpg",
  backdrop: null,
  overview: "A large rabbit deals with three tiny bullies.",
  genres: ["Animation", "Comedy"],
  runtime: 10,
  availability: "available",
  plexUrl: "https://app.plex.tv/desktop#!/server/abc/details?key=%2Flibrary%2Fmetadata%2F1",
  leaving: { daysLeft: 12, warning: false, reason: "watched", practice: true },
};

export const pepper: Title = {
  kind: "tv",
  id: "900102",
  title: "Pepper & Carrot",
  year: "2017",
  poster: null,
  seasons: [
    { n: 1, episodes: 6, have: 6, status: "available" },
    { n: 2, episodes: 8, have: 3, status: "partial" },
    { n: 3, episodes: 8, status: "upcoming" },
  ],
  availability: "requested",
  yourRequest: { slot: 7, stage: "downloading" },
};

export const prideAndPrejudice: Title = {
  kind: "ebook",
  id: "OL66554W",
  title: "Pride and Prejudice",
  year: "1813",
  poster: null,
  author: "Jane Austen",
  availability: "none",
};

export const myRequests: MediaRequest[] = [
  {
    id: "req_7",
    slot: 7,
    title: pepper,
    stage: "downloading",
    requestedAt: "2026-10-01T18:20:00Z",
    updatedAt: "2026-10-05T09:12:00Z",
    seasons: [2],
    progress: { percent: 41.5, eta: "2026-10-05T10:00:00Z", detail: "3 of 8 episodes", seasons: [{ n: 2, have: 3, total: 8 }] },
    help: {
      id: "t_0123456789ab",
      reason: "episodes",
      status: "open",
      waiting: true,
      thread: [
        { id: "e1", at: "2026-10-04T20:00:00Z", by: "pat", kind: "member", text: "Episode 4 is missing." },
        { id: "e2", at: "2026-10-04T21:30:00Z", by: "Admin", kind: "reply", text: "Searching again. Is it only episode 4?" },
      ],
    },
  },
  {
    slot: 8,
    title: prideAndPrejudice,
    stage: "requested",
    requestedAt: "2026-10-05T08:00:00Z",
    updatedAt: "2026-10-05T08:00:00Z",
    format: "both",
    progress: null,
  },
  {
    slot: 3,
    title: bunny,
    stage: "available",
    requestedAt: "2026-09-12T08:00:00Z",
    updatedAt: "2026-09-12T09:40:00Z",
    note: "Enjoy!",
  },
];

export const status: ServerStatus = {
  online: true,
  streams: 2,
  libraries: [
    { title: "Movies", kind: "movie", count: 812 },
    { title: "TV Shows", kind: "show", count: 143 },
    { title: "Audiobooks", kind: "artist", count: 57 },
  ],
  checkedAt: "2026-10-05T09:14:00Z",
};

export const community: Community = {
  onAir: [{ member: "lee", title: "Pepper & Carrot", subtitle: "S02E03", poster: null, progress: 0.42, device: "Living room TV" }],
  leaderboard: [{ name: "lee", hours: 31.5, streak: 6 }, { name: "pat", hours: 12, streak: 0 }],
  you: { rank: 2, hours: 12, streak: 0, longestStreak: 9, daysIdle: 3, removalAfterDays: 60, topThree: true, watchPartyMinutes: 95 },
};

export const arrivals: Arrival[] = [{ title: bunny, addedAt: "2026-10-05T07:00:00Z", detail: "Requested by pat" }];

export const discover: Discover = {
  kind: "movie",
  shelves: [{ key: "trending", title: "Trending", titles: [bunny], more: true }],
  genres: [{ id: 16, name: "Animation" }],
  languages: [],
  languageOptions: [{ code: "en", name: "English" }, { code: "nl", name: "Dutch" }],
};

/** GET /api/mobile on a bot that offers both sign-ins and moved to a new address. */
export const mobileInfo = { version: "1", auth: ["discord", "plex"], push: ["expo"], home: "https://home.plexbie.example" };

/** POST /auth/mobile/token: "pxa_" and 43 URL-safe characters, and when it ends (seconds). */
export const token = { token: `pxa_${"Ab3_-".repeat(8)}Ab3`, expiresAt: 1_800_000_000 };
