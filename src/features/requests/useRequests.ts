import { useQuery } from "@tanstack/react-query";
import { useApi, useSession } from "../../auth/session";
import { isLive } from "./stage";

export function useRequests() {
  const client = useApi();
  const { state } = useSession();
  const server = state.phase === "signedIn" ? state.server : "";
  return useQuery({
    queryKey: ["requests", server],
    queryFn: ({ signal }) => client.myRequests(signal),
    // Something on the air: check again every 10 s, as the website does. Otherwise a
    // minute is plenty (push tells the person when a request moves).
    refetchInterval: (q) => (q.state.data?.some((r) => isLive(r.stage)) ? 10_000 : 60_000),
  });
}
