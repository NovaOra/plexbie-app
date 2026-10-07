// The one TanStack Query client. Module-level, so signing out can empty it (no account
// ever sees the last one's requests) and so its error hooks never hold a stale callback.
import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { ApiError } from "./client";

let onSignedOut: () => void = () => {};

/** The session sets this: what to do when the server says the sign-in has ended. */
export function whenSignedOut(fn: () => void) { onSignedOut = fn; }

const check = (e: unknown) => { if (e instanceof ApiError && e.signedOut) onSignedOut(); };

export const queryClient = new QueryClient({
  defaultOptions: {
    // The API client already retries reads on a dropped connection or a 5xx.
    queries: { retry: false, staleTime: 15_000, gcTime: 24 * 3600_000 },
    // With no connection a write fails at once ("Couldn't reach the server.") and its change
    // is undone, rather than waiting to go out minutes or hours later, or never.
    mutations: { retry: false, networkMode: "always" },
  },
  queryCache: new QueryCache({ onError: check }),
  mutationCache: new MutationCache({ onError: check }),
});
