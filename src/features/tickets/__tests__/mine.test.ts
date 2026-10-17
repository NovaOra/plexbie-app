// A ticket's poster: the bot's when it sends one, else (a ticket on a request) its request's;
// a ticket about a title with neither gets a drawn cover (null), and a general ticket no picture.
import { expect, test } from "@jest/globals";
import { posterOf } from "../mine";

const requests = [{ slot: 7, title: { id: "1", kind: "tv" as const, title: "Pepper & Carrot", poster: "/img/p7" } }];

test("the bot's poster, else the request's, else a drawn cover; none for a general ticket", () => {
  expect(posterOf({ subject: "title", title: "Sintel", slot: null, poster: "/img/sintel" }, requests)).toBe("/img/sintel");
  expect(posterOf({ subject: "request", title: "Pepper & Carrot", slot: 7, poster: null }, requests)).toBe("/img/p7");
  expect(posterOf({ subject: "request", title: "Pepper & Carrot", slot: 7 }, undefined)).toBeNull();
  expect(posterOf({ subject: "request", title: "Elsewhere", slot: 9 }, requests)).toBeNull();
  expect(posterOf({ subject: "title", title: "Sintel", slot: null }, requests)).toBeNull();
  expect(posterOf({ subject: "general", title: null, slot: null }, requests)).toBeUndefined();
});
