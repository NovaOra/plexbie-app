// Manage → Health: rows already on screen don't go on looking current after a check fails
// or while offline (it says so, and when they were last checked), and the Manage tab's
// badge counts services that aren't answering. Before the first check is in, offline says
// so, and a check that fails says why with Try again.
import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { HealthSection } from "../HealthSection";
import { useManageWaiting } from "../useManageWaiting";

type Row = { name: string; ok: boolean; ms: number; detail: string | null };
const mockHealth = jest.fn<(signal?: AbortSignal) => Promise<Row[]>>();
jest.mock("../../../auth/session", () => ({
  useApi: () => ({
    adminHealth: mockHealth,
    adminRequests: async () => ({ pending: [] }),
    adminTickets: async () => ({ counts: { action: 0 } }),
    adminJoins: async () => [],
    adminMessages: async () => [],
  }),
  useSession: () => ({ state: { phase: "signedIn", server: "https://plexbie.example", token: "t", sample: false } }),
}));
jest.mock("react-native-worklets", () => jest.requireActual("react-native-worklets/src/mock"));
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual<object>("react-native-reanimated/mock"),
  cubicBezier: () => "ease-out",
  useReducedMotion: () => false,
}));
jest.mock("../../../ui/haptics", () => ({ tap: () => undefined, select: () => undefined, success: () => undefined, reward: () => undefined, error: () => undefined }));
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
