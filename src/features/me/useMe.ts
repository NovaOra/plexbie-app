import { useQuery } from "@tanstack/react-query";
import { useApi, useServer } from "../../auth/session";

/** Who's signed in and what they may do (member, admin), from the bot's live view. */
export function useMe() {
  const client = useApi();
  const server = useServer();
  return useQuery({
    queryKey: ["session", server],
    queryFn: ({ signal }) => client.session(signal),
    staleTime: 60_000,
  });
}
