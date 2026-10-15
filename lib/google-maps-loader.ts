"use client";

type MapsNamespace = {
  Map?: unknown;
  Marker?: unknown;
  LatLngBounds?: unknown;
  importLibrary?: (name: string) => Promise<unknown>;
};
let pending: Promise<MapsNamespace> | undefined;

// An async script's load event can precede Maps library initialisation.
// Share one loader across maps and wait for the API callback and libraries.
export function loadGoogleMaps<T>(apiKey: string): Promise<T> {
  if (!pending) {
    pending = initialise(apiKey).catch((error) => {
      pending = undefined;
      throw error;
    });
  }
  return pending as Promise<T>;
}

async function initialise(apiKey: string): Promise<MapsNamespace> {
  const browser = window as Window & { google?: { maps?: MapsNamespace }; aocMapsReady?: () => void };
  if (!browser.google?.maps?.importLibrary) {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      const timeout = window.setTimeout(() => finish(new Error("Google Maps timed out. Please try again.")), 20000);
      function finish(error?: Error) {
        window.clearTimeout(timeout);
        delete browser.aocMapsReady;
        if (error) { script.remove(); reject(error); } else resolve();
      }
      browser.aocMapsReady = () => finish();
      script.id = "aoc-google-maps-script";
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&loading=async&callback=aocMapsReady&v=weekly`;
      script.async = true;
      script.onerror = () => finish(new Error("Google Maps could not load. Location sharing can still continue."));
      document.head.appendChild(script);
    });
  }
  const maps = browser.google?.maps;
  if (!maps?.importLibrary) throw new Error("Google Maps is unavailable. Please try again.");
  await Promise.all([maps.importLibrary("core"), maps.importLibrary("maps"), maps.importLibrary("marker")]);
  if ([maps.Map, maps.Marker, maps.LatLngBounds].some((constructor) => typeof constructor !== "function")) {
    throw new Error("Google Maps did not initialise correctly. Please try again.");
  }
  return maps;
}
