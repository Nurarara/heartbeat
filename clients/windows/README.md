# Heartbeat for Windows

One small program (about 60 KB) that is the screensaver, the icon by the clock, the sign-in window
and its own updater. C# 5 on .NET Framework 4.x, which is built into Windows 10 and 11, so testers
install nothing else. It follows [docs/api-for-apps.md](../../docs/api-for-apps.md).

## Build (on your Windows laptop)

```
npm run windows:build
npm run beta:serve
```

The first command compiles `clients/windows/Heartbeat.cs` into `public/downloads/Heartbeat.exe`,
runs its self-tests and writes `public/downloads/windows.json` (version and checksum, for updates).
The second rebuilds and starts the site so the download is served. Neither file is committed.

## What testers do

1. Studio → **Room for your desktop** → **Download for Windows**, then open the file.
   Windows may say "Windows protected your PC" (the app isn't signed yet): **More info → Run anyway**.
2. Choose **OK** to install. It copies itself to `%LOCALAPPDATA%\Programs\Heartbeat`, becomes the
   screensaver (after 5 minutes idle), starts with Windows, and appears in Settings → Apps.
3. Sign in with their email and the six-digit code.

## What it does

- **Screensaver** (`Heartbeat.scr`): one full-screen window per monitor, the newest picture filling
  the screen, the time and temperature small in the corner, a slow fade to each new picture. Any
  mouse move or key closes it. While it shows, it asks the server for new pictures (`showing=1`)
  and reports watch time. Plugged in, it keeps the display on like a picture frame; on battery the
  display sleeps as normal (can be turned off in the menu).
- **Wallpaper** (on by default): the newest picture fills the desktop. While someone is using the
  computer it asks for a new picture every 30 minutes (60 on battery); nothing is made while the
  computer is locked or idle. Pictures made by the screensaver also become the wallpaper. Turning it
  off (or uninstalling) puts the previous wallpaper back.
- **Straight after sign-in** it starts a picture, sets the wallpaper and shows Heartbeat full-screen once.
- **Icon by the clock**: mood, show Heartbeat now, use as wallpaper, pause new pictures for an hour, when the
  screensaver starts (2–30 minutes), keep the screen on while plugged in, open the studio, check
  for updates, sign out, uninstall, quit.
- **Background**: every 15 minutes (30 on battery) it quietly fetches the latest picture so the
  screensaver opens instantly. It never makes pictures in the background.
- **Updates**: about once a day it reads `/downloads/windows.json`; a newer, checksum-verified
  version is swapped in and the app restarts quietly.
- **Uninstall** (menu or Settings → Apps): restores the previous screensaver, removes start-up,
  signs the device out and deletes its files.

Files: the program in `%LOCALAPPDATA%\Programs\Heartbeat`; settings, the cached picture and the
device key (encrypted for the Windows user) in `%LOCALAPPDATA%\Heartbeat`.

## Releasing an update

Raise `Version` at the top of `Heartbeat.cs` (for example `1.0.1`), run `npm run windows:build`,
then restart the server (`npm run beta:serve`). Installed apps pick it up within a day, or straight
away via **Check for updates**.

## Checks

`Heartbeat.exe --probe <server> <device key>` makes one real check against a server (sign-in key, latest picture, watch-time report, update file); it was used to test the app against a running server.

`Heartbeat.exe --self-test` covers arguments, safe server addresses, version comparison, picture
cropping, checksums and reading the server's replies. `npm run windows:build` runs them. The
installer, screensaver windows and tray need a real Windows desktop to try.
