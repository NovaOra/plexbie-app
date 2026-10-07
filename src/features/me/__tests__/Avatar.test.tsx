// Your picture through the bot's proxy carries your sign-in, so it's kept in memory only:
// nothing of it is left on disk for whoever signs in next. A public one may go to disk.
import { expect, jest, test } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";
import type { ImageSource } from "expo-image";
import { Avatar } from "../Avatar";

jest.mock("react-native-worklets", () => jest.requireActual("react-native-worklets/src/mock"));
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual<object>("react-native-reanimated/mock"),
  cubicBezier: () => "ease-out",
}));
jest.mock("expo-image", () => {
  const { createElement } = jest.requireActual<typeof import("react")>("react");
  const { View } = jest.requireActual<typeof import("react-native")>("react-native");
  return { Image: (props: object) => createElement(View, { ...props, testID: "avatar-image" }) };
});
jest.mock("../../art", () => ({
  useArt: () => (avatar: string | null | undefined): ImageSource | null => !avatar ? null
    : avatar.startsWith("/img/") ? { uri: `https://plexbie.example${avatar}`, headers: { Authorization: "Bearer t" } } : { uri: avatar },
}));

test("a proxied picture is kept in memory only", async () => {
  await render(<Avatar name="Omar" avatar="/img/avatar/1" size={40} />);
  expect(screen.getByTestId("avatar-image").props.cachePolicy).toBe("memory");
});

test("a public picture may be kept on disk", async () => {
  await render(<Avatar name="Omar" avatar="https://cdn.example/a.png" size={40} />);
  expect(screen.getByTestId("avatar-image").props.cachePolicy).toBe("memory-disk");
});
