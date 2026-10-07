// The dropdown pill: a long choice ("Waiting for a decision · 3") gets the row's full width
// rather than a fixed slice of it, and at large text sizes it wraps instead of being cut off.
// Its sheet leaves room for the home indicator, not for the tab bar it covers.
import { beforeEach, expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { PickerPill } from "../PickerSheet";
import { space } from "../theme";

jest.mock("react-native-worklets", () => jest.requireActual("react-native-worklets/src/mock"));
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual<object>("react-native-reanimated/mock"),
  cubicBezier: () => "ease-out",
  useReducedMotion: () => false,
}));
// The screen's inset (inside a tab, the tab bar's too) and the window's own.
let mockInset = 0;
let mockWindowInset = 0;
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: mockInset, left: 0, right: 0 }),
  get initialWindowMetrics() {
    return { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 0, bottom: mockWindowInset, left: 0, right: 0 } };
  },
}));
jest.mock("../Glass", () => ({ GlassFill: () => null, glass: { surface: {} } }));
let mockLarge = false;
jest.mock("../useColumns", () => ({ useLargeText: () => mockLarge }));

const LABEL = "Waiting for a decision · 3";
const show = () => render(
  <PickerPill title="Show" label={LABEL} value="waiting" options={[{ value: "waiting", label: LABEL }]} onChange={() => undefined} />,
);

beforeEach(() => { mockLarge = false; mockInset = 0; mockWindowInset = 0; });

test("a long choice can use the row's full width", async () => {
  await show();
  const pill = StyleSheet.flatten(screen.getByRole("button", { name: `Show: ${LABEL}` }).props.style);
  expect(pill.maxWidth).toBe("100%");
});

test("at the default text size the choice stays on one line", async () => {
  await show();
  expect(screen.getByText(LABEL).props.numberOfLines).toBe(1);
});

test("at large text sizes the choice wraps", async () => {
  mockLarge = true;
  await show();
  expect(screen.getByText(LABEL).props.numberOfLines).toBeUndefined();
});

test("on iPhone, the open sheet's bottom fits the home indicator, not the tab bar under it", async () => {
  mockInset = 83;
  mockWindowInset = 34;
  await show();
  await fireEvent.press(screen.getByRole("button", { name: `Show: ${LABEL}` }));
  let sheet = screen.getByRole("header", { name: "Show" }).parent;
  while (sheet && StyleSheet.flatten(sheet.props.style)?.paddingBottom === undefined) sheet = sheet.parent;
  expect(StyleSheet.flatten(sheet!.props.style).paddingBottom).toBe(34 + space.l);
});
