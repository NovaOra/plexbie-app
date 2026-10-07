// The email check and short date shared by Join, Invites and Cleanup.
import { expect, test } from "@jest/globals";
import { EMAIL, shortDate } from "../format";

test("an email address needs a name, an @ and a domain with a dot", () => {
  expect(EMAIL.test("sam@example.com")).toBe(true);
  expect(EMAIL.test("sam@example")).toBe(false);
  expect(EMAIL.test("sam example@example.com")).toBe(false);
  expect(EMAIL.test("@example.com")).toBe(false);
});

test("a short date is the day and month, and nothing without a date", () => {
  const iso = "2026-03-14T12:00:00Z";
  expect(shortDate(iso)).toBe(new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" }));
  expect(shortDate(undefined)).toBe("");
  expect(shortDate()).toBe("");
});
