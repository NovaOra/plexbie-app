// Shared plumbing for Manage's sections: the query key for a section on this server, and
// an action runner that shows the bot's answer (or its refusal) as a toast.
import { useQueryClient } from "@tanstack/react-query";
import * as haptic from "../../ui/haptics";
import { useCallback, useState } from "react";
import { ApiError } from "../../api/client";
import type { Ack } from "../../api/schemas";
import { useSession } from "../../auth/session";
import { useToast, type ToastIn } from "../../ui/Toast";

export type Section = "requests" | "all" | "tickets" | "joins" | "help" | "people" | "invites" | "plexinvites" | "links" | "cleanup" | "health" | "discord" | "messages";

export function useAdminKey() {
  const { state } = useSession();
  const server = state.phase === "signedIn" ? state.server : "";
  return useCallback((section: Section) => ["admin", server, section] as const, [server]);
}

/**
 * Runs an admin action: marks `key` busy, toasts the outcome, refreshes the sections it
 * touched a moment later (the bot posts to Discord and Plex first). Returns the answer,
 * or null when it failed (already toasted), so callers only handle success. When it went
 * through but the member it was meant for wasn't told (`told: false`), it still counts as
 * done, but the toast says "Not delivered" with the bot's sentence instead of the success.
 * When nobody answered (it may have gone through), it says so, reloads what it touched (and
 * `recheck`) at once, and keeps `key` busy until that's in, so it isn't simply tried again.
 */
export function useAct() {
  const qc = useQueryClient();
  const key = useAdminKey();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const act = useCallback(async (
    id: string | null,
    call: () => Promise<Ack>,
    opts: { done?: (out: Ack) => ToastIn | null; failText?: string; refresh?: Section[]; reward?: boolean; recheck?: () => Promise<unknown> } = {},
  ): Promise<Ack | null> => {
    if (id) setBusy(id);
    let unsure = false;
    try {
      const out = await call();
      if (out.ok === false) throw new Error(out.message || "That didn’t work.");
      const missed = out.told === false;
      if (missed) haptic.error(); else if (opts.reward) haptic.reward(); else haptic.success();
      const t: ToastIn | null = missed ? { tone: "error", text: "Not delivered", detail: out.message || undefined }
        : opts.done ? opts.done(out) : { text: out.message || "Done" };
      if (t) toast(t);
      return out;
    } catch (e) {
      haptic.error();
      unsure = e instanceof ApiError && e.unanswered;
      toast(unsure ? { tone: "error", text: "No answer yet", detail: "It may have gone through. Check before trying again." }
        : { tone: "error", text: opts.failText ?? (e instanceof Error ? e.message : "That didn’t work."),
          detail: opts.failText && e instanceof Error ? e.message : undefined });
      return null;
    } finally {
      if (unsure) {
        await Promise.all([...(opts.refresh ?? []).map((s) => qc.invalidateQueries({ queryKey: key(s) })), opts.recheck?.()]).catch(() => undefined);
      } else {
        for (const s of opts.refresh ?? []) setTimeout(() => void qc.invalidateQueries({ queryKey: key(s) }), 1500);
      }
      if (id) setBusy(null);
    }
  }, [qc, key, toast]);
  return { busy, act };
}
