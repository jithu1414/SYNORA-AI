const crypto = require("node:crypto");
const { promisify } = require("node:util");
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const nodemailer = require("nodemailer");
const mammoth = require("mammoth");
const pdfParse = require("pdf-parse");
const db = require("./storage");

const app = express();
const OLLAMA_URL = (process.env.OLLAMA_URL || "http://localhost:11434").replace(
  /\/$/,
  "",
);
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || "llama3.2:3b";
const EMBEDDING_MODEL = process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text";
const PORT = process.env.PORT || 5000;
const MAX_FILE_SIZE = 12 * 1024 * 1024;
const SESSION_COOKIE = "synora_session";
const SESSION_LIFETIME = 7 * 24 * 60 * 60 * 1000;
const SESSION_SHORT_LIFETIME = 8 * 60 * 60 * 1000;
const FAVORITABLE_TOOLS = new Set([
  "Text Summarizer",
  "Grammar Checker",
  "Grammar Corrector",
  "Translator",
  "Text Translator",
  "Email Writer",
  "Content Writer",
  "Content Generator",
  "Resume Assistant",
  "Python Helper",
  "SQL Assistant",
  "Data Analysis Assistant",
  "Question Generator",
  "Question Answering",
  "Study Assistant",
  "Paragraph Rewriter",
  "Idea Generator",
]);
const ACCENT_COLORS = new Set(["turquoise", "copper"]);
const CODE_LANGUAGES = new Set([
  "Python",
  "JavaScript",
  "TypeScript",
  "Java",
  "C++",
  "C#",
  "Go",
  "Rust",
  "PHP",
  "Ruby",
  "SQL",
  "HTML/CSS",
  "Other",
]);
const now = () => new Date().toISOString();
const scrypt = promisify(crypto.scrypt);

function publicOllamaEndpoint() {
  try {
    const url = new URL(OLLAMA_URL);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "configured by backend";
  }
}

const allowedOrigins = (process.env.FRONTEND_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    credentials: true,
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      let parsed;
      try {
        parsed = new URL(origin);
      } catch {
        return callback(new Error("Origin is not allowed."));
      }
      const localOrigin =
        parsed.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(parsed.hostname);
      if (allowedOrigins.includes(origin) || (!allowedOrigins.length && localOrigin)) {
        return callback(null, true);
      }
      return callback(new Error("Origin is not allowed."));
    },
  }),
);
app.use(express.json({ limit: "3mb" }));

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function sessionCookie(token, maxAge) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`;
}

function readCookie(request, name) {
  const cookie = request.headers.cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  if (!cookie) return "";
  try {
    return decodeURIComponent(cookie.slice(name.length + 1));
  } catch {
    return "";
  }
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email };
}

function emailTransport() {
  const { SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !SMTP_FROM) return null;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, 64, {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  return `${salt.toString("hex")}:${key.toString("hex")}`;
}

async function verifyPassword(password, storedHash) {
  const [saltHex, keyHex] = storedHash.split(":");
  if (!saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, "hex");
  const actual = await scrypt(password, Buffer.from(saltHex, "hex"), expected.length, {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

async function createSession(user, res, rememberMe = true) {
  const lifetime = rememberMe ? SESSION_LIFETIME : SESSION_SHORT_LIFETIME;
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + lifetime).toISOString();
  db.prepare("DELETE FROM auth_sessions WHERE expires_at <= ?").run(now());
  db.prepare("INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)").run(
    hashToken(token),
    user.id,
    expiresAt,
  );
  res.setHeader("Set-Cookie", sessionCookie(token, lifetime / 1000));
}

function requireAuth(req, res, next) {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token) return res.status(401).json({ error: "Sign in to continue." });
  const session = db
    .prepare(
      `SELECT users.id, users.email, users.name
       FROM auth_sessions JOIN users ON users.id = auth_sessions.user_id
       WHERE auth_sessions.token_hash = ? AND auth_sessions.expires_at > ?`,
    )
    .get(hashToken(token), now());
  if (!session) {
    res.setHeader("Set-Cookie", sessionCookie("", 0));
    return res.status(401).json({ error: "Your session has expired. Sign in again." });
  }
  req.user = session;
  return next();
}

function getLocalWorkspaceUser() {
  let user = db
    .prepare("SELECT id, email, name FROM users ORDER BY created_at, id LIMIT 1")
    .get();
  if (!user) {
    user = {
      id: crypto.randomUUID(),
      email: "workspace@local.invalid",
      name: "SYNORA AI User",
    };
    db.prepare(
      "INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)",
    ).run(user.id, user.email, user.name, "disabled", now());
  }

  db.prepare("UPDATE chats SET owner_id = ? WHERE owner_id IS NULL").run(user.id);
  db.prepare("UPDATE documents SET owner_id = ? WHERE owner_id IS NULL").run(user.id);
  db.prepare("UPDATE activities SET owner_id = ? WHERE owner_id IS NULL").run(user.id);

  const legacyPreferences = db.prepare("SELECT key, value FROM preferences").all();
  const movePreference = db.prepare(
    "INSERT INTO preferences (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING",
  );
  for (const preference of legacyPreferences) {
    if (!preference.key.includes(":")) {
      movePreference.run(userPreferenceKey(user.id, preference.key), preference.value);
      db.prepare("DELETE FROM preferences WHERE key = ?").run(preference.key);
    }
  }
  return user;
}

function userPreferenceKey(userId, key) {
  return `${userId}:${key}`;
}

function getUserPreferences(userId) {
  const prefix = `${userId}:`;
  return Object.fromEntries(
    db
      .prepare("SELECT key, value FROM preferences")
      .all()
      .filter((entry) => entry.key.startsWith(prefix))
      .map((entry) => [entry.key.slice(prefix.length), entry.value]),
  );
}

async function fetchOllama(url, options) {
  try {
    return await fetch(url, options);
  } catch (cause) {
    const timedOut = cause instanceof Error && cause.name === "TimeoutError";
    const error = new Error(
      timedOut
        ? "Ollama took too long to respond. Please try again."
        : `Unable to connect to Ollama at ${OLLAMA_URL}. Make sure Ollama is running.`,
    );
    error.status = timedOut ? 504 : 503;
    throw error;
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
  fileFilter: (_req, file, callback) => {
    const extension = file.originalname.toLowerCase().split(".").pop();
    if (!["pdf", "docx", "txt", "md", "csv"].includes(extension || "")) {
      callback(new Error("Supported file types are PDF, DOCX, TXT, MD, and CSV."));
      return;
    }
    callback(null, true);
  },
});

function validText(value, label, maxLength = 20000) {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    throw new Error(`${label} must be a non-empty string of at most ${maxLength} characters.`);
  }
  return value.trim();
}

function chatSummary(row) {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    messageCount: row.message_count || 0,
  };
}

function documentSummary(row) {
  return {
    id: row.id,
    name: row.name,
    mime: row.mime,
    embeddingStatus: row.embedding_status,
    createdAt: row.created_at,
    characters: row.content.length,
    sizeBytes: row.size_bytes,
  };
}

function recordActivity(ownerId, category, title, description, entityId = null) {
  db.prepare(
    "INSERT INTO activities (owner_id, category, title, description, entity_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(ownerId, category, title, description, entityId, now());
}

async function ollamaTags() {
  const response = await fetchOllama(`${OLLAMA_URL}/api/tags`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}`);
  const data = await response.json();
  return Array.isArray(data.models) ? data.models : [];
}

