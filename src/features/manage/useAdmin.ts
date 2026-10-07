// Shared plumbing for Manage's sections: the query key for a section on this server, and
// an action runner that shows the bot's answer (or its refusal) as a toast.
import { useQueryClient } from "@tanstack/react-query";
import * as haptic from "../../ui/haptics";
import { useCallback, useRef, useState } from "react";
import { ApiError } from "../../api/client";
import { checkSignedOut } from "../../api/query";
import type { Ack } from "../../api/schemas";
import { useServer } from "../../auth/session";
import { useToast, type ToastIn } from "../../ui/Toast";

export type Section = "requests" | "all" | "tickets" | "joins" | "people" | "invites" | "plexinvites" | "links" | "cleanup" | "health" | "discord" | "messages";

export function useAdminKey() {
  const server = useServer();
  return useCallback((section: Section) => ["admin", server, section] as const, [server]);
}

/**
 * Runs an admin action: marks `id` busy, toasts the outcome, refreshes the sections it
 * touched a moment later (the bot posts to Discord and Plex first). Returns the answer,
 * or null when it failed (already toasted), so callers only handle success. When it went
 * through but the member it was meant for wasn't told (`told: false`), it still counts as
 * done, but the toast says "Not delivered" with the bot's sentence instead of the success.
 * When nobody answered (it may have gone through), it says so, reloads what it touched (and
 * `recheck`) at once, and keeps `id` busy until that's in, so it isn't simply tried again.
 * Several can be on their way at once, each busy until its own is in; another call with an
 * id that's still on its way is ignored (null, nothing toasted). A refusal because the
 * sign-in has ended signs out, as it does for a read. `onFail` hears the failure as toasted,
 * for a sheet the toast would sit behind, and whether it was that no answer came.
 * `busy` is the latest id still on its way (or null); `isBusy(id)` asks about one.
 */
export function useAct() {
  const qc = useQueryClient();
  const key = useAdminKey();
  const toast = useToast();
  const [running, setRunning] = useState<string[]>([]);
  // Read and written in the same tick as the press, so a quick second tap is caught too.
  const inFlight = useRef(new Set<string>());
  const act = useCallback(async (
    id: string | null,
    call: () => Promise<Ack>,
    opts: {
      done?: (out: Ack) => ToastIn | null; failText?: string; refresh?: Section[]; reward?: boolean; recheck?: () => Promise<unknown>;
      onFail?: (t: ToastIn, unanswered: boolean) => void;
    } = {},
  ): Promise<Ack | null> => {
    if (id) {
      if (inFlight.current.has(id)) return null;
      inFlight.current.add(id);
      setRunning((r) => [...r, id]);
    }
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
      checkSignedOut(e);
      haptic.error();
      unsure = e instanceof ApiError && e.unanswered;
      const t: ToastIn = unsure ? { tone: "error", text: "No answer yet", detail: "It may have gone through. Check before trying again." }
        : { tone: "error", text: opts.failText ?? (e instanceof Error ? e.message : "That didn’t work."),
          detail: opts.failText && e instanceof Error ? e.message : undefined };
      toast(t);
      opts.onFail?.(t, unsure);
      return null;
    } finally {
      if (unsure) {
        await Promise.all([...(opts.refresh ?? []).map((s) => qc.invalidateQueries({ queryKey: key(s) })), opts.recheck?.()]).catch(() => undefined);
      } else {
        for (const s of opts.refresh ?? []) setTimeout(() => void qc.invalidateQueries({ queryKey: key(s) }), 1500);
      }
      if (id) {
        inFlight.current.delete(id);
        setRunning((r) => r.filter((x) => x !== id));
      }
    }
  }, [qc, key, toast]);
  const isBusy = useCallback((id: string) => running.includes(id), [running]);
  return { busy: running.at(-1) ?? null, isBusy, act };
}
