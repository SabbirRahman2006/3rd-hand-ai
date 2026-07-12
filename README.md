# 3rd Hand AI

A fully local, offline-first AI desktop workspace for developers and security learners — chat, notes, tasks, and real recon tooling, running entirely on your own machine through [Ollama](https://ollama.com). No API keys. No subscriptions. No cloud. Nothing leaves your computer.

![status](https://img.shields.io/badge/status-active-brightgreen) ![platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue) ![license](https://img.shields.io/badge/local--first-100%25-purple)

---
<img width="1263" height="641" alt="image" src="https://github.com/user-attachments/assets/2505781d-f801-4ef3-860c-7136f831a1cc" />
<img width="901" height="464" alt="image" src="https://github.com/user-attachments/assets/2b97cc4f-f716-4ede-9530-d4be3addb695" />
<img width="216" height="168" alt="image" src="https://github.com/user-attachments/assets/54819af7-0653-469c-8464-a5c9c0a161c5" />


## Why this exists

Most AI chat apps either send your data to a server or lock features behind a subscription. 3rd Hand AI does neither — it's a thin, fast desktop shell around your own local Ollama models, built for people who actually want to *own* their tools: students, self-taught engineers, and security learners who want an AI that runs on their hardware, remembers what they tell it to remember, and doesn't phone home.

## Features

- **Four focused modes** — Chatty, Planner, Coder, and Hacker. Each mode is a distinct, carefully-written system prompt, not a re-skinned label. Coder mode fixes your actual bug instead of rewriting your style. Hacker mode is a grounded practitioner, not a cyberpunk character.
- **Real Recon Tools panel** — run `nmap`, `whois`, `nslookup`, and `curl -I` against a target you type, and `exiftool`, `strings`, and `identify` against a file you pick. Output streams back live. File hashing (MD5/SHA1/SHA256) works out of the box with zero external tools, built entirely on Node's crypto module.
- **Streaming chat** — tokens appear as they generate, not after a long wait.
- **Consent-based memory** — the AI can flag something worth remembering, but nothing is saved until you click Save. You can see and edit everything it remembers.
- **Edit & resend** — fix a typo in your last message and regenerate, like any modern chat UI.
- **Voice in and out** — dictate with your mic, hear replies read back, both using your OS's built-in capabilities. No API key, no cost.
- **Multi-language** — auto-detects or force a response language (English, Bangla, German, Arabic, French, Spanish, Hindi, Urdu).
- **Real date/time awareness** — the model is told the actual current date/time from your system clock every message, so it doesn't hallucinate a date from its training cutoff.
- **Notes & Tasks** — lightweight, stored locally, always available alongside chat.
- **Model-aware** — auto-detects what's installed in Ollama, recommends the right model per mode, warns you clearly if Ollama isn't reachable instead of failing silently.

## Screenshots

*(add a few screenshots here before publishing — Chat view, Recon Tools panel, and Settings look best)*

## Requirements

- [Ollama](https://ollama.com) installed and running (handles all AI inference locally)
- Windows 10/11, macOS, or Linux
- At least one Ollama model pulled (the app can pull one for you from Settings — no terminal needed)

**Recon Tools** (optional, only needed if you use that panel):
- `nmap` — [nmap.org](https://nmap.org/download.html)
- `whois` — `winget install whois` (Windows) or pre-installed (macOS/Linux)
- `exiftool` — [exiftool.org](https://exiftool.org)
- `identify` — part of [ImageMagick](https://imagemagick.org)
- `nslookup` and `curl` — already built into Windows 10/11, macOS, and Linux

## Installation

**From a release build:**
Download the installer from [Releases](../../releases) and run it. That's it.

**From source:**
```bash
git clone https://github.com/SabbirRahman2006/3rd-hand-ai.git
cd 3rd-hand-ai
npm install
npm run dist
```
The installer will be in `release/`.

## Quick start

1. Install and open [Ollama](https://ollama.com)
2. Launch 3rd Hand AI
3. Go to **Settings**, pull a model (Llama 3 8B or Phi-3 Mini for lighter hardware)
4. Pick a mode, start chatting
5. Try the **Recon Tools** tab for real nmap/whois/exiftool output, or **Notes/Tasks** for everyday use

## Architecture

Electron + React + TypeScript, talking to Ollama's local HTTP API (`localhost:11434`). All state — chat history, notes, tasks, memory, settings — is stored as JSON on disk, written atomically so a crash mid-save can't corrupt anything. No network calls except to Ollama itself and, optionally, whatever recon target you type in.

## Responsible use

Recon Tools runs real commands. Only point them at systems you own or have explicit permission to test — same rule as using `nmap` directly. Nothing in this app runs automatically; every scan requires you to type a target and click a button.

## Credits

Built by **[Sabbir Rahman](https://github.com/SabbirRahman2006)**.

## License

MIT
