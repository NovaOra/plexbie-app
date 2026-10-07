// The shared request words: the seasons a request asked for, short on a card or chip and
// spelled out on a request's own page, and where a title lives once it's in.
import { expect, test } from "@jest/globals";
import { KIND_LABEL, home, isBook, seasonsLabel } from "../stage";

test("seasons on a card or chip", () => {
  expect(seasonsLabel("all")).toBe("All seasons");
  expect(seasonsLabel("latest")).toBe("Latest season");
  expect(seasonsLabel([1])).toBe("S1");
  expect(seasonsLabel([1, 2])).toBe("S1, S2");
});

test("seasons spelled out", () => {
  expect(seasonsLabel("all", { long: true })).toBe("All seasons");
  expect(seasonsLabel("latest", { long: true })).toBe("Latest season + new episodes");
  expect(seasonsLabel([1], { long: true })).toBe("Season 1");
  expect(seasonsLabel([1, 2], { long: true })).toBe("Seasons 1, 2");
});

test("no seasons asked for shows nothing", () => {
  for (const s of [[], null, undefined]) {
    expect(seasonsLabel(s)).toBeNull();
    expect(seasonsLabel(s, { long: true })).toBeNull();
  }
});

test("books live on Audiobookshelf, everything else on Plex", () => {
  expect(isBook("audiobook")).toBe(true);
  expect(isBook("ebook")).toBe(true);
  expect(isBook("movie")).toBe(false);
  expect(isBook(null)).toBe(false);
  expect(home("ebook")).toBe("Audiobookshelf");
  expect(home("tv")).toBe("Plex");
  expect(home(undefined)).toBe("Plex");
});

test("a kind the app doesn't know has no label", () => {
  expect(KIND_LABEL.movie).toBe("Film");
  expect(KIND_LABEL.tv).toBe("TV");
  expect(KIND_LABEL.audiobook).toBe("Audiobook");
  expect(KIND_LABEL.ebook).toBe("Ebook");
  expect(KIND_LABEL.podcast).toBeUndefined();
});
