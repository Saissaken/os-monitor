# os-monitor

Lightweight system tray monitor for macOS, Windows, and Linux.

## What it shows

**Tray title** updates every 2 seconds:

```
45.2% · 8.5G · GPU:25% · Dsk:62%
```

A `⚠` warning indicator appears next to any value that exceeds its threshold (CPU/RAM/GPU ≥ 80%, Disk ≥ 90%).

**Context menu** (click the tray title to open):

| Section | Fields |
|---|---|
| CPU | Usage %, Temperature (if available), Core count |
| RAM | Used / Total GB, Usage % |
| GPU | Model, Usage %, VRAM used / total (if available) |
| Disk | Space used / total GB, Usage %, Read/Write MB/s |

Sections are omitted when data is unavailable (e.g. GPU on machines without a discrete controller).

## Requirements

- macOS, Windows, or Linux
- [Bun](https://bun.sh) — build tool only

## Setup

```bash
bun install
bun run build
bun run start
```

## Development

```bash
bun run dev   # watch build + auto-restart via nodemon
```

## Architecture

Single-process Electron app — no renderer or preload script. `src/main.ts` is the only entry point. It creates a native `Tray`, polls system metrics every 2 seconds, and updates the tray title and context menu in place.

| Dependency | Role |
|---|---|
| `electron` | Tray widget, native menus |
| `systeminformation` | CPU load, RAM, GPU, temperature, disk |
| `macos-temperature-sensor` | Native sensor module required for CPU temp on Apple Silicon |
| `bun` | Bundler only — runtime is Electron's bundled Node.js |

## Notes

- `macos-temperature-sensor` is a native module built via node-gyp. Bun runs its postinstall script automatically because it is listed in `trustedDependencies`. The temperature row is omitted from the context menu when the sensor is unavailable.
- The tray icon must be 22×22 px (`resources/icon.png`).
- The Dock icon is hidden on macOS (`app.dock?.hide()`).