async function requireModel(model) {
  const models = await ollamaTags();
  if (!models.some((item) => item.name === model)) {
    const error = new Error(
      `Ollama model "${model}" is not installed. Run "ollama pull ${model}" and try again.`,
    );
    error.status = 503;
    throw error;
  }
}

async function generateText({ model, prompt, system, messages }) {
  await requireModel(model);
  const body = messages
    ? { model, messages, stream: false }
    : { model, prompt, system, stream: false };
  const response = await fetchOllama(`${OLLAMA_URL}/api/${messages ? "chat" : "generate"}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  });
  let result;
  try {
    result = await response.json();
  } catch {
    const error = new Error("Ollama returned an invalid response.");
    error.status = 502;
    throw error;
  }
  if (!response.ok) {
    const error = new Error(
      typeof result.error === "string" ? result.error : `Ollama returned HTTP ${response.status}`,
    );
    error.status = 502;
    throw error;
  }
  const text = messages ? result.message?.content : result.response;
  if (typeof text !== "string" || !text.trim()) {
    const error = new Error("Ollama returned an empty response. Please try again.");
    error.status = 502;
    throw error;
  }
  return text.trim();
}

async function embedTexts(texts) {
  const response = await fetchOllama(`${OLLAMA_URL}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
    signal: AbortSignal.timeout(90000),
  });
  const data = await response.json();
  if (!response.ok || !Array.isArray(data.embeddings)) {
    throw new Error(
      typeof data.error === "string" ? data.error : "Ollama embeddings are unavailable.",
    );
  }
  return data.embeddings;
}

function splitIntoChunks(text) {
  const chunks = [];
  const size = 1000;
  const overlap = 150;
  for (let start = 0; start < text.length; start += size - overlap) {
    const chunk = text.slice(start, start + size).trim();
    if (chunk) chunks.push(chunk);
    if (chunks.length >= 180) break;
  }
  return chunks;
}

function cosineSimilarity(left, right) {
  if (left.length !== right.length) return 0;
  let dot = 0;
  let leftLength = 0;
  let rightLength = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftLength += left[index] ** 2;
    rightLength += right[index] ** 2;
  }
  return leftLength && rightLength ? dot / (Math.sqrt(leftLength) * Math.sqrt(rightLength)) : 0;
}

function keywordScore(content, queryTerms) {
  const normalized = content.toLowerCase();
  return queryTerms.reduce((score, term) => score + (normalized.includes(term) ? 1 : 0), 0);
}

app.get("/", (_req, res) => {
  res.json({ message: "SYNORA AI backend is running successfully." });
});

app.get("/api/health", async (_req, res) => {
  try {
    const models = await ollamaTags();
    res.json({
      status: "OK",
      service: "SYNORA AI",
      ollama: {
        connected: true,
        url: publicOllamaEndpoint(),
        model: DEFAULT_MODEL,
        modelAvailable: models.some((item) => item.name === DEFAULT_MODEL),
        embeddingModel: EMBEDDING_MODEL,
        embeddingModelAvailable: models.some((item) => item.name === EMBEDDING_MODEL),
      },
    });
  } catch (error) {
    res.json({
      status: "DEGRADED",
      service: "SYNORA AI",
      ollama: {
        connected: false,
        url: publicOllamaEndpoint(),
        model: DEFAULT_MODEL,
        modelAvailable: false,
        error: error instanceof Error ? error.message : "Unable to connect to Ollama.",
      },
    });
  }
});

