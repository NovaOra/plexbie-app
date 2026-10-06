// The app's entry: the live-progress task has to be defined before anything else, so
// Android can run it with the app closed (see src/features/push/live.ts), then the app.
import "./src/features/push/live";
import "expo-router/entry";
