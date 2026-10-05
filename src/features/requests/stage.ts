// The same words for each stage as the website (web/src/components/ui.tsx), so a member
// reads the same thing in Discord, on the site and in the app.
import type { RequestStage } from "../../api/types";

const isBook = (kind?: string | null) => kind === "audiobook" || kind === "ebook";
const home = (kind?: string | null) => (isBook(kind) ? "Audiobookshelf" : "Plex");

const LABEL: Record<RequestStage, string> = {
  requested: "Requested", approved: "Approved", upcoming: "Upcoming", searching: "Searching", downloading: "Downloading",
  unpacking: "Unpacking", importing: "Adding to Plex", available: "On Plex", declined: "Declined", closed: "Closed",
};

const HELP: Record<RequestStage, string> = {
  requested: "Waiting for an admin to approve it",
  approved: "Approved, looking for a copy",
  upcoming: "Approved. It isn’t out yet",
  searching: "Approved, looking for a copy",
  downloading: "On its way to Plex",
  unpacking: "Downloaded, SABnzbd is unpacking it",
  importing: "Downloaded, waiting for Plex to add it",
  available: "Ready to watch",
  declined: "Not added",
  closed: "Closed with the old backlog",
};

const known = (s: string): s is RequestStage => s in LABEL;

/** A stage this app doesn't know yet (a newer bot) is shown as the bot wrote it. */
export const stageLabel = (s: string, kind?: string | null) =>
  s === "available" ? `On ${home(kind)}` : s === "importing" ? `Adding to ${home(kind)}` : known(s) ? LABEL[s] : s.charAt(0).toUpperCase() + s.slice(1);

export function stageHelp(s: string, kind?: string | null, format?: string | null) {
  if (isBook(kind)) {
    if (s === "available") return format === "both" ? "Ready to read or listen" : kind === "audiobook" ? "Ready to listen" : "Ready to read";
    if (s === "downloading") return "On its way to Audiobookshelf";
    if (s === "importing") return "Downloaded, being added to Audiobookshelf";
  }
  return known(s) ? HELP[s] : "";
}

/** On the air: something is happening to it right now (the tally light is lit). */
export const isLive = (s: string) => s === "downloading" || s === "unpacking" || s === "importing";
/** Still in the queue: not done, not turned down. */
export const isOpen = (s: string) => !["available", "declined", "closed"].includes(s);

export const formatSlot = (n: number) => String(n).padStart(4, "0");

export function since(iso: string) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}
