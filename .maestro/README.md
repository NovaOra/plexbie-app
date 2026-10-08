# Device tests (Maestro)

These flows run on a real Android emulator and a real iOS Simulator, against a release build in
sample mode ("Look around with sample data"), so they need no server and no account. Run them with
`scripts/device-tests.sh android|ios`. `.github/workflows/device-tests.yml` runs them on main.

A flow finds things by what's on screen, or by what a screen reader would say (`accessibilityLabel`),
the same on both platforms. Text matches as a regex, ignoring case, so `Just arrived` also finds
Android's uppercase JUST ARRIVED. `subflows/` holds the shared steps; they don't run by themselves.
