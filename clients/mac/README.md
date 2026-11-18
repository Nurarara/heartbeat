# Heartbeat for Mac

A small menu-bar app (Swift, one file: `Heartbeat/main.swift`), Apple silicon and Intel, macOS 13+.
Follows [docs/api-for-apps.md](../../docs/api-for-apps.md).

- **First run** asks: use as wallpaper, show full-screen when idle, start at login.
- **Sign in** with the email and six-digit code.
- **Wallpaper**: the newest picture on every display, at the account's pace while you use the Mac.
- **When idle**: Heartbeat full-screen on every display after the chosen time (1–30 minutes), with the
  clock and temperature; any key or mouse movement closes it. It doesn't start while another app (a
  video, a call) keeps the display awake. Plugged in, it keeps the display on like a picture frame.
- **Menu bar**: mood, show now, pause, wallpaper and idle switches, timing, keep screen on, start at
  login, studio, update notice, sign out, quit.

## Building

On a Mac: `clients/mac/build.sh` (needs the Xcode command line tools). Without a Mac: any push that
changes `clients/mac` runs `.github/workflows/mac.yml` on GitHub's free macOS runners, which builds,
signs ad hoc, self-tests and commits `public/downloads/Heartbeat-mac.zip` and `mac.json`.

To release an update, raise `appVersion` in `main.swift` and push. Installed apps show
"Update available" in the menu.

## Why macOS asks before opening it

The app is signed ad hoc (free) but not notarised; notarisation needs Apple's paid developer program.
Testers open it once via System Settings → Privacy & Security → Open Anyway.
