// Manage → People: Unlink and picking who to link are sent once, however fast they're
// tapped, and Unlink waits while its unlink is on its way. Saying which Plex account someone
// is takes a pick and a confirm, the search stays while it filters, and the link sheet
// starts fresh for each person and says why a link failed. A Never remove that fails puts
// the person back as they were, Warned too, unless no answer came: then what the bot says
// once People is reloaded stands. Offline before anyone has loaded it, it says so.
import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { ApiError } from "../../../api/client";
import type { Ack, AppAdminPerson } from "../../../api/schemas";
import type { ConfirmButton } from "../../../ui/Confirm";
import { PeopleSection } from "../PeopleSection";

jest.mock("react-native-worklets", () => jest.requireActual("react-native-worklets/src/mock"));
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual<object>("react-native-reanimated/mock"),
  cubicBezier: () => "ease-out",
}));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
// What each tappable row does, by its label, to tap it twice before the first is done.
const mockPresses: Record<string, () => unknown> = {};
jest.mock("../../../ui/Pressable", () => {
  const { Pressable } = jest.requireActual<typeof import("react-native")>("react-native");
  return {
    PressableScale: (props: { accessibilityLabel?: string; onPress?: () => unknown } & object) => {
      if (props.accessibilityLabel && props.onPress) mockPresses[props.accessibilityLabel] = props.onPress;
      return <Pressable {...props} />;
    },
  };
});
jest.mock("../../../ui/haptics", () => ({ tap: () => undefined, select: () => undefined, success: () => undefined, reward: () => undefined, error: () => undefined }));
jest.mock("../../../ui/Glass", () => ({ GlassFill: () => null, glass: { surface: {} } }));
const mockToast = jest.fn();
jest.mock("../../../ui/Toast", () => ({ useToast: () => mockToast }));
const mockConfirm = jest.fn<(title: string, message: string, buttons: ConfirmButton[]) => void>();
jest.mock("../../../ui/Confirm", () => ({ useConfirm: () => mockConfirm }));

const mockClient = {
  adminPeople: jest.fn<() => Promise<AppAdminPerson[]>>(),
  linkCandidates: jest.fn<() => Promise<{ discord: { id: string; name: string; username: string }[] }>>(),
  linkPerson: jest.fn<() => Promise<Ack>>(),
  unlinkPerson: jest.fn<() => Promise<Ack>>(),
  matchPerson: jest.fn<(plexName: string, account: string) => Promise<Ack>>(),
  keepPerson: jest.fn<(plexName: string, on: boolean) => Promise<Ack>>(),
};
jest.mock("../../../auth/session", () => ({
  useApi: () => mockClient,
  useSession: () => ({ state: { phase: "signedIn", server: "https://plexbie.example", token: "t", sample: false } }),
}));

const person = (over: Partial<AppAdminPerson>) => ({
  plexName: "samr", displayName: "Sam Rivers", linked: false, discordName: null, discordId: null, owner: false, topThree: false,
  neverRemove: false, warned: false, hasAccess: true, tracked: true, lastWatched: null, daysIdle: 3, removalIn: 40, warnAfter: 30,
  ...over,
}) as AppAdminPerson;
const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
};
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

