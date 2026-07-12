import React, { useState, useRef, useEffect } from 'react';
import {
  Send, Volume2, Mic, Pencil, MessageSquare, StickyNote, CheckSquare,
  Sparkles, Paperclip, Plus, Trash2, X, Loader2, BookOpen, Brain, Radar, Settings as SettingsIcon
} from 'lucide-react';
import MarkdownLite from './MarkdownLite';

type Persona = 'chatty' | 'planner' | 'coder' | 'hacker';
type View = 'chat' | 'notes' | 'tasks' | 'memory' | 'recon' | 'settings';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  persona: Persona;
}

interface Note { id: string; title: string; content: string; updatedAt: number; }
interface Task { id: string; text: string; done: boolean; createdAt: number; }
interface OllamaModel { name: string; }

const PERSONAS: { value: Persona; label: string; emoji: string; color: string }[] = [
  { value: 'chatty', label: 'Chatty', emoji: '💬', color: 'from-sky-500 to-cyan-500' },
  { value: 'planner', label: 'Planner', emoji: '📅', color: 'from-emerald-500 to-green-600' },
  { value: 'coder', label: 'Coder', emoji: '💻', color: 'from-indigo-500 to-purple-600' },
  { value: 'hacker', label: 'Hacker', emoji: '🕶️', color: 'from-lime-500 to-emerald-700' }
];

const EMPTY_HISTORY: Record<Persona, Message[]> = {
  chatty: [], planner: [], coder: [], hacker: []
};

interface CatalogModel { name: string; label: string; size: string; minRam: string; goodFor: string[]; note?: string; }

const MODEL_CATALOG: CatalogModel[] = [
  { name: 'llama3:8b', label: 'Llama 3 · 8B', size: '4.7 GB', minRam: '16 GB RAM', goodFor: ['Chatty', 'Planner'] },
  { name: 'mistral:7b', label: 'Mistral · 7B', size: '4.1 GB', minRam: '16 GB RAM', goodFor: ['Chatty', 'General use'] },
  { name: 'qwen2.5:7b', label: 'Qwen 2.5 · 7B', size: '4.4 GB', minRam: '16 GB RAM', goodFor: ['Chatty', 'Coder'], note: 'Fast, strong reasoning for its size' },
  { name: 'phi3:mini', label: 'Phi-3 Mini · 3.8B', size: '2.2 GB', minRam: '8 GB RAM', goodFor: ['Chatty', 'Planner'], note: 'Best pick on low-spec machines / no GPU' },
  { name: 'deepseek-coder:6.7b', label: 'DeepSeek Coder · 6.7B', size: '3.8 GB', minRam: '16 GB RAM', goodFor: ['Coder', 'Hacker'], note: 'Best pick for Coder mode' },
  { name: 'codellama:7b', label: 'Code Llama · 7B', size: '3.8 GB', minRam: '16 GB RAM', goodFor: ['Coder'] },
  { name: 'gemma2:9b', label: 'Gemma 2 · 9B', size: '5.4 GB', minRam: '16 GB RAM', goodFor: ['Planner'] },
];

