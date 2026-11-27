import { lazy, Suspense, useEffect, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from "react";
import "./App.css";
import {
  API_BASE,
  api,
  type AccountUser,
  type ChatMessage,
  type ChatSummary,
  type GeneratedImage,
  type Preferences,
  type SavedSnippet,
  type WorkspaceActivity,
  type WorkspaceDocument,
} from "./api";

const CodeEditor = lazy(() => import("./CodeEditor"));
const MarkdownRenderer = lazy(() => import("./MarkdownRenderer"));

type Page =
  | "Dashboard"
  | "AI Chat"
  | "Code Assistant"
  | "Documents"
  | "Image Generator"
  | "AI Tools"
  | "History"
  | "Settings"
  | "Help & Support"
  | "User Account"
  | "Personal Workspace";

type ToolDefinition = {
  name: string;
  description: string;
  icon: string;
  color: string;
  prompt: string;
  instruction: string;
  extraLabel?: string;
  extraPlaceholder?: string;
  extraDefault?: string;
  extraRequired?: boolean;
  extraType?: "number" | "text";
};

const menuItems: { name: Page; icon: string }[] = [
  { name: "Dashboard", icon: "⌂" },
  { name: "AI Chat", icon: "✧" },
  { name: "Code Assistant", icon: "</>" },
  { name: "Documents", icon: "▤" },
  { name: "Image Generator", icon: "▧" },
  { name: "AI Tools", icon: "✦" },
  { name: "History", icon: "◷" },
  { name: "Personal Workspace", icon: "▣" },
  { name: "User Account", icon: "◉" },
];

const toolDefinitions: ToolDefinition[] = [
  {
    name: "Text Summarizer",
    description: "Turn long text into a clear, useful summary.",
    icon: "≡",
    color: "mint",
    prompt: "Paste the text you want summarized.",
    instruction: "Summarize the supplied text faithfully. Keep key facts and use concise bullets.",
  },
  {
    name: "Grammar Checker",
    description: "Correct grammar, spelling, and clarity.",
    icon: "✓",
    color: "lavender",
    prompt: "Paste the text you want checked.",
    instruction: "Correct grammar, spelling, and punctuation while preserving the original meaning. Return the corrected text, then briefly list important edits.",
  },
  {
    name: "Text Translator",
    description: "Translate text while preserving its tone.",
    icon: "文",
    color: "blue",
    prompt: "Enter the text you want translated.",
    instruction: "Translate the text accurately and preserve its tone and formatting.",
    extraLabel: "Translate to",
    extraPlaceholder: "e.g. Spanish",
    extraRequired: true,
  },
  {
    name: "Email Writer",
    description: "Draft a polished email from a few notes.",
    icon: "✉",
    color: "peach",
    prompt: "Describe the email you need, including its purpose and key points.",
    instruction: "Write a clear, professional email with a subject line, greeting, concise body, and appropriate sign-off.",
    extraLabel: "Tone",
    extraPlaceholder: "e.g. Warm and professional",
    extraDefault: "Professional and friendly",
  },
  {
    name: "Content Generator",
    description: "Create original content from a topic or brief.",
    icon: "✎",
    color: "mint",
    prompt: "Describe the content, audience, and key points.",
    instruction: "Create original, relevant content that follows the user's brief. Do not invent factual claims.",
  },
  {
    name: "Resume Assistant",
    description: "Create a tailored resume draft from your experience.",
    icon: "▤",
    color: "lavender",
    prompt: "Add your experience, education, skills, achievements, and the role you want.",
    instruction: "Draft a professional, ATS-friendly resume using only the supplied facts. Use clear sections and do not invent credentials or experience.",
  },
  {
    name: "Python Helper",
    description: "Write, explain, and troubleshoot Python code.",
    icon: "Py",
    color: "blue",
    prompt: "Describe your Python task or paste code and an error message.",
    instruction: "Help with Python code. Explain assumptions, provide correct examples, and never claim code was executed or verified.",
  },
  {
    name: "SQL Assistant",
    description: "Draft and explain SQL for your schema and database.",
    icon: "DB",
    color: "mint",
    prompt: "Describe the query you need and include relevant table and column names.",
    instruction: "Write or explain SQL using only the schema and requirements provided. State database-dialect assumptions and do not claim a query was executed.",
  },
  {
    name: "Data Analysis Assistant",
    description: "Explore data, summarize findings, and plan analysis.",
    icon: "▥",
    color: "lavender",
    prompt: "Describe your dataset or paste a representative sample and your analysis question.",
    instruction: "Analyze only the data and context provided. Distinguish observed facts from hypotheses, mention sample limitations, and never invent computed results.",
  },
  {
    name: "Question Generator",
    description: "Generate study, interview, or discussion questions.",
    icon: "?",
    color: "blue",
    prompt: "Describe the topic and the audience or difficulty level.",
    instruction: "Generate the requested number of useful questions about the topic. Include answers only if the user requests them.",
    extraLabel: "Number of questions",
    extraPlaceholder: "5",
    extraDefault: "5",
    extraType: "number",
  },
  {
    name: "Question Answering",
    description: "Get a clear answer and explanation for a focused question.",
    icon: "?",
    color: "blue",
    prompt: "Ask a question and include any context that will help answer it.",
    instruction: "Answer the question accurately and clearly. State uncertainty where appropriate, and do not invent facts.",
  },
  {
    name: "Study Assistant",
    description: "Learn a topic with explanations and practice prompts.",
    icon: "✧",
    color: "lavender",
    prompt: "Describe the topic, your level, and what you want to understand.",
    instruction: "Act as a patient study tutor. Explain concepts in structured steps, define unfamiliar terms, and end with one short practice question.",
  },
  {
    name: "Paragraph Rewriter",
    description: "Rewrite a paragraph for a clearer tone and flow.",
    icon: "↻",
    color: "mint",
    prompt: "Paste the paragraph and describe the tone or changes you want.",
    instruction: "Rewrite the supplied paragraph for clarity and flow, preserving its meaning and factual details.",
  },
  {
    name: "Idea Generator",
    description: "Explore fresh, practical ideas for your next project.",
    icon: "✦",
    color: "peach",
    prompt: "Describe the challenge, audience, or project.",
    instruction: "Suggest varied, practical, and specific ideas. Include a short explanation for each.",
  },
];

const pageDescriptions: Record<Page, string> = {
  Dashboard: "Your personal AI workspace overview.",
  "AI Chat": "Ask questions, explore ideas, and continue conversations.",
  "Code Assistant": "Generate, explain, debug, optimize, document, and format code.",
  Documents: "Upload documents and ask grounded questions about their contents.",
  "Image Generator": "Prepare an image prompt and check provider availability.",
  "AI Tools": "Focused AI tools for writing, coding, analysis, and thinking.",
  History: "Reopen conversations and review saved code, documents, and generated images.",
  Settings: "Manage your profile, model, theme, and workspace preferences.",
  "User Account": "Your SYNORA AI account and personal workspace.",
  "Personal Workspace": "Your saved code, notes, images, conversations, and workspace activity.",
  "Help & Support": "Guides, common questions, and troubleshooting.",
};

const initialPreferences: Preferences = {
  profileName: "SYNORA AI User",
  email: "",
  theme: "dark",
  model: "llama3.2:3b",
  notificationsEnabled: true,
  privacyMode: "local-only",
  favoriteTools: [],
  accentColor: "copper",
  workspaceNotes: "",
  savedSnippets: [],
};

function initials(name: string) {
  return name.trim().slice(0, 1).toUpperCase() || "E";
}

function formatDate(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function MarkdownContent({ children }: { children: string }) {
  return (
    <Suspense fallback={<div className="markdown-output" aria-live="polite">Rendering response…</div>}>
      <MarkdownRenderer>{children}</MarkdownRenderer>
    </Suspense>
  );
}

function PageHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="page-intro">
      <p className="eyebrow">SYNORA AI WORKSPACE</p>
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
  );
}