let qc: QueryClient;
beforeEach(() => {
  jest.clearAllMocks();
  mockClient.linkCandidates.mockResolvedValue({ discord: [{ id: "42", name: "Sam", username: "sam" }] });
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(async () => {
  onlineManager.setOnline(true);
  await act(async () => { await new Promise((r) => setTimeout(r, 1600)); });
  qc.clear();
});

const show = async () => {
  await render(<QueryClientProvider client={qc}><PeopleSection /></QueryClientProvider>);
  await screen.findByText("Sam Rivers");
};

test("Unlink tapped twice unlinks once, and waits while it's on its way", async () => {
  mockClient.adminPeople.mockResolvedValue([person({ linked: true, discordName: "Sam", discordId: "42" })]);
  const unlinking = deferred<Ack>();
  mockClient.unlinkPerson.mockReturnValue(unlinking.promise);
  await show();
  const unlink = screen.getByLabelText("Unlink Discord, Sam Rivers");
  await fireEvent.press(unlink);
  await fireEvent.press(unlink);
  expect(screen.getByLabelText("Unlink Discord, Sam Rivers").props.accessibilityState?.disabled).toBe(true);
  await act(async () => { unlinking.resolve({ ok: true, message: "Unlinked" } as Ack); });
  await settle();
  expect(mockClient.unlinkPerson).toHaveBeenCalledTimes(1);
  expect(mockToast).toHaveBeenCalledTimes(1);
});

test("picking who to link, tapped twice, links once and says nothing went wrong", async () => {
  mockClient.adminPeople.mockResolvedValue([person({})]);
  const linking = deferred<Ack>();
  mockClient.linkPerson.mockReturnValue(linking.promise);
  await show();
  await fireEvent.press(screen.getByLabelText("Link Discord, Sam Rivers"));
  await screen.findByLabelText("Link to Sam");
  // The member's row waits for the link to be made, so both taps land before it's in.
  await act(async () => { void mockPresses["Link to Sam"](); void mockPresses["Link to Sam"](); });
  await settle();
  expect(screen.queryByText("Couldn’t link Sam. Try again.")).toBeNull();
  await act(async () => { linking.resolve({ ok: true, message: "Linked" } as Ack); });
  await settle();
  expect(mockClient.linkPerson).toHaveBeenCalledTimes(1);
  expect(mockToast).toHaveBeenCalledTimes(1);
});

test("saying which Plex account someone is takes a pick, then a confirm", async () => {
  mockClient.adminPeople.mockResolvedValue([person({ hasAccess: false, candidates: ["samriv", "srivers"] })]);
  mockClient.matchPerson.mockResolvedValue({ ok: true, message: "Matched" } as Ack);
  await show();
  await fireEvent.press(screen.getByLabelText("srivers, Plex account for Sam Rivers"));
  // A tap only picks the account: nothing is sent yet.
  expect(mockClient.matchPerson).not.toHaveBeenCalled();
  expect(screen.getByLabelText("srivers, Plex account for Sam Rivers").props.accessibilityState?.checked).toBe(true);
  await fireEvent.press(screen.getByLabelText("That’s them: srivers is Sam Rivers"));
  expect(mockClient.matchPerson).not.toHaveBeenCalled();
  expect(mockConfirm).toHaveBeenCalledTimes(1);
  const [title, , buttons] = mockConfirm.mock.calls[0];
  expect(title).toBe("Sam Rivers is srivers on Plex?");
  await act(async () => { await buttons.find((b) => b.style !== "cancel")!.onPress!(); });
  await settle();
  expect(mockClient.matchPerson).toHaveBeenCalledTimes(1);
  expect(mockClient.matchPerson).toHaveBeenCalledWith("samr", "srivers");
});

test("a picked account that's no longer offered can't be sent", async () => {
  const before = [person({ hasAccess: false, candidates: ["samriv", "srivers"] })];
  mockClient.adminPeople.mockResolvedValue(before);
  await show();
  // The accounts are one choice, read out as a group.
  expect(screen.getByLabelText("Plex account for Sam Rivers").props.accessibilityRole).toBe("radiogroup");
  await fireEvent.press(screen.getByLabelText("srivers, Plex account for Sam Rivers"));
  expect(screen.getByLabelText("That’s them: srivers is Sam Rivers")).toBeTruthy();
  // The list refreshes and srivers went to someone else in the meantime.
  await act(async () => { qc.setQueryData(["admin", "https://plexbie.example", "people"], [person({ hasAccess: false, candidates: ["samriv"] })]); });
  await settle();
  expect(screen.queryByLabelText("That’s them: srivers is Sam Rivers")).toBeNull();
  expect(screen.getByLabelText("samriv, Plex account for Sam Rivers").props.accessibilityState?.checked).toBe(false);
});

test("the search stays while it filters, after the list gets shorter", async () => {
  const five = ["samr", "jo", "kim", "lee", "max"].map((n, i) => person({ plexName: n, displayName: i ? null : "Sam Rivers" }));
  mockClient.adminPeople.mockResolvedValue(five);
  await show();
  await fireEvent.changeText(screen.getByLabelText("Find someone"), "max");
  // Someone else is removed: four left, and the filter is still applied.
  await act(async () => { qc.setQueryData(["admin", "https://plexbie.example", "people"], five.slice(1)); });
  await settle();
  expect(screen.getByText("Who’s on Plex · 4")).toBeTruthy();
  expect(screen.getByLabelText("Find someone")).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText("Find someone"), "");
  expect(screen.queryByLabelText("Find someone")).toBeNull();
});

test("the link sheet starts fresh for each person: a new member list and an empty search", async () => {
  mockClient.adminPeople.mockResolvedValue([person({}), person({ plexName: "jo", displayName: "Jo Park" })]);
  await show();
  await fireEvent.press(screen.getByLabelText("Link Discord, Sam Rivers"));
  await screen.findByLabelText("Link to Sam");
  // Dragging the list puts the keyboard away, so the rows under it and Cancel can be reached.
  let list = screen.getByLabelText("Link to Sam").parent;
  while (list && list.props.keyboardShouldPersistTaps === undefined) list = list.parent;
  expect(list?.props.keyboardDismissMode).toBe("on-drag");
  await fireEvent.changeText(screen.getByLabelText("Search Discord members"), "zz");
  await fireEvent.press(screen.getByLabelText("Cancel"));
  mockClient.linkCandidates.mockResolvedValue({ discord: [{ id: "43", name: "Jo", username: "jo" }] });
  await fireEvent.press(screen.getByLabelText("Link Discord, Jo Park"));
  expect(screen.getByLabelText("Search Discord members").props.value).toBe("");
  expect(await screen.findByLabelText("Link to Jo")).toBeTruthy();
  expect(mockClient.linkCandidates).toHaveBeenCalledTimes(2);
});

test("a link that fails says why in the sheet", async () => {
  mockClient.adminPeople.mockResolvedValue([person({})]);
  mockClient.linkPerson.mockRejectedValue(new Error("Sam is already linked to jo."));
  await show();
  await fireEvent.press(screen.getByLabelText("Link Discord, Sam Rivers"));
  await screen.findByLabelText("Link to Sam");
  await act(async () => { await mockPresses["Link to Sam"](); });
  expect(screen.getByText("Sam is already linked to jo.")).toBeTruthy();
});

test("a Never remove that fails puts them back as they were, warned too", async () => {
  mockClient.adminPeople.mockResolvedValue([person({ warned: true })]);
  let refuse!: (e: Error) => void;
  mockClient.keepPerson.mockReturnValue(new Promise<Ack>((_, rej) => { refuse = rej; }));
  await show();
  expect(screen.getByText("Warned")).toBeTruthy();
  await fireEvent.press(screen.getByRole("switch", { name: "Never remove, Sam Rivers" }));
  await settle();
  // Kept straight away: never removed, so no longer warned.
  expect(screen.getByText("Never removed")).toBeTruthy();
  expect(screen.queryByText("Warned")).toBeNull();
  await act(async () => { refuse(new Error("The server didn’t answer.")); });
  await settle();
  expect(screen.getByRole("switch", { name: "Never remove, Sam Rivers" })).not.toBeChecked();
  expect(screen.queryByText("Never removed")).toBeNull();
  expect(screen.getByText("Warned")).toBeTruthy();
});

test("a Never remove that gets no answer shows what the bot says once reloaded", async () => {
  mockClient.adminPeople.mockResolvedValue([person({ warned: true })]);
  let refuse!: (e: Error) => void;
  mockClient.keepPerson.mockReturnValue(new Promise<Ack>((_, rej) => { refuse = rej; }));
  await show();
  await fireEvent.press(screen.getByRole("switch", { name: "Never remove, Sam Rivers" }));
  await settle();
  // It went through after all.
  mockClient.adminPeople.mockResolvedValue([person({ neverRemove: true, warned: false })]);
  await act(async () => { refuse(new ApiError(0, "The server didn’t answer.", "timeout")); });
  await settle();
  expect(mockClient.adminPeople).toHaveBeenCalledTimes(2);
  expect(screen.getByRole("switch", { name: "Never remove, Sam Rivers" })).toBeChecked();
  expect(screen.getByText("Never removed")).toBeTruthy();
  expect(screen.queryByText("Warned")).toBeNull();
});

test("offline before anyone has loaded, it says so instead of a blank card", async () => {
  onlineManager.setOnline(false);
  mockClient.adminPeople.mockResolvedValue([person({})]);
  await render(<QueryClientProvider client={qc}><PeopleSection /></QueryClientProvider>);
  await settle();
  expect(screen.getByText("You’re offline.")).toBeTruthy();
  expect(mockClient.adminPeople).not.toHaveBeenCalled();
});
