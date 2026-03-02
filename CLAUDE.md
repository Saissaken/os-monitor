# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun install          # install dependencies
bun run build        # bundle src/main.ts → dist/main.js
bun run start        # launch with electron .
```

The build script has a single entry point:
- `src/main.ts` → `dist/main.js` (CJS, node target, electron + macos-temperature-sensor external)

There are no tests and no linter configured.

## Architecture

This is an Electron menu bar app. Bun is used only as a build/bundler tool — Electron runs the app using its own bundled Node.js.

No popup window, no renderer, no preload script, no IPC. Everything runs in the main process.

**How it works:**
- `app.dock?.hide()` suppresses the Dock icon on macOS.
- A `Tray` is created with `resources/icon.png` (22×22px).
- `Tray.setTitle()` displays the live CPU usage (e.g. `"45.2%"` or `"45.2% ⚠"` at ≥80%).
- Clicking the tray icon opens a native context menu showing CPU (usage, temp, cores), RAM, GPU (if available), and Quit.

**Polling (every 2s):** `si.currentLoad()`, `si.mem()`, `si.cpuTemperature()`, `si.graphics()`

**Static info (once at startup):** `si.cpu()`, `si.graphics()`

**CPU temperature:** requires `macos-temperature-sensor` on Apple Silicon. Listed in `trustedDependencies` and passed as `--external` in the bun build.

**Icon:** `resources/icon.png` must be 22×22px for the macOS menu bar tray.

## Git

Do not include Claude or co-author attributions in commit messages.
