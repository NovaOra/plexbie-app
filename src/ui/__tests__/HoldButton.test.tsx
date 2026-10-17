// The hold-to-confirm button: a finger that stays down for the whole fill confirms, and so
// do two quick presses (the first arms it). Every other way of pressing it (a screen
// reader, a switch, voice, a keyboard) works like the two presses. No dialogs.
import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { AccessibilityInfo, Alert, Platform, StyleSheet } from "react-native";
import { ReduceMotion, withTiming } from "react-native-reanimated";
import { HoldButton } from "../HoldButton";
import { color, depth } from "../theme";

// Reanimated's own stand-ins, with the timing calls kept to look at.
jest.mock("react-native-worklets", () => jest.requireActual("react-native-worklets/src/mock"));
jest.mock("react-native-reanimated", () => {
  const mock = jest.requireActual<typeof import("react-native-reanimated")>("react-native-reanimated/mock");
  return { ...mock, cubicBezier: () => "ease-out", useReducedMotion: () => false, withTiming: jest.fn(mock.withTiming) };
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
  jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(() => undefined);
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

/** A finger's quick tap: down, up at once, and the press that follows. */
const tap = async () => {
  await fireEvent(button(), "pressIn");
  await answer(false);
  await fireEvent(button(), "pressOut");
  await fireEvent.press(button());
};
const lip = () => StyleSheet.flatten(screen.getByTestId("key-lip").props.style);

test("a full hold confirms once, without a dialog", async () => {
  await show();
  await answer(false);
  await pressIn();
  await wait(1000);
  await fireEvent(button(), "pressOut");
  await fireEvent.press(button());
  expect(onConfirm).toHaveBeenCalledTimes(1);
  expect(Alert.alert).not.toHaveBeenCalled();
});

test("a quick tap arms it and says so; a second confirms", async () => {
  await show();
  await answer(false);
  await tap();
  expect(onConfirm).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Tap again to import it" })).toBeTruthy();
  expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith("Tap again to import it");
  // The words on it keep the verb, as its name does.
  expect(screen.getAllByText("Tap again to import it", { includeHiddenElements: true }).length).toBeGreaterThan(0);
  expect(lip()).toMatchObject({ height: depth.lip, backgroundColor: color.tally });
  await tap();
  expect(onConfirm).toHaveBeenCalledTimes(1);
  expect(Alert.alert).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Hold to import it" })).toBeTruthy();
});

test("a tap too quick for React Native to show the press (its press arrives before it lets go) still arms it", async () => {
  await show();
  await answer(false);
  await fireEvent(button(), "pressIn");
  await answer(false);
  await fireEvent.press(button());
  await wait(130);
  await fireEvent(button(), "pressOut");
  expect(onConfirm).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Tap again to import it" })).toBeTruthy();
  await fireEvent(button(), "pressIn");
  await fireEvent.press(button());
  await fireEvent(button(), "pressOut");
  expect(onConfirm).toHaveBeenCalledTimes(1);
});

test("armed, it waits a few seconds for the second press, then disarms", async () => {
  await show();
  await answer(false);
  await tap();
  await wait(4000);
  expect(screen.getByRole("button", { name: "Hold to import it" })).toBeTruthy();
  await tap();
  expect(onConfirm).not.toHaveBeenCalled();
});

test("a quick tap never confirms by itself, even when the screen-reader check answers late", async () => {
  await show();
  await fireEvent(button(), "pressIn");
  await fireEvent(button(), "pressOut");
  await answer(false);
  await wait(5000);
  expect(onConfirm).not.toHaveBeenCalled();
});

test("letting go of a hold early cancels and says so, without arming it", async () => {
  await show();
  await answer(false);
  await pressIn();
  await wait(600);
  await fireEvent(button(), "pressOut");
  await fireEvent.press(button());
  expect(screen.getAllByText("Chickened out.", { includeHiddenElements: true }).length).toBeGreaterThan(0);
  await wait(5000);
  expect(onConfirm).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Hold to import it" })).toBeTruthy();
});

test("turning disabled mid-hold cancels it, and disarms an armed one", async () => {
  const view = await show();
  await answer(false);
  await pressIn();
  await wait(500);
  await view.rerender(<HoldButton label="Import it" stages={STAGES} bail="Chickened out." onConfirm={onConfirm} disabled />);
  await wait(5000);
  expect(onConfirm).not.toHaveBeenCalled();
  await view.rerender(<HoldButton label="Import it" stages={STAGES} bail="Chickened out." onConfirm={onConfirm} />);
  await tap();
  await view.rerender(<HoldButton label="Import it" stages={STAGES} bail="Chickened out." onConfirm={onConfirm} blocked />);
  await view.rerender(<HoldButton label="Import it" stages={STAGES} bail="Chickened out." onConfirm={onConfirm} />);
  await tap();
  expect(onConfirm).not.toHaveBeenCalled();
});

test("a hold that completes calls the latest onConfirm", async () => {
  const view = await show();
  await answer(false);
  await pressIn();
  const later = jest.fn<() => void>();
  await view.rerender(<HoldButton label="Import it" stages={STAGES} bail="Chickened out." onConfirm={later} />);
  await wait(1000);
  expect(later).toHaveBeenCalledTimes(1);
  expect(onConfirm).not.toHaveBeenCalled();
});

test("a click with no touch behind it (keyboard, switch, voice) arms, and a second confirms", async () => {
  await show({ confirmText: "Did you look at the files?" });
  await answer(false);
  expect(button().props.accessibilityHint).toBe("Did you look at the files? Press and hold, or press twice, to confirm.");
  await fireEvent.press(button());
  expect(onConfirm).not.toHaveBeenCalled();
  await fireEvent.press(button());
  expect(onConfirm).toHaveBeenCalledTimes(1);
  expect(Alert.alert).not.toHaveBeenCalled();
});

test("on Android, the activate action arms, and a second confirms", async () => {
  jest.replaceProperty(Platform, "OS", "android");
  await show();
  await answer(false);
  expect(button().props.accessibilityActions).toEqual(expect.arrayContaining([expect.objectContaining({ name: "activate" })]));
  await fireEvent(button(), "accessibilityAction", { nativeEvent: { actionName: "activate" } });
  expect(onConfirm).not.toHaveBeenCalled();
  await fireEvent(button(), "accessibilityAction", { nativeEvent: { actionName: "activate" } });
  expect(onConfirm).toHaveBeenCalledTimes(1);
});

test("iOS's accessibility activate arms, with no extra custom action", async () => {
  jest.replaceProperty(Platform, "OS", "ios");
  await show();
  await answer(false);
  expect(button().props.accessibilityActions).toBeUndefined();
  await fireEvent(button(), "accessibilityTap");
  expect(screen.getByRole("button", { name: "Tap again to import it" })).toBeTruthy();
  await fireEvent(button(), "accessibilityTap");
  expect(onConfirm).toHaveBeenCalledTimes(1);
});

test("with a screen reader on, a press arms instead of starting a hold", async () => {
  await show();
  await answer(false);
  await act(async () => { readerChanged?.(true); });
  await fireEvent(button(), "pressIn");
  await answer(true);
  await wait(5000);
  expect(onConfirm).not.toHaveBeenCalled();
  await fireEvent(button(), "pressOut");
  await fireEvent.press(button());
  expect(screen.getByRole("button", { name: "Tap again to import it" })).toBeTruthy();
});

test("a disabled, busy or blocked button does nothing, however it's pressed", async () => {
  jest.replaceProperty(Platform, "OS", "android");
  for (const off of [{ disabled: true }, { busy: true }, { blocked: true }]) {
    const view = await show(off);
    await answer(false);
    for (let i = 0; i < 2; i++) {
      await fireEvent(button(), "accessibilityAction", { nativeEvent: { actionName: "activate" } });
      await fireEvent(button(), "accessibilityTap");
    }
    await pressIn();
    await wait(1000);
    expect(onConfirm).not.toHaveBeenCalled();
    await view.unmount();
  }
});

test("its accessible name is the words on it", async () => {
  await show();
  expect(screen.getByRole("button", { name: "Hold to import it" })).toBeTruthy();
});

test("the fill runs its full length with Reduce Motion on, a second by default", async () => {
  await show();
  await answer(false);
  await pressIn();
  expect(withTiming).toHaveBeenCalledWith(1, expect.objectContaining({ duration: 1000, reduceMotion: ReduceMotion.Never }));
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
