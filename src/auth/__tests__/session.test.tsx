// Signing in: the answer the browser sheet brings back is trusted only when it carries this
// sign-in's state, a refusal or a missing code ends it without a token exchange, and the
// exchange proves the app with the verifier behind the challenge it sent.
import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import * as Linking from "expo-linking";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import type { ReactNode } from "react";
import { Platform } from "react-native";
import { ApiError } from "../../api/client";
import { queryClient } from "../../api/query";
import { discordSession, mobileInfo, token } from "../../api/__fixtures__/bot";
import { normalizeServer, SessionProvider, SignInError, useSession } from "../session";

// The Keychain / Keystore, in memory.
jest.mock("expo-secure-store", () => {
  const items = new Map<string, string>();
  return {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
    getItemAsync: async (k: string) => items.get(k) ?? null,
    setItemAsync: async (k: string, v: string) => { items.set(k, v); },
    deleteItemAsync: async (k: string) => { items.delete(k); },
    __items: items,
  };
});
jest.mock("expo-web-browser", () => ({
  ...jest.requireActual<typeof import("expo-web-browser")>("expo-web-browser"),
  openAuthSessionAsync: jest.fn(),
  openBrowserAsync: jest.fn(),
}));
// Android hears the answer as a link opening the app.
jest.mock("expo-linking", () => ({
  ...jest.requireActual<typeof import("expo-linking")>("expo-linking"),
  addEventListener: jest.fn(),
}));
jest.mock("expo-image", () => ({ Image: { clearMemoryCache: async () => true } }));
jest.mock("../../api/persist", () => ({ forgetCache: async () => undefined }));
jest.mock("../../features/push/push", () => ({ disablePush: async () => "off" }));

const SERVER = "https://plexbie.example";
const items = (SecureStore as unknown as { __items: Map<string, string> }).__items;
const openSheet = jest.mocked(WebBrowser.openAuthSessionAsync);
const fetchMock = jest.fn<(url: string, init?: RequestInit) => Promise<Response>>();

/** base64url(SHA-256), as RFC 7636's S256 has it. */
async function s256(text: string) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  let bin = "";
  digest.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

type Calls = { path: string; body?: Record<string, string> }[];
let calls: Calls;
let starts: URL[];

/** The bot: /api/mobile offers both sign-ins (and hasn't moved); the token exchange works. */
function bot(info: object = { ...mobileInfo, home: null }) {
  fetchMock.mockImplementation(async (url: string, init: RequestInit = {}) => {
    const path = url.slice(SERVER.length);
    calls.push({ path, body: init.body ? JSON.parse(String(init.body)) : undefined });
    if (path === "/api/mobile") return new Response(JSON.stringify(info), { status: 200 });
    if (path === "/auth/mobile/token") return new Response(JSON.stringify(token), { status: 200 });
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
  });
}

/** The sheet comes back to the app's address with these answers (state: this sign-in's own). */
function sheetAnswers(answer: (state: string) => Record<string, string> | null) {
  openSheet.mockImplementation(async (start) => {
    const url = new URL(start);
    starts.push(url);
    const back = answer(url.searchParams.get("state")!);
    return back ? { type: "success", url: `com.plexbie.app:/auth?${new URLSearchParams(back)}` } : { type: WebBrowser.WebBrowserResultType.CANCEL };
  });
}

const wrapper = ({ children }: { children: ReactNode }) => <SessionProvider>{children}</SessionProvider>;

async function signedOutSession() {
  const hook = await renderHook(() => useSession(), { wrapper });
  await waitFor(() => expect(hook.result.current.state.phase).toBe("signedOut"));
  return hook;
}

