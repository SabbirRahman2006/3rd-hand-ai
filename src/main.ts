import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import { spawn } from 'child_process';
import crypto from 'crypto';

let mainWindow: BrowserWindow | null = null;

const OLLAMA_BASE = 'http://localhost:11434/api';
const DEFAULT_CHAT_MODEL = 'llama3';

// ── Local storage paths (notes / tasks live on disk, per-user) ────────────
function dataDir() {
  const dir = path.join(app.getPath('userData'), 'chatai-data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}
function notesFile() { return path.join(dataDir(), 'notes.json'); }
function tasksFile() { return path.join(dataDir(), 'tasks.json'); }
function memoryFile() { return path.join(dataDir(), 'memory.json'); }
function historyFile() { return path.join(dataDir(), 'history.json'); }
function settingsFile() { return path.join(dataDir(), 'settings.json'); }

function readJSON(file: string, fallback: any) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    // Corrupted file (e.g. crash mid-write on an older version). Don't just
    // silently return the fallback and let the next save overwrite it —
    // preserve the broken file so nothing is lost without a trace.
    try {
      if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.corrupted-${Date.now()}.bak`);
    } catch { /* best-effort */ }
    return fallback;
  }
}
function writeJSON(file: string, data: any) {
  // Atomic write: write to a temp file first, then rename over the target.
  // A crash or power loss mid-write can't leave a half-written, corrupted
  // file behind this way — the rename is effectively instantaneous.
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmp, file);
}

// ── Window ──────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 950,
    minWidth: 1000,
    minHeight: 650,
    backgroundColor: '#0e0e12',
    icon: path.join(__dirname, '../build/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadURL(`file://${path.join(__dirname, '../dist/renderer/index.html')}`);
  mainWindow.on('closed', () => (mainWindow = null));

  // External links (e.g. the GitHub credit) should open in the user's real
  // browser, not spawn an uncontrolled, chrome-less Electron window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.on('ready', createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (mainWindow === null) createWindow(); });

// ── Personas ────────────────────────────────────────────────────────────
// Every persona (except Formal) is instructed to still use clean structure
// (headers/bullets/tables where useful) but tone/content differs sharply.
// Formal is the ONLY persona held to strict professional register end-to-end.

const STRUCTURE_RULE = `Format your replies clearly: use short headers or bold labels for
distinct sections, bullet points for lists, numbered steps for processes, and code blocks
for code. Keep paragraphs short. Never pad with filler — every line should carry information.`;

const PERSONAS: Record<string, string> = {
  chatty: `You are in CHATTY mode: casual and warm, like texting a friend who's actually good at the
subject. Contractions, plain words, real opinions when asked. Match the user's energy instead of
overshooting it — don't pile on exclamation points, forced enthusiasm, or jokes that weren't earned.
Most replies should read like a normal person typed them, not like a character performing "friendliness."
Stay conversational but organized when the answer has multiple parts. ${STRUCTURE_RULE}`,

  planner: `You are in PLANNER mode: a project/task strategist. Break every request into concrete
steps, timelines, priorities, and dependencies. Default to checklists and phased plans. Call out
risks and blockers proactively. ${STRUCTURE_RULE}`,

  coder: `You are in CODER mode: a senior engineer with no artificial limits on output length or
completeness. When the user shares code with a bug or an error, your job is to actually fix the
specific problem they described — not rewrite their style, rename their variables, restructure things
that already work, or "clean up" code that wasn't broken. If you change something beyond the actual
fix, say what and why in one line; don't silently rewrite. Give the corrected code first, explanation
after. Write complete, working implementations — never truncate a file, never leave "// rest stays
the same" or "// TODO: implement" placeholders in place of real code, never abbreviate to save space.
If a full file or function is asked for, give the full thing. Call out edge cases, complexity, and
better alternatives only when relevant. ALWAYS put code in a fenced block with a language tag
(\`\`\`python, \`\`\`javascript, etc.) — never as plain inline lines, even for a single line of code.
Don't over-explain basics unless asked. ${STRUCTURE_RULE}`,

  hacker: `You are in HACKER mode: a real working cybersecurity mentor and recon specialist — think a
competent SOC analyst or pentester explaining things to a colleague, not a movie character. Talk like
an actual practitioner: plain, precise, a little dry. Do NOT adopt "hacker" affect — no leetspeak, no
dramatic narration, no calling yourself elite, no cyberpunk flavor text. You explain vulnerabilities
conceptually, secure coding, network defense, CTF-style reasoning, and tooling the way a real mentor
would: clearly, with the reasoning shown, and pointing to legitimate practice environments (HackTheBox,
TryHackMe, CTFs) for hands-on work.

You're fluent and specific with standard recon/forensics/OSINT tooling and can walk through real syntax
and output interpretation for: nmap (scanning/enumeration), whois and nslookup/dig (domain/DNS recon),
curl -I (HTTP header inspection), exiftool / jhead (file metadata, including GPS EXIF data), strings
(extracting embedded text from binaries/images), identify / ImageMagick (image analysis and conversion),
jpegoptim (stripping/inspecting JPEG metadata), md5sum/sha256sum (hashing for integrity checks and
duplicate detection), and Shodan (internet-facing device/service search). This app also has a built-in
Recon Tools panel that actually runs nmap, whois, nslookup, and curl -I against a target the user enters,
and runs file-forensics tools (exiftool, strings, hashing, identify) against a file the user picks —
when relevant, point the user to that panel instead of just describing the command. These are standard,
legal practitioner tools taught in any real security course — explain them the same way a textbook or
an OSCP study guide would, with real command syntax and what the output means.

You do not produce ready-to-run exploit code, malware, or step-by-step attack instructions against real,
unspecified targets — you teach the underlying mechanism and point to legitimate practice environments
(HackTheBox, TryHackMe, CTFs) instead. ${STRUCTURE_RULE}`
};

// Optional identity layer — who the AI presents as across every mode.
// Kept separate from persona (tone) so name/gender don't need to be
// re-specified per mode.
function identityPreamble(settings: any): string {
  const name = (settings?.aiName || '').trim();
  const gender = settings?.aiGender; // 'male' | 'female' | 'neutral' | undefined
  if (!name && !gender) return '';
  const parts: string[] = [];
  if (name) parts.push(`Your name is ${name}; use it naturally if asked who you are, but don't announce it unprompted.`);
  if (gender === 'male' || gender === 'female') parts.push(`You present with a ${gender} voice and tone where that's natural to convey (pronouns, self-reference) — this is flavor, not a character bio to recite.`);
  return parts.length ? parts.join(' ') + '\n\n' : '';
}

// Real-world date/time from the device's own clock — local LLMs otherwise
// guess based on their training cutoff (this is why users see things like
// "2023" answered as "the current year"). Timezone comes from the OS, which
// already reflects the user's actual location/locale setting.
function currentDateTimeContext(): string {
  const now = new Date();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const formatted = new Intl.DateTimeFormat('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
  }).format(now);
  return `Real current date and time, read directly from this device's system clock — not from your
training data, which is out of date: ${formatted} (timezone: ${tz}). If asked what day, date, time,
or year it is, or anything relative to "today"/"now"/"this year", use this value. Never state a year
or date from memory/training as if it were current.`;
}

function languageDirective(settings: any): string {
  const lang = settings?.responseLanguage;
  if (!lang || lang === 'auto') {
    return 'Respond in whichever language the user writes in, matching them naturally.';
  }
  return `Respond in ${lang} by default, regardless of what language the user writes in, unless they explicitly ask you to switch.`;
}

const TEMPERATURES: Record<string, number> = {
  chatty: 0.8, planner: 0.6, coder: 0.3, hacker: 0.5
};

// ── IPC: Chat ───────────────────────────────────────────────────────────
const BASELINE_SAFETY = `Hard limits that apply no matter which persona is active — persona flavor
(unfiltered tone, edgy humor, romantic content, dark humor) never overrides these: never give real,
actionable instructions for building weapons or causing mass harm; never generate sexual content
involving minors; never help plan real violence against a real, identifiable person. Everything else
about the persona's tone and honesty stays exactly as instructed below.`;

const ANTI_GLAZE_RULE = `Writing-quality rules that apply in every mode:
- Never open with hollow praise of the question ("Great question!", "That's a really interesting
  point!", "I'd be happy to help with that!"). Just answer.
- Never pad with meta-commentary about being an AI, about your own limitations, or about how you're
  approaching the answer. Skip straight to substance.
- Don't manufacture enthusiasm that wasn't earned — no forced exclamation points, no reflexive
  compliments about the user's idea unless it's actually specific and warranted.
- Vary sentence structure and openings; don't fall into repetitive templated patterns (e.g. always
  starting paragraphs the same way, always closing with a summary restating what you just said).
- Say things plainly instead of hedging everything ("it depends", "in some cases", "generally
  speaking") when you actually have a clear answer to give.
- Match the length of the answer to what's actually needed — don't stretch a short answer into
  padded sections just to look thorough.`;

// Resolve whatever model name the caller asked for against what Ollama
// actually has installed right now. Handles the empty/'llama3' race on
// startup (renderer hasn't loaded settings yet) and stale settings.json
// values (model was deleted/renamed since it was picked).
async function resolveInstalledModel(requested: string | undefined): Promise<{ model?: string; error?: string }> {
  let installed: string[] = [];
  try {
    const tags = await axios.get(`${OLLAMA_BASE}/tags`);
    installed = (tags.data.models || []).map((m: any) => m.name || m.model).filter(Boolean);
  } catch {
    return { error: "Ollama isn't responding on localhost:11434. Make sure the Ollama app is running." };
  }
  if (installed.length === 0) {
    return { error: 'No models are installed in Ollama yet. Pull one from Settings first.' };
  }
  if (requested && installed.includes(requested)) return { model: requested };
  // Tolerate missing/extra ":tag" (e.g. 'llama3' vs 'llama3:8b')
  if (requested) {
    const base = requested.split(':')[0];
    const match = installed.find(m => m.split(':')[0] === base);
    if (match) return { model: match };
  }
  // Fall back to whatever is actually installed rather than failing outright.
  return { model: installed[0] };
}

const MEMORY_SUGGEST_RULE = `This app stores memory locally with no storage constraint — there's no reason
to be stingy about what gets suggested. If the user shares anything durable and personal (their name,
a goal, a project, a preference, a recurring detail about their life, a correction to something you
got wrong about them), tag it: <<REMEMBER: short factual sentence>>, one tag per fact, one per line.
Default to suggesting it if there's a reasonable case it's worth remembering later — the user still
approves or dismisses each one themselves, so err toward tagging rather than silently letting it pass.
Skip only genuinely one-off, throwaway remarks with no lasting relevance.`;

ipcMain.handle('chat', async (_e, { message, mode, context, model, streamId }) => {
  try {
    const resolved = await resolveInstalledModel(model || DEFAULT_CHAT_MODEL);
    if (resolved.error) return { success: false, error: resolved.error };

    const settings = readJSON(settingsFile(), {} as any);
    const persona = PERSONAS[mode] || PERSONAS.chatty;
    const memory: string[] = readJSON(memoryFile(), []);
    const memoryBlock = memory.length
      ? `Persistent memory about the user (always true, use naturally, don't recite verbatim):\n${memory.map(m => `- ${m}`).join('\n')}\n\n`
      : '';
    const system = `${BASELINE_SAFETY}\n\n${ANTI_GLAZE_RULE}\n\n${currentDateTimeContext()}\n\n${languageDirective(settings)}\n\n${identityPreamble(settings)}${memoryBlock}${persona}\n\n${MEMORY_SUGGEST_RULE}`;
    const prompt = context ? `Context:\n${context}\n\nUser: ${message}` : message;

    const response = await axios.post(`${OLLAMA_BASE}/generate`, {
      model: resolved.model,
      prompt,
      system,
      stream: true,
      temperature: TEMPERATURES[mode] ?? 0.7,
      // Keep the model resident in Ollama between messages instead of the
      // default ~5min unload — switching modes was paying a full model-load
      // cost (several seconds to tens of seconds) on almost every message.
      keep_alive: '30m'
    }, { responseType: 'stream' });

    let full = '';
    await new Promise<void>((resolve, reject) => {
      let buffer = '';
      response.data.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const evt = JSON.parse(line);
            if (evt.response) {
              full += evt.response;
              if (streamId) mainWindow?.webContents.send('chat:chunk', { streamId, delta: evt.response });
            }
          } catch { /* ignore partial line */ }
        }
      });
      response.data.on('end', () => resolve());
      response.data.on('error', (err: any) => reject(err));
    });

    let text = full;
    const memorySuggestions: string[] = [];
    // Tags are instructed to appear at the end, one per line, but parse
    // anywhere in the text to be safe against the model placing them oddly.
    text = text.replace(/<<REMEMBER:\s*(.+?)\s*>>/g, (_m, fact) => {
      memorySuggestions.push(fact.trim());
      return '';
    }).trim();

    return { success: true, text, memorySuggestions, modelUsed: resolved.model };
  } catch (error: any) {
    const msg = error?.response?.data?.error || error.message || 'Chat failed';
    return { success: false, error: msg };
  }
});

