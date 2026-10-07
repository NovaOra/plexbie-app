import { Archivo_400Regular, Archivo_500Medium, Archivo_600SemiBold, Archivo_700Bold, Archivo_800ExtraBold, useFonts } from "@expo-google-fonts/archivo";
import NetInfo from "@react-native-community/netinfo";
import { focusManager, onlineManager } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import * as Linking from "expo-linking";
import * as Notifications from "expo-notifications";
import { type Href, router, Stack, usePathname } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { persistOptions } from "../api/persist";
import { queryClient } from "../api/query";
import { SessionProvider, useSession } from "../auth/session";
import { refreshPush, routeFor, routeForLink } from "../features/push/push";
import { ConfirmProvider } from "../ui/Confirm";
import { LaunchOverlay } from "../ui/LaunchOverlay";
import { ToastProvider } from "../ui/Toast";
import { color } from "../ui/theme";

void SplashScreen.preventAutoHideAsync();
void SystemUI.setBackgroundColorAsync(color.field);

// TanStack Query knows when the phone is offline (no pointless retries, refetch on
// reconnect) and when the app comes back to the foreground (refetch stale data).
onlineManager.setEventListener((setOnline) => NetInfo.addEventListener((s) => setOnline(s.isConnected !== false)));
AppState.addEventListener("change", (s) => { if (Platform.OS !== "web") focusManager.setFocused(s === "active"); });


// A screen opened straight from a link (a live-progress notification's request) gets Home
// beneath it, so Back goes there instead of closing the app.
export const unstable_settings = { anchor: "(app)" };

/** Tapping an alert (app open, in the background, or started by the tap) opens its screen, once.
 *  Rendered with the Stack: navigating before it mounts throws and loses the tap. Its own
 *  component, so following the route doesn't re-render the whole Stack. */
function AlertTaps({ live }: { live: boolean }) {
  const last = Notifications.useLastNotificationResponse();
  const pathname = usePathname();
  // The tap already acted on: signing out and back in (or into another server) doesn't replay it.
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!last || last.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const id = last.notification.request.identifier;
    if (handled.current === id) return;
    // A tap that started the app waits for the start screen to hand over to Home, so the alert's
    // screen opens from Home (Back goes there) rather than over a blank one.
    if (live && pathname === "/") return;
    handled.current = id;
    // Signed out or in the sample, there's no telling which server sent it: the tap opens nothing.
    if (live) router.navigate(routeFor(last.notification.request.content.data?.url));
    try { Notifications.clearLastNotificationResponse(); } catch { /* not on every platform */ }
  }, [last, live, pathname]);
  return null;
}

/** A link opened while signed out (a live-progress notification's request) is kept, and opened
 *  once after the sign-in that follows, from Home. Only links routeForLink accepts are kept; the sign-in's own
 *  answer and invite links never replace one. Rendered with the Stack, like AlertTaps. */
function LinkAfterSignIn({ signedIn, live }: { signedIn: boolean; live: boolean }) {
  const pathname = usePathname();
  const held = useRef<Href | null>(null);
  const signedInNow = useRef(signedIn);
  useEffect(() => {
    signedInNow.current = signedIn;
    // Looking around the sample instead drops it: a much later sign-in doesn't open it out of nowhere.
    if (signedIn && !live) held.current = null;
  }, [signedIn, live]);
  useEffect(() => {
    // Signed in, the router opens the link itself.
    const keep = (url: string | null) => { if (!signedInNow.current) held.current = routeForLink(url) ?? held.current; };
    keep(Linking.getLinkingURL());
    const links = Linking.addEventListener("url", ({ url }) => keep(url));
    return () => links.remove();
  }, []);
  useEffect(() => {
    // Still on the way in (the start, sign-in or invite screen): wait for Home.
    if (!live || !held.current || ["/", "/sign-in", "/auth", "/invite"].includes(pathname)) return;
    const to = held.current;
    held.current = null;
    router.navigate(to);
  }, [live, pathname]);
  return null;
}

function Routes() {
  const { state, client } = useSession();
  const live = state.phase === "signedIn" && !state.sample;
  // Once a start: the alert channels exist and the bot has this phone on the right one.
  useEffect(() => { if (live && client) void refreshPush(client); }, [live, client]);
  const [fonts, fontError] = useFonts({ Archivo_400Regular, Archivo_500Medium, Archivo_600SemiBold, Archivo_700Bold, Archivo_800ExtraBold });
  // A font that fails to load falls back to the system font; it never keeps the splash up.
  const ready = (fonts || !!fontError) && state.phase !== "loading";
  // Android's launch screen hands over to LaunchOverlay, which opens onto the app when it's ready.
  if (!ready) return <LaunchOverlay ready={false} />;
  const signedIn = state.phase === "signedIn";
  return (
    <>
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.field }, animation: "fade" }}>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(app)" />
        {/* Pushed over the tabs with the platform's own transition and back gesture. */}
        <Stack.Screen name="title/[kind]/[id]" options={{ animation: "default" }} />
        <Stack.Screen name="request/[slot]" options={{ animation: "default" }} />
        <Stack.Screen name="manage-request/[key]" options={{ animation: "default" }} />
        <Stack.Screen name="manage-ticket/[id]" options={{ animation: "default" }} />
        <Stack.Screen name="you" options={{ animation: "default" }} />
        <Stack.Screen name="channel" options={{ animation: "default" }} />
        {/* A real sheet (UISheetPresentationController / Material bottom sheet), not one drawn in JS. */}
        <Stack.Screen name="help/[slot]" options={{
          presentation: "formSheet", sheetAllowedDetents: [0.75, 1], sheetGrabberVisible: true, sheetCornerRadius: 20,
          contentStyle: { backgroundColor: color.panel }, animation: "default",
        }} />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
      <Stack.Screen name="auth" />
      {/* Signed in or out: it stays through the sign-in that uses the invite, to say how it went. */}
      <Stack.Screen name="invite" options={{ animation: "default" }} />
    </Stack>
    <AlertTaps live={live} />
    <LinkAfterSignIn signedIn={signedIn} live={live} />
    <LaunchOverlay ready />
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: color.field }}>
      <SafeAreaProvider>
        <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
          <SessionProvider>
            <ToastProvider>
              <ConfirmProvider>
                <StatusBar style="light" />
                <Routes />
              </ConfirmProvider>
            </ToastProvider>
          </SessionProvider>
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
