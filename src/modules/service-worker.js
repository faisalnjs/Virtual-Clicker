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


export async function notifySuggestionResponses(count, seatCode) {
  if (localStorage.getItem("suggestion-notifications-disabled") === "true") return false;
  if (!count || !window.isSecureContext || !("Notification" in window) || !("serviceWorker" in navigator) || (Notification.permission !== "granted")) return false;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration?.active || (typeof registration.showNotification !== "function")) return false;
  if (await registration.pushManager?.getSubscription()) return true;
  await registration.showNotification("Reply to suggestion", {
    body: `${count} suggestion${count === 1 ? ' has' : 's have'} a new reply. Open My Suggestions to read it.`,
    icon: "/banner-meta.png", badge: "/favicon.ico",
    tag: `suggestion-responses-${seatCode}`,
    data: { url: "/#suggestions", type: "suggestions" },
  });
  return true;
}
