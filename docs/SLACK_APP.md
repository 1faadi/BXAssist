# BXAssist Slack App — Setup & Operations Guide

Simple end-to-end guide for creating the Slack app, wiring it to BXAssist, understanding the flow, deploying, and linking everything together.

BXAssist is a **single-workspace** Slack office bot (Next.js + `@slack/web-api`). It is **not** a multi-workspace OAuth marketplace app. You install the bot once into your company workspace and store one bot token in env.

---

## What it does

| Feature | Slack command / trigger | What happens |
|--------|-------------------------|--------------|
| Attendance check-in | `/check-in` | Ephemeral button → signed browser URL (office IP only) → Sheets + channel post |
| Attendance checkout | `/checkout` | Same as check-in |
| Leave request | `/leave-req` | Modal → post to leave channel with Approve/Reject → Sheets |
| Overtime request | `/overtime-req` | Modal → overtime channel + approval buttons → Sheets |
| Short leave | `/short-leave-req` | Modal → short-leave channel + approval buttons → Sheets |
| Daily report | `/daily-report` | Modal → post to daily report channel |
| Weekly report | `/weekly-report` | Compiles this week’s daily reports → modal → weekly channel |
| Standup | `/standup` | Modal → post to standup channel |
| Policy Q&A | `/policy` | RAG answer from company policy docs |
| Approvals | Approve / Reject buttons | Updates Slack message + Sheets + DM to requester |
| Reminders | Vercel cron | Standup / attendance / daily-report nudges |

**Persistence:** Google Sheets (not a Slack installs DB).  
**Host:** typically Vercel.

---

## 1. Prerequisites

