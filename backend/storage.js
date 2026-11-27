const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const databasePath =
  process.env.DATABASE_PATH || path.join(__dirname, "enter-ai.sqlite");
const db = new DatabaseSync(databasePath);

db.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    terms_accepted_at TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS auth_sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS password_resets (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS image_generations (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    prompt TEXT NOT NULL,
    image_url TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS chats (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    mime TEXT NOT NULL,
    content TEXT NOT NULL,
    file_blob BLOB NOT NULL,
    embedding_status TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS document_chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    embedding TEXT,
    UNIQUE(document_id, chunk_index)
  );
  CREATE TABLE IF NOT EXISTS preferences (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    entity_id TEXT,
    created_at TEXT NOT NULL
  );
`);

const userColumns = db.prepare("PRAGMA table_info(users)").all();
if (!userColumns.some((column) => column.name === "terms_accepted_at")) {
  db.exec("ALTER TABLE users ADD COLUMN terms_accepted_at TEXT");
}

for (const table of ["chats", "documents", "activities"]) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((column) => column.name === "owner_id")) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN owner_id TEXT REFERENCES users(id)`);
  }
}

module.exports = db;
