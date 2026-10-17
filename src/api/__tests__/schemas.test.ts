// The runtime checks at the network edge, against answers shaped like the bot's: what the
// bot sends today passes untouched, a newer bot's extras pass through, and one odd row is
// dropped instead of failing the whole screen.
import { expect, test } from "@jest/globals";
import {
  AckSchema, AdminCleanupSchema, AdminTicketDetailSchema, BlockedListSchema, AdminTicketsSchema, ArrivalsSchema, CommunitySchema, DiscoverSchema, MediaRequestsSchema, MessagePeopleSchema,
  MobileInfoSchema, MyTicketsSchema, NewTicketSchema, SessionSchema, SignedOutOthersSchema, StatusSchema, TitleDetailSchema, TitlesSchema, TokenSchema,
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
  // A request's ticket says nothing of what it's about: it's on the request.
  const sent = wire(fx.myRequests) as { help?: object }[];
  expect(parsed).toEqual(sent.map((r) => (r.help ? { ...r, help: { ...r.help, subject: "request" } } : r)));
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

test("sign out every other session: the count of app sign-ins it ended comes through, and an answer without it is refused", () => {
  const sent = { ok: true, ended: 2, message: "Signed out every other website sign-in and 2 app sign-ins." };
  expect(SignedOutOthersSchema.parse(wire(sent))).toEqual(sent);
  expect(SignedOutOthersSchema.safeParse({ ok: true, message: "Done." }).success).toBe(false);
});

test("the member's own tickets parse as sent: about a film, on a request, and general", () => {
  const parsed = MyTicketsSchema.parse(wire(fx.myTickets));
  expect(parsed).toEqual(wire(fx.myTickets));
  expect(parsed.map((t) => t.subject)).toEqual(["title", "request", "general"]);
});

test("the member's own tickets read the bot's poster; a general one, an older bot's or an odd value has none", () => {
  const parsed = MyTicketsSchema.parse(wire(fx.myTickets));
  expect(parsed.map((t) => t.poster ?? null)).toEqual(["/img/tmdb/w185/sintel.jpg?v=2", "/img/tmdb/w185/pepper.jpg?v=2", null]);
  const older = fx.myTickets.map(({ poster: _, ...t }) => t);
  expect(MyTicketsSchema.parse(wire(older)).map((t) => t.poster ?? null)).toEqual([null, null, null]);
  expect(MyTicketsSchema.parse([{ ...fx.myTickets[0], poster: 5 }])[0].poster ?? null).toBeNull();
});

test("a ticket with odd values reads safely, an unknown subject as a request's, and a broken row is left out", () => {
  const [odd, ...rest] = MyTicketsSchema.parse([
    { id: "0a1b2c3d4e5f", subject: "account", title: 5, slot: "seven", waiting: "yes", status: 1, thread: "none", createdAt: null },
    { subject: "title", title: "No id" }, "junk", null,
  ]);
  expect(rest).toEqual([]);
  expect(odd).toMatchObject({ subject: "request", title: null, slot: null, waiting: false, status: "open", reason: "", thread: [], createdAt: "", updatedAt: "" });
});

test("a title page: an older bot says nothing of tickets, 1.0.7 says whether it's on Plex and the member's open ticket", () => {
  const older = TitleDetailSchema.parse(wire(fx.bunny));
  expect(older.onPlex).toBeUndefined();
  expect(older.yourTicket ?? null).toBeNull();
  const newer = TitleDetailSchema.parse(wire({ ...fx.bunny, onPlex: true, yourTicket: { id: "0a1b2c3d4e5f", reason: "Won't play on Plex", subject: "title", status: "open", waiting: true, thread: [] } }));
  expect(newer.onPlex).toBe(true);
  expect(newer.yourTicket).toMatchObject({ id: "0a1b2c3d4e5f", subject: "title", waiting: true });
  // Odd values: no ticket button (as on an older bot), and no ticket.
  const odd = TitleDetailSchema.parse({ ...fx.bunny, onPlex: "yes", yourTicket: "h1" });
  expect(odd.onPlex).toBeUndefined();
  expect(odd.yourTicket).toBeNull();
});

test("Manage's tickets: an older bot's are on a request; 1.0.7 says what each is about", () => {
  const older = { id: "abc123abc123", requestKey: "7", slot: 7, title: "Pepper & Carrot", kind: "tv", seasons: [2], who: "pat", reason: "Stuck downloading",
    status: "open", waiting: false, createdAt: "2026-10-05T09:00:00Z", updatedAt: "2026-10-05T09:00:00Z", count: 1 };
  const general = { ...older, id: "123456abcdef", subject: "general", requestKey: null, slot: 0, title: "", kind: "", seasons: null };
  const { rows } = AdminTicketsSchema.parse(wire({ rows: [older, fx.titleTicket, general], counts: { action: 3, waiting: 0, solved: 0 } }));
  expect(rows.map((t) => [t.subject, t.requestKey, t.slot, t.title, t.tmdb ?? null])).toEqual([
    ["request", "7", 7, "Pepper & Carrot", null], ["title", null, 0, "Sintel", "900104"], ["general", null, 0, "", null],
  ]);
  const detail = AdminTicketDetailSchema.parse(wire(fx.titleTicket));
  expect(detail.plexUrl).toBe(fx.titleTicket.plexUrl);
  expect(detail.statusThen?.split("\n")).toHaveLength(2);
  expect(AdminTicketDetailSchema.parse(wire({ ...fx.titleTicket, plexUrl: 4 })).plexUrl).toBeNull();
});

test("a new ticket's answer: the help id always, the ticket as the list has it when it's there", () => {
  const sent = { ok: true, message: "Sent. An admin will take a look and get back to you.", help: { id: "0a1b2c3d4e5f", reason: "Picture looks wrong" }, ticket: fx.myTickets[0] };
  expect(NewTicketSchema.parse(wire(sent))).toEqual(wire(sent));
  expect(NewTicketSchema.parse({ ...sent, ticket: "odd" }).ticket).toBeNull();
  expect(NewTicketSchema.safeParse({ ok: true, message: "Sent." }).success).toBe(false);
});

test("a person's open ticket on Messages: an older bot's is on a request", () => {
  const person = { id: "d1", name: "pat", count: 1, received: 1, failed: 0, via: ["discord"],
    last: { at: "2026-10-05T09:00:00Z", text: "Hi", channel: "discord", delivered: true, direction: "in" } };
  const [older, newer] = MessagePeopleSchema.parse([
    { ...person, ticket: { id: "abc123abc123", title: "Pepper & Carrot", slot: 7 } },
    { ...person, id: "d2", ticket: { id: "123456abcdef", title: "", slot: 0, subject: "general" } },
  ]);
  expect(older.ticket?.subject).toBe("request");
  expect(newer.ticket?.subject).toBe("general");
});

test("Manage from a bot before reason codes and posters: everything still reads, the new fields empty", () => {
  const [ticket] = AdminTicketsSchema.parse(wire(fx.oldBot.tickets)).rows;
  expect(ticket).toMatchObject({ id: "abc123abc123", reason: "Stuck downloading" });
  expect(ticket.reasonCode).toBeUndefined();
  expect(ticket.poster ?? null).toBeNull();
  expect(BlockedListSchema.parse(wire(fx.oldBot.blocked)).rows[0].poster ?? null).toBeNull();
  const cleanup = AdminCleanupSchema.parse(wire(fx.oldBot.cleanup));
  expect([cleanup.warning[0].poster ?? null, cleanup.exempt[0].poster ?? null]).toEqual([null, null]);
  expect(AckSchema.parse(wire(fx.oldBot.take)).changed).toBeUndefined();
});

test("Manage from a newer bot: reason codes, posters and an unchanged take come through; odd values read as missing", () => {
  const row = { ...fx.oldBot.tickets.rows[0], reasonCode: "stuck", poster: "https://image.tmdb.org/t/p/w342/a.jpg" };
  expect(AdminTicketsSchema.parse(wire({ ...fx.oldBot.tickets, rows: [row] })).rows[0]).toMatchObject({ reasonCode: "stuck", poster: row.poster });
  expect(AdminTicketsSchema.parse({ ...fx.oldBot.tickets, rows: [{ ...row, reasonCode: 4, poster: 5 }] }).rows[0]).toMatchObject({ reasonCode: undefined, poster: null });
  expect(AckSchema.parse({ ok: true, changed: false, message: "It’s already yours." }).changed).toBe(false);
});