app.get("/api/models", async (_req, res) => {
  try {
    const models = await ollamaTags();
    res.json({ models: models.map((model) => model.name) });
  } catch (error) {
    res.status(503).json({
      error: error instanceof Error ? error.message : "Unable to connect to Ollama.",
    });
  }
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

app.post("/api/auth/register", async (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = req.body?.password;
  const confirmation = req.body?.confirmPassword;
  const acceptedTerms = req.body?.acceptedTerms === true;
  const rememberMe = req.body?.rememberMe !== false;
  if (req.body?.rememberMe !== undefined && typeof req.body.rememberMe !== "boolean") {
    return res.status(400).json({ error: "Remember-me preference must be a boolean." });
  }
  if (!acceptedTerms) {
    return res.status(400).json({ error: "Accept the terms and privacy notice to create an account." });
  }
  if (name.length < 2 || name.length > 60) {
    return res.status(400).json({ error: "Name must be between 2 and 60 characters." });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) {
    return res.status(400).json({ error: "Enter a valid email address." });
  }
  if (typeof password !== "string" || password.length < 10 || password.length > 200) {
    return res.status(400).json({ error: "Password must be between 10 and 200 characters." });
  }
  if (password !== confirmation) {
    return res.status(400).json({ error: "Passwords do not match." });
  }
  const passwordHash = await hashPassword(password);
  const user = { id: crypto.randomUUID(), email, name };
  try {
    db.exec("BEGIN IMMEDIATE");
    const firstUser = db.prepare("SELECT COUNT(*) AS count FROM users").get().count === 0;
    db.prepare(
      "INSERT INTO users (id, email, name, password_hash, terms_accepted_at, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(user.id, user.email, user.name, passwordHash, now(), now());
    if (firstUser) {
      db.prepare("UPDATE chats SET owner_id = ? WHERE owner_id IS NULL").run(user.id);
      db.prepare("UPDATE documents SET owner_id = ? WHERE owner_id IS NULL").run(user.id);
      db.prepare("UPDATE activities SET owner_id = ? WHERE owner_id IS NULL").run(user.id);
      const legacyPreferences = db.prepare("SELECT key, value FROM preferences").all();
      const movePreference = db.prepare(
        "INSERT INTO preferences (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING",
      );
      for (const preference of legacyPreferences) {
        if (!preference.key.includes(":")) {
          movePreference.run(userPreferenceKey(user.id, preference.key), preference.value);
          db.prepare("DELETE FROM preferences WHERE key = ?").run(preference.key);
        }
      }
      const saveDefault = db.prepare(
        "INSERT INTO preferences (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING",
      );
      saveDefault.run(userPreferenceKey(user.id, "theme"), "dark");
      saveDefault.run(userPreferenceKey(user.id, "model"), DEFAULT_MODEL);
    }
    db.exec("COMMIT");
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch (rollbackError) {
      console.error("Registration rollback failed:", rollbackError);
    }
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(409).json({ error: "An account with this email already exists." });
    }
    console.error("Account registration failed:", error);
    return res.status(500).json({ error: "Could not create your account." });
  }
  await createSession(user, res, rememberMe);
  return res.status(201).json({ user: publicUser(user) });
});

app.post("/api/auth/login", async (req, res) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = req.body?.password;
  const rememberMe = req.body?.rememberMe !== false;
  if (req.body?.rememberMe !== undefined && typeof req.body.rememberMe !== "boolean") {
    return res.status(400).json({ error: "Remember-me preference must be a boolean." });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof password !== "string" || !password) {
    return res.status(400).json({ error: "Enter a valid email and password." });
  }
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  const dummyHash = `${"00".repeat(16)}:${"00".repeat(64)}`;
  const passwordMatches = await verifyPassword(password, user?.password_hash || dummyHash);
  if (!user || !passwordMatches) {
    return res.status(401).json({ error: "Email or password is incorrect." });
  }
  await createSession(user, res, rememberMe);
  return res.json({ user: publicUser(user) });
});

app.post("/api/auth/logout", (req, res) => {
  const token = readCookie(req, SESSION_COOKIE);
  if (token) db.prepare("DELETE FROM auth_sessions WHERE token_hash = ?").run(hashToken(token));
  res.setHeader("Set-Cookie", sessionCookie("", 0));
  res.json({ signedOut: true });
});

app.post("/api/auth/forgot-password", async (req, res) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) {
    return res.status(400).json({ error: "Enter a valid email address." });
  }
  const transport = emailTransport();
  if (!transport) {
    return res.status(503).json({
      error: "Password reset email is not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS, and SMTP_FROM on the backend.",
    });
  }
  const user = db.prepare("SELECT id, email FROM users WHERE email = ?").get(email);
  if (user) {
    const token = crypto.randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    db.prepare("DELETE FROM password_resets WHERE user_id = ?").run(user.id);
    db.prepare("INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, ?)").run(
      hashToken(token),
      user.id,
      expiresAt,
    );
    const frontendUrl = (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");
    try {
      await transport.sendMail({
        from: process.env.SMTP_FROM,
        to: user.email,
        subject: "Reset your SYNORA AI password",
        text: `Use this link within 30 minutes to reset your password: ${frontendUrl}/?reset=${encodeURIComponent(token)}`,
      });
    } catch (error) {
      console.error("Password reset email delivery failed:", error);
      db.prepare("DELETE FROM password_resets WHERE token_hash = ?").run(hashToken(token));
      return res.status(503).json({ error: "Password reset email could not be sent. Check the backend mail configuration." });
    }
  }
  return res.json({ message: "If an account exists for that email, a password reset link has been sent." });
});

app.post("/api/auth/reset-password", async (req, res) => {
  const token = typeof req.body?.token === "string" ? req.body.token : "";
  const password = req.body?.password;
  const confirmation = req.body?.confirmPassword;
  if (!token || typeof password !== "string" || password.length < 10 || password.length > 200) {
    return res.status(400).json({ error: "Enter a valid reset link and a password between 10 and 200 characters." });
  }
  if (password !== confirmation) {
    return res.status(400).json({ error: "Passwords do not match." });
  }
  const reset = db
    .prepare("SELECT user_id FROM password_resets WHERE token_hash = ? AND expires_at > ?")
    .get(hashToken(token), now());
  if (!reset) return res.status(400).json({ error: "This password reset link is invalid or expired." });
  const passwordHash = await hashPassword(password);
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, reset.user_id);
  db.prepare("DELETE FROM password_resets WHERE user_id = ?").run(reset.user_id);
  db.prepare("DELETE FROM auth_sessions WHERE user_id = ?").run(reset.user_id);
  res.setHeader("Set-Cookie", sessionCookie("", 0));
  return res.json({ message: "Password updated. Sign in with your new password." });
});

