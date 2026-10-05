import { useQuery } from "@tanstack/react-query";
import { useApi } from "../../auth/session";
import { useAdminKey } from "./useAdmin";

/** What's waiting on an admin (requests to decide, help asked, people asking to join),
 *  for the badge on the Manage tab. Shares its queries with the Manage sections. */
export function useManageWaiting(enabled: boolean): number {
  const client = useApi();
  const key = useAdminKey();
  const every = 60_000;
  const requests = useQuery({ queryKey: key("requests"), queryFn: ({ signal }) => client.adminRequests(signal), refetchInterval: every, enabled });
  const help = useQuery({ queryKey: key("help"), queryFn: ({ signal }) => client.adminHelp(signal), refetchInterval: every, enabled });
  const joins = useQuery({ queryKey: key("joins"), queryFn: ({ signal }) => client.adminJoins(signal), refetchInterval: every, enabled });
  if (!enabled) return 0;
  return (requests.data?.pending.length ?? 0) + (help.data?.filter((h) => h.status === "open").length ?? 0)
    + (joins.data?.filter((j) => j.status === "pending").length ?? 0);
}
