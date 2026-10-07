// One of the member's requests: a placeholder while the list loads, the error with Try
// again when it fails, "isn't yours, or it's gone" when the slot isn't in the list, and
// the request itself, its title the screen's heading.
import { beforeEach, expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { myRequests } from "../../../api/__fixtures__/bot";
import type { AppRequest } from "../../../api/schemas";
import { RequestDetail } from "../RequestDetail";

type Answer = { data?: AppRequest[]; error: Error | null; refetch: () => void };
const mockRefetch = jest.fn();
let mockAnswer: Answer;
jest.mock("../../requests/useRequests", () => ({ useRequests: () => mockAnswer }));
jest.mock("../../../auth/session", () => ({
  useApi: () => ({}),
  useSession: () => ({ state: { phase: "signedIn", server: "https://plexbie.example", token: "t", sample: false } }),
}));
jest.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({}) }));
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ slot: String(mockSlot) }),
  useFocusEffect: () => undefined,
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
}));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("react-native-worklets", () => jest.requireActual("react-native-worklets/src/mock"));
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual<object>("react-native-reanimated/mock"),
  cubicBezier: () => "ease-out",
  useReducedMotion: () => false,
}));
jest.mock("expo-image", () => ({ Image: () => null }));
jest.mock("../../../ui/haptics", () => ({ tap: () => undefined, select: () => undefined, reward: () => undefined, error: () => undefined, success: () => undefined }));
jest.mock("../../../ui/Glass", () => ({ Ambient: () => null, GlassFill: () => null, FrostedTop: () => null, glass: { surface: {} } }));
jest.mock("../StageBox", () => ({ StageBox: () => null, SeasonsBox: () => null }));

const rows = myRequests as unknown as AppRequest[];
let mockSlot = rows[0].slot;
beforeEach(() => {
  mockRefetch.mockReset();
  mockSlot = rows[0].slot;
});

test("while the list loads, a placeholder", async () => {
  mockAnswer = { data: undefined, error: null, refetch: mockRefetch };
  await render(<RequestDetail />);
  expect(screen.getByLabelText("Loading")).toBeTruthy();
  expect(screen.queryByRole("alert")).toBeNull();
});

test("a load that fails says so, and Try again loads it again", async () => {
  mockAnswer = { data: undefined, error: new Error("The server didn’t answer."), refetch: mockRefetch };
  await render(<RequestDetail />);
  expect(screen.getByRole("alert").props.children).toBe("Couldn’t load this request.");
  await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
  expect(mockRefetch).toHaveBeenCalledTimes(1);
});

test("a slot that isn't in the list: not yours, or gone, with nothing to try again", async () => {
  mockSlot = 99_999;
  mockAnswer = { data: rows, error: null, refetch: mockRefetch };
  await render(<RequestDetail />);
  expect(screen.getByRole("alert").props.children).toBe("That request isn’t yours, or it’s gone.");
  expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
});

test("the request, its title the heading", async () => {
  mockAnswer = { data: rows, error: null, refetch: mockRefetch };
  await render(<RequestDetail />);
  expect(screen.getByRole("header", { name: rows[0].title.title })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Back" })).toBeTruthy();
});
