import { app, Tray, Menu, Notification } from "electron";
import { autoUpdater } from "electron-updater";
import si from "systeminformation";
import path from "path";

app.on("window-all-closed", () => {
  // keep running as tray-only app on all platforms
});

app.whenReady().then(async () => {
  app.dock?.hide();

  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, "icon.png")
    : path.join(__dirname, "../resources/icon.png");
  const tray = new Tray(iconPath);
  tray.setTitle("…");
  tray.setToolTip("OS Monitor");

  type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'uptodate' | 'error';
  let updateStatus: UpdateStatus = 'idle';
  autoUpdater.on('checking-for-update',  () => { updateStatus = 'checking'; });
  autoUpdater.on('update-available',     () => { updateStatus = 'available'; });
  autoUpdater.on('download-progress',    () => { updateStatus = 'downloading'; });
  autoUpdater.on('update-not-available', () => {
    updateStatus = 'uptodate';
    new Notification({ title: 'OS Monitor', body: "You're up to date." }).show();
    setTimeout(() => { if (updateStatus === 'uptodate') updateStatus = 'idle'; }, 5000);
  });
  autoUpdater.on('update-downloaded', () => {
    updateStatus = 'ready';
    new Notification({ title: 'OS Monitor', body: 'Update downloaded — open the menu to restart.' }).show();
  });
  autoUpdater.on('error', (_e, message) => {
    updateStatus = 'error';
    new Notification({ title: 'OS Monitor', body: `Update check failed: ${message ?? 'unknown error'}` }).show();
    setTimeout(() => { if (updateStatus === 'error') updateStatus = 'idle'; }, 5000);
  });
  autoUpdater.checkForUpdates().catch(() => {});

  const [cpu, graphics, defaultIfaceName, defaultIfaceInfo, publicIpText] = await Promise.all([
    si.cpu(),
    si.graphics(),
    si.networkInterfaceDefault(),
    si.networkInterfaces('default'),
    fetch('https://api.ipify.org').then((r) => r.text()).catch(() => null),
  ]);
  const cores = cpu.cores;
  const gpuController = graphics.controllers[0] ?? null;
  const gpuAvailable = gpuController !== null;
  const gpuModel = gpuController?.model ?? "";
  const netPrivateIp = (defaultIfaceInfo as any)?.ip4 ?? null;
  const netPublicIp = publicIpText?.trim() ?? null;

  function cpuBar(pct: number): string {
    const filled = Math.round(pct / 100 * 20);
    return "◼".repeat(filled) + "◻".repeat(20 - filled);
  }

  function levelEmoji(n: number): string {
    return n >= 80 ? "🔴" : n >= 50 ? "🟡" : "🟢";
  }

  function ioEmoji(mbps: number): string {
    return mbps >= 100 ? "🔴" : mbps >= 10 ? "🟡" : "🟢";
  }

  function netEmoji(kbps: number): string {
    return kbps >= 10000 ? "🔴" : kbps >= 1000 ? "🟡" : "🟢";
  }

  function pingEmoji(ms: number): string {
    return ms >= 150 ? "🔴" : ms >= 50 ? "🟡" : "🟢";
  }

  function updateMenuItem(): Electron.MenuItemConstructorOptions {
    switch (updateStatus) {
      case 'checking':    return { label: 'Checking for updates…', enabled: false };
      case 'available':   return { label: 'Downloading update…', enabled: false };
      case 'downloading': return { label: 'Downloading update…', enabled: false };
      case 'ready':       return { label: 'Restart to install update', click: () => autoUpdater.quitAndInstall() };
      case 'uptodate':    return { label: 'Up to date', enabled: false };
      case 'error':       return { label: 'Update check failed — retry', click: () => { updateStatus = 'idle'; autoUpdater.checkForUpdates().catch(() => {}); } };
      default:            return { label: 'Check for Updates', click: () => autoUpdater.checkForUpdates().catch(() => {}) };
    }
  }

  async function update() {
    const [load, mem, temp, gpuGraphics, fsSizes, fsStats, netStats] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.cpuTemperature(),
      gpuAvailable ? si.graphics() : Promise.resolve(null),
      si.fsSize(),
      si.fsStats(),
      si.networkStats(defaultIfaceName),
    ]);
    const pingMs = lastPingMs;

    const cpuUsage = Math.round(load.currentLoad * 10) / 10;
    const cpuHot = cpuUsage >= 80;
    const cpuTemp = temp.main !== null ? `${Math.round(temp.main)}°C` : null;

    const ramUsedGB = (mem.active / 1024 ** 3).toFixed(1);
    const ramTotalGB = (mem.total / 1024 ** 3).toFixed(1);
    const ramPct = Math.round((mem.active / mem.total) * 100);
    const ramHot = ramPct >= 80;

    const gpuCtrl = gpuGraphics?.controllers[0] ?? undefined;
    const gpuUsage = gpuCtrl?.utilizationGpu ?? null;
    const gpuMemUsed = gpuCtrl?.memoryUsed != null
      ? (gpuCtrl.memoryUsed / 1024 ** 3).toFixed(1)
      : null;
    const gpuMemTotal = gpuCtrl?.memoryTotal != null
      ? (gpuCtrl.memoryTotal / 1024 ** 3).toFixed(1)
      : null;
    const gpuHot = gpuUsage != null && gpuUsage >= 80;

    const gpuPart = gpuUsage != null
      ? ` · GPU:${gpuUsage}%${gpuHot ? "⚠" : ""}`
      : "";

    const rootFs =
      fsSizes.find((f) => f.mount === "/System/Volumes/Data") ??
      fsSizes.find((f) => f.mount === "/") ??
      fsSizes.find((f) => /^[A-Za-z]:[/\\]?$/.test(f.mount)) ??
      fsSizes.sort((a, b) => b.size - a.size)[0] ??
      null;
    const diskUsedGB  = rootFs ? (rootFs.used / 1024 ** 3).toFixed(1) : null;
    const diskTotalGB = rootFs ? (rootFs.size / 1024 ** 3).toFixed(1) : null;
    const diskPct     = rootFs ? Math.round(rootFs.use) : null;
    const diskHot     = diskPct != null && diskPct >= 90;
    const readMBs  = fsStats.rx_sec != null ? (fsStats.rx_sec  / 1024 ** 2).toFixed(1) : null;
    const writeMBs = fsStats.wx_sec != null ? (fsStats.wx_sec  / 1024 ** 2).toFixed(1) : null;

    const net = netStats[0] ?? null;
    const netRxKBs = net?.rx_sec != null ? (net.rx_sec / 1024).toFixed(1) : null;
    const netTxKBs = net?.tx_sec != null ? (net.tx_sec / 1024).toFixed(1) : null;
    const ping = pingMs > 0 ? `${Math.round(pingMs)} ms` : null;

    const diskPart = diskPct != null
      ? ` · Dsk:${diskPct}%${diskHot ? "⚠" : ""}`
      : "";
    const titleText = `${cpuUsage}%${cpuHot ? "⚠" : ""} · ${ramUsedGB}G${ramHot ? "⚠" : ""}${gpuPart}${diskPart}`;
    tray.setTitle(titleText);      // macOS only — shows in menu bar
    tray.setToolTip(titleText);    // all platforms — visible on hover

    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: `CPU · ${cpu.brand} · ${cores} cores`, enabled: false },
        { label: `  ${levelEmoji(cpuUsage)} ${cpuBar(cpuUsage)}  ${cpuUsage}%`, enabled: false },
        ...(cpuTemp ? [{ label: `  ${levelEmoji(temp.main!)} Temp: ${cpuTemp}`, enabled: false }] : []),
        { type: "separator" },
        { label: `RAM · ${ramUsedGB} / ${ramTotalGB} GB`, enabled: false },
        { label: `  ${levelEmoji(ramPct)} ${cpuBar(ramPct)}  ${ramPct}%`, enabled: false },
        ...(gpuAvailable
          ? [
              { type: "separator" as const },
              { label: "GPU", enabled: false },
              { label: `  Model: ${gpuModel}`, enabled: false },
              ...(gpuUsage != null
                ? [{ label: `  Usage: ${gpuUsage}%`, enabled: false }]
                : []),
              ...(gpuMemUsed && gpuMemTotal
                ? [{ label: `  VRAM:  ${gpuMemUsed} / ${gpuMemTotal} GB`, enabled: false }]
                : []),
            ]
          : []),
        ...(diskPct != null
          ? [
              { type: "separator" as const },
              { label: `Disk · ${diskUsedGB} / ${diskTotalGB} GB`, enabled: false },
              { label: `  ${levelEmoji(diskPct)} ${cpuBar(diskPct)}  ${diskPct}%`, enabled: false },
              ...(readMBs != null && writeMBs != null
                ? [{ label: `  ${ioEmoji(parseFloat(readMBs))} R: ${readMBs} MB/s  ${ioEmoji(parseFloat(writeMBs))} W: ${writeMBs} MB/s`, enabled: false }]
                : []),
            ]
          : []),
        ...(net != null
          ? [
              { type: "separator" as const },
              { label: "Network", enabled: false },
              { label: `  Interface: ${defaultIfaceName}`, enabled: false },
              ...(netPrivateIp ? [{ label: `  Private: ${netPrivateIp}`, enabled: false }] : []),
              ...(netPublicIp ? [{ label: `  Public:  ${netPublicIp}`, enabled: false }] : []),
              ...(netRxKBs != null && netTxKBs != null
                ? [{ label: `  ${netEmoji(parseFloat(netRxKBs))} ↓ ${netRxKBs} KB/s  ${netEmoji(parseFloat(netTxKBs))} ↑ ${netTxKBs} KB/s`, enabled: false }]
                : []),
              ...(ping != null ? [{ label: `  ${pingEmoji(pingMs)} Ping: ${ping}`, enabled: false }] : []),
            ]
          : []),
        { type: "separator" as const },
        updateMenuItem(),
        { type: "separator" as const },
        { label: "Quit", role: "quit" },
      ])
    );
  }

  let lastPingMs: number = -1;
  const refreshPing = () => si.inetLatency().then(ms => { lastPingMs = ms; }).catch(() => {});
  refreshPing();
  setInterval(refreshPing, 2000);

  await update();
  setInterval(update, 2000);

  tray.on("click", () => tray.popUpContextMenu());
}).catch((err) => {
  console.error("Fatal init error:", err);
  app.quit();
});
