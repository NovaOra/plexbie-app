// The runtime checks at the network edge, against answers shaped like the bot's: what the
// bot sends today passes untouched, a newer bot's extras pass through, and one odd row is
// dropped instead of failing the whole screen.
import { expect, test } from "@jest/globals";
import {
  ArrivalsSchema, CommunitySchema, DiscoverSchema, MediaRequestsSchema, MobileInfoSchema, SessionSchema, StatusSchema,
  TitleDetailSchema, TitlesSchema, TokenSchema,
} from "../schemas";
import * as fx from "../__fixtures__/bot";

/** Through JSON, as it comes off the wire. */
const wire = (v: unknown): unknown => JSON.parse(JSON.stringify(v));

test("both kinds of session parse as sent", () => {
  expect(SessionSchema.parse(wire(fx.discordSession))).toEqual(fx.discordSession);
  expect(SessionSchema.parse(wire(fx.plexSession))).toEqual(fx.plexSession);
});

test("a session without its user or member flag is refused, not guessed at", () => {
  const { user: _user, ...noUser } = fx.discordSession;
  const { member: _member, ...noMember } = fx.discordSession;
  expect(SessionSchema.safeParse(wire(noUser)).success).toBe(false);
  expect(SessionSchema.safeParse(wire(noMember)).success).toBe(false);
});

test("a session from an older bot gets safe defaults", () => {
  const parsed = SessionSchema.parse({ user: { id: "1", name: "pat" }, member: false });
  expect(parsed.joinPending).toBe(false);
  expect(parsed.user.avatar).toBeNull();
  expect(parsed.admin).toBeUndefined();
  // A value of the wrong type reads as unknown, not as a crash.
  expect(SessionSchema.parse({ ...fx.discordSession, plexName: 5, inGuild: "yes", admin: "no" })).toMatchObject({ plexName: null, inGuild: null, admin: undefined });
});

test("a member's requests parse as sent, ticket thread included", () => {
  const parsed = MediaRequestsSchema.parse(wire(fx.myRequests));
  expect(parsed).toEqual(wire(fx.myRequests));
  expect(parsed[0].help?.thread?.map((e) => e.kind)).toEqual(["member", "reply"]);
});

test("one malformed request is left out, the rest still show", () => {
  const rows = [...wire(fx.myRequests) as object[], { slot: "nine", title: null }, "junk", null];
  expect(MediaRequestsSchema.parse(rows).map((r) => r.slot)).toEqual([7, 8, 3]);
});

test("a stage or kind a newer bot adds is kept as written", () => {
  const [first] = wire(fx.myRequests) as Record<string, unknown>[];
  const newer = { ...first, stage: "seeding", title: { ...(first.title as object), kind: "comic" }, extra: { from: "the future" } };
  const [parsed] = MediaRequestsSchema.parse([newer]);
  expect(parsed.stage).toBe("seeding");
  expect(parsed.title.kind).toBe("comic");
  expect((parsed as Record<string, unknown>).extra).toEqual({ from: "the future" });
});

test("a broken progress or ticket blanks that part, not the request", () => {
  const [first] = wire(fx.myRequests) as Record<string, unknown>[];
  const [parsed] = MediaRequestsSchema.parse([{ ...first, progress: "41%", help: { reason: 3 } }]);
  expect(parsed.slot).toBe(7);
  expect(parsed.progress).toBeNull();
  expect(parsed.help).toBeNull();
});

test("titles: search results, a title page, and odd rows dropped", () => {
  const titles = [fx.bunny, fx.pepper, fx.prideAndPrejudice];
  expect(TitlesSchema.parse(wire(titles))).toEqual(wire(titles));
  expect(TitlesSchema.parse([...wire(titles) as object[], { id: 5, title: "no kind" }])).toHaveLength(3);
  const page = TitleDetailSchema.parse(wire(fx.pepper));
  expect(page.seasons?.map((s) => s.status)).toEqual(["available", "partial", "upcoming"]);
  expect(page.yourRequest).toEqual({ slot: 7, stage: "downloading" });
  // A newer availability is kept as a string; a missing one reads as "none".
  expect(TitleDetailSchema.parse({ ...fx.bunny, availability: "soon" }).availability).toBe("soon");
  const { availability: _a, ...noAvailability } = fx.bunny;
  expect(TitleDetailSchema.parse(noAvailability).availability).toBe("none");
});

test("server status, the household's standings and arrivals parse as sent", () => {
  expect(StatusSchema.parse(wire(fx.status))).toEqual(wire(fx.status));
  expect(CommunitySchema.parse(wire(fx.community))).toEqual(wire(fx.community));
  expect(ArrivalsSchema.parse(wire(fx.arrivals))).toEqual(wire(fx.arrivals));
  expect(DiscoverSchema.parse(wire(fx.discover))).toEqual(wire(fx.discover));
});

test("standings from a quiet server: missing parts become empty, not a crash", () => {
  expect(CommunitySchema.parse({ onAir: null, leaderboard: "x", you: null })).toEqual({ onAir: [], leaderboard: [], you: null });
  expect(StatusSchema.parse({ online: false })).toEqual({ online: false, streams: 0, libraries: [] });
});

test("app sign-in info: today's shape, and one from a bot that hasn't moved", () => {
  expect(MobileInfoSchema.parse(wire(fx.mobileInfo))).toEqual(fx.mobileInfo);
  expect(MobileInfoSchema.parse({ version: "1", auth: ["plex"], push: [], home: null })).toEqual({ version: "1", auth: ["plex"], push: [], home: null });
  expect(MobileInfoSchema.safeParse({ version: "1" }).success).toBe(false);
});

test("the sign-in token is only ever header-safe", () => {
  expect(TokenSchema.parse(wire(fx.token))).toEqual(fx.token);
  for (const bad of ["short", `pxa_${"A".repeat(40)}\r\nX-Evil: 1`, `pxa_${"A".repeat(40)} B`, "A".repeat(513)]) {
    expect(TokenSchema.safeParse({ ...fx.token, token: bad }).success).toBe(false);
  }
  expect(TokenSchema.safeParse({ token: fx.token.token }).success).toBe(false);
});
