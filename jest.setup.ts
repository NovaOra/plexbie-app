// Native modules aren't there under Jest. These stand in the way the phone answers.
import { jest } from "@jest/globals";

// A development or release build, as on a phone (not Expo Go): Linking reads answers to
// the app's own scheme, and alerts don't stop at Expo Go's missing push.
jest.mock("expo-constants", () => {
  const actual = jest.requireActual<typeof import("expo-constants")>("expo-constants");
  return { ...actual, __esModule: true, default: { ...actual.default, executionEnvironment: "bare" } };
});
jest.mock("expo", () => ({ ...jest.requireActual<typeof import("expo")>("expo"), isRunningInExpoGo: () => false }));

// Random bytes and SHA-256 from the runtime's Web Crypto, so PKCE runs for real.
jest.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  CryptoEncoding: { HEX: "hex", BASE64: "base64" },
  getRandomBytes: (n: number) => crypto.getRandomValues(new Uint8Array(n)),
  // Hex unless asked for base64, as on the phone.
  digestStringAsync: async (_algorithm: string, data: string, options: { encoding?: string } = {}) => {
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data)));
    if (options.encoding !== "base64") return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
    let bin = "";
    digest.forEach((b) => { bin += String.fromCharCode(b); });
    return btoa(bin);
  },
}));
