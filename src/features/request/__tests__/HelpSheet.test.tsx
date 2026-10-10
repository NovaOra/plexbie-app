// "Something wrong?" on a request: once it's in, the sheet closes and the member's list of
// tickets is read again; a sheet swiped away while it was sending closes nothing else.
import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { myRequests } from "../../../api/__fixtures__/bot";
import type { AppRequest } from "../../../api/schemas";
import { HelpSheet } from "../HelpSheet";

const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ slot: "8" }),
  router: { back: () => mockBack() },
}));
const mockRequest = { ...(myRequests[1] as unknown as AppRequest), id: "req_8" };
jest.mock("../../requests/useRequests", () => ({ useRequests: () => ({ data: [mockRequest] }) }));
const mockAsk = jest.fn<() => Promise<unknown>>();
jest.mock("../../../auth/session", () => ({
  useApi: () => ({ askHelp: mockAsk }),
  useServer: () => "https://plexbie.example",
}));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("react-native-worklets", () => jest.requireActual("react-native-worklets/src/mock"));
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual<object>("react-native-reanimated/mock"),
  cubicBezier: () => "ease-out",
  useReducedMotion: () => false,
}));
jest.mock("../../../ui/haptics", () => ({ tap: () => undefined, success: () => undefined }));
const mockToast = jest.fn();
jest.mock("../../../ui/Toast", () => ({ useToast: () => mockToast }));
jest.mock("../../../ui/useDraftGuard", () => ({ useDraftGuard: () => () => undefined }));

const answered = { ok: true, message: "Sent. An admin will take a look and get back to you.", help: { id: "0a1b2c3d4e5f", reason: "Stuck downloading" } };
let qc: QueryClient;
beforeEach(() => {
  jest.clearAllMocks();
  // No clean-up timer for a mutation that's done: clearing the client leaves one running past the test.
  qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { gcTime: Infinity } } });
});
afterEach(() => { qc.clear(); });

const show = () => render(<QueryClientProvider client={qc}><HelpSheet /></QueryClientProvider>);
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

test("once it's in, the sheet closes and the member's tickets are read again", async () => {
  mockAsk.mockResolvedValue(answered);
  const asked = jest.spyOn(qc, "invalidateQueries");
  await show();
  await fireEvent.press(screen.getByRole("radio", { name: "Stuck downloading" }));
  await fireEvent.press(screen.getByRole("button", { name: "Send to the admins" }));
  await settle();
  expect(mockBack).toHaveBeenCalledTimes(1);
  expect(asked).toHaveBeenCalledWith({ queryKey: ["myTickets"] });
});

test("a sheet swiped away while it was sending closes nothing else when the answer comes", async () => {
  let answerNow!: (out: unknown) => void;
  mockAsk.mockReturnValue(new Promise((ok) => { answerNow = ok; }));
  const view = await show();
  await fireEvent.press(screen.getByRole("radio", { name: "Stuck downloading" }));
  await fireEvent.press(screen.getByRole("button", { name: "Send to the admins" }));
  await view.unmount();
  await act(async () => { answerNow(answered); await new Promise((r) => setTimeout(r, 0)); });
  expect(mockBack).not.toHaveBeenCalled();
  expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ text: "Sent to the admins" }));
});
