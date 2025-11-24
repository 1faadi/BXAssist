# Slack App Backend

A Next.js 14 application (App Router, TypeScript) that serves as the backend for a Slack app for office management.

## Features

1. **Attendance Tracking** - Slash commands `/checkin` and `/checkout` to record attendance
2. **Leave Application** - Slash command `/leave` to submit leave requests via modal
3. **Weekly Birthdays** - API endpoint for cron jobs to post weekly birthday announcements
4. **RAG-based Policy Chatbot** - Slash command `/policy` to ask questions about company policies

## Tech Stack

- Next.js 14 (App Router)
- TypeScript
- `@slack/web-api` - Slack Web API
- `googleapis` - Google Sheets integration
- `openai` - Embeddings and chat (RAG)

## Environment Variables

Set these in Vercel or your `.env.local` file:

```env
# OpenRouter configuration (required for embeddings and chat completions)
OPENROUTER_API_KEY=sk-or-your-api-key
APP_URL=http://localhost:3000  # Optional: for OpenRouter app attribution

# Qdrant configuration (required for vector database)
QDRANT_URL=https://your-cluster.qdrant.io:6333
QDRANT_API_KEY=your-qdrant-api-key
QDRANT_COLLECTION_NAME=policy-index  # Optional: defaults to 'policy-index'

# Slack configuration (required for Slack integration)
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SIGNING_SECRET=your-signing-secret
SLACK_LEAVE_CHANNEL_ID=C1234567890  # Channel ID where leave requests are posted

# Google Sheets configuration
# Option 1: New format (preferred)
GOOGLE_SHEETS_CLIENT_EMAIL=your-service-account@project.iam.gserviceaccount.com
GOOGLE_SHEETS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"  # With \n for newlines
GOOGLE_SHEETS_SPREADSHEET_ID=your-spreadsheet-id
# Option 2: Legacy format (full JSON string)
SPREADSHEET_ID=your-spreadsheet-id  # Alternative to GOOGLE_SHEETS_SPREADSHEET_ID
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}  # Full JSON string

# Birthday cron token (optional)
BIRTHDAY_CRON_TOKEN=your-secret-token
```

**Note:** For `GOOGLE_SHEETS_PRIVATE_KEY`, if you're setting it in Vercel, you may need to escape newlines as `\n`. The code will automatically handle this.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Build the policy index:
```bash
npm run build-policy-index
```

This script reads all markdown files from `data/policies/` and creates `data/rag_kb.json` with embeddings.

3. Run the development server:
```bash
npm run dev
```

## Google Sheets Structure

### Attendance Sheet
- **Tab name:** `Attendance`
- **Columns:** `Date`, `User ID`, `User Name`, `Check-in`, `Checkout`

### LeaveRequests Sheet
- **Tab name:** `LeaveRequests` (created automatically)
- **Columns (in order):**
  1. `Timestamp` - ISO timestamp when request was created
  2. `SlackUserId` - Slack user ID
  3. `EmployeeName` - Employee's display name
  4. `LeaveDate` - Leave date (YYYY-MM-DD)
  5. `LeaveType` - Type of leave (Sick, Casual, Annual, Half Day, Work from Home)
  6. `Reason` - Reason for leave
  7. `Status` - Current status (Pending, Approved by Manager 1, Approved by Manager 2, Approved)
  8. `Manager1ApprovedBy` - Name of Manager 1 who approved
  9. `Manager1ApprovedAt` - ISO timestamp of Manager 1 approval
  10. `Manager2ApprovedBy` - Name of Manager 2 who approved
  11. `Manager2ApprovedAt` - ISO timestamp of Manager 2 approval
  12. `SlackMessageTs` - Slack message timestamp (for tracking)
  13. `SlackChannelId` - Slack channel ID (for tracking)

### Birthdays Sheet
- **Tab name:** `Birthdays`
- **Columns:** `User ID`, `User Name`, `Birthday (YYYY-MM-DD)`
- **Row 1:** Header row

## Slack Configuration

### Slash Commands

Configure these slash commands in your Slack app settings (api.slack.com → Your App → Slash Commands):

1. **`/checkin`** and **`/checkout`**
   - Request URL: `https://your-domain.vercel.app/api/slack`
   - Method: POST

2. **`/leave`** (Leave Request Flow)
   - Request URL: `https://your-domain.vercel.app/api/slack/commands`
   - Method: POST
   - Description: "Apply for leave"
   - Usage hint: "Opens a modal to submit leave request"

3. **`/policy`**
   - Request URL: `https://your-domain.vercel.app/api/policy-slack`
   - Method: POST

### Interactivity & Shortcuts

Configure in your Slack app settings (api.slack.com → Your App → Interactivity & Shortcuts):

- **Interactivity:** ON
- **Request URL:** `https://your-domain.vercel.app/api/slack/interactions`
- **Method:** POST

This handles:
- Modal submissions (leave request form)
- Button clicks (approval buttons)

### Required Bot Scopes

In **OAuth & Permissions**, ensure your bot has:
- `commands` - For slash commands
- `chat:write` - To post messages
- `chat:write.public` - To post to channels where bot isn't a member
- `users:read` - To fetch user profile/name

### Channel Setup

