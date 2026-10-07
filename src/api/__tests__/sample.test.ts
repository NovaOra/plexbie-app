// The sample household: each visit starts from the same invented household, whatever the
// last one changed; a blocked download that's imported leaves the waiting list and closes
// its ticket; every title it shows opens its own page; nobody's address is a real one; and
// every screen tells the same story about the same requests, people and services.
import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import { resetSample, sampleApi, samplePlexTitles } from "../sample";
import type { MediaKind } from "../types";

/** The sample answers after a short pause, as a server would. */
async function answer<T>(call: Promise<T>): Promise<T> {
  await jest.advanceTimersByTimeAsync(5_000);
  return call;
}

beforeEach(() => {
  jest.useFakeTimers();
  resetSample();
});
afterEach(() => { jest.useRealTimers(); });

test("a new visit doesn't show what the last one decided", async () => {
  await sampleApi.saveLanguages(["ja"]);
  await answer(sampleApi.decideJoin("9301", true));
  await answer(sampleApi.plexInviteCancel("jordan@example.com"));
  await answer(sampleApi.request({ kind: "movie", id: "900003" }));
  await answer(sampleApi.ticketStatus("h1", "resolved"));
  await answer(sampleApi.decide("7001", true));
  await answer(sampleApi.inboxSettings(false));

  resetSample();

  expect((await sampleApi.prefs()).languages).toEqual([]);
  expect((await answer(sampleApi.adminJoins())).find((j) => j.messageId === "9301")?.status).toBe("pending");
  expect((await answer(sampleApi.plexInvites())).map((i) => i.email)).toContain("jordan@example.com");
  expect((await answer(sampleApi.myRequests())).map((r) => r.title.title)).not.toContain("Night of the Living Dead");
  expect((await answer(sampleApi.title("movie", "900003"))).yourRequest).toBeUndefined();
  expect((await answer(sampleApi.adminTicket("h1"))).status).toBe("open");
  expect((await answer(sampleApi.adminRequests())).pending.map((r) => r.id)).toContain("7001");
  expect((await sampleApi.adminDiscord()).inbox?.autoreply).toBe(true);
});

test("importing the blocked download takes it off the list and closes its ticket", async () => {
  expect((await answer(sampleApi.adminBlocked())).rows.map((r) => r.ticket)).toEqual(["h4"]);
  await answer(sampleApi.blockedImport("sonarr", "SABnzbd_nzo_demo"));

  expect((await answer(sampleApi.adminBlocked())).rows).toEqual([]);
  const ticket = await answer(sampleApi.adminTicket("h4"));
  expect(ticket.status).toBe("resolved");
  expect(ticket.blocked).toBeNull();
  expect(ticket.thread.map((e) => e.text)).toContain("Solved");

  // And it's waiting again on the next visit.
  resetSample();
  expect((await answer(sampleApi.adminBlocked())).rows).toHaveLength(1);
});

test("a call still waiting when the visit ends leaves the next visit alone", async () => {
  const importing = sampleApi.blockedImport("sonarr", "SABnzbd_nzo_demo");
  const failed = expect(importing).rejects.toThrow("That sample visit has ended.");
  resetSample();
  await jest.advanceTimersByTimeAsync(5_000);
  await failed;

  expect((await answer(sampleApi.adminBlocked())).rows.map((r) => r.ticket)).toEqual(["h4"]);
  expect((await answer(sampleApi.adminTicket("h4"))).status).toBe("open");
});

test("every season a request asks for is one its show has", async () => {
  const rows = [
    ...(await answer(sampleApi.myRequests())),
    ...(await answer(sampleApi.adminAll("", undefined, true))).rows,
  ];
  for (const r of rows.filter((x) => x.title.kind === "tv" && x.seasons?.length)) {
    const page = await answer(sampleApi.title("tv", r.title.id));
    const has = (page.seasons ?? []).map((n) => String(n.n));
    for (const n of r.seasons ?? []) expect(`${r.title.title} season ${n}`).toBe(has.includes(String(n)) ? `${r.title.title} season ${n}` : "missing");
  }
});

test("every title the household shows opens its own page", async () => {
  const shown = [
    ...(await answer(sampleApi.myRequests())).map((r) => r.title),
    ...(await answer(sampleApi.arrivals())).map((a) => a.title),
    ...(await answer(sampleApi.adminAll("", undefined, true))).rows.map((r) => r.title),
  ];
  for (const t of shown) {
    const page = await answer(sampleApi.title(t.kind as MediaKind, t.id));
    expect(`${t.kind} ${t.id} ${page.title}`).toBe(`${t.kind} ${t.id} ${t.title}`);
  }
});

test("each title has one id, and each id one title", async () => {
  const all = await answer(sampleApi.searchAll(""));
  const titles = [...all.movie, ...all.tv, ...all.book];
  const ids = new Map<string, string>();
  for (const t of titles) {
    expect(ids.get(t.id) ?? t.title).toBe(t.title);
    ids.set(t.id, t.title);
  }
  // Books too: an ebook is found by a book search as well as an audiobook.
  expect(all.book.map((t) => t.kind)).toEqual(expect.arrayContaining(["audiobook", "ebook"]));
});

