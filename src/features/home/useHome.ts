import { useQuery } from "@tanstack/react-query";
import { useApi, useSession } from "../../auth/session";

function useServer() {
  const { state } = useSession();
  return state.phase === "signedIn" ? state.server : "";
}

/** Plex up or down, how many watching, library sizes. */
export function useStatus() {
  const client = useApi();
  const server = useServer();
  return useQuery({ queryKey: ["status", server], queryFn: ({ signal }) => client.status(signal), refetchInterval: 60_000 });
}

/** Just arrived on Plex and the shelf. */
export function useArrivals() {
  const client = useApi();
  const server = useServer();
  return useQuery({ queryKey: ["arrivals", server], queryFn: ({ signal }) => client.arrivals(signal), staleTime: 5 * 60_000 });
}

/** Who's watching right now, the board, and your own standing. */
export function useCommunity() {
  const client = useApi();
  const server = useServer();
  return useQuery({ queryKey: ["community", server], queryFn: ({ signal }) => client.community(signal), refetchInterval: 30_000 });
}
