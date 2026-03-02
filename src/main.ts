import { app, Tray, Menu } from "electron";
import si from "systeminformation";
import path from "path";

app.whenReady().then(async () => {
  app.dock?.hide();

  const tray = new Tray(path.join(__dirname, "../resources/icon.png"));
  tray.setTitle("…");

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

    const rootFs = fsSizes.find((f) => f.mount === "/")
      ?? fsSizes.sort((a, b) => b.size - a.size)[0]
      ?? null;
    const diskUsedGB  = rootFs ? (rootFs.used / 1024 ** 3).toFixed(1) : null;
    const diskTotalGB = rootFs ? (rootFs.size / 1024 ** 3).toFixed(1) : null;
    const diskPct     = rootFs ? Math.round(rootFs.use) : null;
    const diskHot     = diskPct != null && diskPct >= 90;
    const readMBs  = fsStats.rx_sec != null ? (fsStats.rx_sec  / 1024 ** 2).toFixed(1) : null;
    const writeMBs = fsStats.wx_sec != null ? (fsStats.wx_sec  / 1024 ** 2).toFixed(1) : null;

    const net = netStats[0] ?? null;
    const netRxKBs = net?.rx_sec != null ? (net.rx_sec / 1024).toFixed(1) : null;
    const netTxKBs = net?.tx_sec != null ? (net.tx_sec / 1024).toFixed(1) : null;

    const diskPart = diskPct != null
      ? ` · Dsk:${diskPct}%${diskHot ? "⚠" : ""}`
      : "";
    tray.setTitle(
      `${cpuUsage}%${cpuHot ? "⚠" : ""} · ${ramUsedGB}G${ramHot ? "⚠" : ""}${gpuPart}${diskPart}`
    );

    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "CPU", enabled: false },
        { label: `  Usage: ${cpuUsage}%`, enabled: false },
        ...(cpuTemp ? [{ label: `  Temp:  ${cpuTemp}`, enabled: false }] : []),
        { label: `  Cores: ${cores}`, enabled: false },
        { type: "separator" },
        { label: "RAM", enabled: false },
        { label: `  Used:  ${ramUsedGB} / ${ramTotalGB} GB`, enabled: false },
        { label: `  Usage: ${ramPct}%`, enabled: false },
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
              { label: "Disk", enabled: false },
              { label: `  Space: ${diskUsedGB} / ${diskTotalGB} GB`, enabled: false },
              { label: `  Usage: ${diskPct}%`, enabled: false },
              ...(readMBs != null && writeMBs != null
                ? [{ label: `  R: ${readMBs} MB/s  W: ${writeMBs} MB/s`, enabled: false }]
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
                ? [{ label: `  ↓ ${netRxKBs} KB/s  ↑ ${netTxKBs} KB/s`, enabled: false }]
                : []),
            ]
          : []),
        { type: "separator" as const },
        { label: "Quit", role: "quit" },
      ])
    );
  }

  await update();
  setInterval(update, 2000);

  tray.on("click", () => tray.popUpContextMenu());
});
