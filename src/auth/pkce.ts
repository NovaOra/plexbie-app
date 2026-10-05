// Proof that the app finishing a sign-in is the app that started it (PKCE, RFC 7636).
// The verifier never leaves the phone until the token exchange; the browser only ever
// sees its SHA-256. So a sign-in code caught on the way back (another app claiming the
// plexbie:// scheme) is useless on its own.
import * as Crypto from "expo-crypto";

const b64url = (b64: string) => b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function randomString(bytes: number): string {
  const raw = Crypto.getRandomBytes(bytes);
  let bin = "";
  raw.forEach((b) => { bin += String.fromCharCode(b); });
  return b64url(btoa(bin));
}

export async function newPkce() {
  const verifier = randomString(32);
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, {
    encoding: Crypto.CryptoEncoding.BASE64,
  });
  return { verifier, challenge: b64url(digest), state: randomString(16) };
}
