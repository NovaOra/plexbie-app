import { useQuery } from "@tanstack/react-query";
import { ApiError } from "../../api/client";
import { useApi, useServer } from "../../auth/session";

/** How long Home's channel waits for what just arrived before it says so and offers another go. */
export const ARRIVALS_DEADLINE_MS = 8_000;

/**
 * Runs `load` with a signal that's aborted after `ms` (or when `outer` is). Past the deadline
 * it ends as a timeout whether or not the load stops, so what waits on it can say so instead
 * of loading forever.
 */
export function withDeadline<T>(load: (signal: AbortSignal) => Promise<T>, ms: number, outer?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  outer?.addEventListener("abort", cancel);
  return new Promise<T>((ok, no) => {
    const timer = setTimeout(() => {
      controller.abort();
      no(new ApiError(0, "The server took too long to answer.", "timeout"));
    }, ms);
    load(controller.signal).then(ok, no).finally(() => {
      clearTimeout(timer);
      outer?.removeEventListener("abort", cancel);
    });
  });
}

/** Plex up or down, how many watching, library sizes. */
export function useStatus() {
  const client = useApi();
  const server = useServer();
  return useQuery({ queryKey: ["status", server], queryFn: ({ signal }) => client.status(signal), refetchInterval: 60_000 });
}

/** Just arrived on Plex and the shelf. Given up on after 8 s (the bot asks Plex for it, and a
 *  slow Plex shouldn't leave the channel loading), so Home can show it off air with Try again. */
export function useArrivals() {
  const client = useApi();
  const server = useServer();
  return useQuery({
    queryKey: ["arrivals", server],
    queryFn: ({ signal }) => withDeadline((s) => client.arrivals(s), ARRIVALS_DEADLINE_MS, signal),
    staleTime: 5 * 60_000,
  });
}

/** Who's watching right now, the board, and your own standing. */
export function useCommunity() {
  const client = useApi();
  const server = useServer();
  return useQuery({ queryKey: ["community", server], queryFn: ({ signal }) => client.community(signal), refetchInterval: 30_000 });
}
