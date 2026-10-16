import { useDesk } from "./desk/useDesk";

/** How many things need an admin, for the badge on the Manage tab: the desk's own Needs you,
 *  from the same queries, so the badge and the queue always say the same number. */
export function useManageWaiting(enabled: boolean): number {
  const { desk } = useDesk(enabled);
  return enabled ? desk.needs.length : 0;
}
