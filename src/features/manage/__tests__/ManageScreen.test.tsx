// Manage opened from an alert (/manage?tab=…&who=…): each alert opens its section, even when
// the last one said the same, and a DM alert's conversation opens once, not on every
// return to Messages.
import { beforeEach, expect, jest, test } from "@jest/globals";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text as MockText } from "react-native";
import { router } from "expo-router";
import { ManageScreen } from "../ManageScreen";

// The route's params, as the router holds them: an alert replaces them, setParams merges.
let mockParams: { tab?: string; who?: string } = {};
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams,
  useFocusEffect: () => undefined,
  router: { setParams: jest.fn((p: object) => { mockParams = { ...mockParams, ...p }; }) },
}));
jest.mock("react-native-worklets", () => jest.requireActual("react-native-worklets/src/mock"));
jest.mock("react-native-reanimated", () => jest.requireActual("react-native-reanimated/mock"));
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
jest.mock("../TicketsSection", () => ({ TicketsSection: mockSection("Tickets"), useTickets: () => ({ data: undefined }) }));
jest.mock("../RequestsSection", () => ({ RequestsSection: mockSection("Requests"), useRequestsCount: () => ({ waiting: 0 }) }));
jest.mock("../AllRequestsSection", () => ({ AllRequestsSection: mockSection("All requests"), useAllRequests: () => ({ data: undefined }) }));
jest.mock("../JoinsSection", () => ({ JoinsSection: mockSection("Joins"), useJoins: () => ({ data: [] }) }));
jest.mock("../PeopleSection", () => ({ PeopleSection: mockSection("People") }));
jest.mock("../InvitesSection", () => ({ InvitesSection: mockSection("Invites") }));
jest.mock("../CleanupSection", () => ({ CleanupSection: mockSection("Cleanup") }));
jest.mock("../HealthSection", () => ({ HealthSection: mockSection("Health") }));
jest.mock("../DiscordSection", () => ({ DiscordSection: mockSection("Discord") }));
jest.mock("../MessagesSection", () => ({
  useMessagePeople: () => ({ data: [] }),
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
  jest.mocked(router.setParams).mockClear();
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
