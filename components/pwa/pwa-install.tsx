"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Download, ExternalLink, Share, X } from "lucide-react";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

declare global {
  interface Window {
    __aocInstall?: { prompt: InstallPromptEvent | null; installed: boolean };
  }
}

function isStandalone() {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

function isIosDevice() {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isInAppBrowser() {
  if (typeof navigator === "undefined") return false;
  const userAgent = navigator.userAgent;
  const knownInApp = /ChatGPT|WhatsApp|FBAN|FBAV|Instagram|Line\/|LinkedInApp|MicroMessenger|GSA\/|Twitter/i.test(userAgent);
  const iosNonSafari = isIosDevice() && !/Version\/[\d.]+.*Safari/i.test(userAgent);
  return knownInApp || iosNonSafari || /; wv\)|\bwv\b/i.test(userAgent);
}

function isIosSafari() {
  if (typeof navigator === "undefined") return false;
  return isIosDevice() && /Version\/[\d.]+.*Safari/i.test(navigator.userAgent) && !isInAppBrowser();
}

export function PwaInstall() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [open, setOpen] = useState(false);
  const [installed, setInstalled] = useState(true);
  const [inAppBrowser, setInAppBrowser] = useState(false);
  const [iosSafari, setIosSafari] = useState(false);
  const [copied, setCopied] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [workerError, setWorkerError] = useState(false);
  const [fallback, setFallback] = useState("");
  const inFlight = useRef(false);
  

  useEffect(() => {
    const initialise = window.requestAnimationFrame(() => {
      setMobile(/Android/i.test(navigator.userAgent) || isIosDevice() || window.matchMedia("(max-width: 639px), (pointer: coarse)").matches);
      setIos(isIosDevice());
      setInAppBrowser(isInAppBrowser());
      setIosSafari(isIosSafari());
      setInstalled(isStandalone() || Boolean(window.__aocInstall?.installed));
      setPrompt(window.__aocInstall?.prompt ?? null);
    });
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch((error) => {
        console.error("PWA service-worker registration failed", error);
        setWorkerError(true);
      });
    }

    const syncEarlyPrompt = () => {
      setPrompt(window.__aocInstall?.prompt ?? null);
      if (window.__aocInstall?.prompt) setFallback("");
      if (window.__aocInstall?.installed) { setInstalled(true); setOpen(false); }
    };
    syncEarlyPrompt();
    let active = true;
    const displayMode = window.matchMedia("(display-mode: standalone)");
    const syncDisplayMode = () => { if (isStandalone()) { setInstalled(true); setOpen(false); } };
    displayMode.addEventListener("change", syncDisplayMode);
    const relatedNavigator = navigator as Navigator & { getInstalledRelatedApps?: () => Promise<Array<{ platform: string; url?: string }>> };
    if (!isIosDevice() && relatedNavigator.getInstalledRelatedApps) {
      void relatedNavigator.getInstalledRelatedApps().then((apps) => {
        const manifestUrl = new URL("/manifest.webmanifest", window.location.origin).href;
        if (active && apps.some((app) => app.platform === "webapp" && app.url && new URL(app.url, window.location.origin).href === manifestUrl)) {
          if (window.__aocInstall) { window.__aocInstall.installed = true; window.__aocInstall.prompt = null; }
          setInstalled(true); setPrompt(null); setFallback("");
        }
      }).catch(() => { /* Installed-app detection is optional on older browsers. */ });
    }
    window.addEventListener("aoc-install-ready", syncEarlyPrompt);
    return () => {
      active = false;
      displayMode.removeEventListener("change", syncDisplayMode);
      window.cancelAnimationFrame(initialise);
      window.removeEventListener("aoc-install-ready", syncEarlyPrompt);
    };
  }, []);

  if (!mobile || installed) return null;

  async function install() {
    // iOS Safari does not expose beforeinstallprompt. Always show Apple's
    // supported Share -> Add to Home Screen instructions instead.
    if (ios) { setOpen(true); return; }
    if (inFlight.current || isStandalone() || window.__aocInstall?.installed) return;
    // Use the bootstrap store only: React state can still hold a consumed event.
    const availablePrompt = window.__aocInstall?.prompt;
    if (!availablePrompt) {
      setFallback(inAppBrowser ? "Open this link in Android Chrome to install." : workerError ? "App setup could not finish. Check your connection and reopen Chrome." : "Chrome has not offered installation in this tab. If already installed, open the app from your home screen.");
      return;
    }
    inFlight.current = true;
    // Consume before invoking: a prompt is single-use, including dismissal.
    if (window.__aocInstall) window.__aocInstall.prompt = null;
    setPrompt(null);
    setFallback("");
    setOpen(false);
    setInstalling(true);
    try {
      // Retain user activation: no asynchronous work before this call.
      await availablePrompt.prompt();
      const choice = await availablePrompt.userChoice;
      // The appinstalled event is the authoritative confirmation of installation.
      if (choice.outcome === "accepted") setOpen(false);
    } catch {
      setFallback("Chrome could not open installation. Try again when installation becomes available.");
    } finally {
      inFlight.current = false;
      setInstalling(false);
      // Preserve a fresh event emitted while the previous userChoice resolved.
      setPrompt(window.__aocInstall?.prompt ?? null);
    }
  }

  async function copyInstallLink() {
    const url = `${window.location.origin}${window.location.pathname}${window.location.search}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const input = document.createElement("textarea");
      input.value = url;
      input.setAttribute("readonly", "");
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      input.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2500);
  }

  return <>
    <div className="flex flex-col items-end gap-3 bg-slate-50 px-4 pt-4 pb-[calc(6rem+env(safe-area-inset-bottom))]">
    <button type="button" onClick={() => void install()} disabled={installing} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#0b3159] px-4 py-2 text-sm font-bold text-white shadow-lg ring-1 ring-white/30 disabled:opacity-60" aria-haspopup={ios ? "dialog" : undefined}>
      <Download className="size-4" aria-hidden="true" /> {installing ? "Opening…" : "Install App"}
    </button>
    {!ios && fallback && <p role="status" aria-live="polite" className="max-w-xs rounded-lg bg-white p-3 text-sm text-slate-700 shadow-lg">{fallback}</p>}
    </div>
    {ios && open && <div className="fixed inset-0 z-[70] grid place-items-end bg-slate-950/50 p-3 sm:place-items-center" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="install-title" className="w-full max-w-md rounded-2xl bg-white p-5 text-slate-950 shadow-2xl">
        <div className="flex items-start justify-between gap-4"><div><h2 id="install-title" className="text-xl font-bold">Install Anesthetist on Call</h2><p className="mt-1 text-sm leading-6 text-slate-600">{ios ? "On iPhone or iPad, use Safari’s Add to Home Screen option." : prompt ? "Install the app on your home screen." : "Installation is not available directly in this browser right now."}</p></div><button type="button" onClick={() => setOpen(false)} className="grid size-11 shrink-0 place-items-center rounded-full hover:bg-slate-100" aria-label="Close install instructions"><X className="size-5" /></button></div>
        {ios ? <>
          {iosSafari ? <div className="mt-5 rounded-xl bg-blue-50 p-4 text-center text-base font-semibold leading-7 text-blue-950" data-ios-safari-install-guide>
            Tap the Share button → Add to Home Screen → Add.
          </div> : <div className="mt-5 space-y-3" data-ios-install-actions>
            <a href={typeof window === "undefined" ? "https://anesthetistoncall.in/" : window.location.href} target="_blank" rel="noopener noreferrer" className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0b3159] px-4 py-3 text-sm font-bold text-white shadow-sm">
              <ExternalLink className="size-5" aria-hidden="true" /> Open in Safari
            </a>
            <button type="button" onClick={() => void copyInstallLink()} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-900">
              {copied ? <Check className="size-5 text-emerald-600" aria-hidden="true" /> : <Copy className="size-5" aria-hidden="true" />}{copied ? "Link copied" : "Copy Link"}
            </button>
            <p role="status" aria-live="polite" className="text-center text-sm leading-5 text-slate-600">{inAppBrowser ? "If Safari does not open, copy the link, open Safari, and paste it in the address bar." : "If you are already in Safari, continue with the Share steps below. Otherwise copy the link and paste it into Safari."}</p>
          </div>}
          {!iosSafari && <ol className="mt-5 space-y-3 rounded-xl bg-blue-50 p-4 text-sm font-semibold text-blue-950"><li className="flex gap-3"><Share className="size-5 shrink-0" />1. Open this page in Safari, then tap Share.</li><li>2. Tap Add to Home Screen.</li><li>3. Tap Add.</li></ol>}
        </> : null}
      </section>
    </div>}
  </>;
}
