// Capture installation before the application hydrates. Never persist the event.
(() => {
  if (window.__aocInstall) return;
  const state = window.__aocInstall = { prompt: null, installed: false };
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.prompt = event;
    window.dispatchEvent(new Event("aoc-install-ready"));
  });
  window.addEventListener("appinstalled", () => {
    state.prompt = null;
    state.installed = true;
    window.dispatchEvent(new Event("aoc-install-ready"));
  });
})();
