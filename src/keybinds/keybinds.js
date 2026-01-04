import * as ui from "/src/modules/ui.js";
import storage from "/src/modules/storage.js";
import * as themes from "/src/themes/themes.js";
import { insertFromIndex } from "/src/symbols/symbols.js";

try {
  document.addEventListener("keydown", async (e) => {
    const anyDialogOpen = Array.from(document.querySelectorAll("dialog")).some(
      (dialog) => dialog.open,
    );
    const isTyping = document.activeElement.matches("input, textarea");
    e.preventDefault();
    if (e.ctrlKey) {
      if (e.key == "Enter" && !anyDialogOpen) document.getElementById("submit-button").click();
      if (e.key == "," && !anyDialogOpen) ui.view("settings");
      if (e.key == "." && !anyDialogOpen) ui.view("history");
      if (e.key == "/" && !anyDialogOpen) ui.view("settings/keybinds");
      if (e.key == "b") ui.reportBugModal();
      if (e.key == "s" && !anyDialogOpen) ui.suggestionsModal();
    } else if (e.altKey) {
      if (/[1-9]/.test(e.key)) insertFromIndex(parseInt(e.key) - 1);
    } else if (e.shiftKey) {
      if (e.key == "R" && !anyDialogOpen && !isTyping) {
        themes.resetTheme();
        await storage.idbReady;
        storage.idbDelete("cache").catch((e) => console.error('IDB delete failed', e));
        storage.delete("lastBulkLoad");
        location.reload();
      }
    } else if (e.key == "Enter" && anyDialogOpen) {
      document.querySelector('dialog[open] .submit-button')?.click();
    }
  });
} catch (error) {
  if (storage.get("developer")) {
    alert(`Error @ keybinds.js: ${error.message}`);
  } else {
    ui.reportBugModal(null, String(error.stack));
  }
  throw error;
};