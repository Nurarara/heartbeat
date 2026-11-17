# The API for Heartbeat apps

Every installed app (Windows today; Android and iPhone later) follows this contract. The server is
the single brain: it makes the pictures, holds accounts, moods and limits. An app only signs in,
asks what to show, shows it, and reports that it is showing.

Base address: `https://app.heartbeatart.co.uk`. All routes are under `/api/product/app/`. Requests and
replies are JSON unless noted. Errors reply with an HTTP status and `{ "error": "message for people" }`.

## Signing in (once per device)

1. `POST /api/product/app/code/send` with `{ "email": "..." }`
   Emails a six-digit code. During the private test only invited emails get one (403 otherwise).
2. `POST /api/product/app/code/verify` with
   `{ "email": "...", "code": "123456", "platform": "windows" | "android" | "mac" | "ios", "deviceName": "LAPTOP-1" }`
   Replies `{ "token": "<64 hex characters>", "deviceId": "...", "email": "...", "owner": false }`.

The app stores the token securely (Windows: encrypted for the Windows user) and sends it on every
other request as `Authorization: Bearer <token>`. Tokens last a year. A `401` means the token is no
longer valid (signed out, removed from the test, account changed): forget it and show sign-in again.
Apps never receive a browser cookie, and these routes need no `Origin` header.

## What to show

`GET /api/product/app/state` (add `?showing=1` only while the picture is actually visible)

```json
{
  "ready": true,
  "picture": { "id": "…", "title": "Quiet harbour", "url": "/api/product/app/art/…", "createdAt": 1795000000000 },
  "making": false,
  "notice": "",
  "city": "London", "timezone": "Europe/London", "temperature": 12, "unit": "c",
  "mood": "calm",
  "moods": [{ "id": "auto", "label": "Auto", "colour": "#c9ccd0" }],
  "checkAfterSeconds": 60,
  "studio": "/app",
  "email": "…"
}
```

- `ready: false` with a `reason` means the person must choose a city in their studio first.
- **`showing=1` is what starts new pictures.** When a picture is due (the 10-minute rhythm, daily
  limits and the spending cap all apply), the server starts one and replies `making: true`. Check
  again about every 20 seconds while `making` is true, otherwise every `checkAfterSeconds`.
  Without `showing=1` nothing is ever made, so an app may check quietly in the background for free.
- Repeated checks within the same 10 minutes never start a second picture.
- `notice` carries a plain reason when a picture can't be made right now (for example the daily
  limit). Keep showing the current picture.

## The picture

`GET /api/product/app/art/<id>` returns the JPEG (only to the owner's devices). Download it only when
`picture.id` changes; it never changes for the same id, so it may be cached.

## Mood

`POST /api/product/app/mood` with `{ "mood": "romantic" }`. Saved to the account (the website sees it
too). The current picture stays; the next one follows the mood.

## "Still showing"

`POST /api/product/app/presence` with `{ "session": "<a new UUID each time the screen starts showing>", "surface": "screensaver" | "wallpaper" | "lockscreen" }`
about once a minute while visible. This is how the owner dashboard counts watch time and devices
(for example "windows screensaver"). Gaps over 2.5 minutes are not counted.

## Signing out

`POST /api/product/app/signout` removes this device's token. Owners can also disconnect a device from
the studio, and removing someone from the test invite list disconnects all their devices.

## Updates (Windows)

`GET /downloads/windows.json` returns `{ "version": "1.0.1", "url": "/downloads/Heartbeat.exe", "sha256": "…" }`.
The app checks about once a day; if the version is newer it downloads the file, refuses it unless the
SHA-256 matches, swaps it in and restarts quietly.

## Battery and cost rules every app follows

- Only ask with `showing=1` while the picture is truly on screen.
- Background checks: at most every 15 minutes on mains power, 30 on battery.
- Never retry a failed picture in a loop; the server's 10-minute rhythm already paces retries.
- Keep the last picture on screen when offline.
