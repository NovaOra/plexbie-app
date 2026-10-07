// The dropdown pill: a long choice ("Waiting for a decision · 3") gets the row's full width
// rather than a fixed slice of it, and at large text sizes it wraps instead of being cut off.
import { beforeEach, expect, jest, test } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { PickerPill } from "../PickerSheet";

jest.mock("react-native-worklets", () => jest.requireActual("react-native-worklets/src/mock"));
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual<object>("react-native-reanimated/mock"),
  cubicBezier: () => "ease-out",
  useReducedMotion: () => false,
}));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("../Glass", () => ({ GlassFill: () => null, glass: { surface: {} } }));
let mockLarge = false;
jest.mock("../useColumns", () => ({ useLargeText: () => mockLarge }));

const LABEL = "Waiting for a decision · 3";
const show = () => render(
  <PickerPill title="Show" label={LABEL} value="waiting" options={[{ value: "waiting", label: LABEL }]} onChange={() => undefined} />,
);

beforeEach(() => { mockLarge = false; });

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