function App() {
  const [currentUser, setCurrentUser] = useState<AccountUser>({
    id: "local-workspace",
    name: initialPreferences.profileName,
    email: initialPreferences.email,
  });
  const [activePage, setActivePage] = useState<Page>("Dashboard");
  const [darkMode, setDarkMode] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [historySearch, setHistorySearch] = useState("");
  const [historyFrom, setHistoryFrom] = useState("");
  const [historyTo, setHistoryTo] = useState("");
  const [documentSearch, setDocumentSearch] = useState("");
  const [preferences, setPreferences] = useState<Preferences>(initialPreferences);
  const [models, setModels] = useState<string[]>([]);
  const [connection, setConnection] = useState<{
    connected: boolean;
    modelAvailable: boolean;
    url: string;
    embeddingModel?: string;
    embeddingModelAvailable?: boolean;
    error?: string;
  } | null>(null);
  const [backendError, setBackendError] = useState("");
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [activities, setActivities] = useState<WorkspaceActivity[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatError, setChatError] = useState("");
  const [chatHistoryOpen, setChatHistoryOpen] = useState(false);
  const [modelsRefreshing, setModelsRefreshing] = useState(false);
  const [documents, setDocuments] = useState<WorkspaceDocument[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [documentPreview, setDocumentPreview] = useState<{ id: string; name: string; text: string } | null>(null);
  const [documentPreviewBusy, setDocumentPreviewBusy] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [documentTextSearch, setDocumentTextSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const [documentQuestion, setDocumentQuestion] = useState("");
  const [documentAnswer, setDocumentAnswer] = useState("");
  const [documentRetrieval, setDocumentRetrieval] = useState<"vector" | "keyword" | null>(null);
  const [documentError, setDocumentError] = useState("");
  const [documentNotice, setDocumentNotice] = useState("");
  const [codeAction, setCodeAction] = useState("Generate code");
  const [codeLanguage, setCodeLanguage] = useState("TypeScript");
  const [codePrompt, setCodePrompt] = useState("");
  const [sourceCode, setSourceCode] = useState("");
  const [codeResult, setCodeResult] = useState("");
  const [codeBusy, setCodeBusy] = useState(false);
  const [codeError, setCodeError] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const [activeTool, setActiveTool] = useState(toolDefinitions[0].name);
  const [toolInput, setToolInput] = useState("");
  const [toolExtra, setToolExtra] = useState("");
  const [toolResult, setToolResult] = useState("");
  const [toolError, setToolError] = useState("");
  const [toolBusy, setToolBusy] = useState(false);
  const [imagePrompt, setImagePrompt] = useState("");
  const [imageStyle, setImageStyle] = useState("Photorealistic");
  const [imageRatio, setImageRatio] = useState("1:1");
  const [imageSize, setImageSize] = useState("medium");
  const [imageError, setImageError] = useState("");
  const [imageConfigured, setImageConfigured] = useState(false);
  const [imageGallery, setImageGallery] = useState<GeneratedImage[]>([]);
  const [imageBusy, setImageBusy] = useState(false);
  const [settingsNotice, setSettingsNotice] = useState("");
  const [settingsError, setSettingsError] = useState("");
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [accountWorkspace, setAccountWorkspace] = useState({
    conversations: 0,
    documents: 0,
    storage: "Local SQLite",
  });
  const [supportName, setSupportName] = useState("");
  const [supportEmail, setSupportEmail] = useState("");
  const [supportMessage, setSupportMessage] = useState("");
  const [supportNotice, setSupportNotice] = useState("");
  const [supportError, setSupportError] = useState("");
  const [supportBusy, setSupportBusy] = useState(false);
  const [snippetTitle, setSnippetTitle] = useState("");
  const [snippetLanguage, setSnippetLanguage] = useState("TypeScript");
  const [snippetCode, setSnippetCode] = useState("");
  const [workspaceNotice, setWorkspaceNotice] = useState("");
  const [workspaceError, setWorkspaceError] = useState("");
  const [snippetActionNotice, setSnippetActionNotice] = useState("");
  const [snippetActionError, setSnippetActionError] = useState("");
  const conversationEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void api
      .settings()
      .then((saved) => {
        setPreferences({ ...initialPreferences, ...saved });
        setDarkMode(saved.theme === "dark");
      })
      .catch((error: Error) => setBackendError(error.message));
    void api
      .health()
      .then((health) => setConnection(health.ollama))
      .catch((error: Error) => setBackendError(error.message));
    void api
      .models()
      .then(({ models: availableModels }) => setModels(availableModels))
      .catch((error: Error) => setBackendError(error.message));
    void api
      .chats()
      .then(({ chats: savedChats }) => setChats(savedChats))
      .catch((error: Error) => setBackendError(error.message));
    void api
      .activity()
      .then(({ activities: savedActivities }) => setActivities(savedActivities))
      .catch((error: Error) => setBackendError(error.message));
    void api
      .documents()
      .then(({ documents: savedDocuments }) => setDocuments(savedDocuments))
      .catch((error: Error) => setBackendError(error.message));
    void api
      .account()
      .then(({ user, workspace }) => {
        setCurrentUser(user);
        setAccountWorkspace(workspace);
      })
      .catch((error: Error) => setBackendError(error.message));
    void api
      .imageStatus()
      .then(({ configured }) => setImageConfigured(configured))
      .catch((error: Error) => setImageError(error.message));
    void api
      .images()
      .then(({ images }) => setImageGallery(images))
      .catch((error: Error) => setImageError(error.message));
  }, []);

  useEffect(() => {
    if (activePage !== "AI Chat") return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    conversationEndRef.current?.scrollIntoView({
      behavior: reducedMotion ? "auto" : "smooth",
      block: "end",
    });
  }, [activePage, chatBusy, messages]);

  const selectPage = (page: Page) => {
    setActivePage(page);
    setMenuOpen(false);
    setChatHistoryOpen(false);
    setBackendError("");
    setWorkspaceNotice("");
    setWorkspaceError("");
    setSnippetActionNotice("");
    setSnippetActionError("");
  };

  const activeModel = models.includes(preferences.model)
    ? preferences.model
    : models[0] || "";

  const changeModel = async (model: string) => {
    if (!models.includes(model)) return;
    const previousModel = preferences.model;
    setPreferences((previous) => ({ ...previous, model }));
    try {
      await api.saveSettings({ model });
      setBackendError("");
    } catch (error) {
      setPreferences((previous) => ({ ...previous, model: previousModel }));
      setBackendError(error instanceof Error ? error.message : "Could not save your AI model.");
    }
  };

  const refreshModels = async () => {
    setModelsRefreshing(true);
    setChatError("");
    try {
      const { models: availableModels } = await api.models();
      setModels(availableModels);
      if (availableModels.length === 0) {
        setChatError("No Ollama models are available. Start Ollama and try refreshing.");
      }
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "Could not refresh Ollama models.");
    } finally {
      setModelsRefreshing(false);
    }
  };

  const refreshChats = async () => {
    const result = await api.chats();
    setChats(result.chats);
  };

  const refreshActivity = async () => {
    const result = await api.activity();
    setActivities(result.activities);
  };

  const beginNewChat = async () => {
    setChatError("");
    setMessages([]);
    setActiveChatId(null);
    selectPage("AI Chat");
  };

  const openChat = async (id: string) => {
    setChatError("");
    setBackendError("");
    try {
      const { messages: savedMessages } = await api.messages(id);
      setMessages(savedMessages);
      setActiveChatId(id);
      selectPage("AI Chat");
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "Could not load this conversation.");
    }
  };

  const sendMessage = async (event?: FormEvent) => {
    event?.preventDefault();
    const message = chatInput.trim();
    if (!message || chatBusy) return;
    setChatInput("");
    setChatError("");
    setMessages((previous) => [...previous, { role: "user", content: message }]);
    setChatBusy(true);
    try {
      const result = await api.sendChat(message, activeChatId, activeModel);
      setActiveChatId(result.chatId);
      setMessages((previous) => [...previous, { role: "assistant", content: result.reply }]);
      await refreshChats();
      await refreshActivity();
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "Unable to send your message.");
      void refreshChats().catch(() => undefined);
    } finally {
      setChatBusy(false);
    }
  };

  const handleChatKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  };

  const clearCurrentChat = async () => {
    if (!activeChatId) {
      setMessages([]);
      setChatError("");
      return;
    }
    if (!window.confirm("Delete this conversation and all of its messages? This cannot be undone.")) return;
    try {
      await api.deleteChat(activeChatId);
      setChats((previous) => previous.filter((chat) => chat.id !== activeChatId));
      setActivities((previous) => previous.filter((activity) => activity.entityId !== activeChatId));
      setMessages([]);
      setActiveChatId(null);
      setChatError("");
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "Could not clear this conversation.");
    }
  };

  const deleteChat = async (chat: ChatSummary) => {
    if (!window.confirm(`Delete “${chat.title}”? This cannot be undone.`)) return;
    try {
      await api.deleteChat(chat.id);
      setChats((previous) => previous.filter((item) => item.id !== chat.id));
      setActivities((previous) => previous.filter((activity) => activity.entityId !== chat.id));
      if (activeChatId === chat.id) {
        setActiveChatId(null);
        setMessages([]);
      }
    } catch (error) {
      setBackendError(error instanceof Error ? error.message : "Could not delete the conversation.");
    }
  };

  const uploadDocument = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    await processDocumentUpload(file);
  };

  const processDocumentUpload = async (file: File) => {
    setUploading(true);
    setDocumentError("");
    setDocumentNotice("");
    const formData = new FormData();
    formData.append("file", file);
    try {
      const result = await api.uploadDocument(formData);
      setDocuments((previous) => [result.document, ...previous]);
      setSelectedDocumentId(result.document.id);
      setDocumentPreview(null);
      setDocumentNotice(result.notice);
      void refreshActivity().catch((error: Error) => setBackendError(error.message));
    } catch (error) {
      setDocumentError(error instanceof Error ? error.message : "Could not process this document.");
    } finally {
      setUploading(false);
    }
  };

  const openDocumentPreview = async (document: WorkspaceDocument) => {
    setSelectedDocumentId(document.id);
    setDocumentTextSearch("");
    setDocumentPreviewBusy(true);
    setDocumentError("");
    try {
      const preview = await api.previewDocument(document.id);
      setDocumentPreview({ id: document.id, ...preview });
    } catch (error) {
      setDocumentError(error instanceof Error ? error.message : "Could not preview this document.");
    } finally {
      setDocumentPreviewBusy(false);
    }
  };

  const copyText = async (text: string, successMessage = "Copied to clipboard") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus(successMessage);
      window.setTimeout(() => setCopyStatus(""), 1800);
    } catch {
      setCopyStatus("Clipboard access is unavailable in this browser.");
    }
  };

  const deleteDocument = async (document: WorkspaceDocument) => {
    if (!window.confirm(`Delete “${document.name}” and its extracted text? This cannot be undone.`)) return;
    try {
      await api.deleteDocument(document.id);
      setDocuments((previous) => previous.filter((item) => item.id !== document.id));
      setActivities((previous) => previous.filter((activity) => activity.entityId !== document.id));
      if (documentPreview?.id === document.id) setDocumentPreview(null);
      if (selectedDocumentId === document.id) {
        setSelectedDocumentId(null);
        setDocumentAnswer("");
        setDocumentRetrieval(null);
      }
    } catch (error) {
      setDocumentError(error instanceof Error ? error.message : "Could not delete this document.");
    }
  };

  const openActivity = (activity: WorkspaceActivity) => {
    if (activity.category === "chat" && activity.entityId) {
      void openChat(activity.entityId);
      return;
    }
    if (activity.category === "document" && activity.entityId) {
      setSelectedDocumentId(activity.entityId);
      selectPage("Documents");
      return;
    }
    if (activity.category === "code") {
      selectPage("Code Assistant");
      return;
    }
    if (activity.category === "tool") {
      if (activity.title === "Image Generator") {
        selectPage("Image Generator");
        return;
      }
      const toolAliases: Record<string, string> = {
        "Grammar Corrector": "Grammar Checker",
        Translator: "Text Translator",
        "Content Writer": "Content Generator",
      };
      setActiveTool(toolAliases[activity.title] || activity.title);
      setToolInput("");
      setToolExtra("");
      setToolResult("");
      setToolError("");
      selectPage("AI Tools");
      return;
    }
    selectPage("History");
  };

  const requestDocumentAnswer = async (question: string) => {
    if (!selectedDocumentId || !question.trim()) return;
    setDocumentError("");
    setDocumentAnswer("");
    try {
      const result = await api.askDocument(
        selectedDocumentId,
        question.trim(),
        activeModel,
      );
      setDocumentAnswer(result.answer);
      setDocumentRetrieval(result.retrieval);
      setDocumentQuestion("");
      void refreshActivity().catch((error: Error) => setBackendError(error.message));
    } catch (error) {
      setDocumentError(error instanceof Error ? error.message : "Could not answer this question.");
    }
  };

  const askDocument = async (event: FormEvent) => {
    event.preventDefault();
    await requestDocumentAnswer(documentQuestion);
  };

  const runCodeAction = async (event: FormEvent) => {
    event.preventDefault();
    const hasCode = sourceCode.trim().length > 0;
    if (codeBusy || (!hasCode && !codePrompt.trim())) return;
    setCodeBusy(true);
    setCodeError("");
    setCodeResult("");
    const system = `You are a careful ${codeLanguage} programming assistant. ${codeAction}. Return code in a fenced code block when producing or changing code. Explain important assumptions and never claim code was run or tested unless it was.`;
    const prompt = [
      `Action: ${codeAction}`,
      `Language: ${codeLanguage}`,
      codePrompt.trim() ? `Request:\n${codePrompt.trim()}` : "",
      hasCode ? `Code:\n\`\`\`${codeLanguage.toLowerCase()}\n${sourceCode.trim()}\n\`\`\`` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    try {
      const result = await api.generate(prompt, system, activeModel, {
        category: "code",
        title: "Code Assistant",
        description: codeAction,
      });
      setCodeResult(result.result);
      void refreshActivity().catch((error: Error) => setBackendError(error.message));
    } catch (error) {
      setCodeError(error instanceof Error ? error.message : "Code assistant request failed.");
    } finally {
      setCodeBusy(false);
    }
  };

  const copyCode = async () => {
    if (!codeResult) return;
    const blocks = Array.from(
      codeResult.matchAll(/```(?:[\w+-]+)?\s*\n([\s\S]*?)```/g),
      (match) => match[1].trim(),
    );
    await copyText(
      blocks.length ? blocks.join("\n\n") : codeResult,
      blocks.length ? "Code copied to clipboard" : "Response copied to clipboard",
    );
  };

  const clearCodeEditor = () => {
    setSourceCode("");
    setCodePrompt("");
    setCodeResult("");
    setCodeError("");
    setCopyStatus("");
  };

  const selectedTool = toolDefinitions.find((tool) => tool.name === activeTool) ?? toolDefinitions[0];

  const runTool = async (event: FormEvent) => {
    event.preventDefault();
    if (!toolInput.trim() || toolBusy) return;
    setToolBusy(true);
    setToolError("");
    setToolResult("");
    const extraValue = toolExtra.trim() || selectedTool.extraDefault || "";
    const extraPrompt = selectedTool.extraLabel && extraValue
      ? `${selectedTool.extraLabel}: ${extraValue}`
      : "";
    const prompt = [extraPrompt, toolInput.trim()].filter(Boolean).join("\n\n");
    try {
      const result = await api.generate(prompt, selectedTool.instruction, activeModel, {
        category: "tool",
        title: selectedTool.name,
        description: "AI tool completed",
      });
      setToolResult(result.result);
      void refreshActivity().catch((error: Error) => setBackendError(error.message));
    } catch (error) {
      setToolError(error instanceof Error ? error.message : "This AI tool request failed.");
    } finally {
      setToolBusy(false);
    }
  };

  const saveSettings = async (event: FormEvent) => {
    event.preventDefault();
    setSettingsBusy(true);
    setSettingsNotice("");
    setSettingsError("");
    try {
      await api.saveSettings({
        ...preferences,
        model: activeModel || preferences.model,
        theme: darkMode ? "dark" : "light",
      });
      setCurrentUser((user) =>
        user ? { ...user, name: preferences.profileName.trim(), email: preferences.email.trim() } : user,
      );
      setSettingsNotice("Your profile and preferences have been saved.");
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : "Could not save your settings.");
    } finally {
      setSettingsBusy(false);
    }
  };

  const toggleTheme = async () => {
    const next = !darkMode;
    setDarkMode(next);
    setPreferences((previous) => ({ ...previous, theme: next ? "dark" : "light" }));
    try {
      await api.saveSettings({ theme: next ? "dark" : "light" });
      setBackendError("");
    } catch (error) {
      setDarkMode(!next);
      setPreferences((previous) => ({ ...previous, theme: !next ? "dark" : "light" }));
      setBackendError(error instanceof Error ? error.message : "Could not save your theme preference.");
    }
  };

  const toggleFavoriteTool = async (tool: string) => {
    const previousFavorites = preferences.favoriteTools;
    const favoriteTools = previousFavorites.includes(tool)
      ? previousFavorites.filter((favorite) => favorite !== tool)
      : [...previousFavorites, tool];
    setPreferences((previous) => ({ ...previous, favoriteTools }));
    try {
      await api.saveSettings({ favoriteTools });
    } catch (error) {
      setPreferences((previous) => ({ ...previous, favoriteTools: previousFavorites }));
      setBackendError(error instanceof Error ? error.message : "Could not save your favorite tools.");
    }
  };

  const changeAccentColor = async (accentColor: Preferences["accentColor"]) => {
    const previousAccent = preferences.accentColor;
    setPreferences((previous) => ({ ...previous, accentColor }));
    try {
      await api.saveSettings({ accentColor });
      setBackendError("");
    } catch (error) {
      setPreferences((previous) => ({ ...previous, accentColor: previousAccent }));
      setBackendError(error instanceof Error ? error.message : "Could not save your accent color.");
    }
  };

  const changeAvatar = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type)) {
      setSettingsError("Choose a PNG, JPEG, WebP, or GIF image for your profile picture.");
      return;
    }
    if (file.size > 900 * 1024) {
      setSettingsError("Profile images must be smaller than 900 KB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setPreferences((previous) => ({ ...previous, avatar: reader.result as string }));
        setSettingsError("");
      }
    };
    reader.onerror = () => setSettingsError("The selected profile image could not be read.");
    reader.readAsDataURL(file);
  };

  const generateImage = async (event: FormEvent) => {
    event.preventDefault();
    setImageError("");
    setImageBusy(true);
    try {
      const result = await api.generateImage({
        prompt: imagePrompt.trim(),
        style: imageStyle,
        aspectRatio: imageRatio,
        size: imageSize,
      });
      setImageGallery((previous) => [
        result,
        ...previous,
      ]);
    } catch (error) {
      setImageError(error instanceof Error ? error.message : "Image generation is not available.");
    } finally {
      setImageBusy(false);
    }
  };

  const deleteGeneratedImage = async (image: GeneratedImage) => {
    if (!window.confirm("Delete this generated image from your history?")) return;
    try {
      await api.deleteImage(image.id);
      setImageGallery((previous) => previous.filter((item) => item.id !== image.id));
      void refreshActivity().catch((error: Error) => setBackendError(error.message));
    } catch (error) {
      setImageError(error instanceof Error ? error.message : "Could not delete this image.");
    }
  };

  const addSavedSnippet = async (title: string, language: string, code: string): Promise<string | null> => {
    if (preferences.savedSnippets.length >= 25) {
      const message = "You have reached the 25-snippet limit. Delete a snippet before adding another.";
      setWorkspaceError(message);
      return message;
    }
    const snippet: SavedSnippet = {
      id: crypto.randomUUID(),
      title: title.trim(),
      language,
      code: code.trim(),
      createdAt: new Date().toISOString(),
    };
    const previous = preferences.savedSnippets;
    const savedSnippets = [snippet, ...previous];
    setWorkspaceError("");
    setWorkspaceNotice("");
    setPreferences((current) => ({ ...current, savedSnippets }));
    try {
      await api.saveSettings({ savedSnippets });
      setWorkspaceNotice("Code snippet saved to your workspace.");
      return null;
    } catch (error) {
      setPreferences((current) => ({ ...current, savedSnippets: previous }));
      const message = error instanceof Error ? error.message : "Could not save this code snippet.";
      setWorkspaceError(message);
      return message;
    }
  };

  const submitSavedSnippet = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const error = await addSavedSnippet(snippetTitle, snippetLanguage, snippetCode);
    if (!error) {
      setSnippetTitle("");
      setSnippetCode("");
    }
  };

  const saveAssistantSnippet = async () => {
    setSnippetActionNotice("");
    setSnippetActionError("");
    const firstCodeBlock = codeResult.match(/```(?:[\w+#.-]+)?\s*\n([\s\S]*?)```/)?.[1]?.trim();
    const code = firstCodeBlock || (codeAction === "Generate code" ? codeResult.trim() : "");
    if (!code) {
      setSnippetActionError("This response has no code block to save. Add code in the editor and save it from Personal Workspace.");
      return;
    }
    const title = codePrompt.trim().split(/\r?\n/, 1)[0].slice(0, 80) || `${codeAction} ${codeLanguage} snippet`;
    const error = await addSavedSnippet(title, codeLanguage, code);
    if (error) setSnippetActionError(error);
    else setSnippetActionNotice("Saved to Personal Workspace.");
  };

  const deleteSavedSnippet = async (snippet: SavedSnippet) => {
    if (!window.confirm(`Delete “${snippet.title}” from your workspace?`)) return;
    const previous = preferences.savedSnippets;
    const savedSnippets = previous.filter((item) => item.id !== snippet.id);
    setPreferences((current) => ({ ...current, savedSnippets }));
    setWorkspaceError("");
    setWorkspaceNotice("");
    try {
      await api.saveSettings({ savedSnippets });
      setWorkspaceNotice("Code snippet deleted.");
    } catch (error) {
      setPreferences((current) => ({ ...current, savedSnippets: previous }));
      setWorkspaceError(error instanceof Error ? error.message : "Could not delete this code snippet.");
    }
  };

  const saveWorkspaceNotes = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setWorkspaceError("");
    setWorkspaceNotice("");
    try {
      await api.saveSettings({ workspaceNotes: preferences.workspaceNotes });
      setWorkspaceNotice("Personal notes saved.");
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : "Could not save your notes.");
    }
  };

  const sendSupportRequest = async (event: FormEvent) => {
    event.preventDefault();
    setSupportBusy(true);
    setSupportError("");
    setSupportNotice("");
    try {
      await api.sendSupportRequest({
        name: supportName.trim(),
        email: supportEmail.trim(),
        message: supportMessage.trim(),
      });
      setSupportNotice("Your support request has been sent.");
      setSupportMessage("");
    } catch (error) {
      setSupportError(error instanceof Error ? error.message : "Could not send your support request.");
    } finally {
      setSupportBusy(false);
    }
  };

  const renderDashboard = () => {
    const recentActivities = activities.slice(0, 4);
    const recentTools = activities
      .filter((activity) => activity.category === "code" || activity.category === "tool")
      .filter(
        (activity, index, list) =>
          list.findIndex(
            (item) => item.category === activity.category && item.title === activity.title,
          ) === index,
      )
      .slice(0, 4);
    return (
      <div className="dashboard-home">
        <div className="dashboard-main-column">
          <section className="welcome">
            <div className="welcome-content">
              <div className="eyebrow">YOUR PERSONAL AI WORKSPACE</div>
              <h1>Welcome to <span>SYNORA AI</span></h1>
              <h3>Your Intelligent AI Workspace</h3>
              <p>
                Your intelligent AI workspace for chatting, coding, analyzing documents, and generating images.
              </p>
              <div className="hero-actions">
                <button className="primary-btn" onClick={beginNewChat}>
                  ✦ New Chat <span>→</span>
                </button>
                <button className="outline-btn" onClick={() => selectPage("AI Tools")}>
                  ▤ Explore Tools
                </button>
              </div>
            </div>
            <div className="hero-image-wrap">
              <img src="/robot.png" alt="SYNORA AI assistant robot" className="hero-robot" />
            </div>
          </section>

          <section className="section-block dashboard-quick-tools">
            <div className="section-heading">
              <div className="dashboard-heading-title">
                <span className="dashboard-heading-icon" aria-hidden="true">▣</span>
                <h2>Quick Tools</h2>
              </div>
              <button className="text-link" onClick={() => selectPage("AI Tools")}>View All →</button>
            </div>
            <div className="learning-grid">
              {[
                { name: "AI Chat", description: "Get instant answers", icon: "▢", color: "mint", page: "AI Chat" as Page },
                { name: "Code Assistant", description: "Write, explain & debug code", icon: "</>", color: "lavender", page: "Code Assistant" as Page },
                { name: "Documents", description: "Upload, read & chat with files", icon: "▤", color: "peach", page: "Documents" as Page },
                { name: "Image Generator", description: "Create stunning images with AI", icon: "▧", color: "blue", page: "Image Generator" as Page },
              ].map((tool) => (
                <button className="learning-card" key={tool.name} onClick={() => selectPage(tool.page)}>
                  <div className={`learning-icon ${tool.color}`}>{tool.icon}</div>
                  <h3>{tool.name}</h3>
                  <p>{tool.description}</p>
                  <span className="card-link">Explore <b>→</b></span>
                </button>
              ))}
            </div>
          </section>

          <section className="dashboard-recent-grid">
            <div className="activity-card">
              <div className="activity-heading">
                <div className="dashboard-heading-title"><span className="dashboard-heading-icon" aria-hidden="true">◷</span><h2>Recent conversations</h2></div>
                <button className="text-link" onClick={() => selectPage("History")}>View All →</button>
              </div>
              {chats.length === 0 ? <p className="muted-copy empty-activity">Saved conversations will appear here.</p> : chats.slice(0, 4).map((chat) => (
                <button className="activity-row activity-button" key={chat.id} onClick={() => void openChat(chat.id)}>
                  <span className="activity-dot mint-dot" />
                  <span className="activity-copy"><strong>{chat.title}</strong><span>{chat.messageCount} messages · {formatDate(chat.updatedAt)}</span></span>
                </button>
              ))}
            </div>
            <div className="activity-card">
              <div className="activity-heading">
                <div className="dashboard-heading-title"><span className="dashboard-heading-icon cyan" aria-hidden="true">▤</span><h2>Recently uploaded documents</h2></div>
                <button className="text-link" onClick={() => selectPage("Documents")}>View All →</button>
              </div>
              {documents.length === 0 ? <p className="muted-copy empty-activity">Uploaded documents will appear here.</p> : documents.slice(0, 4).map((document) => (
                <button className="activity-row activity-button" key={document.id} onClick={() => { setSelectedDocumentId(document.id); selectPage("Documents"); }}>
                  <span className="activity-dot blue-dot" />
                  <span className="activity-copy"><strong>{document.name}</strong><span>{document.embeddingStatus === "vector" ? "Vector search ready" : "Keyword search ready"}</span></span>
                </button>
              ))}
            </div>
          </section>

          <section className="section-block dashboard-recent-tools">
            <div className="section-heading">
              <div>
                <h2>Recently used tools</h2>
                <p>Your latest code and AI writing tools.</p>
              </div>
              <button className="text-link" onClick={() => selectPage("AI Tools")}>Browse tools →</button>
            </div>
            {recentTools.length === 0 ? (
              <div className="empty-state-card recent-tools-empty">
                <p>Your recent code and writing tools will appear here after you use them.</p>
              </div>
            ) : (
              <div className="learning-grid">
                {recentTools.map((activity) => {
                  const definition = toolDefinitions.find((tool) => tool.name === activity.title);
                  return (
                    <button className="learning-card" key={`${activity.category}-${activity.title}`} onClick={() => openActivity(activity)}>
                      <div className={`learning-icon ${definition?.color || "lavender"}`}>{definition?.icon || "</>"}</div>
                      <h3>{activity.title}</h3>
                      <p>{activity.description}</p>
                      <span className="card-link">Last used {formatDate(activity.createdAt)}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <section className="bottom-grid dashboard-bottom-grid">
            <div className="goal-card">
              <div className="goal-icon">✦</div>
              <div>
                <p className="goal-label">YOUR AI WORKSPACE</p>
                <h2>Ask Anything</h2>
                <p>Get answers, write, code, analyze and explore ideas.</p>
                <button className="goal-button" onClick={beginNewChat}>Start a Conversation →</button>
              </div>
            </div>
          </section>
        </div>

        <aside className="dashboard-side-column">
          <section className="dashboard-usage-card">
            <div className="dashboard-panel-heading">
              <span className="dashboard-panel-icon" aria-hidden="true">▥</span>
              <h2>Your Usage</h2>
            </div>
            <div className="dashboard-usage-list">
              <article className="dashboard-metric-card">
                <span className="dashboard-metric-icon orange" aria-hidden="true">▢</span>
                <div className="dashboard-metric-copy"><span>Saved conversations</span><strong>{chats.length}</strong></div>
              </article>
              <article className="dashboard-metric-card">
                <span className="dashboard-metric-icon cyan" aria-hidden="true">▤</span>
                <div className="dashboard-metric-copy"><span>Uploaded documents</span><strong>{documents.length}</strong></div>
              </article>
              <article className="dashboard-metric-card">
                <span className="dashboard-metric-icon violet" aria-hidden="true">&lt;/&gt;</span>
                <div className="dashboard-metric-copy"><span>Available AI tools</span><strong>{toolDefinitions.length}</strong></div>
              </article>
              <article className="dashboard-metric-card">
                <span className="dashboard-metric-icon green" aria-hidden="true">ϟ</span>
                <div className="dashboard-metric-copy"><span>Ollama connection</span><strong>{connection ? (connection.connected ? "Online" : "Offline") : "Checking…"}</strong></div>
              </article>
            </div>
            <div className="dashboard-storage-note"><span>Workspace storage</span><strong>{accountWorkspace.storage}</strong></div>
          </section>

          <section className="activity-card dashboard-activity-card">
            <div className="activity-heading">
              <div className="dashboard-heading-title"><span className="dashboard-heading-icon" aria-hidden="true">◷</span><h2>Recent Activity</h2></div>
              <button className="text-link" onClick={() => selectPage("History")}>View All →</button>
            </div>
            {recentActivities.length === 0 ? (
              <p className="muted-copy empty-activity">Your conversations, tools, and documents will appear here.</p>
            ) : recentActivities.map((activity) => (
              <button className="activity-row activity-button" key={activity.id} onClick={() => openActivity(activity)}>
                <span className={`activity-dot ${activity.category === "document" ? "blue-dot" : activity.category === "tool" ? "mint-dot" : activity.category === "code" ? "lavender-dot" : "mint-dot"}`} />
                <span className="activity-copy"><strong>{activity.title}</strong><span>{activity.description} · {formatDate(activity.createdAt)}</span></span>
              </button>
            ))}
          </section>
        </aside>
      </div>
    );
  };

  const renderChat = () => (
    <section className="workspace-page chat-page">
      <header className="chat-header">
        <button className="chat-mobile-menu" type="button" onClick={() => setMenuOpen((open) => !open)} aria-label="Toggle menu">☰</button>
        <div className="chat-header-title">
          <h1>AI Chat</h1>
          <p>Chat with your local AI model (Ollama)</p>
        </div>
        <div className="chat-header-actions">
          <label className="chat-model-picker">
            <span className={`chat-model-indicator ${connection?.connected ? "connected" : ""}`} />
            <select aria-label="Select Ollama model" value={activeModel} onChange={(event) => void changeModel(event.target.value)} disabled={models.length === 0}>
              {models.length === 0 ? <option value="">No installed models</option> : models.map((model) => <option key={model} value={model}>{model}</option>)}
            </select>
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m5 7.5 5 5 5-5" /></svg>
          </label>
          <button className="chat-header-icon" type="button" onClick={() => void refreshModels()} disabled={modelsRefreshing} aria-label="Refresh Ollama models" title="Refresh Ollama models">
            <svg className={modelsRefreshing ? "spinning" : ""} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5" /><path d="M5.6 9a7 7 0 0 1 11.6-2L20 12M4 12l2.8 5a7 7 0 0 0 11.6-2" /></svg>
          </button>
          <button className={`chat-header-icon ${chatHistoryOpen ? "active" : ""}`} type="button" onClick={() => setChatHistoryOpen((open) => !open)} aria-label="Show recent conversations" title="Recent conversations">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 5.5h14v14H5zM8 3v5M16 3v5M8 10h8M8 14h5" /></svg>
          </button>
          <button className="chat-header-icon" type="button" onClick={() => void beginNewChat()} aria-label="New conversation" title="New conversation">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          </button>
          <button className="chat-header-icon danger" type="button" onClick={() => void clearCurrentChat()} aria-label="Clear chat" title="Clear chat">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m3 0-.8 13H6.8L6 7m4 4v5m4-5v5" /></svg>
          </button>
        </div>
      </header>
      {connection?.connected && models.length === 0 && (
        <div className="notice warning">The selected model is not installed. Choose an available model from the selector above.</div>
      )}
      {connection && !connection.connected && (
        <div className="notice warning">Ollama is not connected. Start Ollama at {connection.url} to chat.</div>
      )}
      <div className="chat-layout">
        {chatHistoryOpen && <button className="chat-history-backdrop" type="button" onClick={() => setChatHistoryOpen(false)} aria-label="Close conversation history" />}
        {chatHistoryOpen && (
          <aside className="chat-history-panel" aria-label="Recent conversations">
            <div className="chat-history-heading"><h2>Recent conversations</h2><button className="chat-history-close" type="button" onClick={() => setChatHistoryOpen(false)} aria-label="Close conversation history">×</button></div>
            {chats.length === 0 ? (
              <p className="muted-copy">Your saved conversations will appear here.</p>
            ) : (
              <div className="chat-history-list">
                {chats.slice(0, 8).map((chat) => (
                  <button
                    className={`chat-history-item ${activeChatId === chat.id ? "selected" : ""}`}
                    key={chat.id}
                    onClick={() => void openChat(chat.id)}
                  >
                    <span>{chat.title}</span>
                    <small>{chat.messageCount} messages</small>
                  </button>
                ))}
              </div>
            )}
            <button className="text-link history-link" onClick={() => selectPage("History")}>Open full history →</button>
          </aside>
        )}
        <div className="conversation-panel">
          <div className="conversation-messages" aria-live="polite">
            {messages.length === 0 && (
              <div className="chat-empty-state">
                <div className="placeholder-icon">✧</div>
                <h2>What can I help you with?</h2>
                <p>Ask a question, brainstorm ideas, or get help with a task.</p>
                <div className="suggestion-row">
                  {["Explain a complex topic simply", "Help me brainstorm project ideas", "Draft a professional email"].map((suggestion) => (
                    <button className="suggestion-chip" key={suggestion} onClick={() => setChatInput(suggestion)}>{suggestion}</button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((message, index) => (
              <div className={`message-row ${message.role}`} key={`${activeChatId ?? "new"}-${index}`}>
                <div className="message-avatar">{message.role === "user" ? initials(preferences.profileName) : <img src="/synora-logo.png" alt="" />}</div>
                <div className="message-content">
                  <strong>{message.role === "user" ? preferences.profileName : "SYNORA AI"}</strong>
                  {message.role === "assistant" ? <MarkdownContent>{message.content}</MarkdownContent> : <p>{message.content}</p>}
                  {message.role === "assistant" && (
                    <button className="message-copy" onClick={() => void copyText(message.content)} type="button">Copy response</button>
                  )}
                </div>
              </div>
            ))}
            {chatBusy && <div className="thinking-state" role="status"><span className="loading-dot" /> SYNORA AI is thinking…</div>}
            {chatError && <p className="inline-error" role="alert">{chatError}</p>}
            <div ref={conversationEndRef} />
          </div>
          <form className="chat-composer" onSubmit={(event) => void sendMessage(event)}>
            <div className="chat-input-shell">
              <span className="chat-microphone-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none"><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3m-4 0h8" /></svg>
              </span>
              <textarea
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                onKeyDown={handleChatKeyDown}
                placeholder="Type your message..."
                aria-label="Message SYNORA AI"
                disabled={chatBusy}
                rows={1}
              />
              <button className="chat-send-button" type="submit" disabled={chatBusy || !chatInput.trim() || !activeModel} aria-label={chatBusy ? "Sending message" : "Send message"} title={chatBusy ? "Sending message" : "Send message"}>
                {chatBusy ? <span className="chat-send-spinner" /> : <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m21 3-7.4 18-3.1-7.5L3 10.4 21 3Z" /><path d="M10.5 13.5 15 9" /></svg>}
              </button>
            </div>
          </form>
        </div>
      </div>
    </section>
  );

  const renderCodeAssistant = () => (
    <section className="workspace-page">
      <PageHeader title="Code Assistant" description={pageDescriptions["Code Assistant"]} />
      <div className="code-workbench">
        <form className="feature-form" onSubmit={(event) => void runCodeAction(event)}>
          <div className="form-grid two-col">
            <label className="field-label">
              Programming language
              <select value={codeLanguage} onChange={(event) => setCodeLanguage(event.target.value)}>
                {["Python", "JavaScript", "TypeScript", "Java", "C++", "C#", "Go", "Rust", "PHP", "Ruby", "SQL", "HTML/CSS", "Other"].map((language) => <option key={language}>{language}</option>)}
              </select>
            </label>
            <label className="field-label">
              Action
              <select value={codeAction} onChange={(event) => setCodeAction(event.target.value)}>
                {["Generate code", "Explain code", "Debug code", "Fix errors", "Improve code", "Optimize code", "Generate documentation", "Format code"].map((action) => <option key={action}>{action}</option>)}
              </select>
            </label>
          </div>
          <label className="field-label">
            What should the assistant do?
            <textarea value={codePrompt} onChange={(event) => setCodePrompt(event.target.value)} placeholder="Describe the code you need, or explain the issue you are seeing…" rows={3} />
          </label>
          <label className="field-label">
            Your code or error (optional)
            <Suspense fallback={<div className="code-editor-loading" role="status">Loading code editor…</div>}>
              <CodeEditor
                value={sourceCode}
                language={codeLanguage}
                darkMode={darkMode}
                onChange={setSourceCode}
              />
            </Suspense>
          </label>
          {codeError && <p className="inline-error" role="alert">{codeError}</p>}
          <div className="code-form-actions">
            <button className="secondary-btn" type="button" onClick={clearCodeEditor}>Clear code</button>
            <button className="primary-btn" type="submit" disabled={!activeModel || codeBusy || (!codePrompt.trim() && !sourceCode.trim())}>
            {codeBusy ? "Working…" : `${codeAction} →`}
            </button>
          </div>
        </form>
        <div className="result-panel">
          <div className="result-heading">
            <div><h2>Assistant response</h2><p>Generated by {activeModel || "No installed model"}</p></div>
            <div className="result-actions">
              <button className="secondary-btn" onClick={() => void copyCode()} disabled={!codeResult}>{/```[\s\S]*```/.test(codeResult) ? "Copy code" : "Copy response"}</button>
              <button className="secondary-btn" onClick={() => void saveAssistantSnippet()} disabled={!codeResult}>Save snippet</button>
            </div>
          </div>
          {snippetActionNotice && <p className="inline-success" role="status">{snippetActionNotice}</p>}
          {snippetActionError && <p className="inline-error" role="alert">{snippetActionError}</p>}
          {copyStatus && <p className="inline-success">{copyStatus}</p>}
          {codeBusy ? <div className="result-empty"><span className="loading-dot" /> Generating a response…</div> : codeResult ? <div className="ai-output markdown-content"><MarkdownContent>{codeResult}</MarkdownContent></div> : <div className="result-empty">Your code and explanation will appear here.</div>}
        </div>
      </div>
    </section>
  );

  const renderDocuments = () => {
    const selectedDocument = documents.find((document) => document.id === selectedDocumentId);
    const filteredDocuments = documents.filter((document) =>
      document.name.toLowerCase().includes(documentSearch.trim().toLowerCase()),
    );
    const previewLines = documentPreview?.text.split(/\r?\n/) ?? [];
    const matchingPreviewLines = documentTextSearch.trim()
      ? previewLines.filter((line) => line.toLowerCase().includes(documentTextSearch.trim().toLowerCase()))
      : previewLines;
    return (
      <section className="workspace-page">
        <PageHeader title="Documents" description={pageDescriptions.Documents} />
        <div className="tools-search document-search"><span>⌕</span><input value={documentSearch} onChange={(event) => setDocumentSearch(event.target.value)} placeholder="Search document names…" aria-label="Search documents" /></div>
        <div className="document-upload-panel">
          <label
            className={`upload-dropzone ${uploading ? "busy" : ""} ${isDraggingFile ? "drag-active" : ""}`}
            onDragEnter={(event) => { event.preventDefault(); setIsDraggingFile(true); }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => { event.preventDefault(); setIsDraggingFile(false); }}
            onDrop={(event) => {
              event.preventDefault();
              setIsDraggingFile(false);
              const file = event.dataTransfer.files[0];
              if (file && !uploading) void processDocumentUpload(file);
            }}
          >
              <span className="upload-symbol">{uploading ? "…" : "↑"}</span>
              <strong>{uploading ? "Uploading and processing…" : isDraggingFile ? "Drop to upload" : "Upload a document"}</strong>
            <span>PDF, DOCX, TXT, MD or CSV · up to 12 MB</span>
            <input type="file" accept=".pdf,.docx,.txt,.md,.csv" disabled={uploading} onChange={(event) => void uploadDocument(event)} />
          </label>
          {documentNotice && <p className="inline-success">{documentNotice}</p>}
          {documentError && <p className="inline-error" role="alert">{documentError}</p>}
          {documents.length === 0 ? (
            <div className="empty-documents"><div className="placeholder-icon">▤</div><h2>No documents yet</h2><p>Upload a supported file to extract its text and ask questions.</p></div>
          ) : (
            <div className="document-list">
              <h2>Your documents <span>{filteredDocuments.length}</span></h2>
              {filteredDocuments.length === 0 && <p className="muted-copy">No documents match that search.</p>}
              {filteredDocuments.map((document) => (
                <div className={`document-row ${selectedDocumentId === document.id ? "selected" : ""}`} key={document.id}>
                  <button className="document-select" onClick={() => { setSelectedDocumentId(document.id); setDocumentAnswer(""); setDocumentError(""); setDocumentPreview(null); setDocumentTextSearch(""); }}>
                    <span className="document-icon">▤</span>
                    <span className="document-info"><strong>{document.name}</strong><small>{formatFileSize(document.sizeBytes)} · {formatDate(document.createdAt)} · {document.embeddingStatus === "vector" ? "Vector search ready" : "Keyword search ready"}</small></span>
                  </button>
                  <div className="document-actions">
                    <button className="secondary-btn compact-btn" disabled={documentPreviewBusy} onClick={() => void openDocumentPreview(document)} type="button">{documentPreviewBusy ? "Loading…" : "Preview"}</button>
                    <a className="secondary-btn compact-btn" href={`${API_BASE}/documents/${encodeURIComponent(document.id)}/download`} download>Download</a>
                    <button className="icon-btn danger" aria-label={`Delete ${document.name}`} onClick={() => void deleteDocument(document)}>×</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        {documentPreview && (
          <div className="document-preview-panel">
            <div className="result-heading"><div><h2>Document preview</h2><p>{documentPreview.name}</p></div><button className="icon-btn" type="button" onClick={() => setDocumentPreview(null)} aria-label="Close preview">×</button></div>
            <label className="field-label">Search within this document<input value={documentTextSearch} onChange={(event) => setDocumentTextSearch(event.target.value)} placeholder="Find text in the preview…" /></label>
            {documentTextSearch.trim() && <p className="muted-copy">{matchingPreviewLines.length} matching lines</p>}
            <pre>{matchingPreviewLines.length ? matchingPreviewLines.join("\n") : "No matching text found."}</pre>
          </div>
        )}
        {selectedDocument && (
          <div className="document-question-panel">
            <div className="result-heading">
              <div><h2>Ask this document</h2><p>{selectedDocument.name}</p></div>
              {documentRetrieval && <span className="status-pill">{documentRetrieval === "vector" ? "Vector retrieval" : "Keyword retrieval"}</span>}
            </div>
            <div className="document-prompt-chips">
              <button type="button" className="suggestion-chip" onClick={() => setDocumentQuestion("Summarize the main points in the relevant sections of this document.")}>Draft a summary question</button>
              <button type="button" className="suggestion-chip" onClick={() => setDocumentQuestion("What are the key points and important details in the relevant sections?")}>Find key points</button>
            </div>
            <form className="document-question-form" onSubmit={(event) => void askDocument(event)}>
              <textarea value={documentQuestion} onChange={(event) => setDocumentQuestion(event.target.value)} placeholder="Ask a question about this document…" rows={2} />
              <button className="primary-btn" disabled={!activeModel || !documentQuestion.trim()}>Ask SYNORA AI →</button>
            </form>
            {documentError && <p className="inline-error" role="alert">{documentError}</p>}
            {documentAnswer && <div className="document-answer"><strong>SYNORA AI</strong><MarkdownContent>{documentAnswer}</MarkdownContent></div>}
          </div>
        )}
      </section>
    );
  };

  const renderTools = () => {
    const filteredTools = toolDefinitions.filter((tool) => tool.name.toLowerCase().includes(search.toLowerCase()));
    return (
      <section className="workspace-page">
        <PageHeader title="AI Tools" description={pageDescriptions["AI Tools"]} />
        <div className="tools-search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search writing tools…" aria-label="Search AI tools" /></div>
        <div className="learning-grid tools-catalog">
          {filteredTools.map((tool) => (
            <button className={`learning-card ${activeTool === tool.name ? "tool-card-active" : ""}`} key={tool.name} onClick={() => { setActiveTool(tool.name); setToolInput(""); setToolExtra(""); setToolResult(""); setToolError(""); }}>
              <div className={`learning-icon ${tool.color}`}>{tool.icon}</div>
              <h3>{tool.name}</h3>
              <p>{tool.description}</p>
              <span className="card-link">Open tool →</span>
            </button>
          ))}
          {filteredTools.length === 0 && <p className="empty-message">No tools found. Try another search.</p>}
        </div>
        <div className="tool-workspace">
          <div className="tool-workspace-heading">
            <div className={`learning-icon ${selectedTool.color}`}>{selectedTool.icon}</div>
            <div><h2>{selectedTool.name}</h2><p>{selectedTool.description}</p></div>
            <button className="favorite-toggle" type="button" aria-pressed={preferences.favoriteTools.includes(selectedTool.name)} onClick={() => void toggleFavoriteTool(selectedTool.name)}>
              {preferences.favoriteTools.includes(selectedTool.name) ? "★ Saved" : "☆ Save tool"}
            </button>
          </div>
          <form className="feature-form" onSubmit={(event) => void runTool(event)}>
            {selectedTool.extraLabel && (
              <label className="field-label">{selectedTool.extraLabel}<input type={selectedTool.extraType || "text"} min={selectedTool.extraType === "number" ? 1 : undefined} value={toolExtra} onChange={(event) => setToolExtra(event.target.value)} placeholder={selectedTool.extraPlaceholder} required={selectedTool.extraRequired} /></label>
            )}
            <label className="field-label">Your input<textarea value={toolInput} onChange={(event) => setToolInput(event.target.value)} placeholder={selectedTool.prompt} rows={6} /></label>
            {toolError && <p className="inline-error" role="alert">{toolError}</p>}
            <button className="primary-btn" type="submit" disabled={!activeModel || toolBusy || !toolInput.trim() || Boolean(selectedTool.extraRequired && !toolExtra.trim())}>{toolBusy ? "Working…" : `Run ${selectedTool.name} →`}</button>
          </form>
          {(toolBusy || toolResult) && (
            <div className="tool-result">
              <h3>Result</h3>
              {toolBusy ? <p className="muted-copy"><span className="loading-dot" /> Generating with {activeModel}…</p> : <><MarkdownContent>{toolResult}</MarkdownContent><button className="message-copy" onClick={() => void copyText(toolResult)} type="button">Copy result</button></>}
            </div>
          )}
        </div>
      </section>
    );
  };

  const renderImageGenerator = () => (
    <section className="workspace-page">
      <PageHeader title="Image Generator" description={pageDescriptions["Image Generator"]} />
      <div className="image-generator-layout">
        <form className="feature-form image-form" onSubmit={(event) => void generateImage(event)}>
          <label className="field-label">Describe the image<textarea value={imagePrompt} onChange={(event) => setImagePrompt(event.target.value)} placeholder="Describe the scene, subject, lighting, composition, and mood…" rows={5} /></label>
          <div className="form-grid three-col">
            <label className="field-label">Style<select value={imageStyle} onChange={(event) => setImageStyle(event.target.value)}>{["Photorealistic", "Illustration", "Digital art", "Watercolor", "3D render", "Minimalist"].map((style) => <option key={style}>{style}</option>)}</select></label>
            <label className="field-label">Aspect ratio<select value={imageRatio} onChange={(event) => setImageRatio(event.target.value)}>{["1:1", "3:2", "2:3", "16:9", "9:16"].map((ratio) => <option key={ratio}>{ratio}</option>)}</select></label>
            <label className="field-label">Image quality<select value={imageSize} onChange={(event) => setImageSize(event.target.value)}><option value="medium">Standard</option><option value="high">High</option></select></label>
          </div>
          {!imageConfigured && <div className="notice warning">No image-generation provider is configured. This app will not display a generated image unless a real provider is connected.</div>}
          {imageError && <p className="inline-error" role="alert">{imageError}</p>}
          <button className="primary-btn" type="submit" disabled={!imagePrompt.trim() || imageBusy}>{imageBusy ? "Generating image…" : "Generate Image →"}</button>
        </form>
        <div className="image-preview-panel">
          {imageGallery.length ? (
            <div className="image-gallery">
              {imageGallery.map((image) => (
                <article className="generated-image-card" key={image.id}>
                  <img src={image.imageUrl} alt={image.prompt} />
                  <p>{image.prompt}</p>
                  <small>{formatDate(image.createdAt)}</small>
                  <div className="generated-image-actions"><a className="secondary-btn compact-btn" href={image.imageUrl} download target="_blank" rel="noreferrer">Download image</a><button className="icon-btn danger" type="button" aria-label="Delete generated image" onClick={() => void deleteGeneratedImage(image)}>×</button></div>
                </article>
              ))}
            </div>
          ) : (
            <div className="image-preview-placeholder"><div className="placeholder-icon">▧</div><h2>Generated image preview</h2><p>{imageConfigured ? "Your generated image will appear here." : "Connect an image generation provider to create and download images."}</p></div>
          )}
        </div>
      </div>
    </section>
  );

  const renderHistory = () => {
    const matchesDate = (value: string) => {
      const date = value.slice(0, 10);
      return (!historyFrom || date >= historyFrom) && (!historyTo || date <= historyTo);
    };
    const query = historySearch.trim().toLowerCase();
    const filteredChats = chats.filter((chat) =>
      (!query || chat.title.toLowerCase().includes(query)) && matchesDate(chat.updatedAt),
    );
    const filteredActivities = activities.filter((activity) =>
      (!query || `${activity.title} ${activity.description}`.toLowerCase().includes(query)) &&
      matchesDate(activity.createdAt),
    );
    const filteredCodeHistory = filteredActivities.filter((activity) => activity.category === "code");
    const filteredOtherActivities = filteredActivities.filter((activity) => activity.category !== "code");
    const filteredDocuments = documents.filter((document) =>
      (!query || document.name.toLowerCase().includes(query)) && matchesDate(document.createdAt),
    );
    const filteredImages = imageGallery.filter((image) =>
      (!query || image.prompt.toLowerCase().includes(query)) && matchesDate(image.createdAt),
    );
    return (
    <section className="workspace-page">
      <div className="page-toolbar">
        <PageHeader title="History" description={pageDescriptions.History} />
        <button className="secondary-btn" onClick={async () => {
          if (chats.length === 0 || !window.confirm("Delete all saved conversations? This cannot be undone.")) return;
          try {
            await api.clearChats();
            setChats([]);
            setActivities((previous) => previous.filter((activity) => activity.category !== "chat"));
            setMessages([]);
            setActiveChatId(null);
          } catch (error) {
            setBackendError(error instanceof Error ? error.message : "Could not clear conversation history.");
          }
        }}>Clear chat history</button>
      </div>
      <div className="history-filters">
        <label className="field-label">Search history<input value={historySearch} onChange={(event) => setHistorySearch(event.target.value)} placeholder="Search conversations and activity…" /></label>
        <label className="field-label">From<input type="date" value={historyFrom} onChange={(event) => setHistoryFrom(event.target.value)} /></label>
        <label className="field-label">To<input type="date" value={historyTo} onChange={(event) => setHistoryTo(event.target.value)} /></label>
        <button className="text-link" type="button" onClick={() => { setHistorySearch(""); setHistoryFrom(""); setHistoryTo(""); }}>Clear filters</button>
      </div>
      <div className="history-section">
        <div className="section-heading"><div><h2>Conversations</h2><p>Saved on this workspace.</p></div><span className="status-pill">{filteredChats.length} shown · {chats.length} total</span></div>
        {chats.length === 0 ? <div className="empty-state-card"><h3>No saved conversations</h3><p>Start a chat and your conversations will be saved here.</p><button className="primary-btn" onClick={beginNewChat}>Start AI Chat →</button></div> : filteredChats.length === 0 ? <p className="muted-copy">No conversations match these filters.</p> : (
          <div className="history-list">
            {filteredChats.map((chat) => (
              <div className="history-row" key={chat.id}>
                <button className="history-open" onClick={() => void openChat(chat.id)}><span className="history-chat-icon">✧</span><span className="history-chat-info"><strong>{chat.title}</strong><small>{chat.messageCount} messages · {formatDate(chat.updatedAt)}</small></span></button>
                <button className="icon-btn danger" aria-label={`Delete ${chat.title}`} onClick={() => void deleteChat(chat)}>×</button>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="history-section">
        <div className="section-heading"><div><h2>Code Assistant history</h2><p>Saved code-generation and editing activity.</p></div><button className="text-link" onClick={() => selectPage("Code Assistant")}>Open Code Assistant →</button></div>
        {filteredCodeHistory.length === 0 ? <p className="muted-copy">Code assistant activity will appear here after you request code help.</p> : filteredCodeHistory.slice(0, 12).map((activity) => (
          <button className="activity-row activity-button" key={activity.id} onClick={() => openActivity(activity)}>
            <span className="activity-dot lavender-dot" />
            <span className="activity-copy"><strong>{activity.title}</strong><span>{activity.description} · {formatDate(activity.createdAt)}</span></span>
          </button>
        ))}
      </div>
      <div className="history-section">
        <div className="section-heading"><div><h2>Recent documents</h2><p>Uploaded files and processing status.</p></div><button className="text-link" onClick={() => selectPage("Documents")}>Open documents →</button></div>
        {documents.length === 0 ? <p className="muted-copy">Uploaded documents will appear here.</p> : filteredDocuments.length === 0 ? <p className="muted-copy">No documents match these filters.</p> : filteredDocuments.slice(0, 5).map((document) => <div className="activity-row history-document" key={document.id}><span className="activity-dot blue-dot" /><div><h4>{document.name}</h4><p>{document.embeddingStatus === "vector" ? "Vector search ready" : "Keyword search ready"} · {formatDate(document.createdAt)}</p></div></div>)}
      </div>
      <div className="history-section">
        <div className="section-heading"><div><h2>Generated images</h2><p>Your provider-generated image history.</p></div><button className="text-link" onClick={() => selectPage("Image Generator")}>Open image generator →</button></div>
        {imageError && <p className="inline-error" role="alert">{imageError}</p>}
        {imageGallery.length === 0 ? <p className="muted-copy">Generated images will appear here when an image provider is configured.</p> : filteredImages.length === 0 ? <p className="muted-copy">No generated images match these filters.</p> : (
          <div className="image-gallery">
            {filteredImages.map((image) => (
              <article className="generated-image-card" key={image.id}>
                <img src={image.imageUrl} alt={image.prompt} />
                <p>{image.prompt}</p>
                <small>{formatDate(image.createdAt)}</small>
                <div className="generated-image-actions">
                  <a className="secondary-btn compact-btn" href={image.imageUrl} download target="_blank" rel="noreferrer">Download image</a>
                  <button className="icon-btn danger" type="button" aria-label="Delete generated image" onClick={() => void deleteGeneratedImage(image)}>×</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
      <div className="history-section">
        <div className="section-heading"><div><h2>Recent AI activity</h2><p>Completed tasks across your workspace.</p></div></div>
        {filteredOtherActivities.length === 0 ? <p className="muted-copy">No other AI activity matches these filters.</p> : filteredOtherActivities.slice(0, 12).map((activity) => (
          <button className="activity-row activity-button" key={activity.id} onClick={() => openActivity(activity)}>
            <span className={`activity-dot ${activity.category === "document" ? "blue-dot" : activity.category === "code" ? "lavender-dot" : "mint-dot"}`} />
            <span className="activity-copy"><strong>{activity.title}</strong><span>{activity.description} · {formatDate(activity.createdAt)}</span></span>
          </button>
        ))}
      </div>
    </section>
    );
  };

  const renderUserAccount = () => (
    <section className="workspace-page">
      <PageHeader title="User Account" description={pageDescriptions["User Account"]} />
      <div className="account-overview-card">
        <div className="account-identity">
          {preferences.avatar ? <img className="profile-avatar-large" src={preferences.avatar} alt={`${preferences.profileName} profile`} /> : <div className="profile-avatar-large initials-avatar">{initials(preferences.profileName)}</div>}
          <div><p className="eyebrow">SYNORA AI ACCOUNT</p><h2>{currentUser?.name || preferences.profileName}</h2><p>{currentUser?.email || preferences.email}</p></div>
        </div>
        <div className="account-overview-actions">
          <button className="secondary-btn" onClick={() => selectPage("Settings")} type="button">Edit profile & preferences</button>
        </div>
      </div>
      <div className="account-stats-grid">
        <article className="account-stat-card"><span>Saved conversations</span><strong>{accountWorkspace.conversations}</strong><button className="text-link" onClick={() => selectPage("History")} type="button">View history →</button></article>
        <article className="account-stat-card"><span>Uploaded documents</span><strong>{accountWorkspace.documents}</strong><button className="text-link" onClick={() => selectPage("Documents")} type="button">View documents →</button></article>
        <article className="account-stat-card"><span>Workspace storage</span><strong>{accountWorkspace.storage}</strong><small>Managed by your backend configuration</small></article>
      </div>
    </section>
  );

  const renderPersonalWorkspace = () => (
    <section className="workspace-page">
      <PageHeader title="Personal Workspace" description={pageDescriptions["Personal Workspace"]} />
      <div className="account-stats-grid workspace-overview-grid">
        <article className="account-stat-card"><span>Conversations</span><strong>{chats.length}</strong><button className="text-link" onClick={() => selectPage("History")} type="button">Explore history →</button></article>
        <article className="account-stat-card"><span>Documents</span><strong>{documents.length}</strong><button className="text-link" onClick={() => selectPage("Documents")} type="button">Open documents →</button></article>
        <article className="account-stat-card"><span>Saved code snippets</span><strong>{preferences.savedSnippets.length}</strong></article>
        <article className="account-stat-card"><span>Generated images</span><strong>{imageGallery.length}</strong><button className="text-link" onClick={() => selectPage("History")} type="button">View history →</button></article>
      </div>
      <div className="favorite-tools-section">
        <div className="section-heading"><div><h2>Favorite AI tools</h2><p>Keep your most-used tools close.</p></div><button className="text-link" onClick={() => selectPage("AI Tools")} type="button">Browse tools →</button></div>
        {preferences.favoriteTools.length === 0 ? <p className="muted-copy">Save tools from the AI Tools page and they will appear here.</p> : (
          <div className="learning-grid">
            {preferences.favoriteTools.map((favoriteName) => {
              const favorite = toolDefinitions.find((tool) => tool.name === favoriteName);
              if (!favorite) return null;
              return <button className="learning-card" key={favorite.name} onClick={() => { setActiveTool(favorite.name); setToolInput(""); setToolResult(""); selectPage("AI Tools"); }}><div className={`learning-icon ${favorite.color}`}>{favorite.icon}</div><h3>{favorite.name}</h3><p>{favorite.description}</p><span className="card-link">Open favorite →</span></button>;
            })}
          </div>
        )}
      </div>
      <div className="history-section workspace-snippets">
        <div className="section-heading"><div><h2>Saved code snippets</h2><p>Keep useful code alongside your workspace.</p></div><span className="status-pill">{preferences.savedSnippets.length} / 25</span></div>
        {workspaceNotice && <p className="inline-success" role="status">{workspaceNotice}</p>}
        {workspaceError && <p className="inline-error" role="alert">{workspaceError}</p>}
        <form className="feature-form snippet-form" onSubmit={(event) => void submitSavedSnippet(event)}>
          <div className="form-grid two-col">
            <label className="field-label">Snippet title<input value={snippetTitle} onChange={(event) => setSnippetTitle(event.target.value)} maxLength={80} required placeholder="e.g. Parse a CSV file" /></label>
            <label className="field-label">Language<select value={snippetLanguage} onChange={(event) => setSnippetLanguage(event.target.value)}>{["Python", "JavaScript", "TypeScript", "Java", "C++", "C#", "Go", "Rust", "PHP", "Ruby", "SQL", "HTML/CSS", "Other"].map((language) => <option key={language}>{language}</option>)}</select></label>
          </div>
          <label className="field-label">Code<textarea value={snippetCode} onChange={(event) => setSnippetCode(event.target.value)} maxLength={20000} rows={5} required placeholder="Paste or write code to save…" /></label>
          <button className="primary-btn" type="submit" disabled={preferences.savedSnippets.length >= 25}>Save code snippet →</button>
        </form>
        {preferences.savedSnippets.length === 0 ? <p className="muted-copy">No snippets saved yet. Save a code assistant result or add one above.</p> : (
          <div className="saved-snippet-list">
            {preferences.savedSnippets.map((snippet) => (
              <article className="saved-snippet-card" key={snippet.id}>
                <div className="result-heading">
                  <div><h3>{snippet.title}</h3><p>{snippet.language} · {formatDate(snippet.createdAt)}</p></div>
                  <div className="result-actions">
                    <button className="secondary-btn compact-btn" type="button" onClick={() => { setCodeLanguage(snippet.language); setSourceCode(snippet.code); setCodePrompt(""); setCodeResult(""); selectPage("Code Assistant"); }}>Open in Code Assistant</button>
                    <button className="icon-btn danger" type="button" aria-label={`Delete ${snippet.title}`} onClick={() => void deleteSavedSnippet(snippet)}>×</button>
                  </div>
                </div>
                <pre><code>{snippet.code}</code></pre>
              </article>
            ))}
          </div>
        )}
      </div>
      <div className="history-section workspace-notes">
        <div className="section-heading"><div><h2>Personal notes</h2><p>Private notes saved with your account preferences.</p></div></div>
        <form className="feature-form" onSubmit={(event) => void saveWorkspaceNotes(event)}>
          <label className="field-label">Workspace notes<textarea value={preferences.workspaceNotes} onChange={(event) => setPreferences((previous) => ({ ...previous, workspaceNotes: event.target.value }))} maxLength={20000} rows={6} placeholder="Keep ideas, prompts, and reminders for your next session…" /></label>
          <button className="primary-btn" type="submit">Save notes →</button>
        </form>
      </div>
      <div className="history-section">
        <div className="section-heading"><div><h2>Generated images</h2><p>Your real image-provider results.</p></div><button className="text-link" onClick={() => selectPage("Image Generator")}>Open image generator →</button></div>
        {imageError && <p className="inline-error" role="alert">{imageError}</p>}
        {imageGallery.length === 0 ? <p className="muted-copy">No generated images yet. Images appear here only after a provider returns a result.</p> : (
          <div className="image-gallery">
            {imageGallery.slice(0, 6).map((image) => (
              <article className="generated-image-card" key={image.id}>
                <img src={image.imageUrl} alt={image.prompt} />
                <p>{image.prompt}</p>
                <small>{formatDate(image.createdAt)}</small>
                <div className="generated-image-actions">
                  <a className="secondary-btn compact-btn" href={image.imageUrl} download target="_blank" rel="noreferrer">Download image</a>
                  <button className="icon-btn danger" type="button" aria-label="Delete generated image" onClick={() => void deleteGeneratedImage(image)}>×</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
      <div className="history-section">
        <div className="section-heading"><div><h2>Recent work</h2><p>Your latest saved workspace items.</p></div></div>
        {activities.length === 0 ? <p className="muted-copy">Your workspace activity will appear here as you use SYNORA AI.</p> : activities.slice(0, 6).map((activity) => (
          <button className="activity-row activity-button" key={activity.id} onClick={() => openActivity(activity)}>
            <span className="activity-dot mint-dot" />
            <span className="activity-copy"><strong>{activity.title}</strong><span>{activity.description} · {formatDate(activity.createdAt)}</span></span>
          </button>
        ))}
      </div>
    </section>
  );

  const renderSettings = () => (
    <section className="workspace-page">
      <PageHeader title="Settings & workspace" description={pageDescriptions.Settings} />
      <form className="settings-layout" onSubmit={(event) => void saveSettings(event)}>
        <div className="settings-panel">
          <div className="settings-section-heading"><div><h2>Personal workspace</h2><p>Your profile is stored locally with your workspace data.</p></div></div>
          <div className="profile-editor">
            <div className="profile-avatar-wrap">
              {preferences.avatar ? <img className="profile-avatar-large" src={preferences.avatar} alt="Profile" /> : <div className="profile-avatar-large initials-avatar">{initials(preferences.profileName)}</div>}
              <label className="secondary-btn compact-btn avatar-upload">Change photo<input type="file" accept="image/*" onChange={changeAvatar} /></label>
            </div>
            <div className="form-grid two-col profile-fields">
              <label className="field-label">Username<input value={preferences.profileName} onChange={(event) => setPreferences((previous) => ({ ...previous, profileName: event.target.value }))} maxLength={60} /></label>
              <label className="field-label">Email<input type="email" value={preferences.email} onChange={(event) => setPreferences((previous) => ({ ...previous, email: event.target.value }))} maxLength={200} placeholder="you@example.com" /></label>
            </div>
          </div>
        </div>
        <div className="settings-panel">
          <div className="settings-section-heading"><div><h2>Workspace preferences</h2><p>Choose how SYNORA AI works for you.</p></div></div>
          <div className="form-grid two-col">
            <label className="field-label">AI model<select value={activeModel} onChange={(event) => void changeModel(event.target.value)} disabled={models.length === 0}>{models.length === 0 ? <option value="">No installed models</option> : models.map((model) => <option key={model} value={model}>{model}</option>)}</select><small>Only models returned by your Ollama server are selectable.</small></label>
            <div className="field-label">Appearance<div className="theme-setting"><span>{darkMode ? "Dark theme" : "Light theme"}</span><button className="theme-toggle" type="button" onClick={() => void toggleTheme()}>{darkMode ? "☀ Light" : "☾ Dark"}</button></div><label className="accent-setting">Accent color<select value={preferences.accentColor} onChange={(event) => { if (event.target.value === "turquoise" || event.target.value === "copper") void changeAccentColor(event.target.value); }}><option value="turquoise">Turquoise</option><option value="copper">Copper orange</option></select></label></div>
            <label className="notification-setting"><input type="checkbox" checked={preferences.notificationsEnabled} onChange={(event) => setPreferences((previous) => ({ ...previous, notificationsEnabled: event.target.checked }))} /><span><strong>Product notifications</strong><small>Allow workspace status and update notifications.</small></span></label>
            <div className="field-label">Privacy mode<div className="theme-setting"><span>Local workspace</span><span className="status-pill">Backend + Ollama</span></div><small>Image generation and support email use configured external services.</small></div>
          </div>
        </div>
        <div className="settings-panel connection-panel">
          <div className="settings-section-heading"><div><h2>AI connection</h2><p>Ollama requests are sent from the backend.</p></div><span className={`connection-badge ${connection?.connected ? "online" : "offline"}`}><i />{connection ? (connection.connected ? "Connected" : "Not connected") : "Checking…"}</span></div>
          <div className="connection-details">
            <div><span>Ollama endpoint</span><strong>{connection?.url || "Checking configured server…"}</strong></div>
            <div><span>Selected model</span><strong>{activeModel || "No installed model"} {activeModel ? "· available" : "· unavailable"}</strong></div>
            <div><span>Embeddings</span><strong>{connection?.embeddingModelAvailable ? `${connection.embeddingModel} · ready` : `${connection?.embeddingModel || "nomic-embed-text"} · not installed`}</strong></div>
          </div>
          <p className="muted-copy">To change the Ollama endpoint, set <code>OLLAMA_URL</code> in the backend environment and restart the server. It is not editable from the browser.</p>
          {connection?.error && <p className="inline-error">{connection.error}</p>}
          {connection && !connection.embeddingModelAvailable && <p className="muted-copy">To enable vector search for document Q&A, run <code>ollama pull {connection.embeddingModel || "nomic-embed-text"}</code>.</p>}
          {!connection?.connected && <p className="muted-copy">Start Ollama locally, then refresh this page to recheck the connection.</p>}
        </div>
        <div className="settings-panel preferences-actions">
          <div><h2>Application preferences</h2><p>Conversation history and document metadata are saved in the backend SQLite database.</p></div>
          <button className="secondary-btn" type="button" onClick={async () => {
            if (!window.confirm("Delete every saved conversation? Uploaded documents and preferences will remain.")) return;
            try {
              await api.clearChats();
              setChats([]);
              setActivities((previous) => previous.filter((activity) => activity.category !== "chat"));
              setMessages([]);
              setActiveChatId(null);
              setSettingsNotice("Chat history cleared.");
              setSettingsError("");
            } catch (error) {
              setSettingsError(error instanceof Error ? error.message : "Could not clear chat history.");
            }
          }}>Clear chat history</button>
        </div>
        {(settingsNotice || settingsError) && <p className={settingsError ? "inline-error" : "inline-success"} role={settingsError ? "alert" : "status"}>{settingsError || settingsNotice}</p>}
        <div className="settings-submit"><button className="primary-btn" type="submit" disabled={settingsBusy}>{settingsBusy ? "Saving…" : "Save preferences →"}</button></div>
      </form>
    </section>
  );

  const renderHelp = () => (
    <section className="workspace-page">
      <PageHeader title="Help & Support" description={pageDescriptions["Help & Support"]} />
      <div className="help-grid">
        <div className="help-card"><div className="help-icon">✧</div><h2>Quick start guide</h2><ol><li>Start Ollama on this computer.</li><li>Open Settings to confirm the model connection.</li><li>Choose AI Chat, Code Assistant, or a tool.</li><li>Upload a document to ask questions about its text.</li></ol></div>
        <div className="help-card"><div className="help-icon">?</div><h2>Frequently asked questions</h2><details><summary>Where do AI requests go?</summary><p>Your browser calls the Express backend, which sends text prompts to the configured Ollama instance.</p></details><details><summary>How do I use AI Chat?</summary><p>Open AI Chat, start a new conversation, enter a prompt, then press Enter or select Send. Conversations are saved to your account.</p></details><details><summary>How does document Q&A work?</summary><p>Upload a PDF, DOCX, TXT, Markdown, or CSV document. SYNORA extracts its text and uses available vector or keyword retrieval to ground answers.</p></details><details><summary>Why is document vector search unavailable?</summary><p>Install the embedding model with <code>ollama pull nomic-embed-text</code>, then re-upload documents to index their vectors.</p></details><details><summary>Can I generate images now?</summary><p>Image generation requires a server-side provider key. Without it, SYNORA reports the missing configuration and shows no generated image.</p></details><details><summary>Where is my workspace data stored?</summary><p>Conversations, extracted documents, uploads, and preferences are stored in the backend SQLite database.</p></details></div>
        <div className="help-card troubleshooting-card"><div className="help-icon">⚙</div><h2>Troubleshooting</h2><p><strong>Ollama is offline:</strong> start Ollama and verify the service responds at localhost:11434.</p><p><strong>Model missing:</strong> run <code>ollama pull llama3.2:3b</code> and check Settings.</p><p><strong>Document has no text:</strong> scanned-image PDFs need OCR, which is not configured.</p><p><strong>Backend unavailable:</strong> run <code>npm start</code> in the backend folder.</p></div>
        <div className="help-card contact-card"><div className="help-icon">✉</div><h2>Contact support</h2><p>Send a support request through the configured mail service. Avoid including private document contents.</p><form className="support-form" onSubmit={(event) => void sendSupportRequest(event)}><label className="field-label">Name<input required minLength={2} maxLength={100} value={supportName} onChange={(event) => setSupportName(event.target.value)} /></label><label className="field-label">Email<input type="email" required value={supportEmail} onChange={(event) => setSupportEmail(event.target.value)} /></label><label className="field-label">Message<textarea required minLength={10} maxLength={5000} rows={4} value={supportMessage} onChange={(event) => setSupportMessage(event.target.value)} /></label>{supportError && <p className="inline-error" role="alert">{supportError}</p>}{supportNotice && <p className="inline-success" role="status">{supportNotice}</p>}<button className="primary-btn" type="submit" disabled={supportBusy}>{supportBusy ? "Sending…" : "Send support request →"}</button></form></div>
      </div>
    </section>
  );

  const renderPage = () => {
    switch (activePage) {
      case "Dashboard": return renderDashboard();
      case "AI Chat": return renderChat();
      case "Code Assistant": return renderCodeAssistant();
      case "Documents": return renderDocuments();
      case "Image Generator": return renderImageGenerator();
      case "AI Tools": return renderTools();
      case "History": return renderHistory();
      case "Settings": return renderSettings();
      case "Help & Support": return renderHelp();
      case "User Account": return renderUserAccount();
      case "Personal Workspace": return renderPersonalWorkspace();
      default: return renderDashboard();
    }
  };

  const activeTitle = activePage;
  return (
    <div className={`app workspace-enter${darkMode ? " dark" : ""}${activePage === "AI Chat" ? " chat-active" : ""}`} data-accent={preferences.accentColor}>
      {menuOpen && <button className="mobile-overlay" aria-label="Close menu" onClick={() => setMenuOpen(false)} />}
      <aside className={menuOpen ? "sidebar open" : "sidebar"}>
        <button className="brand brand-home" type="button" onClick={() => selectPage("Dashboard")} aria-label="Go to dashboard">
          <img className="brand-symbol" src="/synora-logo.png" alt="" />
          <div><h2 className="logo">SYNORA AI</h2><p>Your Intelligent AI Workspace</p></div>
        </button>
        <p className="menu-label">WORKSPACE</p>
        <nav className="navigation">
          {menuItems.map((item) => (
            <button key={item.name} className={activePage === item.name ? "nav-item active" : "nav-item"} onClick={() => selectPage(item.name)}>
              <span className="nav-icon">{item.icon}</span><span>{item.name}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button className={activePage === "Settings" ? "nav-item active" : "nav-item"} onClick={() => selectPage("Settings")}><span className="nav-icon">⚙</span><span>Settings</span></button>
          <button className={activePage === "Help & Support" ? "nav-item active" : "nav-item"} onClick={() => selectPage("Help & Support")}><span className="nav-icon">?</span><span>Help & Support</span></button>
          <button className="user-profile user-profile-button" onClick={() => selectPage("Settings")} aria-label="Open profile and workspace settings">
            {preferences.avatar ? <img className="user-avatar avatar-image" src={preferences.avatar} alt="" /> : <div className="user-avatar">{initials(preferences.profileName)}</div>}
            <span><strong>{preferences.profileName || "SYNORA AI User"}</strong><small>{preferences.email || "Personal Workspace"}</small></span>
          </button>
        </div>
      </aside>
      <main className="main-content">
        <header className="topbar">
          <div className="topbar-left">
            <button className="mobile-menu" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle menu">☰</button>
            <div className="breadcrumb"><span>Workspace</span><b>/</b><strong>{activeTitle}</strong></div>
          </div>
          <div className="topbar-actions">
            <div className="search-box"><span>⌕</span><input type="search" placeholder="Search AI tools…" aria-label="Search AI tools" value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && search.trim()) selectPage("AI Tools"); }} /></div>
            <button className="notification-button" title="Recent activity" aria-label="Open recent activity" onClick={() => selectPage("History")}>◷</button>
            <span className={`top-connection ${connection?.connected ? "online" : "offline"}`} title={connection?.connected ? "Ollama connected" : connection ? "Ollama disconnected" : "Checking Ollama"}><i />{connection ? (connection.connected ? "Ollama online" : "Ollama offline") : "Checking Ollama"}</span>
            <button className="theme-toggle" onClick={() => void toggleTheme()}>{darkMode ? "☀ Light" : "☾ Dark"}</button>
            <button className="top-profile-button" onClick={() => selectPage("User Account")} aria-label="Open user account">
              {preferences.avatar ? <img className="top-avatar avatar-image" src={preferences.avatar} alt="" /> : <span className="top-avatar">{initials(preferences.profileName)}</span>}
            </button>
          </div>
        </header>
        {backendError && <div className="backend-banner" role="alert"><span>{backendError}</span><button onClick={() => setBackendError("")} aria-label="Dismiss error">×</button></div>}
        <div className="dashboard-content">{renderPage()}</div>
      </main>
    </div>
  );
}

export default App;
