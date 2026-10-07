// Manage → Invites: a new link (shown only once) stays until it's dismissed, through a
// section switch and another new link, and goes once its link stops working; a share sheet
// that fails says so; Next on the name
// moves to the email; Plex invites sent to a username are listed by name, without buttons
// that can't work. Plex invites that can't be loaded say so, with Try again.
import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { useState } from "react";
import { Share, TextInput } from "react-native";
import type { AppAdminInvite, AppNewInvite, AppPlexInvite } from "../../../api/schemas";
import { InvitesSection } from "../InvitesSection";

jest.mock("expo-router", () => ({ useFocusEffect: () => undefined }));
jest.mock("react-native-worklets", () => jest.requireActual("react-native-worklets/src/mock"));
jest.mock("react-native-reanimated", () => jest.requireActual("react-native-reanimated/mock"));
jest.mock("../../../ui/Pressable", () => {
  const { Pressable } = jest.requireActual<typeof import("react-native")>("react-native");
  return { PressableScale: Pressable };
});
jest.mock("../../../ui/haptics", () => ({ tap: () => undefined, select: () => undefined, success: () => undefined, reward: () => undefined, error: () => undefined }));
jest.mock("../../../ui/Glass", () => ({ GlassFill: () => null, glass: { surface: {} } }));
const mockToast = jest.fn();
jest.mock("../../../ui/Toast", () => ({ useToast: () => mockToast }));
type Choice = { style?: string; onPress?: () => unknown };
const mockConfirm = jest.fn<(title: string, message: string, choices: Choice[]) => void>();
jest.mock("../../../ui/Confirm", () => ({ useConfirm: () => mockConfirm }));

const mockClient = {
  adminInvites: jest.fn<() => Promise<AppAdminInvite[]>>(),
  plexInvites: jest.fn<() => Promise<AppPlexInvite[]>>(),
  createInvite: jest.fn<() => Promise<AppNewInvite>>(),
  renewInvite: jest.fn<(id: string) => Promise<AppNewInvite>>(),
  revokeInvite: jest.fn<(id: string) => Promise<{ ok: boolean; message: string }>>(),
};
jest.mock("../../../auth/session", () => ({
  useApi: () => mockClient,
  useSession: () => ({ state: { phase: "signedIn", server: "https://plexbie.example", token: "t", sample: false } }),
}));

const invite = (id: string, label: string, over: Partial<AppAdminInvite> = {}): AppAdminInvite => ({
  id, label, email: null, createdBy: "you", createdAt: "2026-10-01T10:00:00Z", expiresAt: "2026-10-14T10:00:00Z",
  status: "active", usedBy: null, usedAt: null, ...over,
});
const made = (id: string, label: string): AppNewInvite => ({ url: `https://plexbie.example/invite/${id}`, invite: invite(id, label) });
const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
};
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

// Holds the new links the way Manage does, so they outlast the section.
function Host({ open }: { open: boolean }) {
  const [fresh, setFresh] = useState<AppNewInvite[]>([]);
  return open ? (
    <InvitesSection fresh={fresh} onMade={(m) => setFresh((f) => [m, ...f])} onDone={(id) => setFresh((f) => f.filter((x) => x.invite.id !== id))} />
  ) : null;
}