export default function App() {
  const [view, setView] = useState<View>('chat');
  const [persona, setPersona] = useState<Persona>('chatty');

  // Chat state — hydrated from disk on mount, saved on every change
  const [messagesByPersona, setMessagesByPersona] = useState<Record<Persona, Message[]>>(EMPTY_HISTORY);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [attachedFile, setAttachedFile] = useState<{ name: string; content: string } | null>(null);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Model / settings
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [chatModel, setChatModel] = useState('llama3');
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [pullProgress, setPullProgress] = useState<Record<string, { status: string; pct?: number; error?: string }>>({});
  const [customPullName, setCustomPullName] = useState('');

  // Memory
  const [memory, setMemory] = useState<string[]>([]);
  const [newMemoryItem, setNewMemoryItem] = useState('');
  const [memorySuggestions, setMemorySuggestions] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  // AI identity (voice output uses the browser's built-in speech synthesis — no keys, no cost)
  const [aiName, setAiName] = useState('');
  const [aiGender, setAiGender] = useState<'unspecified' | 'male' | 'female'>('unspecified');
  const [responseLanguage, setResponseLanguage] = useState('auto');
  const [recording, setRecording] = useState(false);
  const recognitionRef = useRef<any>(null);

  // Notes
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);

  // Tasks
  const [tasks, setTasks] = useState<Task[]>([]);

  // Recon Tools
  const [reconTools, setReconTools] = useState<{ id: string; label: string; category: 'network' | 'file'; note: string }[]>([]);
  const [reconTarget, setReconTarget] = useState('');
  const [reconFilePath, setReconFilePath] = useState('');
  const [reconFileName, setReconFileName] = useState('');
  const [reconOutput, setReconOutput] = useState('');
  const [reconRunning, setReconRunning] = useState(false);
  const [reconHash, setReconHash] = useState<{ md5: string; sha1: string; sha256: string; sizeBytes: number } | null>(null);
  const reconRunIdRef = useRef<string | null>(null);
  const [newTask, setNewTask] = useState('');

  const messages = messagesByPersona[persona];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, view]);

  // ── Initial load: history, notes, tasks, memory, settings, models ──────
  useEffect(() => {
    window.api.history.list().then(h => {
      setMessagesByPersona({ ...EMPTY_HISTORY, ...h });
      setHistoryLoaded(true);
    });
    window.api.notes.list().then(n => setNotes(n || []));
    window.api.tasks.list().then(t => setTasks(t || []));
    window.api.memory.list().then(m => setMemory(m || []));
    window.api.settings.get().then(s => {
      if (s?.chatModel) setChatModel(s.chatModel);
      if (s?.aiName) setAiName(s.aiName);
      if (s?.aiGender) setAiGender(s.aiGender);
      if (s?.responseLanguage) setResponseLanguage(s.responseLanguage);
    });
    refreshModels();
    if ('speechSynthesis' in window) window.speechSynthesis.getVoices();
    window.api.recon.tools().then(setReconTools);
    const unsubscribeRecon = window.api.recon.onOutput(({ runId, chunk }) => {
      if (runId !== reconRunIdRef.current) return;
      setReconOutput(prev => prev + chunk);
    });

    const unsubscribe = window.api.models.onProgress((data) => {
      setPullProgress(prev => {
        const pct = data.total && data.completed ? Math.round((data.completed / data.total) * 100) : undefined;
        return { ...prev, [data.name]: { status: data.status || 'pulling', pct, error: data.error } };
      });
      if (data.status === 'success') {
        refreshModels();
      }
    });
    return () => { unsubscribe(); unsubscribeRecon(); };
  }, []);

  // Persist chat history to disk whenever it changes (after initial load)
  useEffect(() => {
    if (!historyLoaded) return;
    window.api.history.save(messagesByPersona);
  }, [messagesByPersona, historyLoaded]);

  // A mode's "accuracy" (coder staying sharp, hacker staying grounded, etc.)
  // depends on running a model actually suited to it — not whatever happens to
  // be selected globally. When the user switches modes, auto-switch to the best
  // *installed* model for that mode, if one exists and isn't already active.
  const modelForPersona = (p: Persona): string | null => {
    const label = PERSONAS.find(x => x.value === p)?.label;
    if (!label) return null;
    const candidates = MODEL_CATALOG.filter(m => m.goodFor.includes(label));
    for (const c of candidates) {
      const base = c.name.split(':')[0];
      const installedMatch = availableModels.find(m => m.split(':')[0] === base);
      if (installedMatch) return installedMatch;
    }
    return null;
  };

  const selectPersona = (p: Persona) => {
    setPersona(p);
    const match = modelForPersona(p);
    if (match && match !== chatModel) saveModelChoice(match);
  };

  const refreshModels = () => {
    setModelsError(null);
    window.api.getModels().then(res => {
      if (res.success) {
        setAvailableModels((res.models || []).map((m: OllamaModel) => m.name));
      } else {
        setModelsError(res.error || 'Could not reach Ollama. Is the Ollama app running?');
      }
    });
  };

  useEffect(() => {
    if (availableModels.length === 0) return;
    if (!availableModels.includes(chatModel)) {
      const best = modelForPersona(persona) || availableModels[0];
      saveModelChoice(best);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableModels]);

  const activeNote = notes.find(n => n.id === activeNoteId) || null;

  // ── Chat ──────────────────────────────────────────────────────────────
  const handleSend = async (textOverride?: string) => {
    const text = textOverride ?? input;
    if (!text.trim()) return;
    setLastError(null);
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: text, persona };
    const assistantId = (Date.now() + 1).toString();
    const assistantMsg: Message = { id: assistantId, role: 'assistant', content: '', persona };
    setMessagesByPersona(prev => ({ ...prev, [persona]: [...prev[persona], userMsg, assistantMsg] }));
    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    setLoading(true);

    const streamId = assistantId;
    const unsubscribe = window.api.onChatChunk(({ streamId: sid, delta }) => {
      if (sid !== streamId) return;
      setMessagesByPersona(prev => ({
        ...prev,
        [persona]: prev[persona].map(m => m.id === assistantId ? { ...m, content: m.content + delta } : m)
      }));
    });

    try {
      const res = await window.api.chat(text, persona, attachedFile?.content, chatModel, streamId);
      if (res.success) {
        // Replace streamed (possibly still-tagged) content with the final, cleaned text.
        setMessagesByPersona(prev => ({
          ...prev,
          [persona]: prev[persona].map(m => m.id === assistantId ? { ...m, content: res.text } : m)
        }));
        if (res.memorySuggestions?.length) setMemorySuggestions(prev => [...prev, ...res.memorySuggestions]);
      } else {
        setLastError(res.error);
        setMessagesByPersona(prev => ({
          ...prev,
          [persona]: prev[persona].filter(m => m.id !== assistantId)
        }));
      }
    } catch (e: any) {
      setLastError(e?.message || 'Failed to reach local model.');
    } finally {
      unsubscribe();
      setLoading(false);
    }
  };

  const handleAttach = async () => {
    const res = await window.api.files.open();
    if (res.success) setAttachedFile({ name: res.name, content: res.content });
  };

  const startEdit = (msg: Message) => {
    setEditingId(msg.id);
    setEditingText(msg.content);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingText('');
  };

  // Editing a message invalidates its old response and anything after it —
  // the conversation from that point on is now stale, so drop it and resend.
  const submitEdit = () => {
    if (!editingId || !editingText.trim()) return;
    const idx = messages.findIndex(m => m.id === editingId);
    if (idx === -1) return;
    setMessagesByPersona(prev => ({ ...prev, [persona]: prev[persona].slice(0, idx) }));
    const text = editingText;
    setEditingId(null);
    setEditingText('');
    handleSend(text);
  };

  // ── Recon Tools ───────────────────────────────────────────────────────
  const runReconTool = async (toolId: string, category: 'network' | 'file') => {
    const target = category === 'network' ? reconTarget : reconFilePath;
    if (!target.trim()) return;
    const runId = `${toolId}-${Date.now()}`;
    reconRunIdRef.current = runId;
    setReconOutput('');
    setReconRunning(true);
    try {
      await window.api.recon.run(toolId, target, runId);
    } finally {
      setReconRunning(false);
    }
  };

  const pickReconFile = async () => {
    const res = await window.api.recon.pickFile();
    if (res.success) {
      setReconFilePath(res.filePath);
      setReconFileName(res.name);
      setReconHash(null);
      setReconOutput('');
    }
  };

  const runReconHash = async () => {
    if (!reconFilePath) return;
    setReconRunning(true);
    setReconHash(null);
    try {
      const res = await window.api.recon.hash(reconFilePath);
      if (res.success) setReconHash(res);
      else setLastError(res.error);
    } finally {
      setReconRunning(false);
    }
  };



  const LANG_BCP47: Record<string, string> = {
    English: 'en', Bangla: 'bn', German: 'de', Arabic: 'ar', French: 'fr',
    Spanish: 'es', Hindi: 'hi', Urdu: 'ur'
  };

  // Prefer a female voice from whatever the OS/browser has installed.
  // Voice availability differs by OS (Windows: Zira, Mac: Samantha, etc.),
  // so this is name-matching against common female voice names rather than
  // relying on a `gender` field the Web Speech API doesn't reliably expose.
  const pickFemaleVoice = (langCode: string): SpeechSynthesisVoice | null => {
    const voices = window.speechSynthesis?.getVoices() || [];
    if (voices.length === 0) return null;
    const femaleNames = ['zira', 'samantha', 'victoria', 'karen', 'moira', 'tessa', 'fiona', 'susan',
      'female', 'ava', 'allison', 'serena', 'joanna', 'salli', 'kimberly', 'ivy', 'emma', 'amy', 'olivia', 'aria'];
    const matchingLang = voices.filter(v => v.lang.toLowerCase().startsWith(langCode));
    const pool = matchingLang.length ? matchingLang : voices;
    const byName = pool.find(v => femaleNames.some(n => v.name.toLowerCase().includes(n)));
    if (byName) return byName;
    const maleNames = ['david', 'alex', 'daniel', 'fred', 'george', 'james', 'mark', 'tom', 'guy', 'ryan'];
    return pool.find(v => !maleNames.some(n => v.name.toLowerCase().includes(n))) || pool[0] || null;
  };

  const handleSpeak = (text: string) => {
    if (!('speechSynthesis' in window)) {
      setLastError('Speech synthesis is not available in this build.');
      return;
    }
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    const langCode = LANG_BCP47[responseLanguage] || 'en';
    const voice = pickFemaleVoice(langCode);
    if (voice) utter.voice = voice;
    utter.rate = 1;
    utter.pitch = 1;
    setAudioPlaying(true);
    utter.onend = () => setAudioPlaying(false);
    utter.onerror = () => { setAudioPlaying(false); setLastError('Speech playback failed.'); };
    window.speechSynthesis.speak(utter);
  };

  // Voice-to-text: dictate into the chat input instead of typing.
  // Note: relies on the browser's SpeechRecognition API, which in Electron's
  // bundled Chromium is not guaranteed to work the way it does in real Chrome
  // (Chrome's build ships an API key for Google's speech service; Electron's
  // doesn't by default). Wired up here — if it errors, that's why.
  const toggleRecording = () => {
    const SpeechRecognitionCtor = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!SpeechRecognitionCtor) {
      setLastError("Voice input isn't available in this build.");
      return;
    }
    if (recording) {
      recognitionRef.current?.stop();
      setRecording(false);
      return;
    }
    const recognition = new SpeechRecognitionCtor();
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript || '';
      if (transcript) setInput(prev => (prev ? prev + ' ' : '') + transcript);
    };
    recognition.onerror = (event: any) => {
      setLastError(`Voice input failed: ${event.error}. Electron often can't reach the speech service Chrome normally uses.`);
      setRecording(false);
    };
    recognition.onend = () => setRecording(false);
    recognitionRef.current = recognition;
    recognition.start();
    setRecording(true);
  };

  // ── Memory ────────────────────────────────────────────────────────────
  const addMemoryItem = () => {
    if (!newMemoryItem.trim()) return;
    const updated = [...memory, newMemoryItem.trim()];
    setMemory(updated);
    setNewMemoryItem('');
    window.api.memory.save(updated);
  };

  const deleteMemoryItem = (idx: number) => {
    const updated = memory.filter((_, i) => i !== idx);
    setMemory(updated);
    window.api.memory.save(updated);
  };

  // ── Notes ─────────────────────────────────────────────────────────────
  const createNote = () => {
    const n: Note = { id: Date.now().toString(), title: 'Untitled', content: '', updatedAt: Date.now() };
    const updated = [n, ...notes];
    setNotes(updated);
    setActiveNoteId(n.id);
    window.api.notes.save(updated);
  };

  const updateNote = (id: string, patch: Partial<Note>) => {
    const updated = notes.map(n => (n.id === id ? { ...n, ...patch, updatedAt: Date.now() } : n));
    setNotes(updated);
    window.api.notes.save(updated);
  };

  const deleteNote = (id: string) => {
    const updated = notes.filter(n => n.id !== id);
    setNotes(updated);
    if (activeNoteId === id) setActiveNoteId(null);
    window.api.notes.save(updated);
  };

  const sendNoteToChat = (note: Note) => {
    setAttachedFile({ name: note.title, content: note.content });
    setView('chat');
  };

  // ── Tasks ─────────────────────────────────────────────────────────────
  const addTask = () => {
    if (!newTask.trim()) return;
    const t: Task = { id: Date.now().toString(), text: newTask, done: false, createdAt: Date.now() };
    const updated = [t, ...tasks];
    setTasks(updated);
    setNewTask('');
    window.api.tasks.save(updated);
  };

  const toggleTask = (id: string) => {
    const updated = tasks.map(t => (t.id === id ? { ...t, done: !t.done } : t));
    setTasks(updated);
    window.api.tasks.save(updated);
  };

  const deleteTask = (id: string) => {
    const updated = tasks.filter(t => t.id !== id);
    setTasks(updated);
    window.api.tasks.save(updated);
  };

  const planTasks = async () => {
    const pending = tasks.filter(t => !t.done).map(t => t.text).join('\n- ');
    if (!pending) return;
    setView('chat');
    selectPersona('planner');
    setInput(`Here are my open tasks:\n- ${pending}\n\nHelp me prioritize and sequence these.`);
  };

  // ── Settings persistence ─────────────────────────────────────────────
  const saveModelChoice = (nextChat: string) => {
    setChatModel(nextChat);
    window.api.settings.save({ chatModel: nextChat });
  };

  const saveIdentity = (name: string, gender: 'unspecified' | 'male' | 'female') => {
    setAiName(name);
    setAiGender(gender);
    window.api.settings.save({ aiName: name, aiGender: gender === 'unspecified' ? undefined : gender });
  };

  const saveLanguage = (lang: string) => {
    setResponseLanguage(lang);
    window.api.settings.save({ responseLanguage: lang });
  };

  const acceptMemorySuggestion = (index: number) => {
    const fact = memorySuggestions[index];
    if (!fact) return;
    const updated = [...memory, fact];
    setMemory(updated);
    window.api.memory.save(updated);
    setMemorySuggestions(prev => prev.filter((_, i) => i !== index));
  };

  const dismissMemorySuggestion = (index: number) =>
    setMemorySuggestions(prev => prev.filter((_, i) => i !== index));

  const pullModel = async (name: string) => {
    setPullProgress(prev => ({ ...prev, [name]: { status: 'pulling' } }));
    const res = await window.api.models.pull(name);
    if (!res.success) {
      setPullProgress(prev => ({ ...prev, [name]: { status: 'error', error: res.error } }));
    }
  };

  const deleteModel = async (name: string) => {
    if (!confirm(`Delete ${name} from disk?`)) return;
    const res = await window.api.models.delete(name);
    if (res.success) refreshModels();
    else alert(`Couldn't delete: ${res.error}`);
  };

  const activePersonaMeta = PERSONAS.find(p => p.value === persona)!;

  return (
    <div className="h-screen flex bg-[#0e0e12] text-gray-100">

      {/* ── Sidebar ── */}
      <div className="w-56 border-r border-white/10 flex flex-col bg-[#121216]">
        <div className="p-4 border-b border-white/10 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-purple-400" />
          <span className="font-bold tracking-tight">3rd Hand AI</span>
        </div>

        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
          {[
            { id: 'chat', label: 'Chat', icon: MessageSquare },
            { id: 'notes', label: 'Notes', icon: StickyNote },
            { id: 'tasks', label: 'Tasks', icon: CheckSquare },
            { id: 'recon', label: 'Recon Tools', icon: Radar },
            { id: 'memory', label: 'Memory', icon: Brain },
            { id: 'settings', label: 'Models', icon: SettingsIcon }
          ].map(item => (
            <button
              key={item.id}
              onClick={() => setView(item.id as View)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition ${
                view === item.id ? 'bg-white/10 text-white' : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
              }`}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="p-3 border-t border-white/10">
          <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-2 px-1">Persona</div>
          <div className="grid grid-cols-1 gap-1">
            {PERSONAS.map(p => (
              <button
                key={p.value}
                onClick={() => { selectPersona(p.value); setView('chat'); }}
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs transition ${
                  persona === p.value
                    ? `bg-gradient-to-r ${p.color} text-white font-medium`
                    : 'text-gray-400 hover:bg-white/5'
                }`}
              >
                <span>{p.emoji}</span>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="px-3 pb-3 text-[10px] text-gray-600 flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${modelsError ? 'bg-red-500' : 'bg-emerald-500'}`} />
          {modelsError ? 'Ollama unreachable' : `${chatModel} ready`}
        </div>

        <div className="px-3 pb-3 text-[10px] text-gray-600">
          Built by{' '}
          <a
            href="https://github.com/SabbirRahman2006"
            onClick={e => { e.preventDefault(); window.open('https://github.com/SabbirRahman2006'); }}
            className="text-gray-400 hover:text-purple-300 underline decoration-dotted"
          >
            Sabbir Rahman
          </a>
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {view === 'chat' && (
          <>
            <div className="border-b border-white/10 px-6 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">{activePersonaMeta.emoji}</span>
                <span className="font-semibold">{activePersonaMeta.label} mode</span>
                <span className="text-xs text-gray-500 ml-1">· {chatModel}</span>
              </div>
              {attachedFile && (
                <div className="flex items-center gap-2 text-xs bg-white/5 px-2.5 py-1 rounded-full">
                  <Paperclip className="w-3 h-3" />
                  {attachedFile.name}
                  <button onClick={() => setAttachedFile(null)}><X className="w-3 h-3" /></button>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              {messages.length === 0 && (
                <div className="h-full flex items-center justify-center text-gray-500 text-sm">
                  Start a conversation in {activePersonaMeta.label} mode.
                </div>
              )}
              <div className="max-w-3xl mx-auto space-y-4">
                {messages.map(msg => (
                  <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} group`}>
                    <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                      msg.role === 'user' ? 'bg-purple-600/90 text-white' : 'bg-white/5 border border-white/10'
                    }`}>
                      {editingId === msg.id ? (
                        <div className="min-w-[260px]">
                          <textarea
                            value={editingText}
                            onChange={e => setEditingText(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitEdit(); }
                              if (e.key === 'Escape') cancelEdit();
                            }}
                            autoFocus
                            rows={Math.min(8, editingText.split('\n').length + 1)}
                            className="w-full bg-black/20 border border-white/20 rounded-lg px-2 py-1.5 text-sm resize-none focus:outline-none"
                          />
                          <div className="flex gap-2 mt-1.5">
                            <button onClick={submitEdit} className="text-[11px] px-2.5 py-1 rounded-md bg-white/20 hover:bg-white/30">
                              Save & resend
                            </button>
                            <button onClick={cancelEdit} className="text-[11px] px-2.5 py-1 rounded-md hover:bg-white/10">
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          {msg.role === 'assistant' ? (
                            <MarkdownLite text={msg.content} />
                          ) : (
                            <p className="whitespace-pre-wrap">{msg.content}</p>
                          )}
                          <div className="flex items-center gap-3 mt-2">
                            {msg.role === 'assistant' && (
                              <button
                                onClick={() => handleSpeak(msg.content)}
                                disabled={audioPlaying}
                                className="flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-gray-200"
                              >
                                <Volume2 className="w-3 h-3" /> Speak
                              </button>
                            )}
                            {msg.role === 'user' && (
                              <button
                                onClick={() => startEdit(msg)}
                                className="flex items-center gap-1.5 text-[11px] text-white/60 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <Pencil className="w-3 h-3" /> Edit
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                ))}
                {loading && messages[messages.length - 1]?.content === '' && (
                  <div className="flex items-center gap-2 text-gray-500 text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" /> Thinking…
                  </div>
                )}
                {memorySuggestions.map((fact, i) => (
                  <div key={i} className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3 text-sm flex items-start gap-3">
                    <Brain className="w-4 h-4 text-purple-300 mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <div className="text-purple-200 mb-2">Remember this? "{fact}"</div>
                      <div className="flex gap-2">
                        <button onClick={() => acceptMemorySuggestion(i)} className="text-xs px-3 py-1.5 rounded-md bg-purple-600 hover:bg-purple-500">
                          Save to memory
                        </button>
                        <button onClick={() => dismissMemorySuggestion(i)} className="text-xs px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/15">
                          Not now
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {lastError && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-300">
                    <div className="font-medium mb-1">Chat failed</div>
                    <div className="text-red-400/90 text-xs mb-2">{lastError}</div>
                    {availableModels.length > 0 && (
                      <div className="text-xs text-red-400/70">
                        Models Ollama actually has: {availableModels.join(', ')}. Set the right one in Settings.
                      </div>
                    )}
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>

            <div className="border-t border-white/10 p-4">
              <div className="max-w-3xl mx-auto flex items-center gap-2">
                <button
                  onClick={handleAttach}
                  className="p-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400"
                  title="Attach a file for context"
                >
                  <Paperclip className="w-4 h-4" />
                </button>
                <button
                  onClick={toggleRecording}
                  className={`p-2.5 rounded-lg ${recording ? 'bg-red-600 hover:bg-red-500' : 'bg-white/5 hover:bg-white/10 text-gray-400'}`}
                  title={recording ? 'Stop dictating' : 'Dictate a message'}
                >
                  <Mic className="w-4 h-4" />
                </button>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => {
                    setInput(e.target.value);
                    e.target.style.height = 'auto';
                    e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder={`Message ${activePersonaMeta.label}… (Shift+Enter for a new line)`}
                  rows={1}
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 focus:outline-none focus:border-purple-500 resize-none overflow-y-auto leading-relaxed"
                  style={{ maxHeight: 200 }}
                />
                <button
                  onClick={handleSend}
                  disabled={loading || !input.trim()}
                  className="p-2.5 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:bg-white/5 disabled:text-gray-600"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        )}

        {view === 'notes' && (
          <div className="flex-1 flex min-h-0">
            <div className="w-72 border-r border-white/10 flex flex-col">
              <div className="p-3 border-b border-white/10 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-400">Notes</span>
                <button onClick={createNote} className="p-1.5 rounded-md bg-white/5 hover:bg-white/10">
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                {notes.map(n => (
                  <button
                    key={n.id}
                    onClick={() => setActiveNoteId(n.id)}
                    className={`w-full text-left px-4 py-3 border-b border-white/5 ${
                      activeNoteId === n.id ? 'bg-white/10' : 'hover:bg-white/5'
                    }`}
                  >
                    <div className="text-sm font-medium truncate">{n.title || 'Untitled'}</div>
                    <div className="text-xs text-gray-500 truncate mt-0.5">{n.content.slice(0, 60) || 'Empty note'}</div>
                  </button>
                ))}
                {notes.length === 0 && (
                  <div className="p-4 text-xs text-gray-500">No notes yet. Click + to create one.</div>
                )}
              </div>
            </div>

            <div className="flex-1 flex flex-col">
              {activeNote ? (
                <>
                  <div className="border-b border-white/10 p-4 flex items-center gap-2">
                    <input
                      value={activeNote.title}
                      onChange={e => updateNote(activeNote.id, { title: e.target.value })}
                      className="flex-1 bg-transparent text-lg font-semibold focus:outline-none"
                      placeholder="Note title"
                    />
                    <button
                      onClick={() => sendNoteToChat(activeNote)}
                      className="text-xs px-3 py-1.5 rounded-md bg-purple-600/80 hover:bg-purple-600 flex items-center gap-1.5"
                    >
                      <BookOpen className="w-3.5 h-3.5" /> Use as chat context
                    </button>
                    <button onClick={() => deleteNote(activeNote.id)} className="p-1.5 rounded-md hover:bg-white/10 text-gray-400">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <textarea
                    value={activeNote.content}
                    onChange={e => updateNote(activeNote.id, { content: e.target.value })}
                    className="flex-1 bg-transparent p-4 resize-none focus:outline-none leading-relaxed"
                    placeholder="Write freely…"
                  />
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
                  Select a note or create a new one.
                </div>
              )}
            </div>
          </div>
        )}

        {view === 'tasks' && (
          <div className="flex-1 flex flex-col max-w-2xl mx-auto w-full">
            <div className="border-b border-white/10 p-4 flex items-center justify-between">
              <span className="font-semibold">Tasks</span>
              <button
                onClick={planTasks}
                className="text-xs px-3 py-1.5 rounded-md bg-emerald-600/80 hover:bg-emerald-600 flex items-center gap-1.5"
              >
                📅 Ask Planner to prioritize
              </button>
            </div>
            <div className="p-4 flex gap-2">
              <input
                value={newTask}
                onChange={e => setNewTask(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addTask()}
                placeholder="Add a task…"
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 focus:outline-none focus:border-emerald-500"
              />
              <button onClick={addTask} className="p-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500">
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 space-y-2">
              {tasks.map(t => (
                <div key={t.id} className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-lg px-3 py-2.5">
                  <input type="checkbox" checked={t.done} onChange={() => toggleTask(t.id)} className="w-4 h-4" />
                  <span className={`flex-1 text-sm ${t.done ? 'line-through text-gray-500' : ''}`}>{t.text}</span>
                  <button onClick={() => deleteTask(t.id)} className="text-gray-500 hover:text-red-400">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {tasks.length === 0 && <div className="text-xs text-gray-500 py-4">No tasks yet.</div>}
            </div>
          </div>
        )}

        {view === 'recon' && (
          <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full overflow-y-auto">
            <div className="mb-4">
              <div className="font-semibold mb-1 flex items-center gap-2"><Radar className="w-4 h-4" /> Recon Tools</div>
              <div className="text-xs text-gray-500">
                Runs real local commands against a target or file you choose — nothing here runs automatically.
                Only scan hosts/domains you own or have explicit permission to test.
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-lg p-4 mb-4">
              <div className="text-xs text-gray-400 mb-2 font-medium">Network / domain target</div>
              <input
                value={reconTarget}
                onChange={e => setReconTarget(e.target.value)}
                placeholder="e.g. example.com or 192.168.1.1"
                className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:border-purple-500"
              />
              <div className="flex flex-wrap gap-2">
                {reconTools.filter(t => t.category === 'network').map(t => (
                  <button
                    key={t.id}
                    onClick={() => runReconTool(t.id, 'network')}
                    disabled={reconRunning || !reconTarget.trim()}
                    title={t.note}
                    className="text-xs px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/15 disabled:opacity-40"
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-lg p-4 mb-4">
              <div className="text-xs text-gray-400 mb-2 font-medium">File forensics</div>
              <div className="flex items-center gap-2 mb-3">
                <button onClick={pickReconFile} className="text-xs px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/15">
                  Choose file…
                </button>
                <span className="text-xs text-gray-500 truncate">{reconFileName || 'No file selected'}</span>
              </div>
              <div className="flex flex-wrap gap-2 mb-3">
                {reconTools.filter(t => t.category === 'file').map(t => (
                  <button
                    key={t.id}
                    onClick={() => runReconTool(t.id, 'file')}
                    disabled={reconRunning || !reconFilePath}
                    title={t.note}
                    className="text-xs px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/15 disabled:opacity-40"
                  >
                    {t.label}
                  </button>
                ))}
                <button
                  onClick={runReconHash}
                  disabled={reconRunning || !reconFilePath}
                  className="text-xs px-3 py-1.5 rounded-md bg-purple-600/80 hover:bg-purple-600 disabled:opacity-40"
                >
                  Hash file (MD5/SHA1/SHA256 — built in, no install needed)
                </button>
              </div>
              {reconHash && (
                <div className="bg-black/30 rounded-lg p-3 text-[11px] font-mono space-y-1 text-gray-300">
                  <div>size: {reconHash.sizeBytes.toLocaleString()} bytes</div>
                  <div>md5: {reconHash.md5}</div>
                  <div>sha1: {reconHash.sha1}</div>
                  <div>sha256: {reconHash.sha256}</div>
                </div>
              )}
            </div>

            {(reconOutput || reconRunning) && (
              <div className="bg-black/50 border border-white/10 rounded-lg p-3 flex-1 min-h-[200px] overflow-auto">
                <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
                  {reconRunning && <Loader2 className="w-3 h-3 animate-spin" />}
                  {reconRunning ? 'Running…' : 'Output'}
                </div>
                <pre className="text-xs font-mono text-gray-200 whitespace-pre-wrap">{reconOutput || ' '}</pre>
              </div>
            )}
          </div>
        )}

        {view === 'memory' && (
          <div className="flex-1 flex flex-col max-w-2xl mx-auto w-full">
            <div className="border-b border-white/10 p-4">
              <div className="font-semibold flex items-center gap-2"><Brain className="w-4 h-4" /> Memory</div>
              <div className="text-xs text-gray-500 mt-1">
                Facts here get quietly added to every persona's context — across every chat, every restart.
                This is what makes it feel like it actually knows you instead of starting fresh each time.
              </div>
            </div>
            <div className="p-4 flex gap-2">
              <input
                value={newMemoryItem}
                onChange={e => setNewMemoryItem(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addMemoryItem()}
                placeholder="e.g. I'm learning cybersecurity, prefer concise answers…"
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 focus:outline-none focus:border-purple-500"
              />
              <button onClick={addMemoryItem} className="p-2.5 rounded-lg bg-purple-600 hover:bg-purple-500">
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 space-y-2">
              {memory.map((m, idx) => (
                <div key={idx} className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-lg px-3 py-2.5">
                  <span className="flex-1 text-sm text-gray-200">{m}</span>
                  <button onClick={() => deleteMemoryItem(idx)} className="text-gray-500 hover:text-red-400">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {memory.length === 0 && <div className="text-xs text-gray-500 py-4">Nothing remembered yet.</div>}
            </div>
          </div>
        )}

        {view === 'settings' && (
          <div className="flex-1 overflow-y-auto max-w-2xl mx-auto w-full p-6 space-y-8">
            <div>
              <div className="font-semibold mb-1">AI identity</div>
              <div className="text-xs text-gray-500 mb-4">
                Applies across every mode. Purely cosmetic — doesn't change behavior.
              </div>
              <label className="block text-xs text-gray-400 mb-1.5">Name</label>
              <input
                value={aiName}
                onChange={e => saveIdentity(e.target.value, aiGender)}
                placeholder="e.g. Lyra"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 mb-4 text-sm"
              />
              <label className="block text-xs text-gray-400 mb-1.5">Gender</label>
              <select
                value={aiGender}
                onChange={e => saveIdentity(aiName, e.target.value as any)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm"
              >
                <option value="unspecified">Unspecified</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
              </select>
            </div>

            <div>
              <div className="font-semibold mb-1">Response language</div>
              <div className="text-xs text-gray-500 mb-4">
                "Auto" replies in whatever language you write in. Pick one to force it every time.
              </div>
              <select
                value={responseLanguage}
                onChange={e => saveLanguage(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm"
              >
                <option value="auto">Auto (match my language)</option>
                <option value="English">English</option>
                <option value="Bangla">Bangla</option>
                <option value="German">German</option>
                <option value="Arabic">Arabic</option>
                <option value="French">French</option>
                <option value="Spanish">Spanish</option>
                <option value="Hindi">Hindi</option>
                <option value="Urdu">Urdu</option>
              </select>
            </div>

            <div>
              <div className="font-semibold mb-1">Voice</div>
              <div className="text-xs text-gray-500">
                Speaking uses your OS's built-in voices — free, offline, no API key. It always picks the
                best available female voice, regardless of the AI identity gender above. The mic button
                next to the chat input dictates speech into text.
              </div>
            </div>

            <div>
              <div className="font-semibold mb-1">Active model</div>
              <div className="text-xs text-gray-500 mb-4">
                What Chat actually uses right now.
              </div>

              {modelsError && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-300 mb-4">
                  {modelsError}
                  <button onClick={refreshModels} className="block mt-2 text-xs underline text-red-400">Retry</button>
                </div>
              )}

              <label className="block text-xs text-gray-400 mb-1.5">Chat model</label>
              <select
                value={chatModel}
                onChange={e => saveModelChoice(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5"
              >
                {availableModels.length === 0 && <option value={chatModel}>{chatModel}</option>}
                {availableModels.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            <div>
              <div className="font-semibold mb-1">Installed on this machine</div>
              <div className="text-xs text-gray-500 mb-3">Pulled via Ollama already — nothing to download.</div>
              <div className="space-y-1.5">
                {availableModels.map(m => (
                  <div key={m} className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm">
                    <span className="flex-1">{m}</span>
                    <button onClick={() => deleteModel(m)} className="text-gray-500 hover:text-red-400">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                {availableModels.length === 0 && !modelsError && (
                  <div className="text-xs text-gray-500">Nothing installed yet — pull one below.</div>
                )}
              </div>
            </div>

            <div>
              <div className="font-semibold mb-1">Download a model</div>
              <div className="text-xs text-gray-500 mb-3">
                Pulls straight from Ollama's library — no terminal. Matched to what each persona is actually good at.
              </div>
              <div className="grid grid-cols-1 gap-2">
                {MODEL_CATALOG.map(m => {
                  const installed = availableModels.includes(m.name);
                  const progress = pullProgress[m.name];
                  const pulling = progress?.status && progress.status !== 'success' && progress.status !== 'error';
                  return (
                    <div key={m.name} className="bg-white/5 border border-white/10 rounded-lg px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{m.label}</div>
                          <div className="text-[11px] text-gray-500">
                            {m.size} · {m.minRam} · best for {m.goodFor.join(', ')}{m.note ? ` · ${m.note}` : ''}
                          </div>
                        </div>
                        {installed ? (
                          <span className="text-[11px] text-emerald-400 px-2 py-1">Installed</span>
                        ) : pulling ? (
                          <span className="text-[11px] text-purple-300 px-2 py-1 flex items-center gap-1.5">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            {progress?.pct !== undefined ? `${progress.pct}%` : 'Pulling…'}
                          </span>
                        ) : (
                          <button
                            onClick={() => pullModel(m.name)}
                            className="text-xs px-3 py-1.5 rounded-md bg-purple-600/80 hover:bg-purple-600 whitespace-nowrap"
                          >
                            Download
                          </button>
                        )}
                      </div>
                      {progress?.status === 'error' && (
                        <div className="text-[11px] text-red-400 mt-1.5">{progress.error}</div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 flex gap-2">
                <input
                  value={customPullName}
                  onChange={e => setCustomPullName(e.target.value)}
                  placeholder="Or type any model tag, e.g. phi3:mini"
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
                />
                <button
                  onClick={() => { if (customPullName.trim()) { pullModel(customPullName.trim()); setCustomPullName(''); } }}
                  className="text-xs px-3 py-2 rounded-md bg-white/10 hover:bg-white/15 whitespace-nowrap"
                >
                  Pull
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
