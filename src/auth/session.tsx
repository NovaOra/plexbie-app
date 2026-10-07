// Who is signed in, to which Plexbie server, and how to sign in and out.
//
// Sign-in happens on the bot, in the system's own browser sheet (ASWebAuthenticationSession
// on iOS, a Custom Tab on Android), never in a web view the app controls:
//
//   1. GET  {server}/auth/mobile/start?via=discord|plex&challenge=…&state=…&redirect=com.plexbie.app:/auth
//      → the bot runs its normal Discord or Plex sign-in (the Plex token stays on the bot)
//   2. the bot sends the sheet to the app's address, com.plexbie.app:/auth, with
//      ?code=…&state=… (one use, about a minute). It works the same for every Plexbie, on
//      any address: no website links open the app. With invite=<code>, the Plex sign-in also
//      accepts that invite and the answer says how it went
//      (invite=ok|already|email|unconfirmed|invalid|failed; features/auth/InviteScreen.tsx).
//   3. POST {server}/auth/mobile/token {code, verifier} → {token, expiresAt}
//
// The token is the only secret the app holds. It lives in the Keychain / Keystore
// (expo-secure-store, this device only, excluded from backups), is sent only as a Bearer
// header to the server it came from, and is never logged.
import { Image } from "expo-image";
import * as Linking from "expo-linking";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState, Platform } from "react-native";
import { ApiError, api, pub } from "../api/client";
import { forgetCache } from "../api/persist";
import { queryClient, whenSignedOut } from "../api/query";
import { SAMPLE_SERVER, sampleApi } from "../api/sample";
import { disablePush } from "../features/push/push";
import { newPkce } from "./pkce";

const KEY = "plexbie.signin";                 // {server, token, expiresAt}, one item so they can't disagree
const KEY_LAST_SERVER = "plexbie.lastServer"; // remembered for the sign-in screen, not a secret
const STORE: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
/** No Plexbie is assumed: each household types its own address (plexbie.<their domain>). */
export const DEFAULT_SERVER = "";
/**
 * Reverse-DNS, as RFC 8252 recommends: less likely than "plexbie://" to be claimed by another app.
 * Written out, not built with Linking.createURL: the bot accepts exactly this address and nothing else.
 */
const REDIRECT = "com.plexbie.app:/auth";

/**
 * Android: open the sign-in sheet and wait for the answer at either address (see the top
 * of this file). Null when the person comes back without one (they closed the sheet).
 */
