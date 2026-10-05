import { NativeTabs } from "expo-router/unstable-native-tabs";
import { Platform } from "react-native";
import { JoinScreen } from "../../features/join/JoinScreen";
import { useManageWaiting } from "../../features/manage/useManageWaiting";
import { useMe } from "../../features/me/useMe";
import { color } from "../../ui/theme";

// The platform's own tab bar (UITabBar / Material bottom navigation): its feel, its
// accessibility and its haptics, nothing rebuilt in JS. Tab switches don't animate.
// On iOS 26 it's the floating Liquid Glass bar, so it gets no colour of its own (a
// background would make it opaque), and it tucks away as you scroll down a page.
// Five at most (Android's bottom navigation holds five): You opens from Home's header. Someone signed in who isn't on Plex yet
// sees the join screen instead: there's nothing in the tabs they're allowed to load.
export default function AppTabs() {
  const me = useMe();
  const admin = !!me.data?.admin;
  // A small count on Manage when something's waiting on an admin, wherever they are.
  const waiting = useManageWaiting(admin);
  if (me.data && !me.data.member && !me.data.admin) return <JoinScreen me={me.data} />;
  return (
    <NativeTabs
      tintColor={color.screen}
      badgeBackgroundColor={color.tally}
      badgeTextColor={color.field}
      {...(Platform.OS === "ios" ? IOS : ANDROID)}
    >
      <NativeTabs.Trigger name="home">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="tv" md="live_tv" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="search">
        <NativeTabs.Trigger.Label>Request</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="magnifyingglass" md="search" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="requests">
        <NativeTabs.Trigger.Label>Requests</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="calendar" md="event_note" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="library">
        <NativeTabs.Trigger.Label>Library</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="square.grid.2x2" md="video_library" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="manage" hidden={!admin}>
        <NativeTabs.Trigger.Label>Manage</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="checklist" md="fact_check" />
        {/* No text at all when nothing waits: with any text (even "0") the badge shows, hidden or not. */}
        <NativeTabs.Trigger.Badge hidden={!waiting}>{waiting ? (waiting > 99 ? "99+" : String(waiting)) : undefined}</NativeTabs.Trigger.Badge>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

const IOS = { minimizeBehavior: "onScrollDown" } as const;
const ANDROID = {
  backgroundColor: color.fieldDeep,
  iconColor: color.slateInk,
  labelStyle: { color: color.slateInk },
  indicatorColor: color.panelRaised,
} as const;
