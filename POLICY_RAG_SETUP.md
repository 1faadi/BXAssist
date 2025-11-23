# Policy RAG Assistant Setup Guide

This guide explains how to set up and use the RAG-based policy assistant (Phase 1).

## Overview

The policy assistant uses:
- **OpenRouter API** for embeddings and chat completions
- **Pinecone** vector database for semantic search
- **PDF parsing** to extract text from policy documents

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

This installs:
- `pdf-parse` - For extracting text from PDF files
- `@pinecone-database/pinecone` - Pinecone vector database client
- `openai` - Used as the client for OpenRouter API
- Other Next.js dependencies

### 2. Set Environment Variables

Create a `.env.local` file or set in Vercel:

```env
OPENROUTER_API_KEY=sk-or-your-api-key-here
PINECONE_API_KEY=your-pinecone-api-key
PINECONE_INDEX_NAME=policy-index  # Optional: defaults to 'policy-index'
```

Get your API keys from:
- OpenRouter: https://openrouter.ai/
- Pinecone: https://app.pinecone.io/

### 3. Add Your Policy PDF

Place your PDF file in `data/policies/`. For example:
- `data/policies/D1_ Company Policies .pdf`

The script will automatically find and process any `.pdf` file in that directory.

### 4. Create Pinecone Index

1. Go to https://app.pinecone.io/
2. Create a new index:
   - Name: `policy-index` (or your custom name)
   - Dimension: `1536` (for `text-embedding-3-small`)
   - Metric: `cosine`

### 5. Build the Policy Index

Run the indexing script:

```bash
npm run build-policy-index
```

This will:
1. Find the PDF file in `data/policies/`
2. Extract text using `pdf-parse`
3. Clean and normalize the text
4. Split into chunks of ~500-800 characters
5. Save to `data/policy_index.json`

**Output example:**
```
Building policy index from PDF...
Reading PDF: data/policies/D1_ Company Policies .pdf
Extracted 45231 characters from PDF
Cleaned text: 44892 characters
Created 67 chunks
✅ Policy index created successfully at data/policy_index.json
   Total chunks: 67
   Average chunk size: 670 characters
```

### 6. Start the Development Server

```bash
npm run dev
```

### 7. Test the Assistant

1. Open http://localhost:3000/policy in your browser
2. Enter a question like: "What is the probation period for new employees?"
3. Click "Ask" to get an answer based on your policy document

## How It Works

### Retrieval (Vector Similarity Search)

When a user asks a question:

1. **Embedding Generation**: The question is embedded using OpenRouter with `openai/text-embedding-3-small`
2. **Vector Search**: The embedding is used to query Pinecone for similar policy chunks
3. **Top K Selection**: Pinecone returns the top 5 most similar chunks based on cosine similarity

### Answer Generation

1. The selected chunks are formatted as context
2. A system prompt instructs the model to answer ONLY from the provided context
3. The question and context are sent to OpenRouter using `openai/gpt-4o-mini`
4. The model generates an answer based strictly on the policy text

## API Usage

### Web UI

Visit `/policy` for an interactive UI.

### API Endpoint

```bash
curl -X POST http://localhost:3000/api/policy-chat \
  -H "Content-Type: application/json" \
  -d '{"question": "What is the leave policy?"}'
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

## File Structure

```
lib/
  openrouter.ts      # OpenRouter client configuration
  pinecone.ts        # Pinecone client configuration
  policyRag.ts       # Retrieval and answer logic (vector similarity)

scripts/
  buildPolicyIndex.mts  # PDF → Pinecone index builder

data/
  policies/          # Place PDF files here

app/
  api/
    policy-chat/     # API endpoint
  policy/            # Web UI page
```

## Troubleshooting

### "No PDF files found"
- Make sure your PDF is in `data/policies/`
- Check the file has a `.pdf` extension

### "Missing OPENROUTER_API_KEY" or "Missing PINECONE_API_KEY"
- Set the environment variables in `.env.local` or Vercel
- Restart the dev server after adding env vars

### Empty or poor answers
- Check that Pinecone index has vectors (check in Pinecone dashboard)
- Rebuild the index: `npm run build-policy-index`
- Verify the index name matches `PINECONE_INDEX_NAME` (default: `policy-index`)
- Try more specific questions

### PDF parsing errors
- Ensure the PDF is not password-protected
- Try a different PDF if text extraction fails
- Check that `pdf-parse` is installed: `npm list pdf-parse`

## Next Steps (Phase 2)

This is Phase 1 - a clean web + API RAG assistant. Future phases will add:
- Slack integration (`/policy` slash command)
- Enhanced retrieval methods
- Multi-document support