async function signInFails(server = "plexbie.example", via: "discord" | "plex" = "discord") {
  const { result } = await signedOutSession();
  let error: unknown;
  await act(async () => { await result.current.signIn(server, via).catch((e: unknown) => { error = e; }); });
  expect(error).toBeInstanceOf(SignInError);
  // Nothing of it stays: no token asked for, none kept, still signed out.
  expect(calls.map((c) => c.path)).not.toContain("/auth/mobile/token");
  expect(items.has("plexbie.signin")).toBe(false);
  expect(result.current.state.phase).toBe("signedOut");
  return error as SignInError;
}

beforeEach(() => {
  items.clear();
  calls = [];
  starts = [];
  openSheet.mockReset();
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as typeof fetch;
  bot();
});

test("a sign-in that comes back with its own state ends signed in", async () => {
  sheetAnswers((state) => ({ code: "one-time-code", state }));
  const { result } = await signedOutSession();
  await act(async () => { await result.current.signIn("plexbie.example/", "discord"); });

  const [start] = starts;
  expect(`${start.origin}${start.pathname}`).toBe(`${SERVER}/auth/mobile/start`);
  expect(start.searchParams.get("via")).toBe("discord");
  expect(start.searchParams.get("redirect")).toBe("com.plexbie.app:/auth");
  expect(openSheet).toHaveBeenCalledWith(expect.any(String), "com.plexbie.app:/auth", { preferEphemeralSession: true });

  // The exchange sends the code and the verifier behind the challenge the browser saw.
  const exchange = calls.find((c) => c.path === "/auth/mobile/token")!;
  expect(exchange.body?.code).toBe("one-time-code");
  expect(await s256(exchange.body!.verifier)).toBe(start.searchParams.get("challenge"));
  expect(start.toString()).not.toContain(exchange.body!.verifier);

  expect(result.current.state).toEqual({ phase: "signedIn", server: SERVER, token: token.token, sample: false });
  expect(JSON.parse(items.get("plexbie.signin")!)).toEqual({ server: SERVER, ...token });
  expect(items.get("plexbie.lastServer")).toBe(SERVER);
});

