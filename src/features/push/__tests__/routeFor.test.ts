// Tapping an alert: the bot's website path in the alert becomes one of the app's screens,
// and anything the app doesn't recognise lands on Home rather than an unknown route.
import { expect, test } from "@jest/globals";
import { routeFor, routeForLink } from "../push";

test("the household's pages, at the root and under /app from older bots", () => {
  expect(routeFor("/requests")).toBe("/requests");
  expect(routeFor("/schedule")).toBe("/requests");
  expect(routeFor("/app/requests")).toBe("/requests");
  expect(routeFor("/app/schedule?x=1")).toBe("/requests");
  expect(routeFor("/manage")).toBe("/manage");
  expect(routeFor("/app/manage")).toBe("/manage");
});

test("a ticket opens that ticket", () => {
  expect(routeFor("/manage?tab=tickets&ticket=0123456789ab")).toEqual({ pathname: "/manage-ticket/[id]", params: { id: "0123456789ab" } });
  expect(routeFor("/app/manage?ticket=abcdef012345")).toEqual({ pathname: "/manage-ticket/[id]", params: { id: "abcdef012345" } });
});

test("a conversation opens that conversation", () => {
  expect(routeFor("/manage?tab=messages&who=d123456789")).toEqual({ pathname: "/manage", params: { tab: "messages", who: "d123456789" } });
  expect(routeFor("/manage?tab=messages&who=ppat%40example.com")).toEqual({ pathname: "/manage", params: { tab: "messages", who: "ppat@example.com" } });
});

test("a tab opens that tab", () => {
  expect(routeFor("/manage?tab=joins")).toEqual({ pathname: "/manage", params: { tab: "joins" } });
});

test("anything malformed falls back instead of reaching a route", () => {
  // Not a ticket id: the tab it named, else Manage itself.
  expect(routeFor("/manage?tab=tickets&ticket=../../etc")).toEqual({ pathname: "/manage", params: { tab: "tickets" } });
  expect(routeFor("/manage?ticket=0123456789ABCDEF")).toBe("/manage");
  expect(routeFor("/manage?tab=Not/A-Tab")).toBe("/manage");
  // Someone who isn't "d…" (Discord) or "p…" (Plex) is not a conversation.
  expect(routeFor("/manage?tab=messages&who=x123")).toEqual({ pathname: "/manage", params: { tab: "messages" } });
});

test("unknown, empty or non-string targets go Home", () => {
  for (const url of ["/", "", "/settings", "https://example.com/requests", "/applications", undefined, null, 42, { url: "/requests" }]) {
    expect(routeFor(url)).toBe("/home");
  }
});

// Opening one of the app's own links while signed out: kept for after the sign-in, but only
// when it names a screen the app has, in a shape it accepts.
test("the app's own links name their screen", () => {
  expect(routeForLink("com.plexbie.app:///request/214")).toEqual({ pathname: "/request/[slot]", params: { slot: "214" } });
  expect(routeForLink("com.plexbie.app://request/214")).toEqual({ pathname: "/request/[slot]", params: { slot: "214" } });
  expect(routeForLink("com.plexbie.app:///title/movie/693134")).toEqual({ pathname: "/title/[kind]/[id]", params: { kind: "movie", id: "693134" } });
  expect(routeForLink("com.plexbie.app:///requests")).toBe("/requests");
  expect(routeForLink("com.plexbie.app:///library/")).toBe("/library");
  expect(routeForLink("com.plexbie.app:///manage?tab=tickets&ticket=0123456789ab")).toEqual({ pathname: "/manage-ticket/[id]", params: { id: "0123456789ab" } });
});

test("sign-in and invite links, Home and anything unknown or malformed keep nothing", () => {
  for (const url of [
    "com.plexbie.app://auth?code=abc&state=xyz", "com.plexbie.app://invite?server=https%3A%2F%2Fplexbie.example.com&code=abcdefgh",
    "com.plexbie.app://", "com.plexbie.app:///home", "com.plexbie.app:///sign-in", "com.plexbie.app:///settings",
    "com.plexbie.app:///request/0", "com.plexbie.app:///request/-3", "com.plexbie.app:///request/2x", "com.plexbie.app:///request/214/help",
    "com.plexbie.app:///title/song/1", "com.plexbie.app:///title/movie/..%2F..", "com.plexbie.app:///title/movie",
    "com.plexbie.app://expo-development-client/?url=http%3A%2F%2F10.0.0.2%3A8081",
    "", undefined, null, 42,
  ]) {
    expect(routeForLink(url)).toBeNull();
  }
});
