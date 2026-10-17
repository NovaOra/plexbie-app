// Segmented controls and rows of keys: a chosen option is a raised face with a coloured line
// along its foot, never a pink fill; labels stay on one line (short labels on a narrow
// track, and a row of keys too narrow for its words stacks them).
import { beforeEach, expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Dimensions, StyleSheet, View } from "react-native";
import { Button } from "../Button";
import { KeyRow } from "../KeyRow";
import { Segmented } from "../Segmented";
import { color } from "../theme";

jest.mock("react-native-worklets", () => jest.requireActual("react-native-worklets/src/mock"));
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual<object>("react-native-reanimated/mock"),
  cubicBezier: () => "ease-out",
  useReducedMotion: () => false,
}));
jest.mock("../haptics", () => ({ tap: () => undefined, select: () => undefined, reward: () => undefined, error: () => undefined }));

// The phone's text at its usual size (jest's stand-in is 2x).
beforeEach(() => { Dimensions.set({ window: { width: 390, height: 844, scale: 3, fontScale: 1 }, screen: { width: 390, height: 844, scale: 3, fontScale: 1 } }); });

const layout = (width: number) => ({ nativeEvent: { layout: { width, height: 52, x: 0, y: 0 } } });
const OPTIONS = [{ id: "note", label: "Note for admins", short: "Note" }, { id: "reply", label: "Reply to Jordan Lee", short: "Reply" }];

test("the chosen option is a raised face with the accent along its foot, not a pink fill", async () => {
  const onChange = jest.fn();
  await render(<Segmented accessibilityLabel="Who sees it" options={OPTIONS} value="note" onChange={onChange} accent={color.note} />);
  const note = screen.getByRole("radio", { name: "Note for admins" });
  expect(note.props.accessibilityState).toMatchObject({ checked: true });
  const face = StyleSheet.flatten((note.children[0] as unknown as { props: { style: object } }).props.style);
  expect(face).toMatchObject({ backgroundColor: color.panelRaised });
  const lines = screen.root!.queryAll((n) => n.type === "View" && StyleSheet.flatten(n.props.style)?.backgroundColor === color.note);
  expect(lines).toHaveLength(1);
  await fireEvent.press(screen.getByRole("radio", { name: "Reply to Jordan Lee" }));
  expect(onChange).toHaveBeenCalledWith("reply");
});

test("on a narrow track the options say their short labels; their names stay whole", async () => {
  await render(<Segmented accessibilityLabel="Who sees it" options={OPTIONS} value="note" onChange={() => undefined} />);
  expect(screen.getByText("Note for admins")).toBeTruthy();
  await fireEvent(screen.getByLabelText("Who sees it"), "layout", layout(260));
  expect(screen.getByText("Note")).toBeTruthy();
  expect(screen.getByRole("radio", { name: "Reply to Jordan Lee" })).toBeTruthy();
});

test("keys sit side by side when their words fit, and stack when they don't", async () => {
  const row = (width: number) => (
    <View testID="wrap">
      <KeyRow><Button kind="secondary" label="Wait on Jordan" onPress={() => undefined} /><Button kind="secondary" label="Solve…" onPress={() => undefined} /></KeyRow>
    </View>
  );
  const view = await render(row(0));
  const keyRow = () => screen.getByTestId("wrap").children[0] as unknown as { props: { style: object } };
  await fireEvent(keyRow() as never, "layout", layout(420));
  expect(StyleSheet.flatten(keyRow().props.style)).toMatchObject({ flexDirection: "row" });
  // Too narrow for equal halves: one under the other, full width (never in proportion).
  await fireEvent(keyRow() as never, "layout", layout(320));
  const style = StyleSheet.flatten(keyRow().props.style) as { flexDirection?: string };
  expect(style.flexDirection).toBeUndefined();
  for (const name of ["Wait on Jordan", "Solve…"]) {
    expect(StyleSheet.flatten(screen.getByRole("button", { name }).props.style)).toMatchObject({ alignSelf: "stretch" });
  }
  await view.unmount();
});

test("what the phone measures of a label wins over the estimate", async () => {
  await render(
    <View testID="wrap">
      <KeyRow><Button kind="secondary" label="Wait on Jordan" onPress={() => undefined} /><Button kind="secondary" label="Solve…" onPress={() => undefined} /></KeyRow>
    </View>,
  );
  const keyRow = () => screen.getByTestId("wrap").children[0] as unknown as { props: { style: object } };
  await fireEvent(keyRow() as never, "layout", layout(420));
  expect(StyleSheet.flatten(keyRow().props.style)).toMatchObject({ flexDirection: "row" });
  // Laid out, "Wait on Jordan" is far wider than its letters suggested: the pair stacks.
  const measured = screen.getAllByText("Wait on Jordan", { includeHiddenElements: true }).at(-1)!;
  await fireEvent(measured, "layout", layout(320));
  expect((StyleSheet.flatten(keyRow().props.style) as { flexDirection?: string }).flexDirection).toBeUndefined();
});

test("a key's words stay on one line, unless the phone's text is large", async () => {
  const view = await render(<Button label="Sign out and try again with Plex" onPress={() => undefined} />);
  expect(screen.getByText("Sign out and try again with Plex").props.numberOfLines).toBe(1);
  await view.unmount();
  Dimensions.set({ window: { width: 390, height: 844, scale: 3, fontScale: 2 }, screen: { width: 390, height: 844, scale: 3, fontScale: 2 } });
  await render(<Button label="Sign out and try again with Plex" onPress={() => undefined} />);
  expect(screen.getByText("Sign out and try again with Plex").props.numberOfLines).toBeUndefined();
});
