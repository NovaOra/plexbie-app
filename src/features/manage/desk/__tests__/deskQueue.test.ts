// The website's queue logic (copied as it is) on the app's sample household and on an older
// bot's answers: the queue, the monitors and the menu agree, and nothing the older bot
// leaves out (reason codes, posters) breaks a row.
import { afterAll, beforeAll, expect, jest, test } from "@jest/globals";
import { resetSample } from "../../../../api/sample";
import type { AdminTicketRow } from "../../../../api/types";
import { deriveDesk, listFor, type Desk, type DeskData } from "../manageQueue";
import { menuGroups } from "../manageMenu";
import { sampleDesk } from "../__fixtures__/deskSample";

let data: DeskData;
let desk: Desk;
let now: number;
beforeAll(async () => {
  jest.useFakeTimers();
  resetSample();
  data = await sampleDesk();
  now = Date.now();
  desk = deriveDesk(data, now, { me: "Sam" });
});
afterAll(() => { jest.useRealTimers(); });

test("9 things need you, the blocked import and the failing check first", () => {
  expect(desk.counts).toEqual({ needs: "9", waiting: "2" });
  expect(desk.urgent).toBe(2);
  expect(desk.needs.slice(0, 2).map((i) => [i.kind, i.title])).toEqual([["ticket", "Radar Men from the Moon"], ["down", "Discord Public Bot"]]);
  expect(desk.needs.filter((i) => i.kind === "request").map((i) => i.title).sort()).toEqual(["Tears of Steel", "Undersea Kingdom", "Zombies of the Stratosphere"]);
});

test("the monitors count what the queue holds, and the menu says the same", () => {
  const m = Object.fromEntries(desk.monitors.map((x) => [x.area, x]));
  expect([m.requests.count, m.help.count, m.people.count, m.library.count, m.services.count]).toEqual([3, 3, 2, 0, 1]);
  expect([m.help.hot, m.services.hot, m.requests.hot]).toEqual([true, true, false]);
  for (const x of desk.monitors) expect(listFor(desk, "needs", x.area).list).toHaveLength(x.count);
  const groups = menuGroups(desk, data);
  for (const g of groups.filter((x) => x.id !== "discord")) expect(g.count).toBe(m[g.id].count);
});

test("rows carry the bot's posters, and fall back to a request's for the same title", () => {
  const blocked = desk.needs[0];
  expect(blocked.art?.poster).toContain("radar-men");
  const zombies = desk.needs.find((i) => i.title === "Zombies of the Stratosphere");
  expect(zombies?.art?.poster).toContain("zombies");
});

test("an older bot (no reason codes, no posters): a locked-out member isn't urgent, and no row breaks", () => {
  const rows = (data.tickets?.rows ?? []).map(({ reasonCode: _code, poster: _poster, ...t }) => t as AdminTicketRow);
  const lockedOut: AdminTicketRow = { ...rows[0], id: "aaaaaaaaaaaa", subject: "general", title: "", kind: "", requestKey: null, slot: 0, status: "open", waiting: false,
    who: "grandad", reason: "Can’t get in, or nothing plays" };
  const older = deriveDesk({ ...data, tickets: { ...data.tickets!, rows: [...rows, lockedOut] } }, now, { me: "Sam" });
  expect(older.needs.find((i) => i.key === "ticket:aaaaaaaaaaaa")?.group).toBe("today");
  const newer = deriveDesk({ ...data, tickets: { ...data.tickets!, rows: [...rows, { ...lockedOut, reasonCode: "access" }] } }, now, { me: "Sam" });
  expect(newer.needs.find((i) => i.key === "ticket:aaaaaaaaaaaa")?.group).toBe("urgent");
  for (const i of older.needs) expect(typeof i.title).toBe("string");
});

test("a feed that couldn't load makes the count a floor, not a final number", () => {
  const { messages: _gone, ...rest } = data;
  const partial = deriveDesk(rest, now, { me: "Sam", failed: { messages: true } });
  expect(partial.missing).toEqual(["messages"]);
  expect(partial.counts.needs).toBe("8+");
  expect(partial.loading).toBe(false);
});
