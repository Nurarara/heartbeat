# Getting Heartbeat onto Google Play

Checked against current sources in November 2026 (links at the end). Short version: **every Android
app must be signed, but on Android signing is free and already done**: the app is signed with
Heartbeat's own key. What stands between Heartbeat and the Play Store is Google's account rules,
not signing.

## Can it go on Play without signing? No, and that's fine

- Every Android app on every phone must be signed. There is no unsigned route, on Play or anywhere.
- Unlike Windows, Android signing needs **no paid certificate**: you make your own key for free
  (done). Google then also signs the copy it delivers ("Play App Signing").
- Tools like Lovable or Replit don't skip any of this. They build and sign the app for you, but you
  still need your own Play developer account and pass the same rules below.

## What Google requires (all doable)

| Requirement | Status |
|---|---|
| Developer account: **$25 one-time**, identity check (government ID) | You: sign up at play.google.com/console as **Individual** |
| New personal accounts: a **closed test with at least 12 testers for 14 days in a row** before going public | Your private-test group can be these testers |
| App must target **Android 16 (API 36)** | Done (versionCode 2, targetSdk 36) |
| Upload format: **Android App Bundle (.aab)** | Done: `npm run android:build` also produces the bundle (see below) |
| Privacy policy web page | Done: https://app.heartbeatart.co.uk/privacy (updated for the apps) |
| Data safety form, content rating questionnaire, store listing | Answers below |
| Icon 512×512, feature graphic 1024×500 | Done: `clients/android/store/` |
| At least 2 phone screenshots | You: take them on your phone (app home + lock screen) |

## Steps

1. **Create the account** (play.google.com/console, Individual, $25, ID check; can take a few days).
2. **Create app**: name "Heartbeat", app, free.
3. **Testing → Closed testing → Create track**. Upload `app-release.aab`
   (`clients/android/app/build/outputs/bundle/release/`). Choose **Play App Signing**
   (Google keeps the delivery key; the key you have is the "upload key").
4. Add your testers' Gmail addresses (at least 12) and share the opt-in link. Each must
   **opt in and keep it installed for 14 days**.
5. Fill in the store listing, data safety, content rating and privacy policy (below) meanwhile.
6. After 14 days: **Apply for production**. Google usually answers within about 7 days.

## Store listing (ready to paste)

- **App name:** Heartbeat
- **Short description (80):** Living art for your lock screen and screensaver, made for your time and weather.
- **Full description:**
  Heartbeat turns your phone into a calm, living picture frame.

  Every few minutes it paints a new original picture for the moment you're in: the time of day,
  the weather outside, the sun and moon, and the mood you choose (Calm, Cosy, Dreamy, Sleep and
  more). At night it stays dark and restful.

  • Lock screen picture that changes by itself
  • Home screen wallpaper (optional)
  • Screensaver while charging, or a full-screen frame that stays on
  • Pick a mood with one tap; your next picture follows it
  • Works with Heartbeat on Windows and on the web with the same account

  Sign in with your email and a six-digit code. No password needed.
- **Category:** Art & Design. **Tags:** wallpaper, ambient, art.
- **Contact email:** your Heartbeat address.

## Data safety form (matches what the app does)

- **Collected:** Email address (account management); Device or other IDs: the device name you
  sign in from (account management, analytics); App activity: when the screensaver/frame is open
  and for how long, mood choice (analytics, app functionality).
- **Not collected:** location (only the city you type in the studio), contacts, photos, files,
  messages, health, financial info.
- **Shared with third parties:** No. (The AI services receive scene descriptions, not personal data.)
- **Encrypted in transit:** Yes (HTTPS). **Users can request deletion:** Yes (account deletion in the studio).

## Content rating

Questionnaire category "Reference, News, or Educational / Other": no violence, no user-generated
content shared with others, no gambling, no chat. Expected rating: Everyone / PEGI 3.

## Meanwhile: testers can install it today without Play

Testers download it from their studio (Download for Android) and allow "install unknown apps". This
works in the UK now. Google's new developer verification for apps installed outside Play starts in
Brazil, Indonesia, Singapore and Thailand (from 30 September 2026) and goes worldwide in 2027; it
includes a free limited option for up to 20 devices. Being on Play avoids this entirely.

## Sources

- [Target API level requirements (Play Console Help)](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en-AU)
- [Closed testing: 12 testers for 14 days](https://ontest.app/blog/google-play-12-testers-14-days-requirement-explained)
- [Android developer verification (Android Developers)](https://developer.android.com/developer-verification)
- [Developer verification rollout (Android Developers Blog)](https://developer.android.com/blog/posts/android-developer-verification-rolling-out-to-all-developers-on-play-console-and-android-developer-console)
- [Understanding developer verification (Help)](https://support.google.com/android-developer-console/answer/16561738?hl=en)
