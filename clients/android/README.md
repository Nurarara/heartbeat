# Heartbeat for Android

A tiny app (about 40 KB), plain Kotlin with no extra libraries, following
[docs/api-for-apps.md](../../docs/api-for-apps.md).

## What it does

- **Sign in** with the email and six-digit code.
- **Lock screen picture** (on by default) and **home screen wallpaper** (optional): the newest picture,
  cropped to the phone's shape. A background check about every 30 minutes keeps them current; it
  asks for a new picture at most once an hour, only while the screen is on.
- **Screensaver while charging**: Android's built-in screensaver (Settings → Display → Screen saver →
  Heartbeat). The app's button opens that page. Some phones (several Samsung models) hide it; then use…
- **Frame**: Heartbeat full-screen with the clock and temperature, screen kept on. Tap to leave.
- **Mood** chips, pause for an hour, open the studio, sign out, and an "update available" button
  when a newer version is published.

Watch time from the screensaver and frame shows on the owner dashboard as "android screensaver".

## Installing (testers)

Studio → Room for your desktop → **Download for Android**, open the file, and allow the browser to
"install unknown apps" when Android asks. Then sign in.

## Building

Needs the Android SDK (`ANDROID_HOME`) and the signing key. Add to `.dev.vars` (never commit the key):

```
HEARTBEAT_ANDROID_KEYSTORE=C:\path\to\heartbeat-android.jks
HEARTBEAT_ANDROID_KEYSTORE_PASSWORD=...
HEARTBEAT_ANDROID_KEY_ALIAS=heartbeat
```

Then `npm run android:build`. Without the SDK, put a built `Heartbeat.apk` in `public/downloads/`
and run `npm run android:publish`. Either way, restart with `npm run beta:serve`.

**Keep the signing key safe.** Every update must be signed with the same key; if it is lost, testers
have to uninstall and reinstall once.

## Google Play

See [docs/play-store.md](../../docs/play-store.md): what Google requires, the listing text, data
safety answers, and the icon and feature graphic in `store/`.

## Releasing an update

Raise `versionCode` (and `versionName`) in `app/build.gradle.kts` and `APP_VERSION_CODE` in
`Heartbeat.kt`, build, publish, restart the server. The app shows "Update available" when it opens.