test("every email address in the household is a reserved example one", async () => {
  const emails = [
    ...(await answer(sampleApi.plexInvites())).map((i) => i.email),
    ...(await answer(sampleApi.adminJoins())).map((j) => j.email),
    ...(await answer(sampleApi.adminInvites())).map((i) => i.email),
  ].filter(Boolean);
  expect(emails.length).toBeGreaterThan(0);
  for (const email of emails) expect(email).toMatch(/@example\.(com|org|net)$/);
});

test("signing out every other session in the household says how many app sign-ins ended", async () => {
  expect(await answer(sampleApi.signOutOthers())).toEqual({ ok: true, ended: 2, message: "Signed out every other website sign-in and 2 app sign-ins." });
});

test("each request number is one title on every screen, a new request included", async () => {
  await answer(sampleApi.request({ kind: "movie", id: "900003" }));
  const admin = await answer(sampleApi.adminRequests());
  const seen: [number, string][] = [
    ...(await answer(sampleApi.myRequests())).map((r): [number, string] => [r.slot, r.title.title]),
    ...[...admin.pending, ...admin.recent].map((r): [number, string] => [r.slot, r.title]),
    ...(await answer(sampleApi.adminAll("", undefined, true))).rows.map((r): [number, string] => [r.slot, r.title.title]),
    ...(await answer(sampleApi.adminTickets())).rows.map((t): [number, string] => [t.slot, t.title]),
  ];
  const titles = new Map<number, string>();
  for (const [slot, title] of seen) {
    expect(`${slot} ${title}`).toBe(`${slot} ${titles.get(slot) ?? title}`);
    titles.set(slot, title);
  }
});

test("your own requests are yours under All requests, and a recent decision names the same approver", async () => {
  const me = (await sampleApi.session())?.user.name;
  const rows = (await answer(sampleApi.adminAll("", undefined, true))).rows;
  for (const r of await answer(sampleApi.myRequests())) expect(`${r.slot} ${rows.find((x) => x.slot === r.slot)?.requester}`).toBe(`${r.slot} ${me}`);
  for (const r of (await answer(sampleApi.adminRequests())).recent.filter((x) => x.status === "approved")) {
    const row = rows.find((x) => x.slot === r.slot);
    expect(`${r.slot} ${row?.stage} ${row?.approvedBy}`).toBe(`${r.slot} ${row?.stage} ${r.resolvedBy}`);
    expect(row?.stage).not.toBe("requested");
  }
});

test("a request waiting for a decision is in Manage > Requests, and deciding it moves it on everywhere", async () => {
  const pending = (await answer(sampleApi.adminRequests())).pending.map((r) => r.slot);
  const waiting = (await answer(sampleApi.adminAll("", undefined, true))).rows.filter((r) => r.status === "pending").map((r) => r.slot);
  expect(waiting.length).toBeGreaterThan(0);
  for (const slot of waiting) expect(pending).toContain(slot);

  await answer(sampleApi.decide("7003", true));
  expect((await answer(sampleApi.myRequests())).find((r) => r.slot === 209)?.stage).toBe("approved");
  expect((await answer(sampleApi.adminAll("", undefined, true))).rows.find((r) => r.slot === 209)?.status).toBe("approved");
  expect((await answer(sampleApi.title("movie", "693134"))).yourRequest?.stage).toBe("approved");
});

test("nobody warned is in the top three or watching now, and the top three are the board's", async () => {
  const people = await answer(sampleApi.adminPeople());
  const name = (p: (typeof people)[number]) => p.displayName ?? p.discordName ?? p.plexName;
  const { onAir, leaderboard } = await answer(sampleApi.community());
  const top = leaderboard.slice(0, 3).map((l) => l.name);
  expect(people.some((p) => p.warned)).toBe(true);
  for (const p of people.filter((x) => x.warned)) expect([...top, ...onAir.map((a) => a.member)]).not.toContain(name(p));
  for (const p of people.filter((x) => x.topThree)) expect(top).toContain(name(p));
});

test("Keep a title forever offers exactly the films and shows that are on Plex", async () => {
  const all = await answer(sampleApi.searchAll(""));
  const onPlex = [...all.movie, ...all.tv].filter((t) => t.availability === "available")
    .map((t) => `${t.title} (${t.kind === "tv" ? "show" : "movie"} ${t.year})`);
  expect(samplePlexTitles.map((t) => `${t.title} (${t.type} ${t.year})`).sort()).toEqual(onPlex.sort());
  expect((await answer(sampleApi.cleanupSearch("night"))).map((t) => t.title)).toEqual(["Night of the Living Dead"]);
});

test("a service Health says is down isn't one a request is waiting on", async () => {
  const down = (await answer(sampleApi.adminHealth())).filter((c) => !c.ok).map((c) => c.name);
  expect(down.length).toBeGreaterThan(0);
  const details = [
    ...(await answer(sampleApi.myRequests())),
    ...(await answer(sampleApi.adminAll("", undefined, true))).rows,
  ].map((r) => r.progress?.detail ?? "");
  for (const service of down) for (const detail of details) expect(detail).not.toContain(service);
});
