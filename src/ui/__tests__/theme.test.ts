// The shared text box and its rims keep the exact look each screen had on its own.
import { expect, jest, test } from "@jest/globals";
import { color, multilineInput, replyRim } from "../theme";

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
