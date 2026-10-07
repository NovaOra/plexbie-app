// Manage → Messages, one conversation: "Add to their ticket" is its own stop for a screen
// reader, a send the bot refused still shows what it logged, and Android Back (or the
// on-screen one) goes back to everyone and tells Manage the conversation is closed. The
// search stays while it filters, after the list gets shorter. A first load that fails says
// so, with Try again.
import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { BackHandler } from "react-native";
import type { Ack, AppLoggedMessage, AppMessagePerson } from "../../../api/schemas";
import { MessagesSection } from "../MessagesSection";

jest.mock("react-native-worklets", () => jest.requireActual("react-native-worklets/src/mock"));
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual<object>("react-native-reanimated/mock"),
  cubicBezier: () => "ease-out",
}));
jest.mock("../../../ui/Pressable", () => ({ PressableScale: jest.requireActual<typeof import("react-native")>("react-native").Pressable }));
jest.mock("../../../ui/haptics", () => ({ tap: () => undefined, select: () => undefined, success: () => undefined, reward: () => undefined, error: () => undefined }));
const mockToast = jest.fn();
jest.mock("../../../ui/Toast", () => ({ useToast: () => mockToast }));
// The screen is in view: focus effects run while mounted.
jest.mock("expo-router", () => {
  const { useEffect } = jest.requireActual<typeof import("react")>("react");
  return { useFocusEffect: (effect: () => void | (() => void)) => { useEffect(() => effect(), [effect]); } };
});
jest.mock("../../me/useMe", () => ({ useMe: () => ({ data: { user: { name: "Alex" } } }) }));

const mockClient = {
  adminMessages: jest.fn<() => Promise<AppMessagePerson[]>>(),
  conversation: jest.fn<(who: string) => Promise<AppLoggedMessage[]>>(),
  messageReply: jest.fn<(who: string, text: string) => Promise<Ack>>(),
  messageDone: jest.fn<(who: string, done: boolean) => Promise<Ack>>(),
  messageToTicket: jest.fn<(id: string) => Promise<Ack>>(),
};
jest.mock("../../../auth/session", () => ({
  useApi: () => mockClient,
  useSession: () => ({ state: { phase: "signedIn", server: "https://plexbie.example", token: "t", sample: false } }),
  useServer: () => "https://plexbie.example",
}));

const now = new Date().toISOString();
const sam = {
  id: "d1", name: "Sam Rivers", count: 2, received: 1, failed: 0, via: ["discord"], unread: 1, done: null,
  last: { at: now, text: "It stops halfway through", channel: "discord", delivered: true, direction: "in" },
  ticket: { id: "abc123abc123", title: "Big Buck Bunny", slot: 3 },
} as AppMessagePerson;
const dm = {
  id: "m1", at: now, direction: "in", channel: "discord", delivered: true, by: null, ticket: null,
  title: null, text: "It stops halfway through", context: "Discord DM", error: null,
} as AppLoggedMessage;

