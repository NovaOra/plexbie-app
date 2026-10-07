// Manage → Health: rows already on screen don't go on looking current after a check fails
// or while offline (it says so, and when they were last checked), and the Manage tab's
// badge counts services that aren't answering. Before the first check is in, offline says
// so, and a check that fails says why with Try again. Sign out every other session goes
// through once per hold and says how many app sign-ins ended, or why it didn't finish; a
// Plexbie from before it is told to update.
import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { ApiError } from "../../../api/client";
import type { AppSignedOutOthers } from "../../../api/schemas";
import { HealthSection } from "../HealthSection";
import { useManageWaiting } from "../useManageWaiting";

type Row = { name: string; ok: boolean; ms: number; detail: string | null };
const mockHealth = jest.fn<(signal?: AbortSignal) => Promise<Row[]>>();
const mockSignOutOthers = jest.fn<() => Promise<AppSignedOutOthers>>();
const mockToast = jest.fn();
jest.mock("../../../auth/session", () => ({
  useApi: () => ({
    adminHealth: mockHealth,
    signOutOthers: mockSignOutOthers,
    adminRequests: async () => ({ pending: [] }),
    adminTickets: async () => ({ counts: { action: 0 } }),
    adminJoins: async () => [],
    adminMessages: async () => [],
  }),
  useSession: () => ({ state: { phase: "signedIn", server: "https://plexbie.example", token: "t", sample: false } }),
  useServer: () => "https://plexbie.example",
}));
jest.mock("react-native-worklets", () => jest.requireActual("react-native-worklets/src/mock"));
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual<object>("react-native-reanimated/mock"),
  cubicBezier: () => "ease-out",
  useReducedMotion: () => false,
}));
jest.mock("../../../ui/haptics", () => ({ tap: () => undefined, select: () => undefined, success: () => undefined, reward: () => undefined, error: () => undefined }));
jest.mock("../../../ui/Toast", () => ({ useToast: () => mockToast }));
// The hold itself is HoldButton's business; here a press is a finished hold.
jest.mock("../../../ui/HoldButton", () => {
  const { Pressable, Text } = jest.requireActual<typeof import("react-native")>("react-native");
  return {
    HoldButton: ({ label, disabled, onConfirm }: { label: string; disabled?: boolean; onConfirm: () => void }) => (
      <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }}
        onPress={() => { if (!disabled) onConfirm(); }}><Text>{label}</Text></Pressable>
    ),
  };
});
jest.mock("../BlockedImport", () => ({ BlockedList: () => null }));

const rows: Row[] = [
  { name: "Plex", ok: true, ms: 40, detail: null },
  { name: "Sonarr", ok: false, ms: 6000, detail: "HTTP 502" },
  { name: "Radarr", ok: false, ms: 6000, detail: "TimeoutError" },
];

let qc: QueryClient;
beforeEach(() => {
  mockHealth.mockReset();
  mockHealth.mockResolvedValue(rows);
  mockSignOutOthers.mockReset();
  mockToast.mockReset();
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => {
  qc.clear();
  onlineManager.setOnline(true);
});

const show = async () => {
  await render(<QueryClientProvider client={qc}><HealthSection /></QueryClientProvider>);
  await screen.findByText("Answering in 40 ms");
};

test("a fresh check shows the rows with nothing to warn about", async () => {
  await show();
  expect(screen.queryByRole("alert")).toBeNull();
});

test("Check again failing over rows already shown says so, and when they were checked", async () => {
  await show();
  mockHealth.mockRejectedValueOnce(new Error("The server didn’t answer."));
  await fireEvent.press(screen.getByRole("button", { name: "Check again" }));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/^Couldn’t check\. Last checked just now\.$/));
  // The rows stay, so a service that was down is still named.
  expect(screen.getByText("HTTP 502")).toBeTruthy();
  // The next check that answers clears it.
  await fireEvent.press(screen.getByRole("button", { name: "Check again" }));
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
});

test("offline, the rows say they're from the last check", async () => {
  await show();
  await act(async () => { onlineManager.setOnline(false); });
  await fireEvent.press(screen.getByRole("button", { name: "Check again" }));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/^Offline\. Last checked just now\.$/));
});

