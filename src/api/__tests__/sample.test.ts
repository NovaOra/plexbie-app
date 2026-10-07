// The sample household: each visit starts from the same invented household, whatever the
// last one changed; a blocked download that's imported leaves the waiting list and closes
// its ticket; every title it shows opens its own page; and nobody's address is a real one.
import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import { resetSample, sampleApi } from "../sample";
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
