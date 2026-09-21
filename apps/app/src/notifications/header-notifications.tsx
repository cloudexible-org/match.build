import { NotificationsMenu } from "./notifications-menu";
import { useNotifications } from "./use-notifications";

/**
 * The notifications bell as the header mounts it: the overlay, plus wherever
 * its list comes from. Split from `NotificationsMenu` so that component stays
 * a pure view — the thing worth looking at in isolation — and everything that
 * knows about the backend lives in `useNotifications`.
 */
export function HeaderNotifications() {
  const { items, markAllRead } = useNotifications();
  return <NotificationsMenu items={items} onOpen={markAllRead} />;
}
