// The toast: each one's timer only ever hides that toast, and with a screen reader on a
// toast still goes, after longer, and leaves with the screen it was shown on.
import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { AccessibilityInfo, Pressable, Text } from "react-native";
import { ToastProvider, useToast, type ToastIn } from "../Toast";

let mockPath = "/";
jest.mock("expo-router", () => ({ usePathname: () => mockPath }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("react-native-worklets", () => jest.requireActual("react-native-worklets/src/mock"));
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual<object>("react-native-reanimated/mock"),
  cubicBezier: () => "ease-out",
}));
jest.mock("../Glass", () => ({ GlassFill: () => null, glass: { surface: {} } }));

let checks: ((on: boolean) => void)[];

beforeEach(() => {
  jest.useFakeTimers();
  mockPath = "/";
  checks = [];
  // The phone answers "is a screen reader on?" whenever it gets round to it.
  jest.spyOn(AccessibilityInfo, "isScreenReaderEnabled").mockImplementation(() => new Promise<boolean>((r) => { checks.push(r); }));
  jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(() => undefined);
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

function Shows({ toasts }: { toasts: ToastIn[] }) {
  const toast = useToast();
  return (
    <>
      {toasts.map((t) => (
        <Pressable key={t.text} accessibilityRole="button" accessibilityLabel={`Show ${t.text}`} onPress={() => toast(t)}>
          <Text>Show</Text>
        </Pressable>
      ))}
    </>
  );
}
const tree = (toasts: ToastIn[]) => <ToastProvider><Shows toasts={toasts} /></ToastProvider>;
const shown = (text: string) => screen.queryByText(text);
async function answer(i: number, on: boolean) { await act(async () => { checks[i](on); }); }
async function wait(ms: number) { await act(async () => { jest.advanceTimersByTime(ms); }); }
async function press(text: string) { await fireEvent.press(screen.getByRole("button", { name: `Show ${text}` })); }

test("an earlier toast's timer doesn't close the one that replaced it", async () => {
  await render(tree([{ text: "Approved Dune" }, { text: "That didn’t go through", tone: "error" }]));
  // Both shown before the phone answers either check.
  await press("Approved Dune");
  await press("That didn’t go through");
  await answer(0, false);
  await answer(1, false);
  await wait(4500);
  expect(shown("That didn’t go through")).toBeTruthy();
  await wait(1600);
  expect(shown("That didn’t go through")).toBeFalsy();
});

test("with a screen reader on, a toast still goes, after 15 seconds", async () => {
  await render(tree([{ text: "Approved Dune", action: { label: "Undo", onPress: () => undefined } }]));
  await press("Approved Dune");
  await answer(0, true);
  await wait(14_000);
  expect(shown("Approved Dune")).toBeTruthy();
  await wait(1_100);
  expect(shown("Approved Dune")).toBeFalsy();
});

test("with a screen reader on, moving to another screen takes the toast away", async () => {
  await render(tree([{ text: "Approved Dune" }]));
  await press("Approved Dune");
  await answer(0, true);
  await wait(3000);
  mockPath = "/title/movie/1";
  await screen.rerender(tree([{ text: "Approved Dune" }]));
  expect(shown("Approved Dune")).toBeFalsy();
});

test("a toast shown on the way back to the last screen stays to be read", async () => {
  await render(tree([{ text: "Sent to the admins" }]));
  await press("Sent to the admins");
  await answer(0, true);
  mockPath = "/requests";
  await screen.rerender(tree([{ text: "Sent to the admins" }]));
  expect(shown("Sent to the admins")).toBeTruthy();
});

test("without a screen reader, moving on leaves the toast to its timer", async () => {
  await render(tree([{ text: "Approved Dune", action: { label: "Undo", onPress: () => undefined } }]));
  await press("Approved Dune");
  await answer(0, false);
  await wait(3000);
  mockPath = "/title/movie/1";
  await screen.rerender(tree([{ text: "Approved Dune", action: { label: "Undo", onPress: () => undefined } }]));
  expect(shown("Approved Dune")).toBeTruthy();
  await wait(3100);
  expect(shown("Approved Dune")).toBeFalsy();
});
