// Help notes not sent yet, by server and request: Android swipes the help sheet away without
// asking, and opening it again brings the note back. Sending or discarding one clears it, and
// signing out or in clears them all, so one person's note never shows for the next. The same
// for a new ticket's note, by server and what it's about (a film or show, or general).
import type { HelpReason, TicketReason } from "../../api/types";

export const helpDrafts = new Map<string, { reason: HelpReason | null; note: string }>();
export const ticketDrafts = new Map<string, { reason: TicketReason | null; note: string }>();