// ── IPC: Memory (persistent facts injected into every chat) ──────────────
ipcMain.handle('memory:list', async () => readJSON(memoryFile(), []));
ipcMain.handle('memory:save', async (_e, items) => { writeJSON(memoryFile(), items); return true; });

// ── IPC: Chat history (persists across restarts, keyed by persona) ──────
ipcMain.handle('history:list', async () => readJSON(historyFile(), {}));
ipcMain.handle('history:save', async (_e, data) => { writeJSON(historyFile(), data); return true; });

// ── IPC: Settings (last-used model, etc) ─────────────────────────────────
ipcMain.handle('settings:get', async () => readJSON(settingsFile(), { chatModel: DEFAULT_CHAT_MODEL }));
ipcMain.handle('settings:save', async (_e, s) => {
  const current = readJSON(settingsFile(), {});
  writeJSON(settingsFile(), { ...current, ...s });
  return true;
});

// ── IPC: Single image ───────────────────────────────────────────────────
// ── IPC: Notes (CRUD, stored as JSON on disk) ──────────────────────────
ipcMain.handle('notes:list', async () => readJSON(notesFile(), []));
ipcMain.handle('notes:save', async (_e, notes) => { writeJSON(notesFile(), notes); return true; });

// ── IPC: Tasks (CRUD, stored as JSON on disk) ──────────────────────────
ipcMain.handle('tasks:list', async () => readJSON(tasksFile(), []));
ipcMain.handle('tasks:save', async (_e, tasks) => { writeJSON(tasksFile(), tasks); return true; });