let qc: QueryClient;
beforeEach(() => {
  jest.clearAllMocks();
  mockClient.adminInvites.mockResolvedValue([]);
  mockClient.plexInvites.mockResolvedValue([]);
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(async () => {
  await act(async () => { await new Promise((r) => setTimeout(r, 400)); });
  qc.clear();
});

const page = (open = true) => <QueryClientProvider client={qc}><Host open={open} /></QueryClientProvider>;
const show = async () => {
  const out = await render(page());
  await settle();
  return out;
};
const fillAndMake = async (name: string) => {
  await fireEvent.changeText(screen.getByLabelText("Who’s it for?"), name);
  await fireEvent.press(screen.getByLabelText("Make invite link"));
};

test("a new link is still there after leaving Invites and coming back", async () => {
  mockClient.createInvite.mockResolvedValue(made("abc", "Mum"));
  const { rerender } = await show();
  await fillAndMake("Mum");
  await settle();
  expect(screen.getByText("https://plexbie.example/invite/abc")).toBeTruthy();
  await rerender(page(false));
  await rerender(page(true));
  await settle();
  expect(screen.getByText("https://plexbie.example/invite/abc")).toBeTruthy();
  // Dismissed, it's gone and the form is back.
  await fireEvent.press(screen.getByLabelText("Make another"));
  expect(screen.queryByText("https://plexbie.example/invite/abc")).toBeNull();
  expect(screen.getByLabelText("Who’s it for?")).toBeTruthy();
});

test("a link that arrives after leaving Invites is shown on coming back", async () => {
  const making = deferred<AppNewInvite>();
  mockClient.createInvite.mockReturnValue(making.promise);
  const { rerender } = await show();
  await fillAndMake("Mum");
  await rerender(page(false));
  await act(async () => { making.resolve(made("abc", "Mum")); });
  await rerender(page(true));
  await settle();
  expect(screen.getByText("https://plexbie.example/invite/abc")).toBeTruthy();
});

test("a second new link doesn't replace the first before it's sent", async () => {
  mockClient.adminInvites.mockResolvedValue([invite("a1", "Ana", { status: "expired" }), invite("b1", "Bo", { status: "expired" })]);
  mockClient.renewInvite.mockImplementation(async (id) => (id === "a1" ? made("a2", "Ana") : made("b2", "Bo")));
  await show();
  await fireEvent.press(screen.getByLabelText("New link for Ana"));
  await settle();
  await fireEvent.press(screen.getByLabelText("New link for Bo"));
  await settle();
  expect(screen.getByText("https://plexbie.example/invite/a2")).toBeTruthy();
  expect(screen.getByText("https://plexbie.example/invite/b2")).toBeTruthy();
});

test("a new link for the same invite replaces the card whose link stopped working", async () => {
  mockClient.createInvite.mockResolvedValue(made("m1", "Mum"));
  mockClient.renewInvite.mockResolvedValue(made("m2", "Mum"));
  await show();
  await fillAndMake("Mum");
  await settle();
  await fireEvent.press(screen.getByLabelText("New link for Mum"));
  await settle();
  expect(mockClient.renewInvite).toHaveBeenCalledWith("m1");
  expect(screen.getByText("https://plexbie.example/invite/m2")).toBeTruthy();
  expect(screen.queryByText("https://plexbie.example/invite/m1")).toBeNull();
  expect(screen.getByLabelText("Make another")).toBeTruthy();
});

test("cancelling an invite takes its new link away", async () => {
  mockClient.createInvite.mockResolvedValue(made("m1", "Mum"));
  mockClient.revokeInvite.mockResolvedValue({ ok: true, message: "" });
  mockConfirm.mockImplementationOnce((_t, _m, choices) => void choices.find((c) => c.style === "destructive")?.onPress?.());
  await show();
  await fillAndMake("Mum");
  await settle();
  await fireEvent.press(screen.getByLabelText("Cancel Mum’s invite"));
  await settle();
  expect(mockClient.revokeInvite).toHaveBeenCalledWith("m1");
  expect(screen.queryByText("https://plexbie.example/invite/m1")).toBeNull();
  expect(screen.getByLabelText("Who’s it for?")).toBeTruthy();
});

test("a share sheet that won't open says so", async () => {
  mockClient.createInvite.mockResolvedValue(made("abc", "Mum"));
  const share = jest.spyOn(Share, "share").mockRejectedValue(new Error("No activity"));
  await show();
  await fillAndMake("Mum");
  await settle();
  await fireEvent.press(screen.getByLabelText("Send it"));
  await settle();
  expect(share).toHaveBeenCalledTimes(1);
  expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ tone: "error" }));
  share.mockRestore();
});

test("Next on the name moves to the email", async () => {
  await show();
  const focus = jest.mocked(TextInput.prototype.focus);
  focus.mockClear();
  const name = screen.getByLabelText("Who’s it for?");
  expect(name.props.submitBehavior).toBe("submit");
  await fireEvent(name, "submitEditing");
  expect(focus).toHaveBeenCalledTimes(1);
  expect((focus.mock.contexts[0] as { props: { accessibilityLabel?: string } }).props.accessibilityLabel).toBe("Their Plex email, optional");
});

test("Plex invites sent to a username show by name and point to plex.tv", async () => {
  mockClient.plexInvites.mockResolvedValue([
    { email: "", name: "grandpa_joe", sentAt: "2026-10-05T10:00:00Z", who: null },
    { email: "", name: "auntie.m", sentAt: "2026-10-06T10:00:00Z", who: null },
    { email: "jo@example.com", name: "", sentAt: "2026-10-06T10:00:00Z", who: "Jo" },
  ]);
  const errors = jest.spyOn(console, "error").mockImplementation(() => undefined);
  await show();
  expect(screen.getByText("grandpa_joe")).toBeTruthy();
  expect(screen.getByText("auntie.m")).toBeTruthy();
  expect(screen.getAllByText("Sent to a Plex username, so change or cancel it on plex.tv.")).toHaveLength(2);
  // Only the invite with an address can be changed or cancelled from here.
  expect(screen.getAllByText("Change email")).toHaveLength(1);
  expect(screen.getByLabelText("Change email for Jo")).toBeTruthy();
  expect(screen.getAllByLabelText(/^Cancel the Plex invite/)).toHaveLength(1);
  // Each row has a key of its own.
  expect(errors.mock.calls.some((c) => String(c[0]).includes("same key"))).toBe(false);
  errors.mockRestore();
});

test("Plex invites that couldn't be loaded say so, with Try again", async () => {
  mockClient.plexInvites.mockRejectedValueOnce(new Error("Plex didn’t answer."))
    .mockResolvedValue([{ email: "sam@example.com", name: "", who: "Sam", sentAt: "2026-10-01T10:00:00Z" }]);
  await show();
  expect(screen.getByText("Couldn’t load the Plex invites nobody has accepted.")).toBeTruthy();
  expect(screen.getByText("Plex didn’t answer.")).toBeTruthy();
  await fireEvent.press(screen.getByLabelText("Try again"));
  await settle();
  expect(screen.getByText("Waiting on Plex · 1")).toBeTruthy();
  expect(screen.queryByText("Plex didn’t answer.")).toBeNull();
});
