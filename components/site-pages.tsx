"use client";
// Download and help, terms, and privacy: part of the public website (see public-site.tsx).
import { Apple, Download, Monitor, Smartphone, Tablet, Tv } from 'lucide-react';
import { SiteFooter, SiteNav, displayHref, useSignedIn } from './public-site';

function Page({ eyebrow, title, intro, children }: { eyebrow: string; title: React.ReactNode; intro?: React.ReactNode; children: React.ReactNode }) {
  return <div className="ps-site ps-page"><SiteNav solid /><main className="ps-doc"><p className="ps-eyebrow">{eyebrow}</p><h1>{title}</h1>{intro && <p className="ps-lede">{intro}</p>}{children}</main><SiteFooter /></div>;
}

export function DownloadPage() {
  const signedIn = useSignedIn();
  return <Page eyebrow="DOWNLOAD AND HELP" title={<>Heartbeat on <em>every screen.</em></>} intro="Install it once, sign in with your email and the six-digit code, and Heartbeat takes care of the rest. During the private test you need an invite to sign in.">
    <nav className="ps-jump" aria-label="Devices"><a href="#windows"><Monitor size={15} />Windows</a><a href="#mac"><Apple size={15} />Mac</a><a href="#android"><Smartphone size={15} />Android</a><a href="#iphone"><Tablet size={15} />iPhone & iPad</a><a href="#web"><Tv size={15} />Browser & TV</a><a href="#using">Using Heartbeat</a></nav>

    <section id="windows" className="ps-guide">
      <div><h2><Monitor size={20} />Windows</h2><p>Your wallpaper and your screensaver, with an icon by the clock for moods. Windows 10 and 11.</p>
        <a className="ps-button" href="/downloads/Heartbeat.exe" download><Download size={16} />Download for Windows</a></div>
      <ol>
        <li>Open <strong>Heartbeat.exe</strong> from your Downloads.</li>
        <li>If Windows says <em>“Windows protected your PC”</em>, choose <strong>More info → Run anyway</strong>. This appears because Heartbeat is new and not yet signed with a paid certificate.</li>
        <li>Choose what Heartbeat should do: <strong>wallpaper</strong>, <strong>screensaver</strong>, or both. It installs just for you; no admin rights needed.</li>
        <li>Sign in with your email and the code. Heartbeat shows straight away; move the mouse to close it.</li>
        <li>Right-click the <strong>Heartbeat icon</strong> by the clock to change the mood, pause, choose when the screensaver starts, or uninstall.</li>
        <li><strong>Lock screen (Windows + L):</strong> right-click the icon → <strong>Show on my lock screen</strong>. It opens the lock screen settings: choose <em>Slideshow</em> and pick the <strong>Pictures › Heartbeat</strong> folder, where Heartbeat keeps its newest pictures.</li>
      </ol>
    </section>

    <section id="mac" className="ps-guide">
      <div><h2><Apple size={20} />Mac</h2><p>Your wallpaper, plus full-screen Heartbeat when your Mac is idle. macOS 13 or later, Apple silicon and Intel.</p>
        <a className="ps-button" href="/downloads/Heartbeat-mac.zip" download><Download size={16} />Download for Mac</a></div>
      <ol>
        <li>Open the downloaded zip and drag <strong>Heartbeat</strong> into your <strong>Applications</strong> folder.</li>
        <li>Open it. If macOS says it can’t check the app, open <strong>System Settings → Privacy & Security</strong>, scroll down and choose <strong>Open Anyway</strong>. This is needed once, because Heartbeat isn’t notarised by Apple yet.</li>
        <li>Choose: use as wallpaper, show full-screen when idle, start when you log in.</li>
        <li>Sign in with your email and the code. Heartbeat lives in the <strong>menu bar</strong> (top right): moods, pause, timing and more.</li>
        <li>Tip: to see Heartbeat instead of a black screen, set <strong>System Settings → Lock Screen → Start Screen Saver when inactive</strong> to <em>Never</em>, and turn the display off a little later than Heartbeat’s idle time.</li>
      </ol>
    </section>

    <section id="android" className="ps-guide">
      <div><h2><Smartphone size={20} />Android</h2><p>Your lock screen picture, and a screensaver while charging. Android 8 or later.</p>
        <a className="ps-button" href="/downloads/Heartbeat.apk" download><Download size={16} />Download for Android</a></div>
      <ol>
        <li>Open <strong>Heartbeat.apk</strong>. When Android asks, allow your browser to <strong>install unknown apps</strong> (just for this). Heartbeat is coming to Google Play.</li>
        <li>Sign in with your email and the code. Your first picture is painted, then set as your <strong>lock screen</strong> automatically.</li>
        <li>Optional: turn on <strong>Home screen wallpaper</strong>.</li>
        <li>For a bedside frame: tap <strong>Use as screensaver while charging</strong>, choose <em>Heartbeat</em> and “while charging”. If your phone hides that setting (some Samsung phones), use <strong>Open frame</strong> instead.</li>
        <li>Notifications still appear on your lock screen as usual. While charging they still sound, and show as soon as you touch the screen.</li>
      </ol>
    </section>

    <section id="iphone" className="ps-guide">
      <div><h2><Tablet size={20} />iPhone & iPad</h2><p>A full-screen Home Screen app, and your lock screen picture through Apple’s Shortcuts app. No App Store needed.</p>
        <a className="ps-button" href={signedIn ? '/app?tab=desktop' : '/auth?mode=login&next=%2Fapp%3Ftab%3Ddesktop'}><Apple size={16} />Open my studio</a></div>
      <ol>
        <li><strong>Home Screen app:</strong> open <strong>app.heartbeatart.co.uk</strong> in Safari, sign in, tap <strong>Share → Add to Home Screen</strong>. Open it from your Home Screen for full-screen Heartbeat that keeps the screen on. Great on a stand or while charging.</li>
        <li><strong>Lock screen picture:</strong> in your studio, open <em>Room for your desktop</em> and tap <strong>Create my iPhone picture link</strong>, then copy the link.</li>
        <li>Open <strong>Shortcuts</strong> → <strong>Automation</strong> → <strong>+</strong> → <strong>Time of Day</strong> → every hour (or a few times a day) → <strong>Run Immediately</strong>.</li>
        <li>Add the action <strong>Get Contents of URL</strong> and paste your link. Then add <strong>Set Wallpaper</strong>, choose <strong>Lock Screen</strong> and turn off <strong>Show Preview</strong>.</li>
        <li>Your lock screen now follows Heartbeat. Your link is private: anyone with it could see your pictures, so don’t share it. You can turn it off in your studio at any time.</li>
      </ol>
    </section>

    <section id="web" className="ps-guide">
      <div><h2><Tv size={20} />Any browser or TV</h2><p>Open your display on any screen with a web browser: a spare laptop, a tablet on a stand, a smart TV.</p>
        <a className="ps-button ps-ghost" href={displayHref(signedIn)}>{signedIn ? 'Open my display' : 'Sign in and open my display'}</a></div>
      <ol><li>Sign in and open <strong>Display</strong>. Move the mouse (or tap) to show the controls: pause, full screen and settings. Change the mood in your studio.</li><li>Press <strong>F</strong> for full screen and <strong>Space</strong> to pause.</li></ol>
    </section>

    <section id="using" className="ps-guide ps-guide-wide">
      <div><h2>Using Heartbeat</h2></div>
      <ul className="ps-tips">
        <li><strong>New pictures:</strong> one an hour while a screen is showing Heartbeat. Pictures aren’t made while your devices sleep.</li>
        <li><strong>Mood:</strong> change it in your studio, or from the Windows, Mac or Android app. The current picture stays; the next one follows the mood.</li>
        <li><strong>City:</strong> change it in your studio. Heartbeat starts a picture for the new city straight away.</li>
        <li><strong>Night:</strong> after sunset pictures get dim, then near-black, on every device.</li>
        <li><strong>Your collection:</strong> every picture made for you is in your studio; keep favourites there.</li>
        <li><strong>Devices:</strong> see and disconnect your devices in the studio under <em>Room for your desktop</em>.</li>
        <li><strong>Trouble?</strong> Email <a href="mailto:hello@heartbeatart.co.uk">hello@heartbeatart.co.uk</a> with your device and what you saw.</li>
      </ul>
    </section>
  </Page>;
}