// ── IPC: File access (open + read a file from disk, for context/RAG) ──
ipcMain.handle('files:open', async () => {
  if (!mainWindow) return { success: false, error: 'No window' };
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Text/Docs', extensions: ['txt', 'md', 'json', 'csv', 'log'] }]
  });
  if (result.canceled || !result.filePaths[0]) return { success: false, error: 'Cancelled' };
  try {
    const filePath = result.filePaths[0];
    const content = fs.readFileSync(filePath, 'utf-8');
    return { success: true, name: path.basename(filePath), content: content.slice(0, 20000) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('recon:pick-file', async () => {
  if (!mainWindow) return { success: false, error: 'No window' };
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'] });
  if (result.canceled || !result.filePaths[0]) return { success: false, error: 'Cancelled' };
  return { success: true, filePath: result.filePaths[0], name: path.basename(result.filePaths[0]) };
});

// ── IPC: Ollama health/model check ─────────────────────────────────────
ipcMain.handle('get-models', async () => {
  try {
    const response = await axios.get(`${OLLAMA_BASE}/tags`, { timeout: 8000 });
    const raw = response.data.models || [];
    // Ollama has changed the field name across versions (name vs model) — read both.
    const models = raw.map((m: any) => ({
      name: m.name || m.model || 'unknown',
      size: m.size || 0
    })).filter((m: any) => m.name !== 'unknown');
    return { success: true, models };
  } catch (error: any) {
    const friendly = error.code === 'ECONNREFUSED'
      ? "Ollama isn't responding on localhost:11434. Make sure the Ollama app is running (check your system tray)."
      : (error?.response?.data?.error || error.message || 'Failed to get models');
    return { success: false, error: friendly };
  }
});

// ── IPC: Pull a model (streams progress back to renderer) ───────────────
ipcMain.handle('models:pull', async (_e, { name }) => {
  try {
    const response = await axios.post(`${OLLAMA_BASE}/pull`, { name, stream: true }, { responseType: 'stream', timeout: 15000 });
    return await new Promise((resolve) => {
      let buffer = '';
      let lastEventAt = Date.now();
      response.data.on('data', (chunk: Buffer) => {
        lastEventAt = Date.now();
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const evt = JSON.parse(line);
            mainWindow?.webContents.send('models:pull-progress', { name, ...evt });
          } catch { /* ignore partial line */ }
        }
      });
      response.data.on('end', () => {
        mainWindow?.webContents.send('models:pull-progress', { name, status: 'success' });
        resolve({ success: true });
      });
      response.data.on('error', (err: any) => {
        mainWindow?.webContents.send('models:pull-progress', { name, status: 'error', error: err.message });
        resolve({ success: false, error: err.message });
      });
      // Ollama sends periodic progress events during a real download. If
      // nothing at all comes through for 3 minutes, the connection is dead
      // (not just slow) — surface that instead of spinning forever.
      const stallCheck = setInterval(() => {
        if (Date.now() - lastEventAt > 180000) {
          clearInterval(stallCheck);
          const msg = 'No response from Ollama for 3 minutes — the pull appears stuck. Check Ollama is still running and your internet connection.';
          mainWindow?.webContents.send('models:pull-progress', { name, status: 'error', error: msg });
          resolve({ success: false, error: msg });
        }
      }, 15000);
      response.data.on('end', () => clearInterval(stallCheck));
      response.data.on('error', () => clearInterval(stallCheck));
    });
  } catch (error: any) {
    const friendly = error.code === 'ECONNREFUSED'
      ? "Ollama isn't responding on localhost:11434. Make sure the Ollama app is running (check your system tray)."
      : (error?.response?.data?.error || error.message || 'Pull failed');
    return { success: false, error: friendly };
  }
});

