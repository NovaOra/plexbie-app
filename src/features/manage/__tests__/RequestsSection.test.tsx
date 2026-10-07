// Manage → Requests: a decision that fails brings back only its own card, never one that
// was decided in the meantime.
import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { Ack, AppAdminRequest, AppAdminRequests } from "../../../api/schemas";
import { ConfirmProvider } from "../../../ui/Confirm";
import { RequestsSection } from "../RequestsSection";

const mockRequests = jest.fn<(signal?: AbortSignal) => Promise<AppAdminRequests>>();
const mockDecide = jest.fn<(id: string, approve: boolean) => Promise<Ack>>();
jest.mock("../../../auth/session", () => ({
  useApi: () => ({ adminRequests: mockRequests, decide: mockDecide }),
  useSession: () => ({ state: { phase: "signedIn", server: "https://plexbie.example", token: "t", sample: false } }),
}));
jest.mock("react-native-worklets", () => jest.requireActual("react-native-worklets/src/mock"));
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual<object>("react-native-reanimated/mock"),
  cubicBezier: () => "ease-out",
  useReducedMotion: () => false,
}));
jest.mock("expo-image", () => ({ Image: () => null }));
jest.mock("../../../ui/haptics", () => ({ tap: () => undefined, select: () => undefined, success: () => undefined, reward: () => undefined, error: () => undefined }));
jest.mock("../../../ui/Glass", () => ({ GlassFill: () => null, glass: { surface: {} } }));
jest.mock("../../../ui/Poster", () => ({ Poster: () => null }));
jest.mock("../../../ui/Toast", () => ({ useToast: () => () => undefined }));

const request = (id: string, slot: number, title: string): AppAdminRequest => ({
  id, slot, title, kind: "movie", poster: null, seasons: null, requester: "Robin",
  requestedAt: "2026-10-06T18:00:00Z", status: "pending", resolvedBy: null, resolvedAt: null,
});
const sintel = request("r1", 41, "Sintel");
const spring = request("r2", 42, "Spring");
const KEY = ["admin", "https://plexbie.example", "requests"];
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

let qc: QueryClient;
beforeEach(() => {
  mockRequests.mockReset();
  mockDecide.mockReset();
  // Finished decisions are dropped at once, so nothing is left waiting after a test.
  qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { gcTime: 0 } } });
});
afterEach(() => qc.clear());

test("a failed decision brings back only its own card", async () => {
  mockRequests.mockResolvedValue({ pending: [sintel, spring], recent: [], older: [] });
  let fail!: (e: Error) => void;
  mockDecide.mockReturnValueOnce(new Promise<Ack>((_, rej) => { fail = rej; })).mockResolvedValueOnce({ ok: true, message: "" });
  await render(<QueryClientProvider client={qc}><ConfirmProvider><RequestsSection /></ConfirmProvider></QueryClientProvider>);

  await fireEvent.press(await screen.findByRole("button", { name: "Approve Sintel for Robin" }));
  await fireEvent.press(screen.getByRole("button", { name: "Approve Spring for Robin" }));
  await settle();
  expect(mockDecide).toHaveBeenCalledTimes(2);

  await act(async () => { fail(new Error("Seerr didn’t answer.")); });
  await settle();
  const after = qc.getQueryData<AppAdminRequests>(KEY);
  expect(after?.pending.map((p) => p.id)).toEqual(["r1"]);
  expect(after?.recent.map((p) => p.id)).toEqual(["r2"]);
  expect(screen.getByRole("button", { name: "Approve Sintel for Robin" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Approve Spring for Robin" })).toBeNull();
});
