# SYNORA AI Backend

## Project description

SYNORA AI is an AI workspace for chatting with local models, working with documents, and using productivity tools. This folder contains its Node.js and Express REST API. The API stores conversations and workspace data in SQLite, uses Ollama for local language-model features, and can connect to optional email and image-generation services.

### Backend capabilities

- Ollama model discovery and AI chat with saved conversation history
- Document upload, text extraction, and document question answering
- Workspace settings, activity, and document management
- Optional image generation through a configured image provider
- Optional support and account emails through SMTP

The local app opens directly to the dashboard. Its workspace API creates or reuses a local workspace identity, so normal local use does not require signing in.

## Requirements

- Node.js 22.5 or newer
- Ollama (optional to start the API; required for chat and document-question features)

## Run locally

From the project directory, start the API:

```powershell
cd backend
npm install
npm start
```

The API listens on `http://localhost:5000` by default. In a separate terminal, start the frontend:

```powershell
cd web
npm install
npm run dev
```

Vite serves the frontend at `http://localhost:5173` by default. The frontend connects to `http://localhost:5000/api`.

## Ollama

Install and run Ollama separately. The default chat model is `llama3.2:3b`:

```powershell
ollama pull llama3.2:3b
```

Document questions can use keyword retrieval. To enable embedding-based retrieval, also pull the embedding model:

```powershell
ollama pull nomic-embed-text
```

The backend health endpoint reports the Ollama connection and whether the configured models are available:

```text
http://localhost:5000/api/health
```

## API overview

The frontend calls the API under `/api`. These are the main route groups:

| Route | Purpose |
| --- | --- |
| `GET /` | Confirm that the backend is running |
| `GET /api/health` | Check API and Ollama status |
| `GET /api/models` | List models available from Ollama |
| `/api/chat`, `/api/generate` | Run chat and text-generation requests |
| `/api/chats` | Create, list, and clear saved conversations |
| `/api/chats/:id/messages` | Load a conversation's messages |
| `/api/documents` | List, upload, download, preview, ask questions about, and delete documents |
| `/api/settings`, `/api/activity` | Read or update workspace settings; read activity |
| `/api/images` | Check image-generation availability and manage generated images |
| `/api/support` | Submit a support request when email is configured |

Legacy account and password-reset endpoints are also present, but are not required by the current local dashboard flow.

## Data and uploads

On first start, SQLite creates `backend/enter-ai.sqlite`. It stores conversations, documents and their original uploads, generated-image history, and workspace preferences. Keep the database private and out of source control; the backend `.gitignore` excludes it. Back it up while the server is stopped.

The document endpoint accepts PDF, DOCX, TXT, Markdown, and CSV files up to 12 MB. Scanned PDFs require OCR before they contain searchable text; OCR is not provided by this backend.

## Configuration

Set environment variables in the backend process or deployment environment. Defaults are shown below.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `5000` | API listening port |
| `DATABASE_PATH` | `backend/enter-ai.sqlite` | SQLite database file path |
| `OLLAMA_URL` | `http://localhost:11434` | Ollama server URL |
| `OLLAMA_MODEL` | `llama3.2:3b` | Default chat model |
| `OLLAMA_EMBED_MODEL` | `nomic-embed-text` | Document embedding model |
| `FRONTEND_ORIGINS` | Localhost origins | Comma-separated allowed browser origins |
| `IMAGE_GENERATION_API_KEY` | — | Optional key for image generation |
| `OPENAI_API_KEY` | — | Fallback image-generation key |
| `IMAGE_GENERATION_URL` | OpenAI image-generation endpoint | Optional image provider URL |
| `IMAGE_GENERATION_MODEL` | `gpt-image-1` | Image-generation model |
| `SMTP_HOST` | — | SMTP server for optional email features |
| `SMTP_PORT` | `587` | SMTP server port |
| `SMTP_SECURE` | `false` | Set to `true` for implicit TLS |
| `SMTP_USER` | — | SMTP username |
| `SMTP_PASS` | — | SMTP password |
| `SMTP_FROM` | — | Sender address for email |
| `SUPPORT_EMAIL` | — | Recipient for support requests |
| `FRONTEND_URL` | `http://localhost:5173` | Frontend URL used in legacy password-reset email links |

Image generation is unavailable until an image-generation key is configured. SMTP settings are only needed for email features such as support requests and the legacy password-reset endpoint. Store secrets in environment variables or a secret manager, never in frontend variables or source control.

The frontend API base URL can be changed independently with `VITE_API_URL`. For example, if the backend uses port 5100, set `$env:VITE_API_URL = "http://localhost:5100/api"` before starting Vite.

## Local-workspace security

The current workspace API uses a local identity and does not require login. It is intended for trusted local development, not as a publicly exposed multi-user service. Do not expose the backend directly to the internet; add suitable authentication and network protections before deploying it for other users.

## Troubleshooting

- **Ollama shows as disconnected:** Start Ollama, check `OLLAMA_URL`, and confirm the configured model is installed with `ollama list`.
- **The backend port is already in use:** Set `PORT` to an available port and update the frontend's `VITE_API_URL` to match.
- **The browser reports a CORS error:** Set `FRONTEND_ORIGINS` to the frontend's exact origin, such as `http://localhost:5173`.
- **The database is created in an unexpected location:** Set `DATABASE_PATH` to an absolute path for the SQLite file.