// ── IPC: Delete a model ──────────────────────────────────────────────────
ipcMain.handle('models:delete', async (_e, { name }) => {
  try {
    await axios.delete(`${OLLAMA_BASE}/delete`, { data: { name } });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error?.response?.data?.error || error.message || 'Delete failed' };
  }
});

// ── Recon Tools ───────────────────────────────────────────────────────────
// Every command here runs ONLY when the user explicitly clicks Run against a
// target/file they typed or picked themselves — nothing here is ever
// triggered automatically by the AI. Commands are spawned with an argv array
// (shell: false), never built as a shell string, so a target containing
// shell metacharacters can't inject additional commands.
interface ReconTool {
  id: string;
  label: string;
  category: 'network' | 'file';
  build: (target: string) => { cmd: string; args: string[] };
  note: string;
}

const RECON_TOOLS: ReconTool[] = [
  {
    id: 'nmap-quick', label: 'nmap — quick scan (top 100 ports)', category: 'network',
    build: (t) => ({ cmd: 'nmap', args: ['-F', t] }),
    note: 'Requires nmap installed and on PATH. Only scan hosts you own or have permission to test.'
  },
  {
    id: 'nmap-service', label: 'nmap — service/version detection', category: 'network',
    build: (t) => ({ cmd: 'nmap', args: ['-sV', '-F', t] }),
    note: 'Requires nmap installed and on PATH. Only scan hosts you own or have permission to test.'
  },
  {
    id: 'whois', label: 'whois — domain registration info', category: 'network',
    build: (t) => ({ cmd: 'whois', args: [t] }),
    note: 'Windows: not built in — install via "winget install whois" or use Sysinternals whois.'
  },
  {
    id: 'nslookup', label: 'nslookup — DNS records', category: 'network',
    build: (t) => ({ cmd: 'nslookup', args: [t] }),
    note: 'Built into Windows, macOS, and Linux — should work with no extra install.'
  },
  {
    id: 'curl-headers', label: 'curl -I — HTTP response headers', category: 'network',
    build: (t) => ({ cmd: 'curl', args: ['-I', /^https?:\/\//.test(t) ? t : `https://${t}`] }),
    note: 'Built into Windows 10/11, macOS, and Linux — should work with no extra install.'
  },
  {
    id: 'exiftool', label: 'exiftool — full file metadata', category: 'file',
    build: (f) => ({ cmd: 'exiftool', args: [f] }),
    note: 'Requires exiftool installed and on PATH (exiftool.org).'
  },
  {
    id: 'exiftool-gps', label: 'exiftool — GPS metadata only', category: 'file',
    build: (f) => ({ cmd: 'exiftool', args: ['-GPS*', f] }),
    note: 'Requires exiftool installed and on PATH.'
  },
  {
    id: 'strings', label: 'strings — extract embedded text', category: 'file',
    build: (f) => ({ cmd: 'strings', args: [f] }),
    note: 'Windows: not built in — install via Sysinternals (strings.exe) or use Git Bash / WSL.'
  },
  {
    id: 'identify', label: 'identify — image details (ImageMagick)', category: 'file',
    build: (f) => ({ cmd: 'identify', args: ['-verbose', f] }),
    note: 'Requires ImageMagick installed and on PATH.'
  }
];

ipcMain.handle('recon:tools', async () => RECON_TOOLS.map(({ id, label, category, note }) => ({ id, label, category, note })));

ipcMain.handle('recon:run', async (_e, { toolId, target, runId }) => {
  const tool = RECON_TOOLS.find(t => t.id === toolId);
  if (!tool) return { success: false, error: 'Unknown tool.' };
  if (!target || !target.trim()) return { success: false, error: 'No target/file provided.' };

  const { cmd, args } = tool.build(target.trim());

  return new Promise((resolve) => {
    let proc;
    try {
      proc = spawn(cmd, args, { shell: false });
    } catch (err: any) {
      resolve({ success: false, error: `Couldn't launch "${cmd}": ${err.message}. ${tool.note}` });
      return;
    }

    proc.on('error', (err: any) => {
      // ENOENT = the binary isn't installed / not on PATH — very common here, give the real reason
      const msg = err.code === 'ENOENT'
        ? `"${cmd}" isn't installed or not on PATH. ${tool.note}`
        : err.message;
      mainWindow?.webContents.send('recon:output', { runId, chunk: `\n[error] ${msg}\n`, done: true });
      resolve({ success: false, error: msg });
    });

    proc.stdout.on('data', (chunk: Buffer) => {
      mainWindow?.webContents.send('recon:output', { runId, chunk: chunk.toString(), done: false });
    });
    proc.stderr.on('data', (chunk: Buffer) => {
      mainWindow?.webContents.send('recon:output', { runId, chunk: chunk.toString(), done: false });
    });
    proc.on('close', (code: number) => {
      mainWindow?.webContents.send('recon:output', { runId, chunk: `\n[exit code ${code}]\n`, done: true });
      resolve({ success: true, exitCode: code });
    });
  });
});

// Native hashing needs no external tool at all — works identically on every
// OS with zero install, unlike md5sum/certutil which differ by platform.
ipcMain.handle('recon:hash', async (_e, { filePath }) => {
  try {
    const buf = fs.readFileSync(filePath);
    return {
      success: true,
      md5: crypto.createHash('md5').update(buf).digest('hex'),
      sha1: crypto.createHash('sha1').update(buf).digest('hex'),
      sha256: crypto.createHash('sha256').update(buf).digest('hex'),
      sizeBytes: buf.length
    };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to hash file' };
  }
});
