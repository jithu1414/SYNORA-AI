export const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

export type ChatSummary = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
};

export type WorkspaceDocument = {
  id: string;
  name: string;
  mime: string;
  embeddingStatus: "vector" | "keyword";
  createdAt: string;
  characters: number;
  sizeBytes: number;
};

export type WorkspaceActivity = {
  id: number;
  category: "chat" | "code" | "tool" | "document";
  title: string;
  description: string;
  entityId: string | null;
  createdAt: string;
};

export type SavedSnippet = {
  id: string;
  title: string;
  language: string;
  code: string;
  createdAt: string;
};

export type Preferences = {
  profileName: string;
  email: string;
  theme: "light" | "dark";
  model: string;
  avatar?: string;
  notificationsEnabled: boolean;
  privacyMode: "local-only";
  favoriteTools: string[];
  accentColor: "turquoise" | "copper";
  workspaceNotes: string;
  savedSnippets: SavedSnippet[];
};

export type AccountUser = {
  id: string;
  name: string;
  email: string;
};

export type GeneratedImage = {
  id: string;
  prompt: string;
  imageUrl: string;
  createdAt: string;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers,
      credentials: "include",
    });
  } catch {
    throw new Error("Cannot reach the SYNORA AI backend. Start it with npm start in the backend folder.");
  }

  const data = (await response.json().catch(() => ({}))) as {
    error?: string;
  } & T;
  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status}).`);
  }
  return data;
}

export const api = {
  sendSupportRequest: (input: { name: string; email: string; message: string }) =>
    request<{ sent: boolean }>("/support", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  account: () =>
    request<{
      user: AccountUser;
      workspace: { conversations: number; documents: number; storage: string };
    }>("/account"),
  health: () => request<{
    status: string;
    ollama: {
      connected: boolean;
      model: string;
      modelAvailable: boolean;
      embeddingModel?: string;
      embeddingModelAvailable?: boolean;
      error?: string;
      url: string;
    };
  }>("/health"),
  models: () => request<{ models: string[] }>("/models"),
  chats: () => request<{ chats: ChatSummary[] }>("/chats"),
  activity: () => request<{ activities: WorkspaceActivity[] }>("/activity"),
  createChat: () =>
    request<{ chat: ChatSummary }>("/chats", {
      method: "POST",
      body: JSON.stringify({}),
    }),
  messages: (id: string) =>
    request<{ messages: ChatMessage[] }>(`/chats/${encodeURIComponent(id)}/messages`),
  sendChat: (message: string, chatId: string | null, model: string) =>
    request<{ chatId: string; reply: string }>("/chat", {
      method: "POST",
      body: JSON.stringify({ message, chatId, model }),
    }),
  deleteChat: (id: string) =>
    request<{ deleted: boolean }>(`/chats/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  clearChats: () =>
    request<{ deleted: boolean }>("/chats", { method: "DELETE" }),
  generate: (
    prompt: string,
    system: string,
    model: string,
    activity?: { category: "code" | "tool"; title: string; description: string },
  ) =>
    request<{ result: string }>("/generate", {
      method: "POST",
      body: JSON.stringify({ prompt, system, model, activity }),
    }),
  documents: () => request<{ documents: WorkspaceDocument[] }>("/documents"),
  previewDocument: (id: string) =>
    request<{ name: string; text: string }>(
      `/documents/${encodeURIComponent(id)}/preview`,
    ),
  uploadDocument: (formData: FormData) =>
    request<{ document: WorkspaceDocument; notice: string }>("/documents", {
      method: "POST",
      body: formData,
    }),
  deleteDocument: (id: string) =>
    request<{ deleted: boolean }>(`/documents/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  askDocument: (id: string, question: string, model: string) =>
    request<{ answer: string; retrieval: "vector" | "keyword" }>(
      `/documents/${encodeURIComponent(id)}/ask`,
      {
        method: "POST",
        body: JSON.stringify({ question, model }),
      },
    ),
  settings: () => request<Preferences>("/settings"),
  saveSettings: (preferences: Partial<Preferences>) =>
    request<{ saved: boolean }>("/settings", {
      method: "PUT",
      body: JSON.stringify(preferences),
    }),
  imageStatus: () =>
    request<{ configured: boolean; message: string }>("/images/status"),
  images: () => request<{ images: GeneratedImage[] }>("/images"),
  deleteImage: (id: string) =>
    request<{ deleted: boolean }>(`/images/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  generateImage: (input: {
    prompt: string;
    style: string;
    aspectRatio: string;
    size: string;
  }) =>
    request<GeneratedImage>("/images/generate", {
      method: "POST",
      body: JSON.stringify(input),
    }),
};
