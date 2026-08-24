const MANIFEST_URL = "/manifest.webmanifest";
const DEFAULT_THEME_COLOR = "#fafafa";

let manifestTemplatePromise = null;
let manifestObjectUrl = null;

export function registerServiceWorker(version) {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;

  const register = () => {
    navigator.serviceWorker.register(`/service-worker.js?v=${encodeURIComponent(version)}`, { scope: "/" }).catch((error) => {
      console.error("Service worker registration failed", error);
    });
    syncPwaTheme().catch((error) => {
      console.error("PWA theme sync failed", error);
    });
  };

  if (document.readyState === "complete") {
    register();
  } else {
    window.addEventListener("load", register, { once: true });
  }
}

export async function syncPwaTheme() {
  if (typeof document === "undefined") return;

  const backgroundColor = getThemeBackgroundColor();
  setThemeColorMeta(backgroundColor);
  await setManifestTheme(backgroundColor);
}

function getThemeBackgroundColor() {
  if (typeof window === "undefined") return DEFAULT_THEME_COLOR;
  const bodyStyles = window.getComputedStyle(document.body);
  const rootStyles = window.getComputedStyle(document.documentElement);
  const color = bodyStyles.getPropertyValue("--background-color") || rootStyles.getPropertyValue("--background-color");
  return (color || DEFAULT_THEME_COLOR).trim() || DEFAULT_THEME_COLOR;
}

function setThemeColorMeta(color) {
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", "theme-color");
    document.head.appendChild(meta);
  }
  meta.setAttribute("content", color);
}

async function setManifestTheme(color) {
  const manifest = await getManifestTemplate();
  if (!manifest) return;

  const updatedManifest = {
    ...manifest,
    theme_color: color,
    background_color: color,
  };

  const link = ensureManifestLink();
  const blob = new Blob([JSON.stringify(updatedManifest)], { type: "application/manifest+json" });

  if (manifestObjectUrl) {
    URL.revokeObjectURL(manifestObjectUrl);
  }
  manifestObjectUrl = URL.createObjectURL(blob);
  link.setAttribute("href", manifestObjectUrl);
}

async function getManifestTemplate() {
  if (!manifestTemplatePromise) {
    manifestTemplatePromise = fetch(MANIFEST_URL, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null);
  }
  return manifestTemplatePromise;
}

function ensureManifestLink() {
  let link = document.querySelector('link[rel="manifest"]');
  if (!link) {
    link = document.createElement("link");
    link.setAttribute("rel", "manifest");
    link.setAttribute("href", MANIFEST_URL);
    document.head.appendChild(link);
  }
  return link;
}