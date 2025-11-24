# Leave Request Implementation Summary

This document provides an overview of the Leave Request flow implementation.

## Key Files Created/Updated

### 1. `app/api/slack/commands/route.ts`
Handles the `/leave` slash command and opens the modal.

**Key Features:**
- Validates Slack signature
- Calculates default date (tomorrow)
- Opens modal with datepicker, leave type dropdown, and reason text area
- Returns 200 OK immediately (Slack requirement)

### 2. `app/api/slack/interactions/route.ts`
Handles modal submissions and button clicks (approvals).

**Key Features:**
- **Modal Submission:**
  - Validates form data
  - Fetches user's real name from Slack
  - Posts message to configured channel with approval buttons
  - Saves to Google Sheets
  
- **Button Clicks:**
  - Identifies which manager approved
  - Updates Google Sheets with approver info and timestamp
  - Updates Slack message (disables button, updates status)
  - When both approve: shows "Approved ✅" and removes buttons

### 3. `lib/slack/client.ts`
Exports a configured Slack WebClient instance.

**Key Features:**
- Lazy initialization to avoid build-time errors
- Uses `SLACK_BOT_TOKEN` from environment

### 4. `lib/slack/verifyRequest.ts`
Verifies Slack request signatures for security.

**Key Features:**
- HMAC SHA256 signature verification
- Replay attack protection (timestamp check)
- Uses `SLACK_SIGNING_SECRET` from environment

### 5. `lib/googleSheets.ts` (Updated)
Extended with leave request functions.

**New Functions:**
- `appendLeaveRequestRow(data)` - Creates header row if needed, appends new request
- `findLeaveRequestByMessage(channelId, messageTs)` - Finds request by Slack message
- `updateLeaveRequestApproval(data)` - Updates approval columns and status

**Key Features:**
- Supports both new format (`GOOGLE_SHEETS_CLIENT_EMAIL` + `GOOGLE_SHEETS_PRIVATE_KEY`) and legacy format (`GOOGLE_SERVICE_ACCOUNT_JSON`)
- Automatically handles escaped newlines in private key
- Creates `LeaveRequests` tab and header row automatically

### 6. `lib/env.ts`
Centralized environment variable configuration.

**Key Features:**
- Lazy getters to avoid build-time errors
- Clear error messages for missing required variables
- Supports optional variables for optional features

## Environment Variables Required

```env
# Required for Leave Request flow
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SIGNING_SECRET=your-signing-secret
SLACK_LEAVE_CHANNEL_ID=C1234567890

# Google Sheets (choose one format)
# Option 1: New format (preferred)
GOOGLE_SHEETS_CLIENT_EMAIL=your-service-account@project.iam.gserviceaccount.com
GOOGLE_SHEETS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_SHEETS_SPREADSHEET_ID=your-spreadsheet-id

# Option 2: Legacy format
SPREADSHEET_ID=your-spreadsheet-id
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
```

## Slack Configuration

### 1. Slash Command
- **Command:** `/leave`
- **Request URL:** `https://your-domain.vercel.app/api/slack/commands`
- **Method:** POST

### 2. Interactivity
- **Request URL:** `https://your-domain.vercel.app/api/slack/interactions`
- **Method:** POST

### 3. Bot Scopes Required
- `commands` - For slash commands
- `chat:write` - To post messages
- `chat:write.public` - To post to channels where bot isn't a member
- `users:read` - To fetch user profile/name

## Google Sheets Structure

The `LeaveRequests` tab is created automatically with these columns:

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

## Flow Diagram

```
User types /leave
    ↓
Slack → /api/slack/commands
    ↓
Modal opens (date pre-filled with tomorrow)
    ↓
User fills form and submits
    ↓
Slack → /api/slack/interactions (view_submission)
    ↓
Message posted to #leave-requests with 2 approval buttons
    ↓
Row saved to Google Sheets (Status: Pending)
    ↓
Manager 1 clicks "Approve (Manager 1)"
    ↓
Slack → /api/slack/interactions (block_actions)
    ↓
Button disabled, status updated to "Approved by Manager 1"
    ↓
Google Sheets row updated (Manager1 columns filled)
    ↓
Manager 2 clicks "Approve (Manager 2)"
    ↓
Slack → /api/slack/interactions (block_actions)
    ↓
Button disabled, status updated to "Approved ✅"
    ↓
Google Sheets row updated (Manager2 columns filled, Status: Approved)
    ↓
Both buttons removed, approval summary shown
```

## Testing Checklist

1. ✅ Type `/leave` in Slack - modal should open
2. ✅ Date should be pre-filled with tomorrow
3. ✅ Select leave type and enter reason, submit
4. ✅ Message should appear in configured channel
5. ✅ Google Sheets should have new row with Status "Pending"
6. ✅ Click "Approve (Manager 1)" - button should disable, status update
7. ✅ Google Sheets should show Manager1 approval info
8. ✅ Click "Approve (Manager 2)" - status should be "Approved ✅"
9. ✅ Google Sheets should show both approvals and Status "Approved"
10. ✅ Both buttons should be removed, summary shown

## Error Handling

- All routes validate Slack signatures
- Missing environment variables throw clear errors
- Google Sheets operations handle missing tabs (creates automatically)
- Button clicks are idempotent (can't approve twice)
- All errors are logged to console
- User-friendly error messages returned to Slack

## Security

- ✅ Slack signature verification on all endpoints
- ✅ Replay attack protection (timestamp validation)
- ✅ Private key handling (escaped newlines)
- ✅ Type-safe environment variable access
- ✅ Input validation on form submissions

