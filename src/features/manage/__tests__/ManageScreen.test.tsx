// Manage opened from an alert (/manage?tab=…&who=…): each alert opens its section, even when
// the last one said the same, and a DM alert's conversation opens once, not on every
// return to Messages. Services down and titles leaving show beside the picker, as links
// big enough to tap. A new invite link waits there too, and is still on Invites after
// another section. Someone who isn't an admin (an old alert, a link) is told it's for
// admins, and none of its sections is asked for. Until it's known who's signed in, offline
// says so, and a failed ask can be tried again.
import { beforeEach, expect, jest, test } from "@jest/globals";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet, Text as MockText } from "react-native";
import { router } from "expo-router";
import { TOUCH } from "../../../ui/theme";
import { ManageScreen } from "../ManageScreen";

// The route's params, as the router holds them: an alert replaces them, setParams merges.
let mockParams: { tab?: string; who?: string } = {};
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams,
  useFocusEffect: () => undefined,
  router: { setParams: jest.fn((p: object) => { mockParams = { ...mockParams, ...p }; }), navigate: jest.fn() },
}));
// Who's signed in, as the bot last said.
let mockMe: { data?: { admin?: boolean; member?: boolean }; error?: Error | null; fetchStatus?: string; isFetching?: boolean; refetch?: () => unknown } = {};
jest.mock("../../me/useMe", () => ({ useMe: () => mockMe }));
// Whether each count behind the picker was allowed to load.
let mockAsked: Record<string, boolean | undefined> = {};
jest.mock("react-native-worklets", () => jest.requireActual("react-native-worklets/src/mock"));
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual<object>("react-native-reanimated/mock"),
  cubicBezier: () => "ease-out",
  useReducedMotion: () => false,
}));
jest.mock("../../../ui/haptics", () => ({ tap: () => undefined, select: () => undefined, success: () => undefined, reward: () => undefined, error: () => undefined }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("../../../auth/session", () => ({
  useSession: () => ({ state: { phase: "signedIn", server: "https://plexbie.example", token: "t", sample: false } }),
}));
jest.mock("../../../ui/Glass", () => ({ Ambient: () => null, TAB_BAR_CLEARANCE: 0 }));
jest.mock("../../../ui/StatusBarScrim", () => ({ StatusBarScrim: () => null }));
// The section dropdown as a row of buttons.
jest.mock("../../../ui/PickerSheet", () => {
  const { Text: T } = jest.requireActual<typeof import("react-native")>("react-native");
  return {
    PickerPill: ({ options, onChange }: { options: { value: string }[]; onChange: (v: string) => void }) =>
      options.map((o) => <T key={o.value} accessibilityRole="button" onPress={() => onChange(o.value)}>{`Pick ${o.value}`}</T>),
  };
});
// Each section as its name; Messages also says whose conversation it opens on.
function mockSection(name: string) { return () => <MockText>{`${name} section`}</MockText>; }
jest.mock("../TicketsSection", () => ({ TicketsSection: mockSection("Tickets"), useTickets: (on?: boolean) => { mockAsked.tickets = on; return { data: undefined }; } }));
jest.mock("../RequestsSection", () => ({ RequestsSection: mockSection("Requests"), useRequestsCount: (on?: boolean) => { mockAsked.requests = on; return { waiting: 0 }; } }));
jest.mock("../AllRequestsSection", () => ({ AllRequestsSection: mockSection("All requests"), useAllRequests: (on?: boolean) => { mockAsked.all = on; return { data: undefined }; } }));
jest.mock("../JoinsSection", () => ({ JoinsSection: mockSection("Joins"), useJoins: (on?: boolean) => { mockAsked.joins = on; return { data: [] }; } }));
jest.mock("../PeopleSection", () => ({ PeopleSection: mockSection("People") }));
// Invites says how many new links it was handed, and makes one.
jest.mock("../InvitesSection", () => ({
  InvitesSection: ({ fresh, onMade }: { fresh: { url: string }[]; onMade: (m: object) => void }) => (
    <>
      <MockText>{`Invites section, ${fresh.length} new`}</MockText>
      <MockText accessibilityRole="button" onPress={() => onMade({ url: "https://plexbie.example/invite/abc", invite: { id: "abc" } })}>Make a link</MockText>
    </>
  ),
}));
// What Cleanup and Health last said: titles in the warning window, and each service.
let mockLeaving: { ratingKey: string }[] = [];
let mockHealth: { name: string; ok: boolean }[] = [];
jest.mock("../CleanupSection", () => ({ CleanupSection: mockSection("Cleanup"), useCleanup: (on?: boolean) => { mockAsked.cleanup = on; return { data: { warning: mockLeaving } }; } }));
jest.mock("../HealthSection", () => ({ HealthSection: mockSection("Health"), useHealth: (on?: boolean) => { mockAsked.health = on; return { data: mockHealth }; } }));
jest.mock("../DiscordSection", () => ({ DiscordSection: mockSection("Discord") }));
jest.mock("../MessagesSection", () => ({
  useMessagePeople: (on?: boolean) => { mockAsked.messages = on; return { data: [] }; },
  MessagesSection: ({ who, onClose }: { who?: string; onClose?: () => void }) => (
    <>
      <MockText>{`Messages section, open on ${who ?? "everyone"}`}</MockText>
      <MockText accessibilityRole="button" onPress={onClose}>Close the conversation</MockText>
    </>
  ),
}));

const qc = new QueryClient();
const page = () => <QueryClientProvider client={qc}><ManageScreen /></QueryClientProvider>;
const pick = (tab: string) => fireEvent.press(screen.getByRole("button", { name: `Pick ${tab}` }));

beforeEach(() => {
  mockParams = {};
  mockLeaving = [];
  mockHealth = [];
  mockMe = { data: { admin: true, member: true } };
  mockAsked = {};
  jest.mocked(router.setParams).mockClear();
  jest.mocked(router.navigate).mockClear();
});

test("an alert's section opens again after another was picked", async () => {
  mockParams = { tab: "requests" };
  const { rerender } = await render(page());
  expect(screen.getByText("Requests section")).toBeTruthy();
  expect(router.setParams).toHaveBeenCalledWith({ tab: undefined, who: undefined });
  await pick("people");
  expect(screen.getByText("People section")).toBeTruthy();
  // The same kind of alert again: the router gets the same address.
  mockParams = { tab: "requests" };
  await rerender(page());
  expect(screen.getByText("Requests section")).toBeTruthy();
});

test("a DM alert's conversation isn't opened again by coming back to Messages", async () => {
  mockParams = { tab: "messages", who: "d1" };
  await render(page());
  expect(screen.getByText("Messages section, open on d1")).toBeTruthy();
  await pick("people");
  await pick("messages");
  expect(screen.getByText("Messages section, open on everyone")).toBeTruthy();
});

test("closing the conversation forgets it, and a new alert about it opens it again", async () => {
  mockParams = { tab: "messages", who: "d1" };
  const { rerender } = await render(page());
  await fireEvent.press(screen.getByRole("button", { name: "Close the conversation" }));
  expect(screen.getByText("Messages section, open on everyone")).toBeTruthy();
  mockParams = { tab: "messages", who: "d1" };
  await rerender(page());
  expect(screen.getByText("Messages section, open on d1")).toBeTruthy();
});

test("services down and titles leaving show beside the picker, and open their section", async () => {
  mockLeaving = [{ ratingKey: "1" }, { ratingKey: "2" }];
  mockHealth = [{ name: "Plex", ok: true }, { name: "Sonarr", ok: false }];
  await render(page());
  const down = screen.getByRole("button", { name: "Health, 1 down. Opens it." });
  const leaving = screen.getByRole("button", { name: "Cleanup, 2 leaving. Opens it." });
  expect(down).toHaveTextContent("Health · 1 down");
  expect(leaving).toHaveTextContent("Cleanup · 2 leaving");
  // The app's touch size, like every other control.
  for (const link of [down, leaving]) expect(StyleSheet.flatten(link.props.style).minHeight).toBeGreaterThanOrEqual(TOUCH);
  await fireEvent.press(down);
  expect(screen.getByText("Health section")).toBeTruthy();
});

test("a new invite link waits beside the picker and is still on Invites after another section", async () => {
  await render(page());
  await pick("invites");
  await fireEvent.press(screen.getByRole("button", { name: "Make a link" }));
  await pick("people");
  expect(screen.getByRole("button", { name: "Invites, 1 waiting. Opens it." })).toBeTruthy();
  await pick("invites");
  expect(screen.getByText("Invites section, 1 new")).toBeTruthy();
});

const COUNTS = ["tickets", "requests", "all", "joins", "cleanup", "health", "messages"];

test("an admin's counts are asked for", async () => {
  await render(page());
  for (const c of COUNTS) expect([c, mockAsked[c]]).toEqual([c, true]);
});

test("a member who isn't an admin is told it's for admins, and nothing is asked of the bot", async () => {
  mockMe = { data: { admin: false, member: true } };
  mockParams = { tab: "messages", who: "d1" };
  await render(page());
  expect(screen.getByText("This page is for admins.")).toBeTruthy();
  expect(screen.queryByText(/section/)).toBeNull();
  expect(screen.queryByRole("button", { name: "Pick requests" })).toBeNull();
  for (const c of COUNTS) expect([c, mockAsked[c]]).toEqual([c, false]);
  await fireEvent.press(screen.getByRole("button", { name: "Go to Home" }));
  expect(router.navigate).toHaveBeenCalledWith("/home");
});

test("nothing is asked for until it's known who's signed in", async () => {
  mockMe = {};
  await render(page());
  expect(screen.getByLabelText("Loading")).toBeTruthy();
  expect(screen.queryByText(/section/)).toBeNull();
  expect(screen.queryByText("This page is for admins.")).toBeNull();
  for (const c of COUNTS) expect([c, mockAsked[c]]).toEqual([c, false]);
});

test("offline before it's known who's signed in, it says so", async () => {
  mockMe = { error: null, fetchStatus: "paused", isFetching: false, refetch: jest.fn() };
  await render(page());
  expect(screen.getByText("You’re offline.")).toBeTruthy();
  expect(screen.queryByLabelText("Loading")).toBeNull();
  for (const c of COUNTS) expect([c, mockAsked[c]]).toEqual([c, false]);
});

test("a failed ask of who's signed in can be tried again", async () => {
  const refetch = jest.fn();
  mockMe = { error: new Error("The server didn’t answer."), fetchStatus: "idle", isFetching: false, refetch };
  await render(page());
  expect(screen.getByText("Couldn’t load Manage.")).toBeTruthy();
  expect(screen.getByText("The server didn’t answer.")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
  expect(refetch).toHaveBeenCalledTimes(1);
});
