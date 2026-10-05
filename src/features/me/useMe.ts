import { useQuery } from "@tanstack/react-query";
import { useApi, useSession } from "../../auth/session";

/** Who's signed in and what they may do (member, admin), from the bot's live view. */
export function useMe() {
  const client = useApi();
  const { state } = useSession();
  return useQuery({
    queryKey: ["session", state.phase === "signedIn" ? state.server : ""],
    queryFn: ({ signal }) => client.session(signal),
    staleTime: 60_000,
  });
}
