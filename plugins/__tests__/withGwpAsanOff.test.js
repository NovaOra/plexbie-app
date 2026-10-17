// GWP-ASan is off for the app: the plugin sets android:gwpAsanMode="never" on <application>.
const { expect, jest, test } = require("@jest/globals");

jest.mock("expo/config-plugins", () => ({
  withAndroidManifest: (config, action) => action(config),
}));

const withGwpAsanOff = require("../withGwpAsanOff");
const { turnOffGwpAsan } = withGwpAsanOff;

/** The manifest as expo prebuild parses it, with the attributes it puts on <application>. */
const generated = (attributes = {}) => ({
  manifest: {
    $: { "xmlns:android": "http://schemas.android.com/apk/res/android" },
    application: [{ $: { "android:name": ".MainApplication", "android:allowBackup": "false", ...attributes } }],
  },
});

test("<application> gets android:gwpAsanMode=\"never\", and keeps what it had", () => {
  const app = turnOffGwpAsan(generated()).manifest.application[0].$;
  expect(app["android:gwpAsanMode"]).toBe("never");
  expect(app["android:name"]).toBe(".MainApplication");
  expect(app["android:allowBackup"]).toBe("false");
});

test("a mode set elsewhere is replaced, and running prebuild again changes nothing", () => {
  const once = turnOffGwpAsan(generated({ "android:gwpAsanMode": "always" }));
  expect(once.manifest.application[0].$["android:gwpAsanMode"]).toBe("never");
  expect(turnOffGwpAsan(once)).toEqual(once);
});

test("a manifest with no <application> stops the prebuild", () => {
  expect(() => turnOffGwpAsan({ manifest: {} })).toThrow(/no <application>/);
});

test("the plugin rewrites the manifest prebuild hands it", () => {
  const config = withGwpAsanOff({ modResults: generated() });
  expect(config.modResults.manifest.application[0].$["android:gwpAsanMode"]).toBe("never");
});
