# VoiceStudio

Open-source, fully local voice engine (github.com/debpalash/VoiceStudio, AGPL-3.0): text to speech, voice cloning, transcription in 646 languages. Runs as a desktop app on the PC, with a local API on port 3900.

Used as an optional voice for Jarvis in [[Brain Graph]]: pick "VoiceStudio (your PC)" in the Voice list and enter the address. If the PC is off, Jarvis falls back to the Cloudflare and device voices.

- Speaks through `/v1/audio/speech` and can transcribe through `/v1/audio/transcriptions` (OpenAI-compatible).
- Settings stay in the browser only; nothing about it is stored in this repo.
- The page runs on GitHub Pages, so VoiceStudio must allow that origin (setup in the repo README).
- Clone only voices you have permission to use.
