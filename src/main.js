/* eslint-disable no-undef */
import "./reset.css";
import "./layout.css";
import "./design.css";
import "bootstrap-icons/font/bootstrap-icons.css";

import "/src/modules/mathlive.js";

import "/src/clicker/clicker.js";
import "/src/symbols/symbols.js";
import "/src/themes/themes.js";
import "/src/keybinds/keybinds.js";

import storage from "/src/modules/storage.js";

try {
  const version = import.meta.env.PACKAGE_VERSION;

  updateVersionString();
  function updateVersionString(beta = false) {
    const DEVELOPER_MODE = storage.get("developer");
    document.querySelectorAll(".version").forEach((element) => {
      element.innerHTML = "<p>v" + version + "</p>" + (DEVELOPER_MODE ? " <code>dev</code>" : "");
    });
    if (DEVELOPER_MODE) {
      if (document.querySelector('.topbar')) {
        document.querySelector('.topbar').innerHTML = `<span><i class="bi bi-cone-striped"></i>&nbsp;${beta ? "Beta Version" : "Developer Mode"} - v${version}</span>`;
      } else {
        var topbar = document.createElement("div");
        topbar.className = "topbar";
        topbar.innerHTML = `<span><i class="bi bi-cone-striped"></i>&nbsp;${beta ? "Beta Version" : "Developer Mode"} - v${version}</span>`;
        document.body.prepend(topbar);
      }
    }
  }
  document.querySelectorAll(".hostname").forEach((element) => {
    element.innerHTML = window.location.hostname;
  });

  let developerTimeout;
  let developerClicks = 0;
  document.getElementById("version-string")?.addEventListener("click", () => {
    developerClicks++;
    clearTimeout(developerTimeout);
    developerTimeout = setTimeout(() => {
      developerClicks = 0;
    }, 1000);
    if (developerClicks == 10) {
      storage.set("developer", true);
      updateVersionString();
    }
  });

  if (window.location.hostname.includes('beta')) {
    storage.set("developer", true);
    updateVersionString(true);
  }
} catch (error) {
  if (storage.get("developer")) {
    alert(`Error @ main.js: ${error.message}`);
  };
  throw error;
};