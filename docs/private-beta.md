# Private beta: run Heartbeat at app.heartbeatart.co.uk for free

The beta runs on your own computer (or any always-on machine). A free Cloudflare Tunnel connects
https://app.heartbeatart.co.uk to it, so you need no paid Cloudflare plan. Testers sign in with a
six-digit code sent to their email; only addresses you invite on your dashboard can get in (25
places). Nobody pays. Each tester gets a new picture every hour while a Heartbeat screen is showing,
up to 30 a day; you can give any tester a faster rhythm or a different limit on the dashboard. Everyone together can spend at most $5 a day on pictures; after that, screens keep
their last picture until midnight UTC.

The computer must stay on and awake while people are testing. If it sleeps, the site is down.

## 1. Email codes (Resend, free: 3,000 emails a month)

1. Sign in at resend.com (the account you made earlier is fine).
2. **Domains → Add domain** → `heartbeatart.co.uk`, region **EU (Ireland)**.
3. Choose **Sign in to Cloudflare** (automatic setup) and approve. If it isn't offered, copy each
   record Resend shows into Cloudflare → heartbeatart.co.uk → **DNS → Records → Add record**,
   exactly as shown. They use the `send` subdomain and `resend._domainkey`, so your existing
   email forwarding keeps working.
4. Wait until Resend says **Verified** (usually a few minutes).
5. **API Keys → Create API key** → name `heartbeat-beta`, permission **Sending access**, domain
   `heartbeatart.co.uk`. Copy it once; it goes into `.dev.vars` in step 3. Never paste it into chat.

## 2. The tunnel (Cloudflare, free)

1. Cloudflare dashboard → **Zero Trust** (left menu). If asked, pick the **Free** plan; it may ask for a
   card but does not charge for the free plan.
2. **Networks → Tunnels → Create a tunnel** → **Cloudflared** → name it `heartbeat`.
3. Choose **Windows**, and run the install command it shows in **PowerShell as Administrator**.
   This installs the tunnel as a Windows service, so it starts with the computer.
4. Next screen, **Public hostname**: subdomain `app`, domain `heartbeatart.co.uk`, type `HTTP`,
   URL `localhost:8787`. Save.

## 3. Settings

Add these lines to `.dev.vars` (beside `package.json`). Keep your existing `CLOUDFLARE_ACCOUNT_ID`,
`CLOUDFLARE_API_TOKEN`, `AZURE_IMAGE_ENDPOINT` and `AZURE_IMAGE_KEY` lines. If a line below already
exists (for example `HEARTBEAT_APP_MODE=development`), change it instead of adding a second one.

```
HEARTBEAT_APP_MODE=production
HEARTBEAT_APP_ORIGIN=https://app.heartbeatart.co.uk
HEARTBEAT_SELF_HOSTED=true
HEARTBEAT_TRUST_CLOUDFLARE_IP=true
HEARTBEAT_BETA=true
HEARTBEAT_OWNER_EMAIL=your-sign-in-email
HEARTBEAT_EMAIL_API_KEY=the-resend-key
HEARTBEAT_EMAIL_FROM=Heartbeat <hello@heartbeatart.co.uk>
HEARTBEAT_OPERATOR_KEY=any-long-random-text-at-least-32-characters
HEARTBEAT_AI_ENABLED=true
HEARTBEAT_BILLING_ENABLED=false
HEARTBEAT_IMAGE_PROVIDER=azure
HEARTBEAT_DIM_TOO_BRIGHT=true
HEARTBEAT_AI_DAILY_LIMIT=200
HEARTBEAT_DAILY_BUDGET_MICROS=5000000
HEARTBEAT_IMAGE_ESTIMATE_MICROS=40000
HEARTBEAT_DIRECTOR_ESTIMATE_MICROS=2000
```

`HEARTBEAT_DAILY_BUDGET_MICROS=5000000` is the $5 daily cap. Optional: `HEARTBEAT_BETA_SEATS` (25),
`HEARTBEAT_BETA_CADENCE_MINUTES` (default 60), `HEARTBEAT_BETA_USER_DAILY` (default 30 pictures per tester
per day). Per-tester values are set on the dashboard instead (Testers → Picture pace).

For `HEARTBEAT_OPERATOR_KEY`, you can make random text in PowerShell:
`-join ((48..57)+(97..122) | Get-Random -Count 40 | % {[char]$_})`

## 4. Start it

```
git pull
npm run beta:serve
```

(`pnpm install` only when an error mentions a missing package.) The Windows, Mac and Android apps
are already built and included in `public/downloads`, so testers can download them from the website
straight away. It builds the app, adds the new database tables (after backing up your local database) and starts.
When it prints **Ready**, open https://app.heartbeatart.co.uk/auth on your phone, enter your owner
email, and type the code from your inbox. Then open **https://app.heartbeatart.co.uk/admin**: your
dashboard. Invite testers there; they go to the same /auth address and sign in with their email.

Next time, `npm run beta:serve nobuild` starts faster when the code hasn't changed.

## Website and apps

- **https://app.heartbeatart.co.uk** is the public website: what Heartbeat is, downloads for every
  device (it suggests the right one), step-by-step help at `/download`, FAQ, terms and privacy.
- **Windows, Mac, Android** apps, and **iPhone/iPad** through Add to Home Screen plus a lock-screen
  picture link (studio → Room for your desktop). See [how-heartbeat-works.md](how-heartbeat-works.md).
- The **Mac app** is built for free on GitHub's Mac computers whenever `clients/mac` changes
  (`.github/workflows/mac.yml`), and the build is committed to `public/downloads` automatically.
- The contact address on the website is `hello@heartbeatart.co.uk`: add it in Cloudflare →
  Email → Routing rules (forward to your inbox) if it isn't there yet.

## What the dashboard shows

Who is watching right now, testers joined, watch time (today, per day, by hour of day), average
session length, pictures made, today's spend against the $5 cap, moods and devices used, every
screen session, and a log of sign-ins, mood changes and invites. Watch time counts only while a
display is open and visible. Removing a tester signs them out at once. **Picture pace:** in each
tester's row, type minutes between pictures and a daily limit and press Save (empty = defaults:
60 minutes, 30 a day). Only you can open `/admin`; for everyone else it doesn't exist.

## Good to know

- Your local database (`.wrangler/state`) holds everything: accounts, pictures and statistics.
  Don't delete it. Backups land in `outputs/backups` whenever the database is updated.
- Weather comes from Open-Meteo's free service, which is fine for a free private test. Before
  charging customers, switch to a commercial weather plan.
- Later, when you move to paid Cloudflare hosting, the same code runs there unchanged.
