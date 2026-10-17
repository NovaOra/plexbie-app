// A row of keys stacks only on the phone's own measurements: side by side until its width and
// every label are known, then one under another only if a label doesn't fit its half.
import { expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { Button } from "../Button";
import { HoldButton } from "../HoldButton";
import { KeyRow } from "../KeyRow";

jest.mock("react-native-worklets", () => jest.requireActual("react-native-worklets/src/mock"));
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual<object>("react-native-reanimated/mock"),
  cubicBezier: () => "ease-out",
  useReducedMotion: () => false,
}));
jest.mock("../haptics", () => ({ tap: () => undefined, select: () => undefined, reward: () => undefined, error: () => undefined }));

const show = () => render(
  <KeyRow style={{}}>
    <Button kind="secondary" label="Look inside" onPress={() => undefined} />
    <Button kind="quiet" label="Search again" onPress={() => undefined} />
  </KeyRow>,
);
const measure = async (label: string, width: number) =>
  fireEvent(screen.getAllByText(label, { includeHiddenElements: true }).at(-1)!, "layout", { nativeEvent: { layout: { width, height: 20 } } });

test("the estimate alone never stacks a pair", async () => {
  await show();
  const box = screen.getByText("Look inside").parent!.parent!.parent!;
  // The row is narrow enough that the rough estimate would stack it.
  await fireEvent(box, "layout", { nativeEvent: { layout: { width: 292, height: 48 } } });
  expect(StyleSheet.flatten(box.props.style).flexDirection).toBe("row");
  // Measured, and it fits: still side by side.
  await measure("Look inside", 88);
  await measure("Search again", 96);
  expect(StyleSheet.flatten(box.props.style).flexDirection).toBe("row");
  // A label that truly doesn't fit its half stacks the pair.
  await measure("Search again", 140);
  expect(StyleSheet.flatten(box.props.style).flexDirection).toBeUndefined();
});

test("a pair with a hold is sized for its resting words, not for what it says once armed", async () => {
  await render(
    <KeyRow>
      <Button kind="secondary" label="Invite to Plex" onPress={() => undefined} />
      <HoldButton kind="quiet" label="Deny" onConfirm={() => undefined} />
    </KeyRow>,
  );
  const box = screen.getByText("Invite to Plex").parent!.parent!.parent!;
  await fireEvent(box, "layout", { nativeEvent: { layout: { width: 340, height: 48 } } });
  await measure("Invite to Plex", 110);
  await measure("Hold to deny", 95);
  // "Tap again to deny" would need more than its half; it's fitted into the key once armed instead.
  for (const t of screen.getAllByText("Tap again to deny", { includeHiddenElements: true })) {
    await fireEvent(t, "layout", { nativeEvent: { layout: { width: 150, height: 20 } } });
  }
  expect(StyleSheet.flatten(box.props.style).flexDirection).toBe("row");
});
