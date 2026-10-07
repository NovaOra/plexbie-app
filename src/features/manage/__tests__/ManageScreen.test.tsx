// Manage opened from an alert (/manage?tab=…&who=…): each alert opens its section, even when
// the last one said the same, and a DM alert's conversation opens once, not on every
// return to Messages. The sections are behind a menu button at the top, beside the title: it
// lists every section with what's waiting in it, and a dot on it says something is waiting
// in another one (a service down, titles leaving, a new invite link, which is still on
// Invites after another section). Someone who isn't an admin (an old alert, a link) is told it's for
// admins, and none of its sections is asked for. Until it's known who's signed in, offline
// says so, and a failed ask can be tried again.
import { beforeEach, expect, jest, test } from "@jest/globals";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react-native";
import { ScrollView, StyleSheet, Text as MockText } from "react-native";
import { router } from "expo-router";
import { color, TOUCH } from "../../../ui/theme";
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
  useServer: () => "https://plexbie.example",
}));
jest.mock("../../../ui/Glass", () => ({ Ambient: () => null, GlassFill: () => null, glass: { surface: {} }, TAB_BAR_CLEARANCE: 0 }));
jest.mock("../../../ui/StatusBarScrim", () => ({ StatusBarScrim: () => null }));
// Each section as its name; Messages also says whose conversation it opens on.
function mockSection(name: string) { return () => <MockText>{`${name} section`}</MockText>; }
jest.mock("../TicketsSection", () => ({ TicketsSection: mockSection("Tickets"), useTickets: (on?: boolean) => { mockAsked.tickets = on; return { data: undefined }; } }));
let mockWaiting = 0;
jest.mock("../RequestsSection", () => ({ RequestsSection: mockSection("Requests"), useRequestsCount: (on?: boolean) => { mockAsked.requests = on; return { waiting: mockWaiting }; } }));
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
const menu = () => screen.getByRole("button", { name: /^Sections/ });
/** A section's row in the open menu: its name, and what's waiting in it. */
const row = (label: string) => screen.getByRole("radio", { name: new RegExp(`^(● )?${label}( · |$)`) });
/** Opens the menu and chooses a section. */
const pick = async (label: string) => {
  await fireEvent.press(menu());
  await fireEvent.press(row(label));
};

beforeEach(() => {
  mockParams = {};
  mockLeaving = [];
  mockHealth = [];
  mockWaiting = 0;
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
  await pick("People");
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
  await pick("People");
  await pick("Messages");
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

test("the sections are behind a menu button beside the title, with what's waiting in each", async () => {
  mockWaiting = 3;
  await render(page());
  const button = menu();
  // A full touch to hit, like every other control.
  expect(StyleSheet.flatten(button.props.style).width).toBeGreaterThanOrEqual(TOUCH);
  // On the title's line, at its end.
  let line = button.parent;
  while (line && StyleSheet.flatten(line.props.style)?.flexDirection !== "row") line = line.parent;
  expect(line).toContainElement(screen.getByRole("header", { name: "Manage" }));
  // The section shown, and what's waiting in it, under the title.
  expect(screen.getByText("Requests · 3 waiting")).toBeTruthy();
  await fireEvent.press(button);
  // Every section, in the website's order, the one shown marked.
  expect(screen.getAllByRole("radio").map((r) => within(r).getAllByText(/./).at(-1)!.props.children)).toEqual(
    ["Tickets", "Requests · 3 waiting", "All requests", "Join requests", "Invites", "People", "Cleanup", "Discord", "Messages", "Health"]);
  expect(screen.getByRole("radio", { checked: true })).toHaveTextContent(/Requests · 3 waiting/);
});

test("choosing a section in the menu shows it, closes the menu, and goes back to the top", async () => {
  const top = jest.spyOn(ScrollView.prototype, "scrollTo");
  await render(page());
  await pick("Health");
  expect(screen.getByText("Health section")).toBeTruthy();
  expect(screen.getByText("Health")).toBeTruthy();
  expect(screen.queryByRole("radio")).toBeNull();
  expect(top).toHaveBeenCalledWith(expect.objectContaining({ y: 0 }));
  top.mockRestore();
});

test("choosing the section already shown goes back to its top, and keeps its conversation", async () => {
  mockParams = { tab: "messages", who: "d1" };
  await render(page());
  const top = jest.spyOn(ScrollView.prototype, "scrollTo");
  await pick("Messages");
  expect(screen.queryByRole("radio")).toBeNull();
  expect(top).toHaveBeenCalledWith(expect.objectContaining({ y: 0 }));
  expect(screen.getByText("Messages section, open on d1")).toBeTruthy();
  top.mockRestore();
});

test("an alert opening another section shows it from the top", async () => {
  const { rerender } = await render(page());
  const top = jest.spyOn(ScrollView.prototype, "scrollTo");
  mockParams = { tab: "health" };
  await rerender(page());
  expect(screen.getByText("Health section")).toBeTruthy();
  expect(top).toHaveBeenCalledWith(expect.objectContaining({ y: 0 }));
  top.mockRestore();
});

test("services down and titles leaving put a dot on the menu, and stand out in it", async () => {
  mockLeaving = [{ ratingKey: "1" }, { ratingKey: "2" }];
  mockHealth = [{ name: "Plex", ok: true }, { name: "Sonarr", ok: false }];
  await render(page());
  expect(menu()).toHaveAccessibleName("Sections, 2 need you");
  expect(screen.getByTestId("sections-dot")).toBeTruthy();
  // No row of links in the middle of the page any more.
  expect(screen.queryByText("Health · 1 down")).toBeNull();
  expect(screen.queryByRole("button", { name: /Opens it/ })).toBeNull();
  await fireEvent.press(menu());
  const down = row("Health");
  expect(down).toHaveAccessibleName("Health · 1 down");
  expect(row("Cleanup")).toHaveAccessibleName("Cleanup · 2 leaving");
  expect(screen.getByText("Health · 1 down")).toHaveStyle({ color: color.screen });
  expect(screen.getByText("People")).not.toHaveStyle({ color: color.screen });
  await fireEvent.press(down);
  expect(screen.getByText("Health section")).toBeTruthy();
});

test("with nothing waiting elsewhere there's no dot", async () => {
  mockWaiting = 2;
  await render(page());
  expect(menu()).toHaveAccessibleName("Sections");
  expect(screen.queryByTestId("sections-dot")).toBeNull();
});

test("a new invite link puts a dot on the menu and is still on Invites after another section", async () => {
  await render(page());
  await pick("Invites");
  await fireEvent.press(screen.getByRole("button", { name: "Make a link" }));
  await pick("People");
  expect(menu()).toHaveAccessibleName("Sections, 1 needs you");
  await fireEvent.press(menu());
  expect(row("Invites")).toHaveAccessibleName("Invites · 1 waiting");
  await fireEvent.press(row("Invites"));
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
  expect(screen.queryByRole("button", { name: /^Sections/ })).toBeNull();
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
