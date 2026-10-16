// The keys and pills: one pink key for the main action, raised keys for the rest, hollow
// pills for quiet ones. A press sinks the face 2px onto a thinner lip (without moving under
// Reduce Motion); a busy key stays down; a blocked one waits, flat, and takes no press.
import { beforeEach, expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen, within } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { Button } from "../Button";
import { color, depth, radius } from "../theme";

let mockReduced = false;
jest.mock("react-native-worklets", () => jest.requireActual("react-native-worklets/src/mock"));
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual<object>("react-native-reanimated/mock"),
  cubicBezier: () => "ease-out",
  useReducedMotion: () => mockReduced,
}));
jest.mock("../haptics", () => ({ tap: () => undefined, select: () => undefined, reward: () => undefined, error: () => undefined }));

beforeEach(() => { mockReduced = false; });

/** The face: the part that looks like the key, inside the tap area. */
const face = (name: string) => {
  const [inner] = screen.getByRole("button", { name }).children;
  return StyleSheet.flatten(typeof inner === "string" ? {} : inner.props.style) as Record<string, unknown>;
};
const lipOf = (name: string) =>
  within(screen.getByRole("button", { name })).queryAllByTestId("key-lip").map((n) => StyleSheet.flatten(n.props.style)?.height);
const spinners = () => screen.queryAllByTestId("key-spinner");
const shift = (name: string) => (face(name).transform as { translateY?: number }[] | undefined)?.[0]?.translateY ?? 0;

test("the main action is a pink key; the others raised slate keys; quiet ones hollow pills", async () => {
  await render(<>
    <Button label="Approve" onPress={() => undefined} />
    <Button kind="secondary" label="Take it" onPress={() => undefined} />
    <Button kind="quiet" label="Try again" onPress={() => undefined} />
  </>);
  expect(face("Approve")).toMatchObject({ backgroundColor: color.screen, borderRadius: radius.s });
  expect(face("Take it")).toMatchObject({ backgroundColor: color.panelRaised, borderRadius: radius.s });
  expect(face("Try again")).toMatchObject({ backgroundColor: "transparent", borderColor: color.slate, borderWidth: 1, borderRadius: radius.pill });
  expect(lipOf("Approve")).toEqual([depth.lip]);
  expect(lipOf("Try again")).toEqual([depth.quietLip]);
});

test("pressed, a key sinks 2px onto a 1px lip, and comes back up", async () => {
  await render(<Button label="Approve" onPress={() => undefined} />);
  await fireEvent(screen.getByRole("button", { name: "Approve" }), "pressIn");
  expect(shift("Approve")).toBe(depth.press);
  expect(lipOf("Approve")).toEqual([depth.lipDown]);
  expect(face("Approve").backgroundColor).toBe(color.screenDeep);
  await fireEvent(screen.getByRole("button", { name: "Approve" }), "pressOut");
  expect(shift("Approve")).toBe(0);
});

test("with Reduce Motion the key doesn't move, but its lip still gives", async () => {
  mockReduced = true;
  await render(<Button kind="secondary" label="Take it" onPress={() => undefined} />);
  await fireEvent(screen.getByRole("button", { name: "Take it" }), "pressIn");
  expect(shift("Take it")).toBe(0);
  expect(lipOf("Take it")).toEqual([depth.lipDown]);
});

test("busy: down, a spinner, its words, and no second press", async () => {
  const onPress = jest.fn();
  await render(<Button label="Approve" busy busyLabel="Approving…" onPress={onPress} />);
  const key = screen.getByRole("button", { name: "Approving…" });
  expect(key.props.accessibilityState).toMatchObject({ busy: true, disabled: true });
  expect(shift("Approving…")).toBe(depth.press);
  expect(spinners()).toHaveLength(1);
  await fireEvent.press(key);
  expect(onPress).not.toHaveBeenCalled();
});

test("blocked: flat and slate, no spinner, no press", async () => {
  const onPress = jest.fn();
  await render(<Button label="Approve" blocked onPress={onPress} />);
  expect(face("Approve")).toMatchObject({ backgroundColor: color.panelRaised, opacity: 1 });
  expect(lipOf("Approve")).toEqual([]);
  expect(spinners()).toHaveLength(0);
  await fireEvent.press(screen.getByRole("button", { name: "Approve" }));
  expect(onPress).not.toHaveBeenCalled();
});
