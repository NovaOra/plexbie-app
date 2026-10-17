// A warning line: a drawn alert triangle in the tally's pink beside its words, not the "⚠"
// glyph each phone draws its own way; the triangle is drawing only, so a screen reader reads the words.
import { expect, jest, test } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { AlertIcon, AlertLine } from "../AlertLine";
import { color } from "../theme";

jest.mock("react-native-worklets", () => jest.requireActual("react-native-worklets/src/mock"));
jest.mock("react-native-reanimated", () => ({ ...jest.requireActual<object>("react-native-reanimated/mock"), cubicBezier: () => "ease-out" }));

test("the words in the tally's pink, beside a triangle a screen reader skips", async () => {
  await render(<AlertLine>Nothing found for over a day</AlertLine>);
  const words = screen.getByText("Nothing found for over a day");
  expect(StyleSheet.flatten(words.props.style).color).toBe(color.tally);
  expect(screen.queryByText(/⚠/)).toBeNull();
  const icon = screen.getByTestId("alert-icon", { includeHiddenElements: true });
  expect(icon.props.importantForAccessibility).toBe("no-hide-descendants");
  expect(StyleSheet.flatten(icon.props.style)).toMatchObject({ width: 18, height: 18 });
});

test("the triangle is three 2px strokes and a \"!\", all tally pink, at any size from 16 to 20", async () => {
  await render(<AlertIcon size={20} />);
  const icon = screen.getByTestId("alert-icon", { includeHiddenElements: true });
  const parts = icon.children.flatMap((c) => (typeof c === "string" ? [] : [StyleSheet.flatten(c.props.style) as { height: number; backgroundColor: string }]));
  expect(parts).toHaveLength(5);
  for (const p of parts) expect(p.backgroundColor).toBe(color.tally);
  expect(parts.slice(0, 3).every((p) => p.height === 2)).toBe(true);
});
