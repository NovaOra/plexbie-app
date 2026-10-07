// The hold-to-confirm button: only a finger that stays down for the whole fill confirms,
// and every other way of pressing it (a screen reader, a switch, voice, a keyboard)
// confirms through a dialog instead.
import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { AccessibilityInfo, Alert, Platform, StyleSheet, type AlertButton } from "react-native";
import { ReduceMotion, withTiming } from "react-native-reanimated";
import { HoldButton } from "../HoldButton";
import { color } from "../theme";

// Reanimated's own stand-ins, with the timing calls kept to look at.
jest.mock("react-native-worklets", () => jest.requireActual("react-native-worklets/src/mock"));
jest.mock("react-native-reanimated", () => {
  const mock = jest.requireActual<typeof import("react-native-reanimated")>("react-native-reanimated/mock");
  return { ...mock, cubicBezier: () => "ease-out", withTiming: jest.fn(mock.withTiming) };
});
let mockLarge = false;
jest.mock("../useColumns", () => ({ useLargeText: () => mockLarge }));

const STAGES = ["Sure?", "Really?", "Going in…"];
let checks: ((on: boolean) => void)[];
let readerChanged: ((on: boolean) => void) | undefined;
let onConfirm: jest.Mock<() => void>;

beforeEach(() => {
  jest.useFakeTimers();
  mockLarge = false;
  checks = [];
  readerChanged = undefined;
  onConfirm = jest.fn();
  // The phone answers "is a screen reader on?" whenever it gets round to it.
  jest.spyOn(AccessibilityInfo, "isScreenReaderEnabled").mockImplementation(() => new Promise<boolean>((r) => { checks.push(r); }));
  jest.spyOn(AccessibilityInfo, "addEventListener").mockImplementation(((name: string, handler: (on: boolean) => void) => {
    if (name === "screenReaderChanged") readerChanged = handler;
    return { remove: () => undefined };
  }) as typeof AccessibilityInfo.addEventListener);
  jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

/** Holds the button down; the screen-reader check, if one is asked, says no straight away. */
const pressIn = async () => { await fireEvent(button(), "pressIn"); await answer(false); };
const answer = async (on: boolean) => { await act(async () => { checks.splice(0).forEach((r) => r(on)); }); };
const wait = async (ms: number) => { await act(async () => { jest.advanceTimersByTime(ms); }); };
const button = () => screen.getByRole("button");

async function show(props: Partial<Parameters<typeof HoldButton>[0]> = {}) {
  const view = await render(<HoldButton label="Import it" stages={STAGES} bail="Chickened out." onConfirm={onConfirm} {...props} />);
  return view;
}

/** Presses the dialog's own confirm button, as someone saying yes would. */
function sayYes() {
  const buttons = (jest.mocked(Alert.alert).mock.calls.at(-1)?.[2] ?? []) as AlertButton[];
  buttons.find((b) => b.style !== "cancel")?.onPress?.();
}

test("a full hold confirms once, without a dialog", async () => {
  await show();
  await answer(false);
  await pressIn();
  await wait(3200);
  await fireEvent(button(), "pressOut");
  await fireEvent.press(button());
  expect(onConfirm).toHaveBeenCalledTimes(1);
  expect(Alert.alert).not.toHaveBeenCalled();
});

test("a quick tap never confirms, even when the screen-reader check answers late", async () => {
  await show();
  await fireEvent(button(), "pressIn");
  await fireEvent(button(), "pressOut");
  await answer(false);
  await wait(5000);
  expect(onConfirm).not.toHaveBeenCalled();
  expect(Alert.alert).not.toHaveBeenCalled();
});

test("letting go early cancels and says so", async () => {
  await show();
  await answer(false);
  await pressIn();
  await wait(1500);
  await fireEvent(button(), "pressOut");
  expect(screen.getAllByText("Chickened out.", { includeHiddenElements: true }).length).toBeGreaterThan(0);
  await wait(5000);
  expect(onConfirm).not.toHaveBeenCalled();
});

test("turning disabled mid-hold cancels it", async () => {
  const view = await show();
  await answer(false);
  await pressIn();
  await wait(1000);
  await view.rerender(<HoldButton label="Import it" stages={STAGES} bail="Chickened out." onConfirm={onConfirm} disabled />);
  await wait(5000);
  expect(onConfirm).not.toHaveBeenCalled();
});

test("a hold that completes calls the latest onConfirm", async () => {
  const view = await show();
  await answer(false);
  await pressIn();
  const later = jest.fn<() => void>();
  await view.rerender(<HoldButton label="Import it" stages={STAGES} bail="Chickened out." onConfirm={later} />);
  await wait(3200);
  expect(later).toHaveBeenCalledTimes(1);
  expect(onConfirm).not.toHaveBeenCalled();
});

test("a click with no touch behind it (keyboard, switch, voice) asks in a dialog", async () => {
  await show({ confirmText: "Did you look at the files?" });
  await answer(false);
  await fireEvent.press(button());
  expect(Alert.alert).toHaveBeenCalledWith("Import it", "Did you look at the files?", expect.any(Array));
  expect(onConfirm).not.toHaveBeenCalled();
  sayYes();
  expect(onConfirm).toHaveBeenCalledTimes(1);
});

test("on Android, the activate action asks in a dialog", async () => {
  jest.replaceProperty(Platform, "OS", "android");
  await show();
  await answer(false);
  expect(button().props.accessibilityActions).toEqual(expect.arrayContaining([expect.objectContaining({ name: "activate" })]));
  await fireEvent(button(), "accessibilityAction", { nativeEvent: { actionName: "activate" } });
  expect(Alert.alert).toHaveBeenCalledTimes(1);
  sayYes();
  expect(onConfirm).toHaveBeenCalledTimes(1);
});

test("iOS's accessibility activate asks in a dialog, with no extra custom action", async () => {
  jest.replaceProperty(Platform, "OS", "ios");
  await show();
  await answer(false);
  expect(button().props.accessibilityActions).toBeUndefined();
  await fireEvent(button(), "accessibilityTap");
  expect(Alert.alert).toHaveBeenCalledTimes(1);
});

test("with a screen reader on, a press asks instead of starting a hold", async () => {
  await show();
  await answer(false);
  await act(async () => { readerChanged?.(true); });
  await fireEvent(button(), "pressIn");
  await answer(true);
  await wait(5000);
  expect(onConfirm).not.toHaveBeenCalled();
  await fireEvent(button(), "pressOut");
  await fireEvent.press(button());
  await answer(true);
  expect(Alert.alert).toHaveBeenCalledTimes(1);
});

test("a disabled button does nothing, however it's pressed", async () => {
  jest.replaceProperty(Platform, "OS", "android");
  await show({ disabled: true });
  await answer(false);
  await fireEvent(button(), "accessibilityAction", { nativeEvent: { actionName: "activate" } });
  await fireEvent(button(), "accessibilityTap");
  expect(Alert.alert).not.toHaveBeenCalled();
  expect(onConfirm).not.toHaveBeenCalled();
});

test("its accessible name is the words on it", async () => {
  await show();
  expect(screen.getByRole("button", { name: "Hold to import it" })).toBeTruthy();
});

test("the fill runs its full length with Reduce Motion on", async () => {
  await show();
  await answer(false);
  await pressIn();
  expect(withTiming).toHaveBeenCalledWith(1, expect.objectContaining({ duration: 3200, reduceMotion: ReduceMotion.Never }));
});

test("the words over the fill are dark", async () => {
  await show();
  const colours = screen.getAllByText("Hold to import it", { includeHiddenElements: true })
    .map((t) => StyleSheet.flatten(t.props.style)?.color);
  expect(colours).toContain(color.ink);
  expect(colours).toContain(color.onTally);
});

test("the words wrap at large text sizes", async () => {
  mockLarge = true;
  await show();
  for (const t of screen.getAllByText("Hold to import it", { includeHiddenElements: true })) expect(t.props.numberOfLines).toBeUndefined();
});
