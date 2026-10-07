// Help notes not sent yet, by server and request: Android swipes the help sheet away without
// asking, and opening it again brings the note back. Sending or discarding one clears it, and
// signing out or in clears them all, so one person's note never shows for the next.
import type { HelpReason } from "../../api/types";

export const helpDrafts = new Map<string, { reason: HelpReason | null; note: string }>();