export function LegalPage({ kind }: { kind: 'terms' | 'privacy' }) {
  if (kind === 'privacy') return <Page eyebrow="PRIVACY" title={<>Your space. <em>Your privacy.</em></>} intro="Last updated 18 November 2026. Heartbeat is run from London, United Kingdom. Contact: hello@heartbeatart.co.uk.">
    <div className="ps-legal">
      <h2>What we collect</h2>
      <ul>
        <li><strong>Account:</strong> your email address. Sign-in codes are stored only in scrambled form and expire after 10 minutes.</li>
        <li><strong>Preferences:</strong> the city you choose (not your precise location), units, mood and display settings.</li>
        <li><strong>Pictures:</strong> the pictures made for you, the scene descriptions behind them, and your favourites.</li>
        <li><strong>Usage:</strong> when a Heartbeat screen is open and for how long, the mood, and the device type and name you sign in from (for example “Windows · LAPTOP-1”). We use this to understand and improve Heartbeat.</li>
        <li><strong>Devices:</strong> each app keeps a device key on your device so it stays signed in. Sign out or disconnect the device in your studio to remove it.</li>
      </ul>
      <h2>What we don’t collect</h2>
      <p>No precise location, contacts, photos, files, messages or data from other apps. No advertising, no tracking across other sites, no selling or renting of data.</p>
      <h2>Who helps us</h2>
      <p>Pictures are made by AI services (Cloudflare Workers AI decides the scene, Microsoft Azure paints it). They receive scene descriptions, not your email. Weather comes from Open-Meteo using your city’s coordinates. Sign-in emails are sent by Resend. Our network runs through Cloudflare.</p>
      <h2>How long we keep it</h2>
      <p>While your account exists. Delete your account in your studio (Account) and your pictures and data are removed; a record of picture counts without your email or pictures is kept for cost accounting.</p>
      <h2>Your rights</h2>
      <p>Under UK data protection law you can ask for a copy of your data, a correction, or deletion, and you can complain to the Information Commissioner’s Office (ico.org.uk). Email hello@heartbeatart.co.uk.</p>
      <h2>Children</h2><p>Heartbeat is not intended for children under 13.</p>
    </div>
  </Page>;
  return <Page eyebrow="TERMS" title={<>A little <em>clarity.</em></>} intro="Last updated 18 November 2026. These terms apply to the Heartbeat website and apps during the private test.">
    <div className="ps-legal">
      <h2>The private test</h2>
      <p>Heartbeat is in early, invite-only testing. It is free during the test. Features, timing and limits may change, and the service may pause or stop. We’ll tell testers before anything is charged; nothing is charged without your clear agreement.</p>
      <h2>Your account</h2>
      <p>Use your own email and keep your sign-in codes and devices to yourself. You’re responsible for activity on your account. We may suspend accounts that misuse the service.</p>
      <h2>Pictures</h2>
      <p>Pictures are made by AI for your personal, non-commercial use: to display on your own screens and to keep in your collection. AI pictures can be imperfect or unexpected; we don’t guarantee a particular look, exact weather matching or that two pictures will never resemble each other. Please don’t present them as real photographs.</p>
      <h2>Fair use</h2>
      <p>Each account has a picture rhythm and a daily limit so the service stays fair and affordable. Don’t try to get around limits, overload the service, reverse-engineer private parts of it, or use it to create anything unlawful.</p>
      <h2>The apps</h2>
      <p>The Windows, Mac and Android apps change your wallpaper, screensaver or lock screen only as you choose, and put your previous settings back when you turn them off or uninstall. Early versions are not yet signed by Microsoft or Apple, so your device may warn you when installing; the download page explains why.</p>
      <h2>No guarantees</h2>
      <p>Heartbeat is provided “as is” during testing. To the extent the law allows, we aren’t liable for indirect losses or for interruptions to the service. Nothing in these terms limits rights you have under UK consumer law.</p>
      <h2>Changes and contact</h2>
      <p>We may update these terms; the date above changes when we do. Questions: hello@heartbeatart.co.uk. These terms are governed by the law of England and Wales.</p>
    </div>
  </Page>;
}
