// Which seasons can still be asked for, and what to send. The website's rules
// (web/src/pages/TitlePage.tsx), so the app and the site never disagree.
import type { AppTitle } from "../../api/schemas";

export type SeasonPick = "latest" | number[];
type Season = NonNullable<AppTitle["seasons"]>[number];

/** Missing, or only partly on Plex: the only seasons a request can be for. */
export const openSeasons = (t: AppTitle): Season[] =>
  (t.seasons ?? []).filter((s) => !s.status || s.status === "none" || s.status === "partial");

/** The newest season that has aired. */
export function newestAired(t: AppTitle): number | null {
  const aired = (t.seasons ?? []).filter((s) => s.status !== "upcoming").map((s) => s.n);
  return aired.length ? Math.max(...aired) : null;
}

/** What goes to the bot: "all" only when nothing is on Plex or requested yet and every missing season is picked. */
export function seasonsToSend(t: AppTitle, pick: SeasonPick): number[] | "all" | "latest" {
  if (pick === "latest") return "latest";
  const nothingYet = (t.seasons ?? []).every((s) => !s.status || s.status === "none" || s.status === "upcoming");
  return nothingYet && pick.length === openSeasons(t).length ? "all" : pick;
}

export function seasonSummary(pick: SeasonPick) {
  if (pick === "latest") return "the latest season, plus new episodes as they air";
  return pick.length === 1 ? `season ${pick[0]}` : `seasons ${pick.join(", ")}`;
}

export function sendLabel(pick: SeasonPick) {
  if (Array.isArray(pick) && !pick.length) return "Pick seasons to request";
  if (pick === "latest") return "Request the latest season";
  return pick.length === 1 ? `Request season ${pick[0]}` : `Request ${pick.length} seasons`;
}