1. Create or choose a channel for leave requests (e.g., `#leave-requests`)
2. Invite your bot to the channel: `/invite @YourBotName`
3. Get the channel ID:
   - Right-click channel → View channel details → About → Copy channel ID
   - Or use Slack API: `conversations.list`
4. Set `SLACK_LEAVE_CHANNEL_ID` in your environment variables

## API Endpoints

### `/api/slack`
Handles legacy Slack slash commands (`/checkin`, `/checkout`).

### `/api/slack/commands`
Handles Slack slash commands (primarily `/leave`).
- Opens leave request modal with pre-filled date (tomorrow)
- Validates Slack signature
- Returns 200 OK immediately

### `/api/slack/interactions`
Handles Slack interactivity payloads:
- **Modal submissions:** Processes leave request form, posts to channel, saves to Google Sheets
- **Button clicks:** Handles approval buttons, updates message and Google Sheets
- Validates Slack signature
- Updates message status when both managers approve

### `/api/birthdays`
Weekly birthdays endpoint for cron jobs.

**Usage:**
```
GET /api/birthdays?token=YOUR_BIRTHDAY_CRON_TOKEN
```

**Example cron job (GitHub Actions):**
```yaml
- name: Check birthdays
  run: |
    curl "https://your-domain.vercel.app/api/birthdays?token=${{ secrets.BIRTHDAY_CRON_TOKEN }}"
```

### `/api/policy-chat`
RAG-based policy chat API using OpenRouter and lexical similarity.

**Request:**
```json
POST /api/policy-chat
{
  "question": "What is the probation period for new employees?"
}
```

**Response:**
```json
{
  "answer": "According to the policy...",
  "chunks": [
    {
      "id": "chunk_0001",
      "text": "Policy text excerpt..."
    }
  ]
}
```

### `/api/policy-slack`
Slack slash command handler for `/policy`.

## Building Policy Index

The policy index is built from PDF files and uploaded to Pinecone:

1. **Set up Qdrant:**
   - Get your Qdrant URL and API key from https://cloud.qdrant.io/
   - The collection will be created automatically if it doesn't exist

2. **Set environment variables:**
   ```env
   OPENROUTER_API_KEY=sk-or-your-key
   QDRANT_URL=https://your-cluster.qdrant.io:6333
   QDRANT_API_KEY=your-qdrant-api-key
   QDRANT_COLLECTION_NAME=policy-index  # Optional
   ```

3. **Place your policy PDF file** in `data/policies/` (e.g., `D1_ Company Policies .pdf`)

4. **Run the indexing script:**
   ```bash
   npm run build-policy-index
   ```

5. The script will:
   - Read the PDF file
   - Extract text using `pdf-parse`
   - Clean and normalize the text
   - Chunk it into ~500-800 character segments (splitting on sentence boundaries)
   - Generate embeddings using OpenRouter `openai/text-embedding-3-small`
   - Upload vectors to Qdrant

**Note:** 
- The script should be run locally before deploying
- The script clears existing vectors in the index before uploading (you can comment this out if needed)
- The RAG system uses **vector similarity search** via Qdrant for retrieval
- Chat completions use **OpenRouter** with `openai/gpt-4o-mini`

## Deployment to Vercel

1. Push your code to a Git repository
2. Import the project in Vercel
3. Add all environment variables in Vercel dashboard
4. Deploy

The app is serverless-friendly and works well on Vercel's edge functions.

## Project Structure

```
├── app/
│   ├── api/
│   │   ├── slack/
│   │   │   ├── route.ts            # Legacy Slack commands (checkin/checkout)
│   │   │   ├── commands/route.ts  # Slash commands handler (/leave)
│   │   │   └── interactions/route.ts # Interactivity handler (modals, buttons)
│   │   ├── birthdays/route.ts     # Weekly birthdays endpoint
│   │   ├── policy-chat/route.ts   # Policy chat API
│   │   └── policy-slack/route.ts  # Slack /policy command
│   ├── policy/page.tsx             # Policy chat UI (optional)
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
├── lib/
│   ├── slack/
│   │   ├── client.ts              # Slack WebClient instance
│   │   └── verifyRequest.ts        # Slack signature verification
│   ├── env.ts                      # Environment variable config
│   ├── googleSheets.ts             # Google Sheets helpers (includes leave requests)
│   ├── slack.ts                    # Legacy Slack API helpers
│   ├── openrouter.ts               # OpenRouter API client
│   ├── policyRag.ts                # RAG functionality (vector similarity)
│   └── rag.ts                      # Legacy RAG
├── scripts/
│   └── buildPolicyIndex.mts        # Policy index builder (PDF → Qdrant)
├── data/
│   └── policies/                   # Policy PDF files
└── package.json
```

## Notes

- All API routes handle errors gracefully and return appropriate HTTP status codes
- Slack signature verification is implemented for security
- The RAG system uses **OpenRouter** with `openai/gpt-4o-mini` for chat completions
- **Lexical similarity** (token overlap) is used for retrieval instead of embeddings (OpenRouter doesn't provide embeddings)
- The policy chatbot is conservative: it only answers if the context is clear, otherwise suggests consulting HR
- PDF parsing is done using `pdf-parse` package

#   B X A s s i s t 
 
 