function androidSignIn(start: string, accept: string[], state: string): Promise<string | null> {
  return new Promise((resolve) => {
    let done = false;
    let left = false;
    let closing: ReturnType<typeof setTimeout> | undefined;
    const finish = (url: string | null) => {
      if (done) return;
      done = true;
      clearTimeout(closing);
      links.remove();
      states.remove();
      resolve(url);
    };
    // Only this sign-in's answer (its state): another app can't end it early by opening
    // the app's address with something else.
    const links = Linking.addEventListener("url", ({ url }) => {
      if (accept.some((a) => url.startsWith(`${a}?`)) && url.match(/[?&]state=([^&#]*)/)?.[1] === encodeURIComponent(state)) finish(url);
    });
    const states = AppState.addEventListener("change", (s) => {
      if (s !== "active") left = true;
      // Back without an answer: closed. The answer arrives a moment after the app is in front.
      else if (left) closing = setTimeout(() => finish(null), 2000);
    });
    void WebBrowser.openBrowserAsync(start).catch(() => finish(null));
  });
}

type State =
  | { phase: "loading" }
  | { phase: "signedOut"; server: string; notice?: string }
  | { phase: "signedIn"; server: string; token: string | null; sample: boolean };

export type Via = "discord" | "plex";

export class SignInError extends Error {
  /** `invite`: how the invite went, when the server already used it before this sign-in failed. */
  constructor(message: string, readonly quiet = false, readonly invite?: string) { super(message); this.name = "SignInError"; }
}

const octet = "(25[0-5]|2[0-4]\\d|1?\\d?\\d)";
/**
 * Plain http only where nobody else can be listening: this phone itself, or a Tailscale
 * address (100.64/10, encrypted end to end). Not home-network addresses: on someone else's
 * Wi-Fi, 192.168.1.20 can be anyone, and the sign-in token would cross it in the clear.
 */
const PRIVATE_HTTP = new RegExp(
  `^(localhost|\\[::1\\]|127(\\.${octet}){3}|100\\.(6[4-9]|[7-9]\\d|1[01]\\d|12[0-7])(\\.${octet}){2})$`,
);

/** "plexbie.com" → "https://plexbie.com". Plain http only for an IP on the home network or VPN. */
export function normalizeServer(input: string): string {
  let s = input.trim().replace(/\/+$/, "");
  if (!s) throw new SignInError("Enter your Plexbie address.");
  if (!/^[a-z]+:\/\//i.test(s)) s = `https://${s}`;
  let url: URL;
  try { url = new URL(s); } catch { throw new SignInError("That doesn't look like a web address."); }
  if (url.protocol === "http:" && !PRIVATE_HTTP.test(url.hostname)) {
    throw new SignInError("Use the https:// address: sign-in can't travel over plain http (a Tailscale address is fine).");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new SignInError("That doesn't look like a web address.");
  return `${url.protocol}//${url.host}`;
}

/**
 * Nothing of one sign-in survives into the next: cached answers (in memory and the offline
 * cache file), and member-only posters (only ever cached in memory, so nothing on disk).
 * Runs before the next screen mounts, never during, or it clears that screen's own loads.
 */
async function forgetEverything() {
  await queryClient.cancelQueries();
  queryClient.clear();
  await Promise.all([Image.clearMemoryCache(), forgetCache()]);
}

/** The site a host belongs to ("home.plexbie.com" and "plexbie.com" are both plexbie.com;
 *  "a.example.co.uk" is example.co.uk). An IP address is its own site. */
function siteOf(host: string): string {
  if (/^[\d.]+$|:/.test(host)) return host;
  const labels = host.toLowerCase().split(".");
  const n = labels.length >= 3 && labels[labels.length - 1].length === 2
    && ["co", "com", "org", "net", "ac", "gov", "edu"].includes(labels[labels.length - 2]) ? 3 : 2;
  return labels.slice(-n).join(".");
}

/**
 * A Plexbie that moved names its new address ("home" in GET /api/mobile; the old one keeps
 * working for a while as an alias). The phone follows, still signed in, but only to https
 * on the same site (plexbie.com to home.plexbie.com), checked before its sign-in is sent
 * anywhere, and only once the new address accepts it. A move to another site isn't
 * followed: the person signs in there themselves.
 */
async function movedTo(server: string, token: string): Promise<string | null> {
  try {
    const info = await pub.mobileInfo(server);
    const home = info.home ? normalizeServer(info.home) : null;
    if (!home || home === server || !home.startsWith("https://")) return null;
    if (siteOf(new URL(home).hostname) !== siteOf(new URL(server).hostname)) return null;
    if (!(await api({ server: home, token }).session())) return null;
    return home;
  } catch {
    return null;        // offline, or not moved: try again next launch
  }
}

function useSessionState() {
  const [state, setStateRaw] = useState<State>({ phase: "loading" });
  const current = useRef(state);
  const setState = useCallback((s: State) => { current.current = s; setStateRaw(s); }, []);
  const signingIn = useRef(false);

  useEffect(() => {
    (async () => {
      const [saved, last] = await Promise.all([SecureStore.getItemAsync(KEY, STORE), SecureStore.getItemAsync(KEY_LAST_SERVER, STORE)]);
      const s = saved ? JSON.parse(saved) as { server?: string; token?: string; expiresAt?: number } : null;
      if (s?.server && s.token && (!s.expiresAt || s.expiresAt * 1000 > Date.now())) {
        setState({ phase: "signedIn", server: s.server, token: s.token, sample: false });
        const home = await movedTo(s.server, s.token);
        if (home && current.current.phase === "signedIn" && current.current.token === s.token) {
          await SecureStore.setItemAsync(KEY, JSON.stringify({ ...s, server: home }), STORE);
          await SecureStore.setItemAsync(KEY_LAST_SERVER, home, STORE);
          setState({ phase: "signedIn", server: home, token: s.token, sample: false });
          void queryClient.invalidateQueries();
        }
      } else {
        // Ended while the app was closed: nothing of that sign-in stays on the phone.
        if (s) await Promise.all([SecureStore.deleteItemAsync(KEY, STORE), forgetCache(), disablePush(null)]);
        setState({ phase: "signedOut", server: last ?? DEFAULT_SERVER, notice: s ? "Your sign-in has ended. Sign in again." : undefined });
      }
    })().catch(() => setState({ phase: "signedOut", server: DEFAULT_SERVER }));
  }, [setState]);

  /** Signed out at once on this phone; the server is told in the background. */
  const signOut = useCallback(async (notice?: string) => {
    const was = current.current;
    if (was.phase !== "signedIn") return;
    await forgetEverything();
    setState({ phase: "signedOut", server: was.sample ? DEFAULT_SERVER : was.server, notice });
    await SecureStore.deleteItemAsync(KEY, STORE);
    if (!was.sample && was.token) {
      // This phone stops getting the last person's alerts, then the session ends on the server.
      const client = api({ server: was.server, token: was.token });
      void disablePush(client).finally(() => client.logout().catch(() => undefined));
    } else {
      void disablePush(null);
    }
  }, [setState]);

  useEffect(() => { whenSignedOut(() => void signOut("Your sign-in has ended. Sign in again.")); }, [signOut]);

  const signIn = useCallback(async (rawServer: string, via: Via, opts: { invite?: string } = {}): Promise<{ invite?: string }> => {
    if (signingIn.current) return {};
    signingIn.current = true;
    try {
      const server = normalizeServer(rawServer);
      try {
        const info = await pub.mobileInfo(server);
        if (!info.auth.includes(via)) throw new SignInError(`This server doesn't offer ${via === "plex" ? "Plex" : "Discord"} sign-in.`);
      } catch (e) {
        if (e instanceof SignInError) throw e;
        if (e instanceof ApiError && e.status === 404) {
          throw new SignInError("This Plexbie server doesn't support the app yet. It needs a newer Plexbie.");
        }
        throw new SignInError(e instanceof ApiError ? e.message : "Couldn't reach that server.");
      }
      const { verifier, challenge, state } = await newPkce();
      const redirect = REDIRECT;
      const start = `${server}/auth/mobile/start?${new URLSearchParams({ via, challenge, state, redirect, ...(opts.invite ? { invite: opts.invite } : {}) })}`;
      let url: string | null;
      if (Platform.OS === "android") {
        url = await androidSignIn(start, [REDIRECT], state);
      } else {
        // Ephemeral on iOS: the sheet shares no cookies with Safari and keeps none after.
        const result = await WebBrowser.openAuthSessionAsync(start, REDIRECT, { preferEphemeralSession: true });
        url = result.type === "success" ? result.url : null;
      }
      if (!url) throw new SignInError("Sign-in was closed.", true);
      const back = Linking.parse(url).queryParams ?? {};
      if (back.state !== state) throw new SignInError("That sign-in didn't come back to this app. Try again.");
      // The invite is used during the Plex sign-in, before the app's own sign-in finishes: its
      // answer comes back even when that doesn't finish, and travels with the error.
      const invite = typeof back.invite === "string" ? back.invite : undefined;
      if (typeof back.error === "string") throw new SignInError(back.error === "denied" ? "Sign-in was turned down." : "Sign-in didn't work. Try again.", false, invite);
      if (typeof back.code !== "string") throw new SignInError("Sign-in didn't work. Try again.", false, invite);
      let token: string, expiresAt: number;
      try {
        ({ token, expiresAt } = await pub.exchange(server, back.code, verifier));
      } catch (e) {
        if (invite !== undefined && e instanceof Error) throw new SignInError(e.message, false, invite);
        throw e;
      }
      await forgetEverything();
      await SecureStore.setItemAsync(KEY, JSON.stringify({ server, token, expiresAt }), STORE);
      await SecureStore.setItemAsync(KEY_LAST_SERVER, server, STORE);
      setState({ phase: "signedIn", server, token, sample: false });
      return invite !== undefined ? { invite } : {};
    } finally {
      signingIn.current = false;
    }
  }, [setState]);

  const lookAround = useCallback(async () => {
    // Cleared first, then the screens mount: clearing after would wipe out their first fetch.
    await forgetEverything();
    setState({ phase: "signedIn", server: SAMPLE_SERVER, token: null, sample: true });
  }, [setState]);

  const client = useMemo(() => {
    if (state.phase !== "signedIn") return null;
    return state.sample ? sampleApi : api({ server: state.server, token: state.token });
  }, [state]);

  return { state, client, signIn, signOut, lookAround };
}

type SessionContext = ReturnType<typeof useSessionState>;
const Ctx = createContext<SessionContext | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const value = useSessionState();
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionContext {
  const value = useContext(Ctx);
  if (!value) throw new Error("useSession outside SessionProvider");
  return value;
}

/**
 * The API for the signed-in person (or the sample household). Only used inside the
 * signed-in area; the sample API stands in for the one frame after a sign-out, before
 * the signed-in screens unmount, so nothing throws.
 */
export function useApi() {
  return useSession().client ?? sampleApi;
}
