// PKCE (RFC 7636): the challenge the browser sees is the S256 of a verifier only this
// phone holds, and every value travels in a URL, so base64url without padding.
import { expect, test } from "@jest/globals";
import { newPkce } from "../pkce";

const URL_SAFE = /^[A-Za-z0-9_-]+$/;

/** base64url(SHA-256), worked out here independently of the app's code. */
async function s256(text: string) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  let bin = "";
  digest.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

test("the challenge is the S256 of the verifier, base64url without padding", async () => {
  const { verifier, challenge } = await newPkce();
  expect(challenge).toBe(await s256(verifier));
  expect(challenge).toMatch(URL_SAFE);
  expect(challenge).toHaveLength(43);
});

test("verifier and state are URL-safe and too long to guess", async () => {
  const { verifier, state } = await newPkce();
  // 32 random bytes: 43 characters, inside RFC 7636's 43..128.
  expect(verifier).toMatch(URL_SAFE);
  expect(verifier).toHaveLength(43);
  expect(state).toMatch(URL_SAFE);
  expect(state).toHaveLength(22);
});

test("every sign-in gets its own verifier and state", async () => {
  const a = await newPkce();
  const b = await newPkce();
  expect(a.verifier).not.toBe(b.verifier);
  expect(a.state).not.toBe(b.state);
  expect(a.state).not.toBe(a.verifier);
});
