// The release build signs with a key of its own, never the public debug key that every
// Expo template ships: the plugin rewrites the generated android/app/build.gradle so.
const { afterEach, expect, jest, test } = require("@jest/globals");

jest.mock("expo/config-plugins", () => ({
  withAppBuildGradle: (config, action) => action(config),
}));

const withReleaseSigning = require("../withReleaseSigning");
const { addReleaseSigning } = withReleaseSigning;

// The part of a freshly generated android/app/build.gradle the plugin touches (expo prebuild).
const GENERATED = `def jscFlavor = 'io.github.react-native-community:jsc-android:2026004.+'

android {
    ndkVersion rootProject.ext.ndkVersion

    buildToolsVersion rootProject.ext.buildToolsVersion
    compileSdk rootProject.ext.compileSdkVersion

    namespace 'com.plexbie.app'
    defaultConfig {
        applicationId 'com.plexbie.app'
        minSdkVersion rootProject.ext.minSdkVersion
        targetSdkVersion rootProject.ext.targetSdkVersion
        versionCode 24
        versionName "1.0.4"

        buildConfigField "String", "REACT_NATIVE_RELEASE_LEVEL", "\\"\${findProperty('reactNativeReleaseLevel') ?: 'stable'}\\""
    }
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug
            def enableShrinkResources = findProperty('android.enableShrinkResourcesInReleaseBuilds') ?: 'false'
            shrinkResources enableShrinkResources.toBoolean()
            minifyEnabled enableMinifyInReleaseBuilds
            proguardFiles getDefaultProguardFile("proguard-android.txt"), "proguard-rules.pro"
            def enablePngCrunchInRelease = findProperty('android.enablePngCrunchInReleaseBuilds') ?: 'true'
            crunchPngs enablePngCrunchInRelease.toBoolean()
        }
    }
    packagingOptions {
        jniLibs {
            def enableLegacyPackaging = findProperty('expo.useLegacyPackaging') ?: 'false'
            useLegacyPackaging enableLegacyPackaging.toBoolean()
        }
    }
}
`;

/** The body of the block that opens with `header` (e.g. "release {"), searched from `from`. */
function block(text, header, from = 0) {
  const start = text.indexOf(header, from);
  if (start < 0) return null;
  let depth = 0;
  for (let i = start + header.length - 1; i < text.length; i++) {
    if (text[i] === "{") depth++;
    if (text[i] === "}" && --depth === 0) return text.slice(start + header.length, i);
  }
  return null;
}
const signingConfigs = (text) => block(text, "signingConfigs {");
const buildType = (text, name) => block(block(text, "buildTypes {"), `${name} {`);

const savedEas = process.env.EAS_BUILD;
afterEach(() => {
  if (savedEas === undefined) delete process.env.EAS_BUILD;
  else process.env.EAS_BUILD = savedEas;
});

test("as generated, the release build signs with the public debug key", () => {
  expect(buildType(GENERATED, "release")).toContain("signingConfig signingConfigs.debug");
});

test("a release signing config is added, read from the file -Pplexbie.signing names", () => {
  const out = addReleaseSigning(GENERATED);
  const release = block(signingConfigs(out), "release {");
  expect(release).not.toBeNull();
  for (const key of ["storeFile", "storePassword", "keyAlias", "keyPassword"]) expect(release).toContain(key);
  expect(out).toContain("findProperty('plexbie.signing')");
  expect(out).toContain("System.getenv('PLEXBIE_SIGNING')");
  // Never the template's key, and no password written into the file.
  expect(release).not.toContain("debug.keystore");
  expect(release).not.toContain("'android'");
});

test("the release build type signs with it, and stops when it's missing", () => {
  const out = addReleaseSigning(GENERATED);
  const release = buildType(out, "release");
  expect(release).toContain("signingConfig signingConfigs.release");
  expect(release).not.toContain("signingConfigs.debug");
  // The check runs once the task graph is known, for release tasks only.
  expect(out).toContain("gradle.taskGraph.whenReady");
  expect(out).toMatch(/contains\('Release'\)/);
  expect(out).toContain("throw new GradleException");
  expect(out).toContain("-Pplexbie.signing");
});

test("the debug build and its key are left as they were", () => {
  const out = addReleaseSigning(GENERATED);
  expect(block(signingConfigs(out), "debug {")).toBe(block(signingConfigs(GENERATED), "debug {"));
  expect(buildType(out, "debug")).toBe(buildType(GENERATED, "debug"));
});

test("running prebuild again changes nothing more", () => {
  const once = addReleaseSigning(GENERATED);
  expect(addReleaseSigning(once)).toBe(once);
  expect(once.match(/plexbie\.signing'\)/g)).toHaveLength(1);
});

test("a template that no longer has the expected text stops the prebuild", () => {
  expect(() => addReleaseSigning(GENERATED.replace(/ {4}signingConfigs \{[\s\S]*?\n {4}\}\n/, ""))).toThrow(/signingConfigs \{ debug/);
  expect(() => addReleaseSigning(GENERATED.replace(
    "            signingConfig signingConfigs.debug\n            def enableShrink",
    "            def enableShrink",
  ))).toThrow(/release build type/);
  expect(() => addReleaseSigning(GENERATED.replace("\nandroid {\n", "\nandroid{\n"))).toThrow(/`android \{`/);
});

test("the plugin rewrites the Groovy build file, and refuses one it can't read", () => {
  const config = withReleaseSigning({ modResults: { language: "groovy", contents: GENERATED } });
  expect(buildType(config.modResults.contents, "release")).toContain("signingConfigs.release");
  expect(() => withReleaseSigning({ modResults: { language: "kt", contents: GENERATED } })).toThrow(/Groovy/);
});

test("on an EAS build the file is left alone: EAS signs it with its own credentials", () => {
  process.env.EAS_BUILD = "true";
  const config = withReleaseSigning({ modResults: { language: "groovy", contents: GENERATED } });
  expect(config.modResults.contents).toBe(GENERATED);
});