test("an answer with another state is refused, even one that carries a code", async () => {
  sheetAnswers(() => ({ code: "caught-code", state: "someone-elses-state" }));
  expect((await signInFails()).message).toMatch(/didn't come back to this app/);
});

test("an answer with no state at all is refused", async () => {
  sheetAnswers(() => ({ code: "caught-code" }));
  expect((await signInFails()).message).toMatch(/didn't come back to this app/);
});

test("a refusal says so, and nothing is exchanged", async () => {
  sheetAnswers((state) => ({ error: "denied", state }));
  expect((await signInFails()).message).toBe("Sign-in was turned down.");
});

test("any other error from the bot is a plain try-again", async () => {
  sheetAnswers((state) => ({ error: "expired", state }));
  expect((await signInFails()).message).toBe("Sign-in didn't work. Try again.");
});

test("an answer without a code is a plain try-again", async () => {
  sheetAnswers((state) => ({ state }));
  expect((await signInFails()).message).toBe("Sign-in didn't work. Try again.");
});

test("closing the sheet ends it quietly", async () => {
  sheetAnswers(() => null);
  const error = await signInFails();
  expect(error.message).toBe("Sign-in was closed.");
  expect(error.quiet).toBe(true);
});

test("a server that doesn't offer that sign-in is caught before the browser opens", async () => {
  bot({ version: "1", auth: ["plex"], push: [], home: null });
  sheetAnswers((state) => ({ code: "c", state }));
  expect((await signInFails("plexbie.example", "discord")).message).toBe("This server doesn't offer Discord sign-in.");
  expect(openSheet).not.toHaveBeenCalled();
});

test("a server without app sign-in says it needs a newer Plexbie", async () => {
  fetchMock.mockImplementation(async () => new Response(JSON.stringify({ error: "Not found" }), { status: 404 }));
  sheetAnswers((state) => ({ code: "c", state }));
  expect((await signInFails()).message).toMatch(/doesn't support the app yet/);
  expect(openSheet).not.toHaveBeenCalled();
});

describe("on Android", () => {
  let hear: (url: string) => void;
  let os: { restore: () => void };

  beforeEach(() => {
    os = jest.replaceProperty(Platform, "OS", "android");
    jest.mocked(Linking.addEventListener).mockImplementation((_type, handler) => {
      hear = (url) => handler({ url });
      return { remove: () => undefined } as ReturnType<typeof Linking.addEventListener>;
    });
  });

  // Everything after this block runs as an iPhone again.
  afterEach(() => {
    os.restore();
    jest.mocked(Linking.addEventListener).mockReset();
  });

  test("only this sign-in's answer ends it; another app's link to the app is ignored", async () => {
    jest.mocked(WebBrowser.openBrowserAsync).mockImplementation(async (start) => {
      const state = new URL(start).searchParams.get("state")!;
      hear("com.plexbie.app:/auth?code=planted-code&state=someone-elses-state");
      hear(`com.plexbie.app:/elsewhere?code=planted-code&state=${state}`);
      hear(`com.plexbie.app:/auth?code=one-time-code&state=${state}`);
      return { type: WebBrowser.WebBrowserResultType.OPENED };
    });
    const { result } = await signedOutSession();
    await act(async () => { await result.current.signIn("plexbie.example", "plex"); });
    expect(calls.find((c) => c.path === "/auth/mobile/token")?.body?.code).toBe("one-time-code");
    expect(result.current.state.phase).toBe("signedIn");
  });

  test("a refusal that comes back is still a refusal", async () => {
    jest.mocked(WebBrowser.openBrowserAsync).mockImplementation(async (start) => {
      hear(`com.plexbie.app:/auth?error=denied&state=${new URL(start).searchParams.get("state")}`);
      return { type: WebBrowser.WebBrowserResultType.OPENED };
    });
    expect((await signInFails("plexbie.example", "plex")).message).toBe("Sign-in was turned down.");
  });
});

describe("opening the app signed in", () => {
  const MOVED = "https://home.plexbie.example";
  let seen: { url: string; auth?: string }[];

  /** The saved sign-in's bot names `home` as its new address; the new address answers
   *  /api/session with `there` (the person, or null if it doesn't know the token). */
  function movedBot(home: string | null, there: object | null = discordSession) {
    fetchMock.mockImplementation(async (url: string, init: RequestInit = {}) => {
      seen.push({ url, auth: (init.headers as Record<string, string> | undefined)?.Authorization });
      if (url.endsWith("/api/mobile")) return new Response(JSON.stringify({ ...mobileInfo, home }), { status: 200 });
      if (url.endsWith("/api/session")) return new Response(JSON.stringify(there), { status: 200 });
      return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
    });
  }

  function saved(server = SERVER, expiresAt = Date.now() / 1000 + 3600) {
    items.set("plexbie.signin", JSON.stringify({ server, ...token, expiresAt }));
    items.set("plexbie.lastServer", server);
  }

  /** Signed in at once, then waits for the move check to finish. */
  async function opened(server = SERVER) {
    const { result } = await renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.state).toMatchObject({ phase: "signedIn", token: token.token }));
    await waitFor(() => expect(seen.some((s) => s.url === `${server}/api/mobile`)).toBe(true));
    return result;
  }

  beforeEach(() => { seen = []; });

  test("a move on the same site is followed once the new address takes the sign-in", async () => {
    saved();
    movedBot(MOVED);
    const result = await opened();
    await waitFor(() => expect(result.current.state).toEqual({ phase: "signedIn", server: MOVED, token: token.token, sample: false }));
    expect(seen.find((s) => s.url === `${MOVED}/api/session`)?.auth).toBe(`Bearer ${token.token}`);
    expect(JSON.parse(items.get("plexbie.signin")!).server).toBe(MOVED);
    expect(items.get("plexbie.lastServer")).toBe(MOVED);
  });

  test("a new address that doesn't know the sign-in isn't followed", async () => {
    saved();
    movedBot(MOVED, null);
    const result = await opened();
    await waitFor(() => expect(seen.some((s) => s.url === `${MOVED}/api/session`)).toBe(true));
    expect(result.current.state).toEqual({ phase: "signedIn", server: SERVER, token: token.token, sample: false });
    expect(JSON.parse(items.get("plexbie.signin")!).server).toBe(SERVER);
  });

  test.each([
    ["another site", SERVER, "https://plexbie.example.evil.example"],
    ["another site that ends the same way", SERVER, "https://notplexbie.example"],
    ["plain http", SERVER, "http://100.101.102.103:7979"],
    ["plain http on the same host", "http://127.0.0.1:7979", "http://127.0.0.1:7980"],
  ])("a move to %s isn't followed, and the sign-in never goes there", async (_case, from, home) => {
    saved(from);
    movedBot(home);
    const result = await opened(from);
    // Settled: nothing more is asked for after /api/mobile.
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(seen.filter((s) => !s.url.startsWith(from))).toEqual([]);
    expect(result.current.state).toEqual({ phase: "signedIn", server: from, token: token.token, sample: false });
    expect(JSON.parse(items.get("plexbie.signin")!).server).toBe(from);
    expect(items.get("plexbie.lastServer")).toBe(from);
  });

  test("a saved sign-in that ended while the app was closed starts signed out", async () => {
    saved(SERVER, Date.now() / 1000 - 60);
    movedBot(MOVED);
    const { result } = await renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.state).toEqual({ phase: "signedOut", server: SERVER, notice: "Your sign-in has ended. Sign in again." }));
    expect(items.has("plexbie.signin")).toBe(false);
    expect(seen).toEqual([]);
  });
});

