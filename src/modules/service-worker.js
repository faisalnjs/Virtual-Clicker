const DEFAULT_THEME_COLOR = "#fafafa";

export function registerServiceWorker(version) {
  if (!("serviceWorker" in navigator) || !window.isSecureContext) return;

  const register = () => {
    navigator.serviceWorker.register(`/service-worker.js?v=${encodeURIComponent(version)}${import.meta.env.DEV ? "&dev=1" : ""}`, { scope: "/" }).catch((error) => {
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

