// The website's tokens, the shared text box and its rims: the same values the web uses.
import { expect, jest, test } from "@jest/globals";
import { color, depth, multilineInput, replyRim, space, tint, type } from "../theme";

jest.mock("react-native-worklets", () => jest.requireActual("react-native-worklets/src/mock"));
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual<object>("react-native-reanimated/mock"),
  cubicBezier: () => "ease-out",
}));

test("a reply rim is pink and a staff note's is amber, at the strength asked for", () => {
  expect(replyRim(0.6)).toEqual({ borderColor: "rgba(255, 209, 228, 0.6)" });
  expect(replyRim(0.35)).toEqual({ borderColor: "rgba(255, 209, 228, 0.35)" });
  expect(replyRim(0.45, "note")).toEqual({ borderColor: "rgba(229, 160, 13, 0.45)" });
});

test("a multiline box is two touch targets tall and types from the top", () => {
  expect(multilineInput).toMatchObject({ minHeight: 96, borderColor: color.slate, fontSize: 16, textAlignVertical: "top" });
});

test("the palette, spacing and type carry the website's values", () => {
  expect(color).toMatchObject({ screen: "#ffd1e4", screenHover: "#ffe0ed", screenDeep: "#f5b3cf",
    note: "#e5a00d", noteHover: "#e9ae31", noteDeep: "#c3880b", onNote: "#1f1503" });
  expect(Object.values(space)).toEqual([4, 8, 12, 16, 24, 32, 48]);
  expect([type.body.fontSize, type.body.lineHeight]).toEqual([16, 24]);
  // Every step reads as a step: each heading is bigger than the one below it.
  expect(type.display.fontSize).toBeGreaterThan(type.h2.fontSize);
  expect(type.h2.fontSize).toBeGreaterThan(type.h3.fontSize);
  expect(type.h3.fontSize).toBeGreaterThan(type.small.fontSize);
});

test("a key's lip is 3px and 1px pressed, so the face sinks 2px", () => {
  expect(depth.lip - depth.lipDown).toBe(depth.press);
  expect(tint("#e5a00d", 0.16)).toBe("rgba(229, 160, 13, 0.16)");
});
