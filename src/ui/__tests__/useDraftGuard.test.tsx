// A help note that's been typed isn't thrown away without asking: Back (or a swipe the
// phone lets the app stop) asks "Discard your message?" first. Nothing typed, or the
// note sent, and the sheet just closes. A sheet Android has already swiped away keeps
// the note for next time instead. The question is drawn inside the sheet: on iOS a dialog
// from the app underneath can't show over it.
import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { router, Stack } from "expo-router";
import { act, fireEvent, renderRouter, screen, within } from "expo-router/testing-library";
import { Platform, Text, View } from "react-native";
import { myRequests } from "../../api/__fixtures__/bot";
import type { AppRequest } from "../../api/schemas";

const rows = myRequests as unknown as AppRequest[];
const mine = rows.find((r) => r.id && !r.help) ?? { ...rows[0], id: "900101", help: null };
const mockAskHelp = jest.fn<() => Promise<{ help: null; message: string }>>();
jest.mock("../../features/requests/useRequests", () => ({ useRequests: () => ({ data: [mockMine] }) }));
jest.mock("../../auth/session", () => ({
  useApi: () => ({ askHelp: mockAskHelp }),
  useSession: () => ({ state: { phase: "signedIn", server: "https://plexbie.example", token: "t", sample: false } }),
  useServer: () => "https://plexbie.example",
}));
jest.mock("react-native-safe-area-context", () => jest.requireActual<{ default: object }>("react-native-safe-area-context/jest/mock").default);
jest.mock("react-native-worklets", () => jest.requireActual("react-native-worklets/src/mock"));
jest.mock("../haptics", () => ({ tap: () => undefined, select: () => undefined, error: () => undefined, success: () => undefined }));
jest.mock("../Glass", () => ({ GlassFill: () => null, glass: { surface: {}, strong: {} } }));
let mockMine: AppRequest;
// expo-router's test kit brings its own Reanimated stand-in; it gets the app's easing and
// motion setting before the screens load.
Object.assign(jest.requireMock<Record<string, unknown>>("react-native-reanimated"), {
  cubicBezier: () => "ease-out",
  useReducedMotion: () => false,
});
const Help = (require("../../app/help/[slot]") as typeof import("../../app/help/[slot]")).default;
const { ConfirmProvider } = require("../Confirm") as typeof import("../Confirm");

const os = Platform.OS;
let qc: QueryClient;
let n = 0;
beforeEach(() => {
  // A request of its own each time: a kept note doesn't carry over from one test to the next.
  mockMine = { ...(mine as AppRequest), slot: (mine as AppRequest).slot + ++n };
  mockAskHelp.mockReset();
  qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
});
afterEach(() => { Platform.OS = os; });

function Layout() {
  return (
    <QueryClientProvider client={qc}>
      <ConfirmProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </ConfirmProvider>
    </QueryClientProvider>
  );
}

/** Home, with the help sheet for the request opened over it; returns where the app is. */
async function openSheet() {
  // The render is a promise with the router helpers on it: kept, not unwrapped.
  const sheet = () => <View testID="sheet"><Help /></View>;
  const view = renderRouter({ _layout: Layout, index: () => <Text>Home</Text>, "help/[slot]": sheet }, { initialUrl: "/" });
  await view;
  await act(async () => { router.push({ pathname: "/help/[slot]", params: { slot: String(mockMine.slot) } }); });
  expect(view.getPathname()).toBe(`/help/${mockMine.slot}`);
  return () => view.getPathname();
}
const note = () => screen.getByLabelText(/^Anything else/);
const type = async (text: string) => { await fireEvent.changeText(note(), text); };
const back = async () => { await act(async () => { router.back(); }); };

test("nothing typed: Back closes the sheet without asking", async () => {
  const where = await openSheet();
  await back();
  expect(screen.queryByText("Discard your message?")).toBeNull();
  expect(where()).toBe("/");
});

test("a typed note: Back asks first, and Keep editing keeps the note", async () => {
  const where = await openSheet();
  await type("It’s been at 0% since this morning");
  await back();
  expect(screen.getByText("Discard your message?")).toBeTruthy();
  expect(where()).toBe(`/help/${mockMine.slot}`);
  await fireEvent.press(screen.getByRole("button", { name: "Keep editing" }));
  expect(screen.queryByText("Discard your message?")).toBeNull();
  expect(where()).toBe(`/help/${mockMine.slot}`);
  expect(note().props.value).toBe("It’s been at 0% since this morning");
});

test("a typed note: Discard leaves, and the note is gone next time", async () => {
  const where = await openSheet();
  await type("It’s been at 0% since this morning");
  await back();
  await act(async () => { fireEvent.press(screen.getByRole("button", { name: "Discard" })); });
  expect(where()).toBe("/");
  await act(async () => { router.push({ pathname: "/help/[slot]", params: { slot: String(mockMine.slot) } }); });
  expect(note().props.value).toBe("");
});

test("only spaces typed: nothing to lose, so no question", async () => {
  const where = await openSheet();
  await type("   ");
  await back();
  expect(screen.queryByText("Discard your message?")).toBeNull();
  expect(where()).toBe("/");
});

test("once the note is sent, the sheet closes without asking", async () => {
  mockAskHelp.mockResolvedValue({ help: null, message: "" });
  const where = await openSheet();
  await fireEvent.press(screen.getByRole("radio", { name: "Stuck downloading" }));
  await type("It’s been at 0% since this morning");
  await act(async () => { fireEvent.press(screen.getByRole("button", { name: "Send to the admins" })); });
  expect(mockAskHelp).toHaveBeenCalledTimes(1);
  expect(screen.queryByText("Discard your message?")).toBeNull();
  expect(where()).toBe("/");
});

test("on iOS, a swipe-down the sheet held back asks first, in the sheet itself", async () => {
  Platform.OS = "ios";
  const where = await openSheet();
  await type("It’s been at 0% since this morning");
  // What the native stack sends when a swipe was held back because of the draft.
  await act(async () => { router.dismiss(); });
  expect(within(screen.getByTestId("sheet")).getByText("Discard your message?")).toBeTruthy();
  expect(where()).toBe(`/help/${mockMine.slot}`);
});

test("on Android, a sheet already swiped away goes, and the note is there when it's opened again", async () => {
  Platform.OS = "android";
  const where = await openSheet();
  await type("It’s been at 0% since this morning");
  // What the native stack sends once Android's sheet is gone: it can't be stopped.
  await act(async () => { router.dismiss(); });
  expect(screen.queryByText("Discard your message?")).toBeNull();
  expect(where()).toBe("/");
  await act(async () => { router.push({ pathname: "/help/[slot]", params: { slot: String(mockMine.slot) } }); });
  expect(note().props.value).toBe("It’s been at 0% since this morning");
});

test("a kept note for a request that can no longer take a help request: Close doesn't ask about it", async () => {
  Platform.OS = "android";
  await openSheet();
  await type("It’s been at 0% since this morning");
  await act(async () => { router.dismiss(); });
  mockMine = { ...mockMine, id: undefined };
  await act(async () => { router.push({ pathname: "/help/[slot]", params: { slot: String(mockMine.slot) } }); });
  await act(async () => { fireEvent.press(screen.getByRole("button", { name: "Close" })); });
  expect(screen.queryByText("Discard your message?")).toBeNull();
  expect(screen.getByText("Home")).toBeTruthy();
});
