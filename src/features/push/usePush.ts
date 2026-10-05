import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { pub } from "../../api/client";
import { useApi, useSession } from "../../auth/session";
import { disablePush, enablePush, pushState, type PushState } from "./push";

/** Whether alerts are on in this app on this phone, and switching them. App alerts are the
 *  server's choice too: a Plexbie that doesn't send them (APP_PUSH off, the default) says so
 *  in GET /api/mobile, and then its website's alerts are the way. */
export function usePush() {
  const client = useApi();
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
  const [status, setStatus] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => { void pushState().then((s) => setStatus(sample ? "unavailable" : s)); }, [sample]);
  const set = useCallback(async (on: boolean) => {
    setBusy(true);
    setProblem(null);
    try { setStatus(on ? await enablePush(client) : await disablePush(client)); }
    catch (e) { setProblem(e instanceof Error ? e.message : "Couldn’t change alerts just now."); }
    finally { setBusy(false); }
  }, [client]);
  return { status: serverOff && status !== "on" ? "unavailable" as const : status, serverOff, busy, problem, set };
}
