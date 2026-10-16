// Manage is the desk, as on the website, from the sample household: what needs you in a
// line, five monitors that narrow the queue, the queue with each row's two keys (a decline
// is a hold, or two presses), a detail sheet that Back closes, and Everything else, a
// drawer of every full view with the same counts, from which "‹ Desk" comes back. An alert
// opens its full view straight away. Someone who isn't an admin is told it's for admins,
// and nothing is asked of the bot.
import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import { BackHandler, Text as MockText } from "react-native";
import { router } from "expo-router";
import { resetSample, sampleApi } from "../../../api/sample";
import { ManageScreen } from "../ManageScreen";

let mockParams: { tab?: string; who?: string } = {};
jest.mock("expo-router", () => {
  const { useEffect } = jest.requireActual<typeof import("react")>("react");
  return {
    useLocalSearchParams: () => mockParams,
    useFocusEffect: (effect: () => void | (() => void)) => { useEffect(() => effect() ?? undefined, [effect]); },
    router: { setParams: jest.fn((p: object) => { mockParams = { ...mockParams, ...p }; }), navigate: jest.fn(), push: jest.fn() },
  };
});
let mockMe: { data?: { admin?: boolean; member?: boolean; user?: { name: string } }; error?: Error | null; fetchStatus?: string; isFetching?: boolean; refetch?: () => unknown } = {};
jest.mock("../../me/useMe", () => ({ useMe: () => mockMe }));
// The sample household answers, each call watched.
const mockApi = new Proxy({} as typeof sampleApi, { get: (_t, k: string) => mockCalls(k) });
const mockAsked: string[] = [];
function mockCalls(k: string) {
  return (...args: unknown[]) => { mockAsked.push(k); return (sampleApi as unknown as Record<string, (...a: unknown[]) => unknown>)[k](...args); };
}
jest.mock("../../../auth/session", () => ({
  useApi: () => mockApi,
  useSession: () => ({ state: { phase: "signedIn", server: "https://plexbie.example", token: "t", sample: true } }),
  useServer: () => "https://plexbie.example",
}));
jest.mock("react-native-worklets", () => jest.requireActual("react-native-worklets/src/mock"));
let mockReduced = false;
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual<object>("react-native-reanimated/mock"),
  cubicBezier: () => "ease-out",
  useReducedMotion: () => mockReduced,
}));
jest.mock("../../../ui/haptics", () => ({ tap: () => undefined, select: () => undefined, success: () => undefined, reward: () => undefined, error: () => undefined }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("expo-image", () => ({ Image: () => null }));
jest.mock("../../../ui/Glass", () => ({ Ambient: () => null, GlassFill: () => null, glass: { surface: {} }, TAB_BAR_CLEARANCE: 0 }));
jest.mock("../../../ui/StatusBarScrim", () => ({ StatusBarScrim: () => null }));
jest.mock("../../../ui/Toast", () => ({ useToast: () => () => undefined }));
// The full views and the ticket and request pages, each as its name.
function mockNamed(name: string) { return ({ id }: { id?: string }) => <MockText>{`${name}${id ? ` ${id}` : ""}`}</MockText>; }
jest.mock("../TicketsSection", () => ({ TicketsSection: mockNamed("Tickets section") }));
jest.mock("../RequestsSection", () => ({ RequestsSection: mockNamed("Requests section") }));
jest.mock("../AllRequestsSection", () => ({ AllRequestsSection: mockNamed("All requests section") }));
jest.mock("../JoinsSection", () => ({ JoinsSection: mockNamed("Joins section") }));
jest.mock("../PeopleSection", () => ({ PeopleSection: mockNamed("People section") }));
jest.mock("../InvitesSection", () => ({ InvitesSection: mockNamed("Invites section") }));
jest.mock("../CleanupSection", () => ({ CleanupSection: mockNamed("Cleanup section") }));
jest.mock("../HealthSection", () => ({ HealthSection: mockNamed("Health section") }));
jest.mock("../DiscordSection", () => ({ DiscordSection: mockNamed("Discord section") }));
jest.mock("../MessagesSection", () => ({ MessagesSection: ({ who }: { who?: string }) => <MockText>{`Messages section, open on ${who ?? "everyone"}`}</MockText> }));
jest.mock("../AdminTicketScreen", () => ({ AdminTicketBody: mockNamed("Ticket page") }));
jest.mock("../AdminRequestScreen", () => ({ AdminRequestBody: mockNamed("Request page") }));
jest.mock("../BlockedImport", () => ({ BlockedImport: mockNamed("Blocked import") }));

const LONG = { timeout: 4000 };
let qc: QueryClient;
const page = () => <QueryClientProvider client={qc}><ManageScreen /></QueryClientProvider>;
const monitor = (name: RegExp) => screen.getByLabelText(name);
const desk = async () => { await render(page()); await screen.findByText(/9 things need you\./, undefined, LONG); };

beforeEach(() => {
  resetSample();
  mockParams = {};
  mockReduced = false;
  mockAsked.length = 0;
  mockMe = { data: { admin: true, member: true, user: { name: "Sam" } } };
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  jest.mocked(router.setParams).mockClear();
});
afterEach(() => { qc.clear(); });

test("the desk says what needs you, and each monitor counts its part of the queue", async () => {
  await desk();
  expect(screen.getByText(/2 are urgent\./)).toBeTruthy();
  expect(monitor(/^Requests \(Asks\): 3, 3 waiting/)).toBeTruthy();
  expect(monitor(/^Help: 3, .*urgent/)).toBeTruthy();
  expect(monitor(/^Services \(Health\): 1, 1 of 6 down, urgent/)).toBeTruthy();
  expect(screen.getByRole("radio", { name: "Needs you · 9" }).props.accessibilityState).toMatchObject({ checked: true });
  expect(screen.getByText("Urgent · 2")).toBeTruthy();
});

test("a monitor shows only its part of the queue; pressed again, or Show all, everything", async () => {
  await desk();
  await fireEvent.press(monitor(/^Requests \(Asks\)/));
  expect(screen.getByText("Showing Requests only")).toBeTruthy();
  expect(screen.queryByText("Discord Public Bot")).toBeNull();
  expect(screen.getByText("Zombies of the Stratosphere")).toBeTruthy();
  await fireEvent.press(monitor(/^Requests \(Asks\)/));
  expect(screen.getByText("Discord Public Bot")).toBeTruthy();
  await fireEvent.press(monitor(/^Services \(Health\)/));
  await fireEvent.press(screen.getByRole("button", { name: "Show all" }));
  expect(screen.getByText("Zombies of the Stratosphere")).toBeTruthy();
});

test("Approve on a row decides it, and the row and its count go", async () => {
  await desk();
  await fireEvent.press(screen.getByRole("button", { name: "Approve Zombies of the Stratosphere for Sam" }));
  await screen.findByText(/8 things need you\./, undefined, LONG);
  expect(mockAsked).toContain("decide");
  expect(screen.queryByText("Zombies of the Stratosphere")).toBeNull();
  expect(monitor(/^Requests \(Asks\): 2, 2 waiting/)).toBeTruthy();
});

test("Decline is a hold: two presses decline, one only arms it", async () => {
  await desk();
  await fireEvent.press(screen.getByRole("button", { name: "Hold to decline Undersea Kingdom" }));
  expect(mockAsked).not.toContain("decide");
  await fireEvent.press(screen.getByRole("button", { name: "Again to confirm: Decline Undersea Kingdom" }));
  await screen.findByText(/8 things need you\./, undefined, LONG);
  expect(screen.queryByText("Undersea Kingdom")).toBeNull();
});

test("a row opens its detail in a sheet, and Android's Back closes it rather than leaving Manage", async () => {
  const remove = jest.fn();
  const listen = jest.spyOn(BackHandler, "addEventListener").mockImplementation(() => ({ remove }));
  await desk();
  await fireEvent.press(screen.getByRole("button", { name: /^Ticket · import blocked.*Radar Men from the Moon/ }));
  expect(screen.getByText(/^Ticket page /)).toBeTruthy();
  const back = listen.mock.calls.at(-1)![1] as () => boolean;
  let handled = false;
  await act(async () => { handled = back(); });
  expect(handled).toBe(true);
  expect(screen.queryByText(/^Ticket page /)).toBeNull();
  expect(remove).toHaveBeenCalled();
  listen.mockRestore();
});

test("Waiting and Done show what's waiting on members and what was done lately", async () => {
  await desk();
  await fireEvent.press(screen.getByRole("radio", { name: "Waiting · 2" }));
  expect(screen.getByText("Cosmos Laundromat")).toBeTruthy();
  expect(screen.queryByText("Zombies of the Stratosphere")).toBeNull();
  await fireEvent.press(screen.getByRole("radio", { name: "Done" }));
  expect(screen.getByText("grandad")).toBeTruthy();
});

test("Everything else lists every full view with the monitors' counts, and ‹ Desk comes back", async () => {
  await desk();
  await fireEvent.press(screen.getByRole("button", { name: "Everything else" }));
  const drawer = within(screen.getByTestId("sections-drawer"));
  expect(drawer.getByRole("header", { name: /^Requests · 3/ })).toBeTruthy();
  expect(drawer.getByRole("header", { name: /^Services · 1/ })).toBeTruthy();
  await fireEvent.press(drawer.getByRole("button", { name: /^Invite links/ }));
  expect(screen.getByText("Invites section")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Back to the desk" }));
  expect(screen.getByText(/9 things need you\./)).toBeTruthy();
});

test("the drawer goes back on a tap beside it, and on Android's Back", async () => {
  await desk();
  await fireEvent.press(screen.getByRole("button", { name: "Everything else" }));
  expect(screen.getByTestId("sections-drawer").props.accessibilityElementsHidden).toBe(false);
  await fireEvent.press(screen.getByTestId("sections-scrim", { includeHiddenElements: true }));
  expect(screen.getByTestId("sections-drawer", { includeHiddenElements: true }).props.accessibilityElementsHidden).toBe(true);
  const listen = jest.spyOn(BackHandler, "addEventListener").mockImplementation(() => ({ remove: () => undefined }));
  await fireEvent.press(screen.getByRole("button", { name: "Everything else" }));
  const back = listen.mock.calls.at(-1)![1] as () => boolean;
  await act(async () => { back(); });
  expect(screen.getByTestId("sections-drawer", { includeHiddenElements: true }).props.accessibilityElementsHidden).toBe(true);
  listen.mockRestore();
});

test("Reply on a conversation opens it in Messages", async () => {
  await desk();
  await fireEvent.press(screen.getByRole("button", { name: "Reply: Alex Kim" }));
  expect(screen.getByText(/^Messages section, open on /)).toBeTruthy();
});

test("an alert opens its full view, with its conversation, and its address is used up", async () => {
  mockParams = { tab: "messages", who: "d1" };
  await render(page());
  expect(screen.getByText("Messages section, open on d1")).toBeTruthy();
  expect(router.setParams).toHaveBeenCalledWith({ tab: undefined, who: undefined });
});

test("a member who isn't an admin is told it's for admins, and nothing is asked of the bot", async () => {
  mockMe = { data: { admin: false, member: true, user: { name: "Jo" } } };
  await render(page());
  expect(screen.getByText("This page is for admins.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Everything else" })).toBeNull();
  expect(mockAsked).toEqual([]);
});