test("a sign-in the server says has ended signs this phone out", async () => {
  items.set("plexbie.signin", JSON.stringify({ server: SERVER, ...token, expiresAt: Date.now() / 1000 + 3600 }));
  const { result } = await renderHook(() => useSession(), { wrapper });
  await waitFor(() => expect(result.current.state.phase).toBe("signedIn"));

  await act(async () => {
    await queryClient.fetchQuery({ queryKey: ["requests"], queryFn: () => Promise.reject(new ApiError(401, "Your sign-in has ended. Sign in again.")) })
      .catch(() => undefined);
  });
  await waitFor(() => expect(result.current.state).toEqual({ phase: "signedOut", server: SERVER, notice: "Your sign-in has ended. Sign in again." }));
  expect(items.has("plexbie.signin")).toBe(false);
});

describe("normalizeServer", () => {
  test("a bare name becomes its https address, without a path or trailing slash", () => {
    expect(normalizeServer("plexbie.example")).toBe("https://plexbie.example");
    expect(normalizeServer("  plexbie.example/// ")).toBe("https://plexbie.example");
    expect(normalizeServer("https://Plexbie.Example:8443/app/")).toBe("https://plexbie.example:8443");
  });

  test("plain http only to this phone or a Tailscale address", () => {
    expect(normalizeServer("http://localhost:7979")).toBe("http://localhost:7979");
    expect(normalizeServer("http://127.0.0.1:7979")).toBe("http://127.0.0.1:7979");
    expect(normalizeServer("http://100.101.102.103:7979")).toBe("http://100.101.102.103:7979");
    for (const lan of ["http://192.168.1.20:7979", "http://10.0.0.15", "http://100.128.0.1", "http://100.63.255.255", "http://plexbie.example"]) {
      expect(() => normalizeServer(lan)).toThrow(/https:\/\//);
    }
  });

  test("an empty or non-web address is refused", () => {
    expect(() => normalizeServer("  ")).toThrow("Enter your Plexbie address.");
    expect(() => normalizeServer("ftp://plexbie.example")).toThrow("That doesn't look like a web address.");
    expect(() => normalizeServer("javascript://alert(1)")).toThrow(SignInError);
  });
});
