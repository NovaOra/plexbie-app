import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { pub } from "../../api/client";
import { useApi, useSession } from "../../auth/session";
import { disablePush, enablePush, pushState, type PushState } from "./push";

const pushKey = (sample: boolean) => ["push-state", sample];

/** Whether alerts are on in this app on this phone, and switching them. App alerts are the
 *  server's choice too: a Plexbie that doesn't send them (APP_PUSH off, the default) says so
 *  in GET /api/mobile, and then its website's alerts are the way.
 *
 *  One answer for every row that asks (Phone alerts, Live progress, the offer after a
 *  request), so switching alerts here shows in all of them. It's looked at again whenever
 *  the app comes back to the front or the screen comes back into view: alerts allowed or
 *  refused in the phone's settings show as soon as the person returns. */
export function usePush() {
  const client = useApi();
  const queries = useQueryClient();
  const { state } = useSession();
  const sample = state.phase === "signedIn" && state.sample;
  const server = state.phase === "signedIn" && !state.sample ? state.server : "";
  const offered = useQuery({
    queryKey: ["mobile-info", server],
    queryFn: () => pub.mobileInfo(server),
    enabled: !!server,
    staleTime: 60 * 60_000,
  });
  /** This Plexbie doesn't send app alerts (not this phone's doing). */
  const serverOff = !!offered.data && !(offered.data.push ?? []).includes("expo");
  // Only this phone's Keychain and permissions, so cheap: never taken as fresh, and checked
  // again each time the app is back in front (TanStack's focus refetch, _layout.tsx). No
  // network involved, so it runs offline too.
  const checked = useQuery({
    queryKey: pushKey(sample),
    queryFn: (): Promise<PushState> => (sample ? Promise.resolve("unavailable") : pushState()),
    staleTime: 0,
    networkMode: "always",
  });
  const { refetch } = checked;
  useFocusEffect(useCallback(() => { void refetch({ cancelRefetch: false }); }, [refetch]));
  /** The phone couldn't say (its Keychain or permissions failed): shown as not available. */
  const failed = checked.isError && checked.data === undefined;
  const status: PushState | null = checked.data ?? (failed ? "unavailable" : null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const set = useCallback(async (on: boolean) => {
    setBusy(true);
    setProblem(null);
    try {
      const next = on ? await enablePush(client) : await disablePush(client);
      // A check that started before this finished (coming back from the permission prompt) is out of date.
      await queries.cancelQueries({ queryKey: pushKey(sample) });
      queries.setQueryData(pushKey(sample), next);
    }
    catch (e) {
      const why = e instanceof Error ? e.message : "Couldn’t change alerts just now.";
      // Turning off: the bot didn't hear it, so it still sends them.
      setProblem(on ? why : `Alerts are still on. ${why}`);
      // Whatever got as far as the phone (a permission given, a token kept) shows as it is.
      void queries.invalidateQueries({ queryKey: pushKey(sample) });
    }
    finally { setBusy(false); }
  }, [client, queries, sample]);
  return { status: serverOff && status !== "on" ? "unavailable" as const : status, serverOff, failed, busy, problem, set };
}