app.post("/api/support", async (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  const recipient = process.env.SUPPORT_EMAIL;
  const transport = emailTransport();
  if (!recipient || !transport) {
    return res.status(503).json({
      error: "Support email is not configured. Set SUPPORT_EMAIL and SMTP settings on the backend.",
    });
  }
  if (name.length < 2 || name.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Enter your name and a valid email address." });
  }
  if (message.length < 10 || message.length > 5000) {
    return res.status(400).json({ error: "Message must be between 10 and 5,000 characters." });
  }
  try {
    await transport.sendMail({
      from: process.env.SMTP_FROM,
      to: recipient,
      replyTo: email,
      subject: `SYNORA AI support request from ${name}`,
      text: `Name: ${name}\nEmail: ${email}\n\n${message}`,
    });
  } catch (error) {
    console.error("Support email delivery failed:", error);
    return res.status(503).json({ error: "Support request could not be sent. Check the backend mail configuration." });
  }
  return res.json({ sent: true });
});

app.use("/api", (req, _res, next) => {
  req.user = getLocalWorkspaceUser();
  next();
});

app.get("/api/chats", (_req, res) => {
  const rows = db
    .prepare(
      `SELECT c.*, COUNT(m.id) AS message_count
       FROM chats c LEFT JOIN messages m ON m.chat_id = c.id
       WHERE c.owner_id = ?
       GROUP BY c.id ORDER BY c.updated_at DESC`,
    )
    .all(_req.user.id);
  res.json({ chats: rows.map(chatSummary) });
});

app.get("/api/activity", (_req, res) => {
  const activities = db
    .prepare(
      `SELECT id, category, title, description, entity_id AS entityId, created_at AS createdAt
       FROM activities WHERE owner_id = ? ORDER BY id DESC LIMIT 30`,
    )
    .all(_req.user.id);
  res.json({ activities });
});

app.post("/api/chats", (req, res) => {
  const title =
    typeof req.body?.title === "string" && req.body.title.trim()
      ? req.body.title.trim().slice(0, 100)
      : "New conversation";
  const id = crypto.randomUUID();
  const createdAt = now();
  db.prepare("INSERT INTO chats (id, title, created_at, updated_at, owner_id) VALUES (?, ?, ?, ?, ?)").run(
    id,
    title,
    createdAt,
    createdAt,
    req.user.id,
  );
  res.status(201).json({ chat: { id, title, createdAt, updatedAt, messageCount: 0 } });
});

app.get("/api/chats/:id/messages", (req, res) => {
  const ownedChat = db
    .prepare("SELECT id FROM chats WHERE id = ? AND owner_id = ?")
    .get(req.params.id, req.user.id);
  if (!ownedChat) return res.status(404).json({ error: "Conversation not found." });
  const messages = db
    .prepare("SELECT id, role, content, created_at AS createdAt FROM messages WHERE chat_id = ? ORDER BY id")
    .all(req.params.id);
  res.json({ messages });
});

app.delete("/api/chats/:id", (req, res) => {
  const result = db.prepare("DELETE FROM chats WHERE id = ? AND owner_id = ?").run(req.params.id, req.user.id);
  if (!result.changes) return res.status(404).json({ error: "Conversation not found." });
  db.prepare("DELETE FROM activities WHERE category = 'chat' AND entity_id = ? AND owner_id = ?").run(req.params.id, req.user.id);
  res.json({ deleted: true });
});

app.delete("/api/chats", (_req, res) => {
  db.prepare("DELETE FROM activities WHERE category = 'chat' AND owner_id = ?").run(_req.user.id);
  db.prepare("DELETE FROM chats WHERE owner_id = ?").run(_req.user.id);
  res.json({ deleted: true });
});