let qc: QueryClient;
beforeEach(() => {
  jest.clearAllMocks();
  mockClient.adminMessages.mockResolvedValue([sam]);
  mockClient.conversation.mockResolvedValue([dm]);
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => { qc.clear(); jest.restoreAllMocks(); });

const show = (onClose?: () => void) =>
  render(<QueryClientProvider client={qc}><MessagesSection who="d1" onClose={onClose} /></QueryClientProvider>);

test("“Add to their ticket” isn’t inside the message’s own screen-reader stop", async () => {
  await show();
  const add = await screen.findByLabelText("Add to their ticket on Big Buck Bunny");
  // VoiceOver reads an accessible view as one element and never reaches what's inside it.
  for (let up = add.parent; up; up = up.parent) expect(up.props.accessible).not.toBe(true);
  expect(screen.getByLabelText("Sam Rivers: It stops halfway through. Sent on Discord")).toBeTruthy();
});

test("the message's screen-reader stop says who sent it and that it's on their ticket", async () => {
  mockClient.conversation.mockResolvedValue([
    { ...dm, id: "m2", ticket: "abc123abc123" },
    { ...dm, id: "m3", direction: "out", by: "Alex", text: "Try the other player", context: null },
  ] as AppLoggedMessage[]);
  await show();
  expect(await screen.findByLabelText("Sam Rivers: It stops halfway through. Sent on Discord. On their ticket")).toBeTruthy();
  expect(screen.getByLabelText("Plexbie: Try the other player. Discord DM. Sent by Alex")).toBeTruthy();
});

test("a send the bot refused reloads the conversation and keeps what was typed", async () => {
  mockClient.messageReply.mockRejectedValue(new Error("Sam Rivers doesn’t take DMs from Plexbie."));
  await show();
  await screen.findByLabelText("Add to their ticket on Big Buck Bunny");
  const asked = mockClient.conversation.mock.calls.length;
  await fireEvent.changeText(screen.getByLabelText("Message Sam Rivers as Plexbie"), "Try the other player");
  await fireEvent.press(screen.getByLabelText("Send as Plexbie"));
  // The bot logs the failed DM in the conversation: it shows as "not delivered".
  await waitFor(() => expect(mockClient.conversation.mock.calls.length).toBeGreaterThan(asked));
  expect(screen.getByDisplayValue("Try the other player")).toBeTruthy();
  expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ tone: "error", text: "Not sent" }));
});

test("Android Back closes the conversation instead of leaving Manage", async () => {
  const listen = jest.spyOn(BackHandler, "addEventListener");
  const onClose = jest.fn();
  await show(onClose);
  await screen.findByRole("header", { name: "Sam Rivers" });
  const back = listen.mock.calls.filter(([event]) => event === "hardwareBackPress").at(-1)?.[1];
  expect(back).toBeDefined();
  let handled: boolean | null | undefined;
  await act(async () => { handled = back!({ type: "hardwareBackPress", timeStamp: Date.now() }); });
  expect(handled).toBe(true);
  expect(screen.getByText(/^Every message Plexbie sends/)).toBeTruthy();
  expect(onClose).toHaveBeenCalledTimes(1);
});

test("the on-screen back tells Manage the conversation is closed", async () => {
  const onClose = jest.fn();
  await show(onClose);
  await fireEvent.press(await screen.findByLabelText("Back to everyone"));
  expect(screen.getByText(/^Every message Plexbie sends/)).toBeTruthy();
  expect(onClose).toHaveBeenCalledTimes(1);
});

test("the search stays while it filters, after the list gets shorter", async () => {
  const six = ["d1", "d2", "d3", "d4", "d5", "d6"].map((id, i) => ({ ...sam, id, name: i ? `Person ${i}` : "Sam Rivers" }));
  mockClient.adminMessages.mockResolvedValue(six);
  await render(<QueryClientProvider client={qc}><MessagesSection /></QueryClientProvider>);
  await fireEvent.changeText(await screen.findByLabelText("Find someone"), "Person 5");
  await act(async () => { qc.setQueryData(["admin", "https://plexbie.example", "messages"], six.slice(1)); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  expect(screen.getByText("Messages · 5")).toBeTruthy();
  expect(screen.getByLabelText("Find someone")).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText("Find someone"), "");
  expect(screen.queryByLabelText("Find someone")).toBeNull();
});

test("a first load that fails says so, with Try again", async () => {
  mockClient.adminMessages.mockReset();
  mockClient.adminMessages.mockRejectedValueOnce(new Error("The server didn’t answer.")).mockResolvedValue([sam]);
  await render(<QueryClientProvider client={qc}><MessagesSection /></QueryClientProvider>);
  expect(await screen.findByText("Couldn’t load messages.")).toBeTruthy();
  await fireEvent.press(screen.getByLabelText("Try again"));
  expect(await screen.findByText("Messages · 1")).toBeTruthy();
});
