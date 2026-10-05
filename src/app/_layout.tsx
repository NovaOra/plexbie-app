import { Archivo_400Regular, Archivo_500Medium, Archivo_600SemiBold, Archivo_700Bold, Archivo_800ExtraBold, useFonts } from "@expo-google-fonts/archivo";
import NetInfo from "@react-native-community/netinfo";
import { focusManager, onlineManager } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import * as Notifications from "expo-notifications";
import { router, Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { persistOptions } from "../api/persist";
import { queryClient } from "../api/query";
import { SessionProvider, useSession } from "../auth/session";
import { routeFor } from "../features/push/push";
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


/** Tapping an alert (app open, in the background, or started by the tap) opens its screen. */
function useAlertTaps(signedIn: boolean) {
  const last = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (!signedIn || !last || last.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    router.navigate(routeFor(last.notification.request.content.data?.url));
  }, [last, signedIn]);
}

function Routes() {
  const { state } = useSession();
  useAlertTaps(state.phase === "signedIn" && !state.sample);
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
    </Stack>
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