test("offline, the age of the last check keeps counting", async () => {
  jest.useFakeTimers({ now: new Date("2026-10-07T12:00:00Z"), doNotFake: ["nextTick", "setImmediate"] });
  try {
    await show();
    await act(async () => { onlineManager.setOnline(false); });
    await fireEvent.press(screen.getByRole("button", { name: "Check again" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/Last checked just now\.$/));
    await act(async () => { jest.advanceTimersByTime(3 * 60_000); });
    expect(screen.getByRole("alert")).toHaveTextContent(/^Offline\. Last checked 3 min ago\.$/);
  } finally {
    jest.useRealTimers();
  }
});

test("the Manage tab's badge counts services that aren't answering", async () => {
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  const { result } = await renderHook(() => useManageWaiting(true), { wrapper });
  await waitFor(() => expect(result.current).toBe(2));
});

test("offline before the first check, it says so instead of a blank card", async () => {
  onlineManager.setOnline(false);
  await render(<QueryClientProvider client={qc}><HealthSection /></QueryClientProvider>);
  expect(await screen.findByText("You’re offline.")).toBeTruthy();
  expect(mockHealth).not.toHaveBeenCalled();
});

test("a first check that fails says why, and Try again checks again", async () => {
  mockHealth.mockRejectedValueOnce(new Error("The server didn’t answer."));
  await render(<QueryClientProvider client={qc}><HealthSection /></QueryClientProvider>);
  expect(await screen.findByText("Couldn’t check the services.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Check again" })).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("Answering in 40 ms")).toBeTruthy();
});

test("a finished hold signs out every other session once, and says how many app sign-ins ended", async () => {
  let answer!: (out: AppSignedOutOthers) => void;
  mockSignOutOthers.mockImplementationOnce(() => new Promise((ok) => { answer = ok; }));
  await show();
  expect(screen.getByText("Sign out every other session")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Sign out others" }));
  // On its way, a second hold does nothing.
  expect(screen.getByRole("button", { name: "Sign out others" })).toBeDisabled();
  await fireEvent.press(screen.getByRole("button", { name: "Sign out others" }));
  expect(mockSignOutOthers).toHaveBeenCalledTimes(1);
  await act(async () => { answer({ ok: true, ended: 2, message: "Signed out every other website sign-in and 2 app sign-ins." }); });
  expect(mockToast).toHaveBeenCalledWith({ text: "Signed out everywhere else",
    detail: "2 app sign-ins ended, and every other website sign-in, with the alerts they had on. You’re still signed in here." });
  expect(screen.getByRole("button", { name: "Sign out others" })).not.toBeDisabled();

  mockSignOutOthers.mockResolvedValueOnce({ ok: true, ended: 1, message: "Signed out every other website sign-in and 1 app sign-in." });
  await fireEvent.press(screen.getByRole("button", { name: "Sign out others" }));
  await waitFor(() => expect(mockToast).toHaveBeenLastCalledWith(expect.objectContaining({ detail: expect.stringMatching(/^1 app sign-in ended, /) })));
});

test("a sign-out that didn't finish says why", async () => {
  mockSignOutOthers.mockRejectedValueOnce(new ApiError(503, "Plexbie can't check sign-ins right now. Try again in a moment."));
  await show();
  await fireEvent.press(screen.getByRole("button", { name: "Sign out others" }));
  await waitFor(() => expect(mockToast).toHaveBeenCalledWith({ tone: "error", text: "Sign-out didn’t finish",
    detail: "Plexbie can't check sign-ins right now. Try again in a moment." }));
});

test("a Plexbie from before this button is told to update, not given a status code", async () => {
  await show();
  for (const status of [404, 405]) {
    mockSignOutOthers.mockRejectedValueOnce(new ApiError(status, `The server said no (${status}).`));
    await fireEvent.press(screen.getByRole("button", { name: "Sign out others" }));
    await waitFor(() => expect(mockSignOutOthers).toHaveBeenCalledTimes(status === 404 ? 1 : 2));
    await waitFor(() => expect(mockToast).toHaveBeenLastCalledWith({ tone: "error", text: "Sign-out didn’t finish",
      detail: "This Plexbie can’t sign out other sessions from the app yet. Update it, then try again." }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Sign out others" })).not.toBeDisabled());
  }
  // The bot's own 404 sentence still comes through as it is.
  mockSignOutOthers.mockRejectedValueOnce(new ApiError(404, "No such sign-in."));
  await fireEvent.press(screen.getByRole("button", { name: "Sign out others" }));
  await waitFor(() => expect(mockToast).toHaveBeenLastCalledWith({ tone: "error", text: "Sign-out didn’t finish", detail: "No such sign-in." }));
});