- A Slack workspace where you can create apps (admin or app-creation rights)
- Node.js 18+ and this repo cloned
- A Google Cloud service account with access to a Google Spreadsheet
- (Optional) OpenRouter + Qdrant for `/policy`
- A public HTTPS URL for Slack Request URLs (local: use [ngrok](https://ngrok.com) or similar; production: Vercel)

---

## 2. Create the Slack app

1. Go to [https://api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → **From scratch**.
2. Name it (e.g. `BXAssist`) and pick your workspace.
3. Open **Basic Information** and copy:
   - **Signing Secret** → `SLACK_SIGNING_SECRET`
4. Open **OAuth & Permissions** → **Bot Token Scopes** and add:

| Scope | Why |
|-------|-----|
| `commands` | Slash commands |
| `chat:write` | Post / update messages, DMs, scheduled messages |
| `chat:write.public` | Post to public channels without invite (optional but useful) |
| `users:read` | Resolve display names |
| `channels:history` | Read daily-report history for `/weekly-report` |
| `channels:read` | List / resolve channel info |
| `groups:history` | Same if channels are private |
| `groups:read` | Private channel membership |
| `im:write` | Open DMs for approvals / reminders |

5. Click **Install to Workspace** → allow.
6. Copy the **Bot User OAuth Token** (`xoxb-...`) → `SLACK_BOT_TOKEN`.

> Reinstall the app after adding scopes so the token picks up new permissions.

---

## 3. Create channels and invite the bot

Create (or reuse) channels, then invite the bot in each:

```text
/invite @BXAssist
```

Suggested channels:

| Channel | Env var |
|---------|---------|
| Leave requests | `SLACK_LEAVE_CHANNEL_ID` |
| Attendance | `SLACK_ATTENDANCE_CHANNEL_ID` |
| Overtime | `SLACK_OVERTIME_CHANNEL_ID` |
| Short leave | `SLACK_SHORT_LEAVE_CHANNEL_ID` |
| Daily reports | `SLACK_DAILY_REPORT_CHANNEL_ID` |
| Weekly reports | `SLACK_WEEKLY_REPORT_CHANNEL_ID` |
| Standup | `SLACK_STANDUP_CHANNEL_ID` |

**Get a channel ID:** right-click the channel → **View channel details** → **About** → copy Channel ID (`C...`).

---

## 4. Slack app config (Request URLs)

After your app is reachable on HTTPS (see Local / Deploy sections), set these in the Slack app settings.

### Slash Commands

**api.slack.com → Your App → Slash Commands → Create New Command**

Point **most** commands at the same URL:

```text
https://YOUR_DOMAIN/api/slack/commands
```

| Command | Short description | Request URL |
|---------|-------------------|-------------|
| `/check-in` | Office check-in (attendance channel) | `.../api/slack/commands` |
| `/checkout` | Office checkout | `.../api/slack/commands` |
| `/leave-req` | Submit leave request | `.../api/slack/commands` |
| `/overtime-req` | Submit overtime request | `.../api/slack/commands` |
| `/short-leave-req` | Submit short leave | `.../api/slack/commands` |
| `/daily-report` | Daily progress report | `.../api/slack/commands` |
| `/weekly-report` | Weekly progress report | `.../api/slack/commands` |
| `/standup` | Daily standup | `.../api/slack/commands` |
| `/policy` | Ask company policy questions | `https://YOUR_DOMAIN/api/policy-slack` |

Slack always uses **POST**.

### Interactivity & Shortcuts

**Interactivity & Shortcuts → Interactivity → On**

```text
Request URL: https://YOUR_DOMAIN/api/slack/interactions
```

This receives:

- Modal submissions (`view_submission`)
- Approve / Reject / Edit button clicks (`block_actions`)

### Events API

Not used. No Event Subscriptions URL is required for the current app.

### Socket Mode

Not used. The app is HTTP Request URL based.

---

## 5. Environment variables

Copy `.env.template` → `.env.local` (and set the same keys in Vercel for production).

### Slack (required)

```env
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
SLACK_LEAVE_CHANNEL_ID=C...
SLACK_ATTENDANCE_CHANNEL_ID=C...
SLACK_OVERTIME_CHANNEL_ID=C...
SLACK_SHORT_LEAVE_CHANNEL_ID=C...
SLACK_DAILY_REPORT_CHANNEL_ID=C...
SLACK_WEEKLY_REPORT_CHANNEL_ID=C...
SLACK_STANDUP_CHANNEL_ID=C...
```

### Attendance / app URL

```env
APP_BASE_URL=https://YOUR_DOMAIN
ATTENDANCE_SIGNING_SECRET=long-random-string
OFFICE_IP_ALLOWLIST=203.0.113.10,203.0.113.11
```

`APP_BASE_URL` must be the **public** origin Slack and attendance links use (no trailing slash).  
Signed check-in/out links are built as:

```text
{APP_BASE_URL}/api/attendance/checkin?...
{APP_BASE_URL}/api/attendance/checkout?...
```

### Google Sheets

```env
GOOGLE_SHEETS_CLIENT_EMAIL=...@....iam.gserviceaccount.com
GOOGLE_SHEETS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_SHEETS_SPREADSHEET_ID=...
```

Share the spreadsheet with the service account email (Editor).

### Cron / admin

```env
CRON_SECRET=long-random-string
BIRTHDAY_CRON_TOKEN=optional-token
ADMIN_SECRET=...
ADMIN_KEY=...
```

### Policy bot (optional)

```env
OPENROUTER_API_KEY=...
QDRANT_URL=...
QDRANT_API_KEY=...
QDRANT_COLLECTION_NAME=policy-index
```

---

## 6. App flow (how it works)

```text
Slack user
   │
   ├─ Slash command ──────────────► POST /api/slack/commands
   │                                    │
   │                                    ├─ /check-in|/checkout → ephemeral signed URL button
   │                                    └─ others → views.open (modal)
   │
   ├─ Modal submit / button click ─► POST /api/slack/interactions
   │                                    │
   │                                    ├─ post/update channel message
   │                                    ├─ write/update Google Sheets
   │                                    └─ DM requester on approve/reject
   │
   ├─ /policy ─────────────────────► POST /api/policy-slack → RAG reply
   │
   └─ Attendance button (browser) ─► GET /api/attendance/checkin|checkout
                                        │
                                        ├─ verify signature + office IP
                                        ├─ write Sheets
                                        └─ chat.postMessage to attendance channel

Vercel Cron ──► /api/cron/... ──► Slack DMs / channel reminders
```

### Leave / OT / short leave (approval path)

1. User runs `/leave-req` (or OT / short leave).
2. Backend opens a Slack modal.
3. On submit, interactions route:
   - Posts a Block Kit message to the configured channel (with Approve / Reject).
   - Appends a row in Google Sheets (including `SlackMessageTs` / `SlackChannelId`).
4. Approver clicks Approve or Reject.
5. Backend updates the message, updates Sheets status, and DMs the requester.

### Attendance path

1. User runs `/check-in` or `/checkout` **only in the attendance channel**.
2. Slack shows an ephemeral button with a short-lived signed URL.
3. User opens the URL on the **office network** (`OFFICE_IP_ALLOWLIST`).
4. Backend records attendance in Sheets and posts confirmation to the attendance channel.

### Daily / weekly reports

1. `/daily-report` → modal → message in daily report channel.
2. `/weekly-report` → reads that channel’s history for the week → modal → posts to weekly channel.

### Standup & reminders

1. `/standup` → modal → standup channel.
2. Cron schedules / sends reminder DMs (members of standup / attendance channels).

---

## 7. Local development

```bash
npm install
# optional: npm run build-policy-index
npm run dev
```

Expose localhost to Slack:

```bash
ngrok http 3000
# use https://xxxx.ngrok-free.app as YOUR_DOMAIN in Slack + APP_BASE_URL
```

Update Slack Slash Commands + Interactivity Request URLs to the ngrok domain while testing.

---

## 8. Deploy (Vercel) and link to Slack

### Deploy

1. Push the repo to GitHub/GitLab.
2. Import the project in [Vercel](https://vercel.com).
3. Add **all** env vars from Section 5 (same values as `.env.local`, with production `APP_BASE_URL`).
4. Deploy. Note the production URL, e.g. `https://bx-assist.vercel.app`.

### Link Slack → production

1. In Slack app settings, change every Request URL from ngrok/local to production:

| Feature | Production URL |
|---------|----------------|
| Slash commands (except `/policy`) | `https://YOUR_VERCEL_DOMAIN/api/slack/commands` |
| `/policy` | `https://YOUR_VERCEL_DOMAIN/api/policy-slack` |
| Interactivity | `https://YOUR_VERCEL_DOMAIN/api/slack/interactions` |

2. Set `APP_BASE_URL=https://YOUR_VERCEL_DOMAIN` in Vercel and redeploy if needed.
3. Confirm the bot is still invited to all channels listed in env.
4. Smoke-test each slash command and one Approve/Reject flow.

### Crons

`vercel.json` schedules Mon–Fri jobs (times are UTC), for example:

- Morning: schedule standup / check-in reminders
- Afternoon: daily-report reminder

Secure cron routes with `CRON_SECRET` / `key` / `secret` query params — keep those secrets out of public docs and rotate if leaked.

---

## 9. Google Sheets tabs (high level)

The bot writes to tabs such as:

- `Attendance` — check-in / checkout
- `LeaveRequests` — leave + status + Slack message refs
- `OvertimeRequests` — OT + approvals
- Short leave sheets / approver message tracking
- Reminder queue rows (scheduled message IDs)
- `Birthdays` — for birthday cron posts

Share the spreadsheet with `GOOGLE_SHEETS_CLIENT_EMAIL`.

---

## 10. Key code map

| Path | Role |
|------|------|
| `app/api/slack/commands/route.ts` | Slash command hub |
| `app/api/slack/interactions/route.ts` | Modals + buttons |
| `app/api/policy-slack/route.ts` | `/policy` |
| `app/api/attendance/checkin/route.ts` | Signed check-in |
| `app/api/attendance/checkout/route.ts` | Signed checkout |
| `lib/slackClient.ts` | `WebClient` with `SLACK_BOT_TOKEN` |
| `lib/googleSheets.ts` | Sheets read/write |
| `lib/attendanceSecurity.ts` | Signed attendance URLs |
| `app/api/cron/*` | Reminder jobs |
| `vercel.json` | Cron schedule |

Legacy (older commands still present): `app/api/slack/route.ts` (`/checkin`, `/checkout`, `/leave`). Prefer the current commands in Section 4.

---

## 11. Checklist (new workspace)

- [ ] Create Slack app + install to workspace
- [ ] Add bot scopes + reinstall
- [ ] Copy `SLACK_BOT_TOKEN` + `SLACK_SIGNING_SECRET`
- [ ] Create channels + `/invite` bot + copy channel IDs
- [ ] Set `.env.local` / Vercel env (including `APP_BASE_URL`)
- [ ] Share Google Sheet with service account
- [ ] Deploy to Vercel
- [ ] Wire slash commands → `/api/slack/commands` (+ `/policy` → `/api/policy-slack`)
- [ ] Wire Interactivity → `/api/slack/interactions`
- [ ] Test `/leave-req` approve/reject and `/check-in` on office IP

---

## Notes

- One workspace, one bot token — no Slack OAuth install flow in this codebase.
- `/check-in` and `/checkout` only work in `SLACK_ATTENDANCE_CHANNEL_ID`.
- Attendance completion must happen from an IP in `OFFICE_IP_ALLOWLIST`.
- Keep `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, and cron secrets private; rotate if exposed.
