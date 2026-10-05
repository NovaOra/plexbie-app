import { useQuery } from "@tanstack/react-query";
import { useApi } from "../../auth/session";
import { useAdminKey } from "./useAdmin";

/** What's waiting on an admin (requests to decide, tickets needing an admin, people asking to join,
 *  conversations with new DMs),
 *  for the badge on the Manage tab. Shares its queries with the Manage sections. */
export function useManageWaiting(enabled: boolean): number {
  const client = useApi();
  const key = useAdminKey();
  const every = 60_000;
  const requests = useQuery({ queryKey: key("requests"), queryFn: ({ signal }) => client.adminRequests(signal), refetchInterval: every, enabled });
  const tickets = useQuery({ queryKey: key("tickets"), queryFn: ({ signal }) => client.adminTickets(signal), refetchInterval: every, enabled });
  const joins = useQuery({ queryKey: key("joins"), queryFn: ({ signal }) => client.adminJoins(signal), refetchInterval: every, enabled });
  const messages = useQuery({ queryKey: key("messages"), queryFn: ({ signal }) => client.adminMessages(signal), refetchInterval: every, enabled });
  if (!enabled) return 0;
  return (requests.data?.pending.length ?? 0) + (tickets.data?.counts.action ?? 0)
    + (joins.data?.filter((j) => j.status === "pending").length ?? 0)
    + (messages.data?.filter((p) => p.unread > 0).length ?? 0);
}
