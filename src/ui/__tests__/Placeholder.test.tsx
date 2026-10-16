// A loading shape: hidden from screen readers (what holds it says "Loading"), a band of
// light sweeping across it, and still under Reduce Motion.
import { beforeEach, expect, jest, test } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";
import { withRepeat } from "react-native-reanimated";
import { Placeholder } from "../Placeholder";

let mockReduced = false;
jest.mock("react-native-worklets", () => jest.requireActual("react-native-worklets/src/mock"));
jest.mock("react-native-reanimated", () => {
  const mock = jest.requireActual<typeof import("react-native-reanimated")>("react-native-reanimated/mock");
  return { ...mock, cubicBezier: () => "ease-out", useReducedMotion: () => mockReduced, withRepeat: jest.fn(mock.withRepeat) };
});

beforeEach(() => { mockReduced = false; jest.mocked(withRepeat).mockClear(); });

test("it sweeps, and a screen reader skips it", async () => {
  await render(<Placeholder height={96} />);
  const box = screen.getByTestId("placeholder", { includeHiddenElements: true });
  expect(box.props.importantForAccessibility).toBe("no-hide-descendants");
  expect(box.props.accessibilityElementsHidden).toBe(true);
  expect(withRepeat).toHaveBeenCalledTimes(1);
});

test("under Reduce Motion it holds still", async () => {
  mockReduced = true;
  await render(<Placeholder height={96} />);
  expect(withRepeat).not.toHaveBeenCalled();
});