app.post("/api/chat", async (req, res) => {
  let userMessage;
  try {
    userMessage = validText(req.body?.message, "Message");
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
  const model = typeof req.body?.model === "string" ? req.body.model.trim() : DEFAULT_MODEL;
  let chatId = typeof req.body?.chatId === "string" ? req.body.chatId : "";
  const timestamp = now();
  if (chatId && !db.prepare("SELECT id FROM chats WHERE id = ? AND owner_id = ?").get(chatId, req.user.id)) {
    return res.status(404).json({ error: "Conversation not found. Start a new conversation and try again." });
  }
  if (!chatId) {
    chatId = crypto.randomUUID();
    db.prepare("INSERT INTO chats (id, title, created_at, updated_at, owner_id) VALUES (?, ?, ?, ?, ?)").run(
      chatId,
      userMessage.slice(0, 58) + (userMessage.length > 58 ? "..." : ""),
      timestamp,
      timestamp,
      req.user.id,
    );
  }
  db.prepare("INSERT INTO messages (chat_id, role, content, created_at) VALUES (?, 'user', ?, ?)").run(
    chatId,
    userMessage,
    timestamp,
  );
  const history = db
    .prepare("SELECT role, content FROM messages WHERE chat_id = ? ORDER BY id")
    .all(chatId)
    .map((item) => ({ role: item.role, content: item.content }));
  try {
    const reply = await generateText({ model, messages: history });
    const repliedAt = now();
    db.prepare("INSERT INTO messages (chat_id, role, content, created_at) VALUES (?, 'assistant', ?, ?)").run(
      chatId,
      reply,
      repliedAt,
    );
    db.prepare("UPDATE chats SET updated_at = ? WHERE id = ?").run(repliedAt, chatId);
    const chat = db.prepare("SELECT title FROM chats WHERE id = ?").get(chatId);
    recordActivity(req.user.id, "chat", chat.title, "Conversation updated", chatId);
    return res.json({ chatId, reply });
  } catch (error) {
    console.error("Chat generation failed:", error);
    const status = error.status || (error.name === "TimeoutError" ? 504 : 503);
    return res.status(status).json({
      error:
        error.name === "TimeoutError"
          ? "Ollama took too long to respond. Please try again."
          : error.message || "Unable to connect to Ollama. Check the Ollama service and try again.",
    });
  }
});

app.post("/api/generate", async (req, res) => {
  let prompt;
  try {
    prompt = validText(req.body?.prompt, "Prompt", 30000);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
  const model = typeof req.body?.model === "string" ? req.body.model.trim() : DEFAULT_MODEL;
  const system =
    typeof req.body?.system === "string" ? req.body.system.slice(0, 4000) : undefined;
  let activity;
  if (req.body?.activity !== undefined) {
    const candidate = req.body.activity;
    const allowedTools = new Set([
      "Text Summarizer",
      "Grammar Checker",
      "Grammar Corrector",
      "Translator",
      "Email Writer",
      "Content Writer",
      "Resume Assistant",
      "Paragraph Rewriter",
      "Question Generator",
      "Question Answering",
      "Study Assistant",
      "Idea Generator",
    ]);
    const allowedCodeActions = new Set([
      "Generate code",
      "Explain code",
      "Debug code",
      "Fix errors",
      "Improve code",
      "Optimize code",
      "Generate documentation",
      "Refactor code",
      "Format code",
    ]);
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      return res.status(400).json({ error: "Activity metadata is invalid." });
    }
    if (
      candidate.category === "code" &&
      candidate.title === "Code Assistant" &&
      allowedCodeActions.has(candidate.description)
    ) {
      activity = { category: "code", title: candidate.title, description: candidate.description };
    } else if (candidate.category === "tool" && allowedTools.has(candidate.title)) {
      activity = {
        category: "tool",
        title: candidate.title,
        description: "AI tool completed",
      };
    } else {
      return res.status(400).json({ error: "Activity metadata is not supported." });
    }
  }
  try {
    const result = await generateText({ model, prompt, system });
    if (activity) recordActivity(req.user.id, activity.category, activity.title, activity.description);
    res.json({ result });
  } catch (error) {
    console.error("AI generation failed:", error);
    res.status(error.status || (error.name === "TimeoutError" ? 504 : 503)).json({
      error: error.name === "TimeoutError" ? "Ollama took too long to respond." : error.message,
    });
  }
});

app.get("/api/settings", (req, res) => {
  const preferences = getUserPreferences(req.user.id);
  let favoriteTools = [];
  let savedSnippets = [];
  if (preferences.favoriteTools) {
    try {
      const savedTools = JSON.parse(preferences.favoriteTools);
      if (Array.isArray(savedTools)) {
        favoriteTools = [
          ...new Set(
            savedTools
              .filter((tool) => FAVORITABLE_TOOLS.has(tool))
              .map((tool) => ({
                "Grammar Corrector": "Grammar Checker",
                Translator: "Text Translator",
                "Content Writer": "Content Generator",
              })[tool] || tool),
          ),
        ];
      }
    } catch (error) {
      console.error("Could not read saved favorite tools:", error);
      return res.status(500).json({ error: "Could not load workspace preferences." });
    }
  }
  if (preferences.savedSnippets) {
    try {
      savedSnippets = JSON.parse(preferences.savedSnippets);
      if (!Array.isArray(savedSnippets)) throw new Error("Saved snippets must be an array.");
    } catch (error) {
      console.error("Could not read saved code snippets:", error);
      return res.status(500).json({ error: "Could not load saved code snippets." });
    }
  }
  res.json({
    profileName: req.user.name,
    email: req.user.email,
    theme: preferences.theme === "light" ? "light" : "dark",
    model: preferences.model || DEFAULT_MODEL,
    avatar: preferences.avatar || undefined,
    notificationsEnabled: preferences.notificationsEnabled !== "false",
    favoriteTools,
    accentColor: ACCENT_COLORS.has(preferences.accentColor)
      ? preferences.accentColor
      : "copper",
    privacyMode: "local-only",
    workspaceNotes: preferences.workspaceNotes || "",
    savedSnippets,
  });
});

app.put("/api/settings", (req, res) => {
  try {
    const preferences = req.body;
    if (!preferences || typeof preferences !== "object" || Array.isArray(preferences)) {
      return res.status(400).json({ error: "Settings must be sent as a JSON object." });
    }
    const allowed = [
      "profileName",
      "email",
      "theme",
      "model",
      "avatar",
      "notificationsEnabled",
      "favoriteTools",
      "accentColor",
      "workspaceNotes",
      "savedSnippets",
    ];
    for (const key of allowed) {
      if (preferences[key] === undefined) continue;
      if (key === "notificationsEnabled") {
        if (typeof preferences[key] !== "boolean") {
          throw new Error("notificationsEnabled must be a boolean.");
        }
        continue;
      }
      if (key === "favoriteTools") {
        if (
          !Array.isArray(preferences[key]) ||
          preferences[key].length > FAVORITABLE_TOOLS.size ||
          !preferences[key].every((tool) => FAVORITABLE_TOOLS.has(tool))
        ) {
          throw new Error("Favorite tools must be selected from the available workspace tools.");
        }
        continue;
      }
      if (key === "accentColor") {
        if (!ACCENT_COLORS.has(preferences[key])) {
          throw new Error("Choose a supported accent color.");
        }
        continue;
      }
      if (key === "workspaceNotes") {
        if (typeof preferences[key] !== "string" || preferences[key].length > 20000) {
          throw new Error("Workspace notes must be text of at most 20,000 characters.");
        }
        continue;
      }
      if (key === "savedSnippets") {
        const snippets = preferences[key];
        const ids = new Set();
        if (
          !Array.isArray(snippets) ||
          snippets.length > 25 ||
          !snippets.every((snippet) => {
            if (
              !snippet ||
              typeof snippet !== "object" ||
              typeof snippet.id !== "string" ||
              !snippet.id.trim() ||
              snippet.id.length > 64 ||
              ids.has(snippet.id) ||
              typeof snippet.title !== "string" ||
              !snippet.title.trim() ||
              snippet.title.length > 80 ||
              !CODE_LANGUAGES.has(snippet.language) ||
              typeof snippet.code !== "string" ||
              !snippet.code.trim() ||
              snippet.code.length > 20000 ||
              typeof snippet.createdAt !== "string" ||
              snippet.createdAt.length > 40 ||
              !Number.isFinite(Date.parse(snippet.createdAt))
            ) {
              return false;
            }
            ids.add(snippet.id);
            return true;
          })
        ) {
          throw new Error("Saved snippets must contain at most 25 valid code snippets.");
        }
        continue;
      }
      const maxLength = key === "avatar" ? 1500000 : key === "profileName" ? 60 : 200;
      if (typeof preferences[key] !== "string" || preferences[key].length > maxLength) {
        throw new Error(`${key} must be a string of at most ${maxLength} characters.`);
      }
      if (key === "theme" && !["light", "dark"].includes(preferences[key])) {
        throw new Error("Theme must be light or dark.");
      }
      if (key === "profileName" && preferences[key].trim().length < 2) {
        throw new Error("Profile name cannot be empty.");
      }
      if (key === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(preferences[key])) {
        throw new Error("Enter a valid email address.");
      }
      if (
        key === "avatar" &&
        preferences[key] &&
        !/^data:image\/(?:png|jpeg|webp|gif);base64,/.test(preferences[key])
      ) {
        throw new Error("Profile image must be a supported image data URL.");
      }
    }
    if (preferences.email !== undefined) {
      db.prepare("UPDATE users SET email = ? WHERE id = ?").run(
        preferences.email.trim().toLowerCase(),
        req.user.id,
      );
    }
    if (preferences.profileName !== undefined) {
      db.prepare("UPDATE users SET name = ? WHERE id = ?").run(
        preferences.profileName.trim(),
        req.user.id,
      );
    }
    const savePreference = db.prepare(
      "INSERT INTO preferences (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    );
    for (const key of [
      "theme",
      "model",
      "avatar",
      "notificationsEnabled",
      "favoriteTools",
      "accentColor",
      "workspaceNotes",
      "savedSnippets",
    ]) {
      if (preferences[key] !== undefined) {
        savePreference.run(
          userPreferenceKey(req.user.id, key),
          key === "favoriteTools" || key === "savedSnippets"
            ? JSON.stringify(preferences[key])
            : String(preferences[key]),
        );
      }
    }
    res.json({ saved: true });
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(409).json({ error: "An account with this email already exists." });
    }
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/auth/change-password", async (req, res) => {
  const currentPassword = req.body?.currentPassword;
  const newPassword = req.body?.newPassword;
  const confirmation = req.body?.confirmPassword;
  if (typeof currentPassword !== "string" || typeof newPassword !== "string") {
    return res.status(400).json({ error: "Enter your current and new password." });
  }
  if (newPassword.length < 10 || newPassword.length > 200) {
    return res.status(400).json({ error: "New password must be between 10 and 200 characters." });
  }
  if (newPassword !== confirmation) {
    return res.status(400).json({ error: "Passwords do not match." });
  }
  const user = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(req.user.id);
  if (!(await verifyPassword(currentPassword, user.password_hash))) {
    return res.status(401).json({ error: "Current password is incorrect." });
  }
  const passwordHash = await hashPassword(newPassword);
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, req.user.id);
  db.prepare("DELETE FROM auth_sessions WHERE user_id = ? AND token_hash != ?").run(
    req.user.id,
    hashToken(readCookie(req, SESSION_COOKIE)),
  );
  return res.json({ changed: true });
});

app.get("/api/account", (req, res) => {
  const chats = db.prepare("SELECT COUNT(*) AS count FROM chats WHERE owner_id = ?").get(req.user.id).count;
  const documents = db.prepare("SELECT COUNT(*) AS count FROM documents WHERE owner_id = ?").get(req.user.id).count;
  res.json({
    user: publicUser(req.user),
    workspace: { conversations: chats, documents, storage: "Local SQLite" },
  });
});

app.get("/api/documents", (_req, res) => {
  const rows = db
    .prepare("SELECT id, name, mime, content, embedding_status, created_at, length(file_blob) AS size_bytes FROM documents WHERE owner_id = ? ORDER BY created_at DESC")
    .all(_req.user.id);
  res.json({ documents: rows.map(documentSummary) });
});

app.post("/api/documents", (req, res) => {
  upload.single("file")(req, res, async (uploadError) => {
    if (uploadError) {
      return res.status(uploadError instanceof multer.MulterError ? 400 : 415).json({
        error:
          uploadError.code === "LIMIT_FILE_SIZE"
            ? "File is too large. Maximum size is 12 MB."
            : uploadError.message,
      });
    }
    if (!req.file) return res.status(400).json({ error: "Choose a document to upload." });

    const extension = req.file.originalname.toLowerCase().split(".").pop();
    let text;
    try {
      if (extension === "pdf") {
        const parsed = await pdfParse(req.file.buffer);
        text = parsed.text;
      } else if (extension === "docx") {
        const parsed = await mammoth.extractRawText({ buffer: req.file.buffer });
        text = parsed.value;
      } else {
        text = req.file.buffer.toString("utf8");
      }
    } catch (error) {
      console.error("Document extraction failed:", error);
      return res.status(422).json({ error: "Could not extract text from this document." });
    }
    text = typeof text === "string" ? text.replace(/\0/g, "").trim() : "";
    if (!text) {
      return res.status(422).json({
        error: "No text could be extracted. Scanned PDFs require OCR, which is not configured.",
      });
    }
    if (text.length > 160000) {
      return res.status(413).json({ error: "Document text exceeds the 160,000-character processing limit." });
    }

    const chunks = splitIntoChunks(text);
    let embeddings = [];
    let embeddingStatus = "keyword";
    try {
      await requireModel(EMBEDDING_MODEL);
      embeddings = [];
      for (let index = 0; index < chunks.length; index += 24) {
        embeddings.push(...(await embedTexts(chunks.slice(index, index + 24))));
      }
      embeddingStatus = "vector";
    } catch (error) {
      console.warn(`Embeddings unavailable; using keyword retrieval: ${error.message}`);
    }

    const id = crypto.randomUUID();
    const createdAt = now();
    const insertDocument = db.prepare(
      "INSERT INTO documents (id, name, mime, content, file_blob, embedding_status, created_at, owner_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    );
    const insertChunk = db.prepare(
      "INSERT INTO document_chunks (document_id, chunk_index, content, embedding) VALUES (?, ?, ?, ?)",
    );
    try {
      db.exec("BEGIN IMMEDIATE");
      insertDocument.run(
        id,
        req.file.originalname.slice(0, 255),
        req.file.mimetype || "application/octet-stream",
        text,
        req.file.buffer,
        embeddingStatus,
        createdAt,
        req.user.id,
      );
      chunks.forEach((chunk, index) => {
        insertChunk.run(
          id,
          index,
          chunk,
          embeddingStatus === "vector" ? JSON.stringify(embeddings[index]) : null,
        );
      });
      db.exec("COMMIT");
    } catch (error) {
      try {
        db.exec("ROLLBACK");
      } catch (rollbackError) {
        console.error("Document save rollback failed:", rollbackError);
      }
      console.error("Document persistence failed:", error);
      return res.status(500).json({ error: "Could not save the processed document." });
    }
    const document = db.prepare("SELECT id, name, mime, content, embedding_status, created_at, length(file_blob) AS size_bytes FROM documents WHERE id = ? AND owner_id = ?").get(id, req.user.id);
    recordActivity(req.user.id, "document", document.name, "Document uploaded and processed", id);
    res.status(201).json({
      document: documentSummary(document),
      notice:
        embeddingStatus === "vector"
          ? "Document extracted and indexed with vector search."
          : `Document extracted. Keyword search is active; install "${EMBEDDING_MODEL}" for vector search.`,
    });
  });
});

app.get("/api/documents/:id/download", (req, res) => {
  const document = db.prepare("SELECT name, mime, file_blob FROM documents WHERE id = ? AND owner_id = ?").get(req.params.id, req.user.id);
  if (!document) return res.status(404).json({ error: "Document not found." });
  res.type(document.mime);
  res.attachment(document.name);
  res.send(document.file_blob);
});

app.get("/api/documents/:id/preview", (req, res) => {
  const document = db.prepare("SELECT name, content FROM documents WHERE id = ? AND owner_id = ?").get(req.params.id, req.user.id);
  if (!document) return res.status(404).json({ error: "Document not found." });
  res.json({ name: document.name, text: document.content });
});

app.delete("/api/documents/:id", (req, res) => {
  const result = db.prepare("DELETE FROM documents WHERE id = ? AND owner_id = ?").run(req.params.id, req.user.id);
  if (!result.changes) return res.status(404).json({ error: "Document not found." });
  db.prepare("DELETE FROM activities WHERE category = 'document' AND entity_id = ? AND owner_id = ?").run(req.params.id, req.user.id);
  res.json({ deleted: true });
});

app.post("/api/documents/:id/ask", async (req, res) => {
  let question;
  try {
    question = validText(req.body?.question, "Question", 4000);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
  const document = db.prepare("SELECT name FROM documents WHERE id = ? AND owner_id = ?").get(req.params.id, req.user.id);
  if (!document) return res.status(404).json({ error: "Document not found." });
  const chunks = db
    .prepare("SELECT content, embedding FROM document_chunks WHERE document_id = ?")
    .all(req.params.id);
  if (!chunks.length) return res.status(422).json({ error: "This document has no searchable text." });
  let queryEmbedding;
  try {
    const [embedding] = await embedTexts([question]);
    queryEmbedding = embedding;
  } catch {
    queryEmbedding = null;
  }
  const queryTerms = question.toLowerCase().match(/[a-z0-9]{3,}/g) || [];
  const ranked = chunks
    .map((chunk) => {
      const score =
        queryEmbedding && chunk.embedding
          ? cosineSimilarity(queryEmbedding, JSON.parse(chunk.embedding))
          : keywordScore(chunk.content, queryTerms);
      return { content: chunk.content, score };
    })
    .sort((left, right) => right.score - left.score)
    .filter((item) => item.score > 0)
    .slice(0, 4);
  const context = ranked.map((item) => item.content).join("\n\n---\n\n");
  try {
    const model = typeof req.body?.model === "string" ? req.body.model.trim() : DEFAULT_MODEL;
    const answer = await generateText({
      model,
      system:
        "Answer using only the supplied document excerpts. If they do not contain the answer, say so plainly. Do not invent details.",
      prompt: `Document: ${document.name}\n\nExcerpts:\n${context}\n\nQuestion: ${question}`,
    });
    recordActivity(req.user.id, "document", document.name, "Document question answered", req.params.id);
    res.json({
      answer,
      retrieval: queryEmbedding && chunks.some((chunk) => chunk.embedding) ? "vector" : "keyword",
    });
  } catch (error) {
    console.error("Document question failed:", error);
    res.status(error.status || (error.name === "TimeoutError" ? 504 : 503)).json({
      error: error.name === "TimeoutError" ? "Ollama took too long to respond." : error.message,
    });
  }
});

app.get("/api/images/status", (_req, res) => {
  const configured = Boolean(process.env.IMAGE_GENERATION_API_KEY || process.env.OPENAI_API_KEY);
  res.json({
    configured,
    provider: configured ? "OpenAI Images" : null,
    message: configured
      ? "Image generation is configured."
      : "Set IMAGE_GENERATION_API_KEY on the backend to enable OpenAI image generation.",
  });
});

app.get("/api/images", (req, res) => {
  const rows = db
    .prepare("SELECT id, prompt, image_url, created_at FROM image_generations WHERE owner_id = ? ORDER BY created_at DESC")
    .all(req.user.id);
  res.json({
    images: rows.map((image) => ({
      id: image.id,
      prompt: image.prompt,
      imageUrl: image.image_url,
      createdAt: image.created_at,
    })),
  });
});

app.delete("/api/images/:id", (req, res) => {
  const result = db
    .prepare("DELETE FROM image_generations WHERE id = ? AND owner_id = ?")
    .run(req.params.id, req.user.id);
  if (!result.changes) return res.status(404).json({ error: "Generated image not found." });
  db.prepare("DELETE FROM activities WHERE category = 'tool' AND title = 'Image Generator' AND entity_id = ? AND owner_id = ?")
    .run(req.params.id, req.user.id);
  return res.json({ deleted: true });
});

function saveGeneratedImage(userId, prompt, imageUrl) {
  const image = {
    id: crypto.randomUUID(),
    prompt,
    imageUrl,
    createdAt: now(),
  };
  try {
    db.prepare(
      "INSERT INTO image_generations (id, owner_id, prompt, image_url, created_at) VALUES (?, ?, ?, ?, ?)",
    ).run(image.id, userId, image.prompt, image.imageUrl, image.createdAt);
    recordActivity(userId, "tool", "Image Generator", "Image generated", image.id);
  } catch (error) {
    console.error("Could not save generated image:", error);
    throw Object.assign(new Error("Image was generated but could not be saved to history."), {
      status: 500,
    });
  }
  return image;
}

app.post("/api/images/generate", async (req, res) => {
  const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
  const style = typeof req.body?.style === "string" ? req.body.style.trim() : "";
  const aspectRatio = req.body?.aspectRatio;
  const quality = req.body?.size;
  const apiKey = process.env.IMAGE_GENERATION_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      error: "Image generation is unavailable: configure IMAGE_GENERATION_API_KEY on the backend.",
    });
  }
  if (!prompt || prompt.length > 3000) {
    return res.status(400).json({ error: "Image prompt must be between 1 and 3,000 characters." });
  }
  if (!["Photorealistic", "Illustration", "Digital art", "Watercolor", "3D render", "Minimalist"].includes(style)) {
    return res.status(400).json({ error: "Choose a supported image style." });
  }
  if (!["1:1", "3:2", "2:3", "16:9", "9:16"].includes(aspectRatio)) {
    return res.status(400).json({ error: "Choose a supported aspect ratio." });
  }
  if (!["medium", "high"].includes(quality)) {
    return res.status(400).json({ error: "Choose a supported image quality." });
  }
  const size =
    aspectRatio === "2:3" || aspectRatio === "9:16"
      ? "1024x1536"
      : aspectRatio === "3:2" || aspectRatio === "16:9"
        ? "1536x1024"
        : "1024x1024";
  try {
    const response = await fetch(process.env.IMAGE_GENERATION_URL || "https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.IMAGE_GENERATION_MODEL || "gpt-image-1",
        prompt: `Style: ${style}. ${prompt}`,
        size,
        quality,
        n: 1,
      }),
      signal: AbortSignal.timeout(180000),
    });
    const result = await response.json();
    if (!response.ok) {
      const error = typeof result.error?.message === "string"
        ? result.error.message
        : `Image provider returned HTTP ${response.status}.`;
      return res.status(502).json({ error: `Image generation failed: ${error}` });
    }
    const image = result.data?.[0];
    if (typeof image?.b64_json === "string") {
      return res.json(saveGeneratedImage(
        req.user.id,
        prompt,
        `data:image/png;base64,${image.b64_json}`,
      ));
    }
    if (typeof image?.url === "string" && image.url.startsWith("https://")) {
      return res.json(saveGeneratedImage(req.user.id, prompt, image.url));
    }
    return res.status(502).json({ error: "The image provider returned no downloadable image." });
  } catch (error) {
    console.error("Image generation request failed:", error);
    return res.status(error.status || (error.name === "TimeoutError" ? 504 : 502)).json({
      error: error.status === 500
        ? error.message
        : error.name === "TimeoutError"
          ? "Image generation took too long. Please try again."
          : "Could not connect to the configured image provider.",
    });
  }
});

app.use((error, _req, res, _next) => {
  console.error("Unhandled API error:", error);
  const status = error.status === 413 ? 413 : error.status === 400 ? 400 : 500;
  const message =
    status === 413
      ? "Request body is too large."
      : status === 400
        ? "Request body is invalid or malformed."
        : "An unexpected server error occurred.";
  res.status(status).json({ error: message });
});

app.listen(PORT, () => {
  console.log(`SYNORA AI Backend running at http://localhost:${PORT}`);
  console.log(`SQLite database: ${process.env.DATABASE_PATH || "backend/enter-ai.sqlite"}`);
});
