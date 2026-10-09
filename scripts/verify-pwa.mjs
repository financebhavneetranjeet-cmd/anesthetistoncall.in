import { readFileSync, existsSync } from "node:fs";

const manifest = JSON.parse(readFileSync("public/manifest.webmanifest", "utf8"));
for (const key of ["name", "short_name", "start_url", "scope", "display", "theme_color", "background_color", "icons"]) {
  if (!manifest[key]) throw new Error(`PWA manifest is missing ${key}`);
}
if (manifest.display !== "standalone") throw new Error("PWA must use standalone display mode");
if (manifest.id !== "/" || manifest.start_url !== "/" || manifest.scope !== "/") throw new Error("PWA identity and scope must remain at the origin root");
for (const size of ["192x192", "512x512"]) {
  if (!manifest.icons.some(icon => icon.sizes === size && (icon.purpose || "any").split(" ").includes("any"))) throw new Error(`Missing general-purpose ${size} icon`);
}
if (!manifest.icons.some(icon => icon.purpose === "maskable")) throw new Error("Missing maskable icon");
for (const icon of manifest.icons) {
  if (!existsSync(`public${icon.src}`)) throw new Error(`Missing icon: ${icon.src}`);
  const png = readFileSync(`public${icon.src}`);
  if (png.subarray(1, 4).toString() !== "PNG" || `${png.readUInt32BE(16)}x${png.readUInt32BE(20)}` !== icon.sizes) throw new Error(`Incorrect PNG dimensions: ${icon.src}`);
}

const worker = readFileSync("public/sw.js", "utf8");
const cachedAssets = worker.slice(worker.indexOf("const PUBLIC_ASSETS"), worker.indexOf("];", worker.indexOf("const PUBLIC_ASSETS")) + 2);
for (const forbidden of ["/api/", "dashboard", "notification", "session", "token", "otp"]) {
  if (cachedAssets.toLowerCase().includes(`\"${forbidden}`)) throw new Error(`Service-worker cache must not include ${forbidden}`);
}
if (!worker.includes('request.mode === "navigate"') || !worker.includes('fetch(request, { cache: "no-store" }).catch')) throw new Error("Navigation must be network-first/no-store with an offline fallback");
if (!worker.includes('event.data?.type === "SKIP_WAITING"') || worker.includes("install\", (event) => {\n  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PUBLIC_ASSETS)));\n  self.skipWaiting()")) throw new Error("Service worker activation must require an explicit update action");
if (!worker.includes("key.startsWith(CACHE_PREFIX)")) throw new Error("Service worker must delete only outdated app-shell caches");

const layout = readFileSync("app/layout.tsx", "utf8");
if (!layout.includes('manifest: "/manifest.webmanifest"') || !layout.includes("appleWebApp")) throw new Error("PWA metadata is incomplete");
if (!layout.includes("<PwaUpdate />")) throw new Error("PWA update coordinator is not mounted");
if (!layout.includes("<NotificationPermission />")) throw new Error("PWA notification permission coordinator is not mounted");
const permission = readFileSync("components/pwa/notification-permission.tsx", "utf8");
for (const marker of ["Allow notifications for this site", "Allow Notifications", "Notification.requestPermission()", "pushManager.subscribe", "Enable in Settings", "isCriticalFlow()"])
  if (!permission.includes(marker)) throw new Error(`Notification permission flow is missing ${marker}`);
const installer = readFileSync("components/pwa/pwa-install.tsx", "utf8");
for (const marker of ["WhatsApp", "data-ios-install-actions", "data-ios-safari-install-guide", "Tap the Share button → Add to Home Screen → Add.", "if (ios) { setOpen(true); return; }", "Open in Safari", "Copy Link"])
  if (!installer.includes(marker)) throw new Error(`iPhone install fallback is missing ${marker}`);
const release = readFileSync("lib/release.ts", "utf8");
if (!release.includes("RELEASES") || !release.includes('version: "1.4"') || !release.includes('name: "Multi-Role Accounts"')) throw new Error("Central release metadata is incomplete");
const currentVersion = [...release.matchAll(/version:\s*"([^"]+)"/g)].at(-1)?.[1];
if (!currentVersion || !worker.includes(`const CACHE_NAME = \`\${CACHE_PREFIX}${currentVersion}\`;`)) throw new Error("Service-worker cache version must match the central current release");
for (const marker of ["registration.update()", "waitForWaiting(registration)", 'postMessage({ type: "SKIP_WAITING" })', 'addEventListener("controllerchange"', "aoc-update-in-progress", "navigator.onLine"])
  if (!readFileSync("components/pwa/pwa-update.tsx", "utf8").includes(marker)) throw new Error(`PWA update lifecycle is missing ${marker}`);
console.log("PWA static safety checks passed.");
