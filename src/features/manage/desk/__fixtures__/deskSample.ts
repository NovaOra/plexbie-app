// The sample household's Manage feeds, as the desk loads them (the sample answers after a pause).
import { jest } from "@jest/globals";
import { sampleApi } from "../../../../api/sample";
import type { DeskData } from "../manageQueue";

export async function sampleDesk(): Promise<DeskData> {
  const s = sampleApi;
  const asked = Promise.all([s.adminRequests(), s.adminAll(""), s.adminTickets(), s.adminJoins(), s.adminInvites(), s.plexInvites(),
    s.adminPeople(), s.adminCleanup(), s.adminDiscord(), s.adminMessages(), s.adminHealth(), s.adminBlocked()]);
  await jest.advanceTimersByTimeAsync(5_000);
  const [requests, all, tickets, joins, invites, plexinvites, people, cleanup, discord, messages, health, blocked] = await asked;
  return { requests, all, tickets, joins, invites, plexinvites, people, cleanup, discord, messages, health, blocked: blocked.rows } as unknown as DeskData;
}
