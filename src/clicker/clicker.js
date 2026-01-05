/* eslint-disable no-extra-semi */
/* eslint-disable no-inner-declarations */
import * as ui from "/src/modules/ui.js";
import storage from "/src/modules/storage.js";
import * as auth from "/src/modules/auth.js";

import { autocomplete } from "/src/symbols/symbols.js";
import { unixToTimeString } from "/src/modules/time.js";
import { getExtendedPeriod } from "/src/periods/periods";
import { convertLatexToAsciiMath, convertLatexToMarkup, renderMathInElement } from "mathlive";
import extendedSchedule from "/src/periods/extendedSchedule.json";
``;

function safeParseJSON(str) {
  if (!str || typeof str !== 'string') return null;
  try {
    return JSON.parse(str);
  } catch (e) {
    try {
      const normalized = str.replace(/(^|[^0-9.])(-?)\.(\d+)/g, function (match, p1, p2, p3) {
        return p1 + (p2 || '') + '0.' + p3;
      });
      return JSON.parse(normalized);
    } catch (e2) {
      console.error('safeParseJSON failed for', str, e2);
      return null;
    }
  }
}

try {
  const domain = ((window.location.hostname.search('click') != -1) || (window.location.hostname.search('127') != -1)) ? 'https://api.check.vssfalcons.com' : `http://${document.domain}:5000`;
  var period = document.getElementById("period-input").value;
  const questionInput = document.getElementById("question-input");
  const answerInput = document.getElementById("answer-input");
  const mf = document.getElementById("math-input");
  const setInput = document.getElementById("set-input");
  var setInputs = document.querySelectorAll("[data-set-input]");
  const frqInput = document.getElementById("frq-input");
  var frqParts = document.querySelectorAll(".frq-parts .part");
  var frqPartInputs = document.querySelectorAll(".frq-parts .part input");

  let currentAnswerMode;
  let currentSetType = "brackets";
  let multipleChoice = null;
  let highestDataElement = null;
  let restoredSetType = "";
  var history = [];

  let historyIndex = 0;

  if (!storage.get("makeUpDate")) storage.set("makeUpDate", null);

  // Initialization
  async function init() {
    ui.startLoader();
    // Populate seat code finder grid
    document.getElementById("seat-grid").innerHTML = "";
    for (let col = 1; col <= 5; col++) {
      for (let row = 6; row > 0; row--) {
        period = document.getElementById("period-input").value;
        const code = period + row.toString() + col.toString();
        const button = new ui.Element("button", "", {
          click: () => {
            document.getElementById("code-input").value = code;
            ui.view("settings/code");
          },
        }).element;
        document.getElementById("seat-grid").append(button);
        ui.addTooltip(button, code);
      }
    }
    document.getElementById("period-input").addEventListener("change", () => {
      document.getElementById("seat-grid").innerHTML = "";
      for (let col = 1; col <= 5; col++) {
        for (let row = 6; row > 0; row--) {
          period = document.getElementById("period-input").value;
          const code = period + row.toString() + col.toString();
          const button = new ui.Element("button", "", {
            click: () => {
              document.getElementById("code-input").value = code;
              ui.view("settings/code");
            },
          }).element;
          document.getElementById("seat-grid").append(button);
          ui.addTooltip(button, code);
        }
      }
    });
    if (document.querySelector('[data-logout]')) document.querySelector('[data-logout]').addEventListener('click', () => auth.logout(init));
    // Set default answer mode
    answerMode("input");
    document.getElementById("code-input").value = '';
    document.querySelectorAll("span.code").forEach((element) => {
      element.innerHTML = '';
    });
    document.title = 'Virtual Clicker';
    // Get URL parameters
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    // Test for valid seat code
    const regex = /^[1-9][0-6][0-5]$/;
    if (regex.test(code)) {
      // Update seat code
      storage.set("code", code);
    }
    // Show seat code modal if no saved code exists
    if (!storage.get("code")) {
      ui.view("settings/code");
      return;
    }
    await auth.sync(true, updateCode);
  }

  init();

  // Process click
  function processClick(part = null) {
    const mode = ui.getButtonSelectValue(document.getElementById("answer-mode-selector"));
    const question = part || questionInput.value?.trim().replaceAll(' ', '');
    const [prettyAnswer, answer] =
      multipleChoice ? [multipleChoice, multipleChoice] :
        (() => {
          if (mode === "input") {
            return [answerInput.value?.trim(), answerInput.value?.trim()];
          } else if (mode === "math") {
            return [convertLatexToAsciiMath(mf.value?.trim()), convertLatexToAsciiMath(mf.value?.trim())];
          } else if (mode === "set") {
            var values = "";
            var setInputs = document.querySelectorAll('[data-set-input]');
            setInputs.forEach(a => {
              if ((a.value.length > 0) && (a.value != ' ')) values += a.value.replaceAll(',', '').trim() + ", ";
            });
            values = values.slice(0, -2);
            switch (currentSetType) {
              case "brackets":
                values = `{${values}}`;
                break;
              case "vector":
                values = `<${values}>`;
                break;
              case "array":
                values = `[${values}]`;
                break;
              case "coordinate":
                values = `(${values})`;
                break;
              case "product":
                values = `⟨${values}⟩`;
                break;
              default:
                break;
            };
            return [values, values];
          } else if (mode === "matrix") {
            var matrix = [];
            var matrixRows = document.querySelectorAll('#matrix [data-matrix-row]');
            matrixRows.forEach(row => {
              var matrixRow = [];
              row.querySelectorAll('[data-matrix-column]').forEach(input => {
                var value = input.value?.trim();
                if (value.length > 0) {
                  matrixRow.push(value);
                } else {
                  matrixRow.push("");
                }
              });
              matrix.push(matrixRow);
            });
            return [JSON.stringify(matrix).replaceAll('["', '[').replaceAll('","', ', ').replaceAll('"]', ']'), JSON.stringify(matrix)];
          } else if (mode === "frq") {
            if (part && document.querySelector(`[data-frq-part="${part}"]`)) {
              return [document.querySelector(`[data-frq-part="${part}"]`).value?.trim(), document.querySelector(`[data-frq-part="${part}"]`).value?.trim()];
            } else {
              return [frqInput.value, frqInput.value];
            };
          }
        })();
    if (storage.get("code")) {
      if (question && answer) {
        const promptSubmit = (message, callback) => {
          ui.prompt("Check question number", message, [
            {
              text: "Edit Response",
              close: true,
            },
            {
              text: "Submit Anyway",
              close: true,
              onclick: callback,
            },
          ]);
        };
        const validateQuestion = (callback) => {
          if (question.length > 2) {
            promptSubmit("Question numbers are rarely that long. Are you sure you are entering the question number correctly, and are only inputting the number in this field?", () => {
              if (/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]+/.test(question)) {
                promptSubmit("Question numbers should contain numbers (and possibly a letter) only. Remove any symbols to properly submit your click.", callback);
              } else {
                callback();
              }
            });
          } else if (/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]+/.test(question)) {
            promptSubmit("Question numbers should contain numbers (and possibly a letter) only. Remove any symbols to properly submit your click.", callback);
          } else {
            callback();
          }
        };
        validateQuestion(() => {
          const matchesCurrentPeriod = parseInt(storage.get("code").slice(0, 1)) === getExtendedPeriod() + 1;
          if (((new Date()).getDay() === 0 || (new Date()).getDay() === 6 || getExtendedPeriod() === -1) && !storage.get("makeUpDate")) {
            ui.view("settings/makeup");
          } else if (!matchesCurrentPeriod && !storage.get("makeUpDate")) {
            ui.prompt("Mismatched seat code", `Your current seat code does not match the class period you are currently in (${(getExtendedPeriod() != -1) ? (getExtendedPeriod() + 1) : 'none'}). Responses may not be recorded correctly. Are you sure you would like to continue? To make up clicks, navigate to <b>Settings > Make Up Clicks</b>.`, [
              {
                text: "Change Code",
                close: true,
                onclick: () => {
                  ui.view("settings/code");
                },
              },
              {
                text: "Submit Anyway",
                close: true,
                onclick: submit,
              },
            ]);
          } else if (matchesCurrentPeriod && storage.get("makeUpDate")) {
            ui.prompt("Currently in class", "You are making up clicks for the class you are currently in. Are you sure you want to continue making up clicks instead of returning to usual clicking?", [
              {
                text: "Do Not Make Up Clicks",
                close: true,
                onclick: () => {
                  storage.set("makeUpDate", null);
                  auth.syncPush("makeUpDate");
                  ui.updateTitles();
                  ui.view("");
                },
              },
              {
                text: "Submit Anyway",
                close: true,
                onclick: submit,
              },
            ]);
          } else {
            submit();
          }
        });
      }
      if (!answer) {
        if (mode === "input") {
          answerInput.classList.add("attention");
          answerInput.focus();
        } else if (mode === "math") {
          mf.classList.add("attention");
          mf.focus();
        } else if (mode === "set") {
          setInput.classList.add("attention");
          setInput.focus();
        } else if (mode === "matrix") {
          document.querySelector('#matrix [data-matrix-row]:first-child [data-matrix-column]').classList.add("attention");
          document.querySelector('#matrix [data-matrix-row]:first-child [data-matrix-column]').focus();
          setTimeout(() => {
            document.getElementById("submit-button").disabled = false;
          }, 3000);
        } else if (mode === "frq") {
          if (part) {
            if (document.querySelector(`[data-frq-part="${part}"]`).parentElement.nextElementSibling && (document.querySelector(`[data-frq-part="${part}"]`).parentElement.nextElementSibling.classList.contains('part'))) {
              document.querySelector(`[data-frq-part="${part}"]`).parentElement.nextElementSibling.querySelector('input').classList.add("attention");
              document.querySelector(`[data-frq-part="${part}"]`).parentElement.nextElementSibling.querySelector('input').focus();
            } else {
              document.querySelector(`[data-frq-part="${part}"]`).classList.add("attention");
              document.querySelector(`[data-frq-part="${part}"]`).focus();
            };
          } else {
            frqInput.classList.add("attention");
            frqInput.focus();
          };
        }
      }
      if (!question) {
        questionInput.classList.add("attention");
        questionInput.focus();
      }
    } else {
      ui.view("settings/code");
    }
    function submit() {
      submitClick(storage.get("code"), question, prettyAnswer);
      if (mode === "math" && !multipleChoice) {
        storeClick(storage.get("code"), question, mf.value, "latex");
      } else if (mode === "set" && !multipleChoice) {
        storeClick(storage.get("code"), question, answer, "array");
      } else if (mode === "matrix" && !multipleChoice) {
        storeClick(storage.get("code"), question, answer, "matrix");
      } else if (mode === "frq" && !multipleChoice) {
        storeClick(storage.get("code"), question, answer, "frq");
      } else {
        storeClick(storage.get("code"), question, answer, "text");
      }
      if (mode === "frq") {
        if (part) {
          if (document.querySelector(`[data-frq-part="${part}"]`).parentElement.nextElementSibling && (document.querySelector(`[data-frq-part="${part}"]`).parentElement.nextElementSibling.classList.contains('part'))) {
            document.querySelector(`[data-frq-part="${part}"]`).parentElement.nextElementSibling.querySelector('input').focus();
          } else {
            document.querySelector(`[data-frq-part="${part}"]`).focus();
          };
        } else {
          frqInput.focus();
        };
      } else {
        resetInputs();
      };
      // Show submit confirmation
      ui.modeless(`<i class="bi bi-check-lg"></i>`, storage.get("makeUpDate") ? "Submitted Makeup!" : "Submitted!");
    };
  };

  // Submit click
  document.getElementById("submit-button").addEventListener("click", () => processClick());

  // Save click
  document.querySelectorAll(".frq-parts .part button").forEach(button => button.addEventListener("click", () => processClick(button.getAttribute("data-save-part"))));

  // Remove attention ring when user types in either input
  questionInput.addEventListener("input", (e) => {
    e.target.classList.remove("attention");
  });
  answerInput.addEventListener("input", (e) => {
    e.target.classList.remove("attention");
  });
  mf.addEventListener("input", (e) => {
    e.target.classList.remove("attention");
  });

  // Prevent MathLive default behavior
  mf.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.key == "Enter") {
      e.preventDefault();
    }
  });

  // Reset inputs to default state
  function resetInputs() {
    const mode = ui.getButtonSelectValue(document.getElementById("answer-mode-selector"));
    // Reset answer inputs
    questionInput.value = (ui.getButtonSelectValue(document.getElementById("answer-mode-selector")) === 'frq') ? "1" : "";
    answerInput.value = "";
    mf.value = "";
    setInputs = document.querySelectorAll('[data-set-input]');
    if (setInputs.length > 1) {
      var a = 0;
      setInputs.forEach(s => {
        if (a > 0) {
          s.remove();
        } else {
          s.value = '';
        }
        a++;
      });
    }
    document.querySelectorAll('[data-answer-mode="set"] .button-grid')[1].style.flexWrap = 'nowrap';
    resetMatrix();
    frqInput.value = 4;
    // Switch input mode (exit multiple choice)
    answerMode(mode);
    multipleChoice = null;
    autocomplete.update();
    // Focus input element
    questionInput.focus();
  }

  // Cancel make up button
  document.getElementById("dismiss-makeup-button").addEventListener("click", () => {
    storage.set("makeUpDate", null);
    auth.syncPush("makeUpDate");
    ui.view("");
    ui.stopLoader();
  });

  // Submit to Google Forms
  function submitClick(code, question, answer) {
    const fields = {
      "entry.1896388126": code,
      "entry.1232458460": storage.get("makeUpDate") ? `${question} ${storage.get("makeUpDate")}` : question,
      "entry.1065046570": answer,
    };
    const params = new URLSearchParams(fields).toString();
    const url = "https://docs.google.com/forms/d/e/1FAIpQLSfwDCxVqO2GuB4jhk9iAl7lzoA2TsRlX6hz052XkEHbLrbryg/formResponse?";
    fetch(url + params, {
      method: "POST",
      mode: "no-cors",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });
  }

  // Limit seat code input to integers
  document.getElementById("code-input").addEventListener("input", (e) => {
    e.target.value = parseInt(e.target.value) || "";
  });

  // Save seat code on enter
  document.getElementById("code-input").addEventListener("keydown", (e) => {
    if (e.key == "Enter") {
      e.preventDefault();
      setTimeout(() => {
        saveCode();
      }, 100);
    }
  });

  // Save seat code button
  document.getElementById("save-code-button").addEventListener("click", saveCode);

  // Save seat code
  async function saveCode() {
    const input = document.getElementById("code-input").value;
    // Tests for valid seat code
    const regex = /^[1-9][0-6][0-5]$/;
    if (regex.test(input)) {
      if (input.includes('0')) {
        ui.view("");
        var reservedSeatCodeModal = ui.modal({
          title: 'Reserved Seat Code',
          body: '<p>An invalid seat code was entered. Are you sure you want to use this code?</p>',
          buttons: [
            {
              text: 'Back',
              class: 'cancel-button',
              onclick: () => {
                ui.view("");
                ui.view("settings/code");
                document.getElementById("code-input").focus();
              }
            },
            {
              text: `Use ${input}`,
              class: 'submit-button',
              onclick: async () => {
                if (storage.get("code") !== input) await auth.clearBulkLoad();
                storage.set("code", input);
                init();
                // Close all modals
                ui.view("");
                // Update URL parameters with seat code
                const params = new URLSearchParams(window.location.search);
                params.set("code", input);
              },
              close: true,
            },
          ],
        });
        reservedSeatCodeModal.querySelector('.submit-button').focus();
      } else {
        // Close all modals
        ui.view("");
        if (storage.get("code") !== input) await auth.clearBulkLoad();
        storage.set("code", input);
        init();
        // Update URL parameters with seat code
        const params = new URLSearchParams(window.location.search);
        params.set("code", input);
      }
    } else {
      ui.alert("Error", "Seat code isn't possible");
    }
  }

  // Update elements with new seat code
  async function updateCode() {
    ui.updateTitles();
    try {
      if (!(await auth.bulkLoad(["history"], storage.get("code"), storage.get("password")))) return;
      await storage.idbReady;
      const bulkLoad = (await storage.idbGet('cache')) || storage.get("cache") || {};
      ui.toast(`Welcome back${bulkLoad.name ? `, ${bulkLoad.name}` : ''}!`, 3000, "success", "bi bi-key");
      history = bulkLoad.history || [];
      var course = bulkLoad.course || {};
      if (document.querySelector('.alert')) {
        var clicker_announcement = JSON.parse(course.clicker_announcement || '{}');
        if ((clicker_announcement.image || clicker_announcement.title || clicker_announcement.content || clicker_announcement.link) && (clicker_announcement.expires ? new Date(`${clicker_announcement.expires}T${extendedSchedule[parseInt(storage.get("code").slice(0, 1))][1]}:00`) > new Date() : true)) {
          document.querySelector('.alert').removeAttribute('hidden');
          document.querySelector('.alert').classList = `alert ${clicker_announcement.layout || ''}`;
          if (clicker_announcement.image) {
            document.querySelector('.alert img').removeAttribute('hidden');
            document.querySelector('.alert img').src = clicker_announcement.image;
          } else {
            document.querySelector('.alert img').setAttribute('hidden', '');
          }
          document.querySelector('.alert h3').innerText = clicker_announcement.title || 'Announcement';
          if (clicker_announcement.content) {
            document.querySelector('.alert p').removeAttribute('hidden');
            document.querySelector('.alert p').innerText = clicker_announcement.content;
          } else {
            document.querySelector('.alert p').setAttribute('hidden', '');
          }
          if (clicker_announcement.link) {
            document.querySelector('.alert button').removeAttribute('hidden');
            document.querySelector('.alert button').innerHTML = `${clicker_announcement.linkTitle || 'Go'} <i class="bi bi-arrow-right-short"></i>`;
            document.querySelector('.alert button').addEventListener('click', () => {
              window.open(clicker_announcement.link, '_blank');
            });
          } else {
            document.querySelector('.alert button').setAttribute('hidden', '');
            document.querySelector('.alert button').removeEventListener('click', () => { });
          }
        } else {
          document.querySelector('.alert').setAttribute('hidden', '');
        }
      }
    } catch (error) {
      console.error(error);
    }
    // Update history feed
    try {
      updateHistory();
    } catch (error) {
      console.error(error);
    }
    // Show clear data fix guide
    // if (storage.get("created")) {
    //   document.querySelector(`[data-modal-view="clear-data-fix"]`).remove();
    // } else {
    //   storage.set("created", Date.now());
    // }
    // Focus question input
    if (questionInput) questionInput.focus();
    // Focus answer input
    document.getElementById("answer-suggestion").addEventListener("click", () => answerInput.focus());
    const matchesCurrentPeriod = parseInt(storage.get("code").slice(0, 1)) === getExtendedPeriod() + 1;
    if ((new Date()).getDay() === 0 || (new Date()).getDay() === 6 || getExtendedPeriod() === -1) {
      ui.view("settings/makeup");
    } else if (!matchesCurrentPeriod) {
      ui.prompt("Mismatched seat code", `Your current seat code does not match the class period you are currently in (${(getExtendedPeriod() != -1) ? (getExtendedPeriod() + 1) : 'none'}). Responses may not be recorded correctly. Are you sure you would like to continue? To make up clicks, navigate to <b>Settings > Make Up Clicks</b>.`, [
        {
          text: "Change Code",
          close: true,
          onclick: () => {
            ui.view("settings/code");
          },
        },
        {
          text: "Continue Anyway",
          close: true,
          onclick: ui.stopLoader,
        },
      ]);
    } else if (matchesCurrentPeriod && storage.get("makeUpDate")) {
      ui.prompt("Currently in class", "You are making up clicks for the class you are currently in. Are you sure you want to continue making up clicks instead of returning to usual clicking?", [
        {
          text: "Do Not Make Up Clicks",
          close: true,
          onclick: () => {
            storage.set("makeUpDate", null);
            auth.syncPush("makeUpDate");
            ui.updateTitles();
            ui.view("");
            ui.stopLoader();
          },
        },
        {
          text: "Continue Anyway",
          close: true,
          onclick: ui.stopLoader,
        },
      ]);
    }
  }

  // Show multiple choice card
  document.querySelectorAll("[data-multiple-choice]").forEach((button) => {
    const descriptions = {
      "a": ["Agree", "True", "Yes"],
      "b": ["Disagree", "False", "No"],
      "c": ["Both", "Always"],
      "d": ["Neither", "Never"],
      "e": ["Sometimes", "Cannot be determined", "Does not exist"],
    };
    button.addEventListener("click", (e) => {
      const choice = e.target.getAttribute("data-multiple-choice");
      // Set content of multiple choice card
      const content = document.querySelector(`[data-answer-mode="choice"]>div`);
      content.innerHTML = `<p><b>Choice ${choice.toUpperCase()}</b></p>
  <p>Equivalent to submitting</p>
  <p>${descriptions[choice].join(", ")}</p>`;
      // Show multiple choice card
      answerMode("choice");
      multipleChoice = `CHOICE ${choice.toUpperCase()}`;
    });
  });

  // Hide multiple choice card
  document.getElementById("remove-choice-button").addEventListener("click", () => {
    answerMode(ui.getButtonSelectValue(document.getElementById("answer-mode-selector")));
    multipleChoice = null;
  });

  // Set answer mode
  function answerMode(mode) {
    const current = document.querySelector(`[data-answer-mode="${currentAnswerMode}"]`);
    const fromHeight = current?.getBoundingClientRect().height;

    if (currentAnswerMode == mode) return;
    document.querySelectorAll("[data-answer-mode]").forEach((item) => {
      if (item.getAttribute("data-answer-mode") == mode) {
        item.style.removeProperty("display");
      } else {
        item.style.display = "none";
      }
    });

    // Animate container
    const container = document.getElementById("answer-container");
    const target = document.querySelector(`[data-answer-mode="${mode}"]`);
    const toHeight = target.getBoundingClientRect().height;
    ui.animate(
      container,
      fromHeight
        ? {
          height: fromHeight + "px",
        }
        : undefined,
      {
        height: toHeight + "px",
      },
      500,
      false,
    );

    target?.querySelector('input, textarea, math-field')?.focus();

    currentAnswerMode = mode;
  }

  // Store click to storage and history
  function storeClick(code, question, answer, type) {
    const storageHistory = storage.get("history") || [];
    const timestamp = Date.now();
    storageHistory.push({
      "code": code,
      "question": question,
      "answer": answer,
      "timestamp": timestamp,
      "type": type || "text",
      "makeup": storage.get("makeUpDate") || null,
    });
    storage.set("history", storageHistory);
    try {
      updateHistory();
    } catch (error) {
      console.error(error);
    }
    try {
      fetch(`${domain}/record_click`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          usr: storage.get("code"),
          pwd: storage.get("password"),
          question,
          answer,
          timestamp,
          type: type || "text",
          makeup: storage.get("makeUpDate") || null,
        }),
      });
    } catch (error) {
      console.error(error);
    }
  }

  document.getElementById("history-first")?.addEventListener("click", () => {
    historyIndex = getHistoryDates().length - 1;
    try {
      updateHistory();
    } catch (error) {
      console.error(error);
    }
  });

  document.getElementById("history-backward")?.addEventListener("click", () => {
    historyIndex++;
    try {
      updateHistory();
    } catch (error) {
      console.error(error);
    }
  });

  document.getElementById("history-forward")?.addEventListener("click", () => {
    historyIndex--;
    try {
      updateHistory();
    } catch (error) {
      console.error(error);
    }
  });

  document.getElementById("history-last")?.addEventListener("click", () => {
    historyIndex = 0;
    try {
      updateHistory();
    } catch (error) {
      console.error(error);
    }
  });

  // Count number of unique days
  function getHistoryDates() {
    const combinedHistory = [
      ...history.map(a => ({
        "code": String(a.code),
        "question": a.question,
        "answer": a.answer,
        "timestamp": Number(a.timestamp) || a.timestamp,
        "type": a.type,
        "makeup": a.makeup,
      })),
      ...(storage.get("history") || []).map(a => ({
        "code": String(a.code),
        "question": a.question,
        "answer": a.answer,
        "timestamp": Number(a.timestamp) || a.timestamp,
        "type": a.type,
        "makeup": a.makeup,
      }))
    ].filter((item, index, self) => index === self.findIndex(other => other.code === item.code && other.question === item.question && other.answer === item.answer && other.timestamp === item.timestamp && other.type === item.type && other.makeup === item.makeup)).sort((a, b) => a.timestamp - b.timestamp);
    const dates = combinedHistory.map((entry) => new Date(entry.timestamp).toISOString().split("T")[0]);
    const unique = [...new Set(dates)].reverse();
    return unique;
  }

  // Filter history by date
  function filterHistory() {
    const combinedHistory = [
      ...history.map(a => ({
        "code": String(a.code),
        "question": a.question,
        "answer": a.answer,
        "timestamp": Number(a.timestamp) || a.timestamp,
        "type": a.type,
        "makeup": a.makeup,
      })),
      ...(storage.get("history") || []).map(a => ({
        "code": String(a.code),
        "question": a.question,
        "answer": a.answer,
        "timestamp": Number(a.timestamp) || a.timestamp,
        "type": a.type,
        "makeup": a.makeup,
      }))
    ].filter((item, index, self) => index === self.findIndex(other => other.code === item.code && other.question === item.question && other.answer === item.answer && other.timestamp === item.timestamp && other.type === item.type && other.makeup === item.makeup)).sort((a, b) => a.timestamp - b.timestamp);
    var data = combinedHistory.map((entry) => {
      const day = new Date(entry.timestamp);
      const date = day.toISOString().split("T")[0];
      return { ...entry, day: day, date: date };
    });
    return data.filter((entry) => entry.date === getHistoryDates()[historyIndex]);
  }

  // Update history feed
  function updateHistory() {
    const combinedHistory = filterHistory();
    const date =
      combinedHistory[0] &&
      new Intl.DateTimeFormat("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      }).format(combinedHistory[0]?.day);

    // Update history navigation
    document.getElementById("history-first").disabled = historyIndex === getHistoryDates().length - 1;
    document.getElementById("history-backward").disabled =
      historyIndex === getHistoryDates().length - 1;
    document.getElementById("history-forward").disabled = historyIndex === 0;
    document.getElementById("history-last").disabled = historyIndex === 0;
    document.getElementById("history-date").textContent = date;

    const feed = document.getElementById("history-feed");
    if (combinedHistory.length != 0) {
      feed.innerHTML = "";
      combinedHistory.forEach((item) => {
        const button = document.createElement("button");
        const latex = item.type === "latex";
        const array = item.type === "array";
        const matrix = item.type === "matrix";
        const frq = item.type === "frq";
        if (latex) {
          button.innerHTML = `<p><b>${item.question}.</b> ${unixToTimeString(item.timestamp)} (${item.code})${item.makeup ? ` (Makeup for ${item.makeup.split(' ')[0]})` : ''}</p>\n${convertLatexToMarkup(item.answer)}\n<p class="hint">(Equation may not display properly)</p>`;
        } else if (array) {
          button.innerHTML = `<p><b>${item.question}.</b> ${unixToTimeString(item.timestamp)} (${item.code})${item.makeup ? ` (Makeup for ${item.makeup.split(' ')[0]})` : ''}</p>\n<p>${item.answer.slice(1, -1)}</p>`;
        } else if (matrix) {
          button.innerHTML = `<p><b>${item.question}.</b> ${unixToTimeString(item.timestamp)} (${item.code})${item.makeup ? ` (Makeup for ${item.makeup.split(' ')[0]})` : ''}</p>\n<p>${JSON.stringify((safeParseJSON(item.answer) || []).map(innerArray => innerArray.map(numString => String(numString)))).replaceAll('["', '[').replaceAll('","', ', ').replaceAll('"]', ']')}</p>`;
        } else if (frq) {
          button.innerHTML = `<p><b>${item.question}.</b> ${unixToTimeString(item.timestamp)} (${item.code})${item.makeup ? ` (Makeup for ${item.makeup.split(' ')[0]})` : ''}</p>\n<p>${item.answer}${(item.question === '1') ? '/9' : ''}</p>`;
        } else {
          button.innerHTML = `<p><b>${item.question}.</b> ${unixToTimeString(item.timestamp)} (${item.code})${item.makeup ? ` (Makeup for ${item.makeup.split(' ')[0]})` : ''}</p>\n<p>${item.answer}</p>`;
        }
        feed.prepend(button);
        renderMathInElement(button);
        // Resubmit click
        button.addEventListener("click", () => {
          questionInput.value = item.question;
          ui.view("");
          if (latex) {
            answerMode("math");
            ui.setButtonSelectValue(document.getElementById("answer-mode-selector"), "math");
            mf.value = item.answer;
          } else if (array) {
            answerMode("set");
            ui.setButtonSelectValue(document.getElementById("answer-mode-selector"), "set");
            resetSetInput();
            restoredSetType = "brackets";
            switch (item.answer.slice(0, 1)) {
              case "<":
                restoredSetType = "vector";
                break;
              case "[":
                restoredSetType = "array";
                break;
              case "(":
                restoredSetType = "coordinate";
                break;
              case "⟨":
                restoredSetType = "product";
                break;
              default:
                break;
            };
            ui.setButtonSelectValue(document.getElementById("set-type-selector"), restoredSetType);
            var i = 0;
            item.answer.slice(1, -1).split(', ').forEach(a => {
              setInputs = document.querySelectorAll("[data-set-input]");
              setInputs[i].value = a;
              i++;
              if (i < item.answer.slice(1, -1).split(', ').length) addSet();
            });
          } else if (matrix) {
            answerMode("matrix");
            ui.setButtonSelectValue(document.getElementById("answer-mode-selector"), "matrix");
            resetMatrix();
            var rows = safeParseJSON(item.answer) || [];
            if (rows.length != 2) {
              if (rows.length === 1) {
                removeRow();
              } else {
                for (let i = 0; i < rows.length - 2; i++) {
                  addRow();
                }
              }
            }
            var columns = rows[0].length;
            if (columns != 2) {
              if (columns === 1) {
                removeColumn();
              } else {
                for (let i = 0; i < columns - 2; i++) {
                  addColumn();
                }
              }
            }
            var matrixRows = document.querySelectorAll('#matrix [data-matrix-row]');
            for (let i = 0; i < rows.length; i++) {
              for (let j = 0; j < rows[i].length; j++) {
                matrixRows[i].querySelectorAll('[data-matrix-column]')[j].value = rows[i][j];
              }
            }
            matrixRows[matrixRows.length - 1].lastChild.focus();
          } else if (frq) {
            answerMode("frq");
            ui.setButtonSelectValue(document.getElementById("answer-mode-selector"), "frq");
            questionInput.value = '1';
            if (item.question === '1') {
              frqInput.value = item.answer;
              document.querySelector('[data-answer-mode="frq"] h1').innerText = item.answer;
              frqInput.focus();
            } else {
              if (document.querySelector(`[data-frq-part="${item.question}"]`)) {
                document.querySelector(`[data-frq-part="${item.question}"]`).value = item.answer;
                document.querySelector(`[data-frq-part="${item.question}"]`).focus();
              } else {
                while (!document.querySelector(`[data-frq-part="${item.question}"]`)) {
                  addPart();
                };
                document.querySelector(`[data-frq-part="${item.question}"]`).value = item.answer;
                document.querySelector(`[data-frq-part="${item.question}"]`).focus();
              };
            };
          } else {
            answerMode("input");
            const choice = item.answer.match(/^CHOICE ([A-E])$/);
            if (!choice) {
              answerInput.value = item.answer;
            } else {
              document.querySelector(`[data-multiple-choice="${choice[1].toLowerCase()}"]`).click();
            }
            questionInput.focus();
            autocomplete.update();
          }
        });
      });
    } else {
      feed.innerHTML = "<p>Submitted clicks will show up here!</p>";
    }
  }

  // Reset modals
  const resets = {
    "history": () => {
      ui.prompt("Clear local history?", "This action cannot be reversed!", [
        {
          text: "Cancel",
          close: true,
        },
        {
          text: "Clear",
          close: true,
          onclick: () => {
            storage.delete("history");
            window.location.reload();
          },
        },
      ]);
    },
    "all": () => {
      ui.prompt("Reset all settings?", "This action cannot be reversed!", [
        {
          text: "Cancel",
          close: true,
        },
        {
          text: "Reset",
          close: true,
          onclick: () => {
            storage.obliterate();
            window.location.reload();
          },
        },
      ]);
    },
  };

  // Show reset modal
  document.querySelectorAll("[data-reset]").forEach((button) => {
    button.addEventListener("click", async (e) => {
      if (e.target.getAttribute("data-reset") === 'cache') {
        var timestamp = new Date().getTime();
        storage.set("cacheBust", true);
        document.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
          link.setAttribute("href", `${link.getAttribute("href")}?_=${timestamp}`);
        });
        document.querySelectorAll("script[src]").forEach(script => {
          script.setAttribute("src", `${script.getAttribute("src")}?_=${timestamp}`);
        });
        await storage.idbReady;
        storage.idbDelete("cache").catch((e) => console.error('IDB delete failed', e));
        storage.delete("lastBulkLoad");
      } else {
        resets[e.target.getAttribute("data-reset")]();
      };
    });
  });

  if (storage.get("cacheBust")) {
    var timestamp = new Date().getTime();
    document.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
      link.setAttribute("href", `${link.getAttribute("href")}?${timestamp}`);
    });
    document.querySelectorAll("script[src]").forEach(script => {
      script.setAttribute("src", `${script.getAttribute("src")}?_=${timestamp}`);
    });
  }

  // Disable developer mode button
  if (storage.get("developer")) {
    document.querySelector(`[data-modal-page="reset"]`).append(
      new ui.Element("button", "Disable Developer Mode", {
        "click": () => {
          storage.delete("developer");
        },
      }).element,
    );
  }

  const answerLabel = document.querySelector(`label[for="answer-input"]`);

  // Select answer mode
  document.getElementById("answer-mode-selector").addEventListener("input", (e) => {
    const mode = e.detail;
    answerMode(mode);
    if (mode === "input") {
      answerLabel.setAttribute("for", "answer-input");
    } else if (mode === "math") {
      answerLabel.setAttribute("for", "math-input");
    } else if (mode === "set") {
      answerLabel.setAttribute("for", "set-input");
    } else if (mode === "matrix") {
      answerLabel.setAttribute("for", "matrix");
    } else if (mode === "frq") {
      answerLabel.setAttribute("for", "frq-input");
    }
  });

  // Select set type
  document.getElementById("set-type-selector").addEventListener("input", (e) => {
    const mode = e.detail;
    currentSetType = mode;
  });

  setInputs = document.querySelectorAll('[data-set-input]');

  // Add set input
  if (document.querySelector("[data-add-set-input]")) {
    document.querySelector("[data-add-set-input]").addEventListener("click", addSet);
  }

  function addSet() {
    setInputs = document.querySelectorAll('[data-set-input]');
    highestDataElement = null;
    setInputs.forEach(element => {
      if (highestDataElement === null || parseInt(element.getAttribute('data-set-input'), 10) > parseInt(highestDataElement.getAttribute('data-set-input'), 10)) highestDataElement = element;
    });
    if (highestDataElement !== null) {
      var newSetInput = document.createElement('input');
      newSetInput.setAttribute('type', 'text');
      newSetInput.setAttribute('autocomplete', 'off');
      newSetInput.setAttribute('data-set-input', Number(highestDataElement.getAttribute('data-set-input')) + 1);
      const buttonGrid = document.querySelectorAll('[data-answer-mode="set"] .button-grid')[1];
      const insertBeforePosition = buttonGrid.children.length - 2;
      if (insertBeforePosition > 0) {
        buttonGrid.insertBefore(newSetInput, buttonGrid.children[insertBeforePosition]);
      } else {
        buttonGrid.appendChild(newSetInput);
      }
      document.querySelectorAll('[data-answer-mode="set"] .button-grid')[1].style.flexWrap = (setInputs.length > 9) ? 'wrap' : 'nowrap';
      newSetInput.focus();
      document.querySelector("[data-remove-set-input]").disabled = false;
    }
  }

  // Remove set input
  if (document.querySelector("[data-remove-set-input]")) {
    document.querySelector("[data-remove-set-input]").addEventListener("click", removeSet);
  }

  function removeSet() {
    setInputs = document.querySelectorAll('[data-set-input]');
    if (setInputs.length > 1) {
      highestDataElement = null;
      setInputs.forEach(element => {
        if (highestDataElement === null || parseInt(element.getAttribute('data-set-input'), 10) > parseInt(highestDataElement.getAttribute('data-set-input'), 10)) highestDataElement = element;
      });
      if (highestDataElement !== null) highestDataElement.remove();
    }
    if (setInputs.length === 2) document.querySelector("[data-remove-set-input]").disabled = true;
    document.querySelectorAll('[data-answer-mode="set"] .button-grid')[1].style.flexWrap = (setInputs.length < 12) ? 'nowrap' : 'wrap';
  }

  function resetSetInput() {
    ui.setButtonSelectValue(document.getElementById("set-type-selector"), "brackets");
    document.querySelectorAll('[data-answer-mode="set"] .button-grid')[1].innerHTML = '<input type="text" autocomplete="off" id="set-input" data-set-input="1" /><button square data-add-set-input><i class="bi bi-plus"></i></button><button square data-remove-set-input disabled><i class="bi bi-dash"></i></button>';
    if (document.querySelector("[data-add-set-input]")) {
      document.querySelector("[data-add-set-input]").addEventListener("click", addSet);
    }
    if (document.querySelector("[data-remove-set-input]")) {
      document.querySelector("[data-remove-set-input]").addEventListener("click", removeSet);
    }
  }

  //Change FRQ choice
  frqInput.addEventListener("change", (input) => {
    document.querySelector('[data-answer-mode="frq"] h1').innerText = input.target.value;
  });

  frqInput.addEventListener("input", (input) => {
    document.querySelector('[data-answer-mode="frq"] h1').innerText = input.target.value;
  });

  // Add FRQ part
  if (document.querySelector("[data-add-frq-part]")) {
    document.querySelector("[data-add-frq-part]").addEventListener("click", addPart);
  }

  function addPart() {
    frqPartInputs = document.querySelectorAll('.frq-parts .part input');
    highestDataElement = frqPartInputs[frqPartInputs.length - 1];
    var newPartLetter = String.fromCharCode(highestDataElement.getAttribute('data-frq-part').charCodeAt(0) + 1);
    var newFRQPart = document.createElement('div');
    newFRQPart.classList = 'part';
    newFRQPart.innerHTML = `<div class="prefix">${newPartLetter}.</div>
          <input type="text" autocomplete="off" data-frq-part="${newPartLetter}" />
          <button data-save-part="${newPartLetter}">Save</button>`;
    document.querySelector('.frq-parts').insertBefore(newFRQPart, document.querySelector('.frq-parts').children[document.querySelector('.frq-parts').children.length - 1]);
    frqParts = document.querySelectorAll('.frq-parts .part');
    highestDataElement = frqParts[frqParts.length - 1];
    highestDataElement.querySelector('button').addEventListener("click", () => processClick(newPartLetter))
    highestDataElement.querySelector('input').focus();
    document.querySelector("[data-remove-frq-part]").disabled = false;
    if (newPartLetter === 'z') document.querySelector("[data-add-frq-part]").disabled = true;
  }

  // Remove FRQ part
  if (document.querySelector("[data-remove-frq-part]")) {
    document.querySelector("[data-remove-frq-part]").addEventListener("click", removePart);
  }

  function removePart() {
    frqParts = document.querySelectorAll('.frq-parts .part');
    if (frqParts.length > 4) frqParts[frqParts.length - 1].remove();
    if (frqParts.length === 5) document.querySelector("[data-remove-frq-part]").disabled = true;
  }

  // Add matrix column
  if (document.querySelector("[data-add-matrix-column]")) document.querySelector("[data-add-matrix-column]").addEventListener("click", addColumn);

  function addColumn() {
    var rows = [...document.getElementById('matrix').children];
    rows.forEach(row => {
      var newColumn = document.createElement('input');
      newColumn.setAttribute('type', 'text');
      newColumn.setAttribute('autocomplete', 'off');
      newColumn.setAttribute('data-matrix-column', row.children.length + 1);
      row.appendChild(newColumn);
    });
    rows[0].lastElementChild.focus();
    var columns = document.querySelectorAll('#matrix [data-matrix-row]:first-child [data-matrix-column]');
    if (columns.length === 10) document.querySelector("[data-add-matrix-column]").disabled = true;
    document.querySelector("[data-remove-matrix-column]").disabled = false;
  }

  // Remove matrix column
  if (document.querySelector("[data-remove-matrix-column]")) document.querySelector("[data-remove-matrix-column]").addEventListener("click", removeColumn);

  function removeColumn() {
    var rows = [...document.getElementById('matrix').children];
    rows.forEach(row => {
      var lastColumn = row.lastElementChild;
      if (lastColumn) lastColumn.remove();
    });
    if (rows[0].children.length < 10) document.querySelector("[data-add-matrix-column]").disabled = false;
    if (rows[0].children.length === 1) document.querySelector("[data-remove-matrix-column]").disabled = true;
  }

  // Add matrix row
  if (document.querySelector("[data-add-matrix-row]")) document.querySelector("[data-add-matrix-row]").addEventListener("click", addRow);

  function addRow() {
    var newRow = document.createElement('div');
    newRow.classList.add('row');
    newRow.setAttribute('data-matrix-row', document.querySelectorAll('[data-matrix-row]').length + 1);
    var columns = document.querySelectorAll('[data-matrix-row]:first-child [data-matrix-column]');
    columns.forEach(column => {
      var newColumn = document.createElement('input');
      newColumn.setAttribute('type', 'text');
      newColumn.setAttribute('autocomplete', 'off');
      newColumn.setAttribute('data-matrix-column', column.getAttribute('data-matrix-column'));
      newRow.appendChild(newColumn);
    });
    document.getElementById('matrix').appendChild(newRow);
    newRow.firstElementChild.focus();
    var rows = document.querySelectorAll('[data-matrix-row]');
    if (rows.length === 10) document.querySelector("[data-add-matrix-row]").disabled = true;
    document.querySelector("[data-remove-matrix-row]").disabled = false;
  }

  // Remove matrix row
  if (document.querySelector("[data-remove-matrix-row]")) document.querySelector("[data-remove-matrix-row]").addEventListener("click", removeRow);

  function removeRow() {
    var rows = document.querySelectorAll('[data-matrix-row]');
    if (rows.length > 1) {
      var lastRow = rows[rows.length - 1];
      lastRow.remove();
      if (rows.length < 10) document.querySelector("[data-add-matrix-row]").disabled = false;
      if (rows.length === 2) document.querySelector("[data-remove-matrix-row]").disabled = true;
    }
  }

  function resetMatrix() {
    var matrix = document.getElementById('matrix');
    matrix.innerHTML = '<div class="row" data-matrix-row="1"><input type="text" autocomplete="off" id="matrix-column" data-matrix-column="1" /><input type="text" autocomplete="off" id="matrix-column" data-matrix-column="2" /></div><div class="row" data-matrix-row="2"><input type="text" autocomplete="off" id="matrix-column" data-matrix-column="1" /><input type="text" autocomplete="off" id="matrix-column" data-matrix-column="2" /></div>';
    document.querySelectorAll('[data-answer-mode="matrix"] .button-grid')[1].innerHTML = '<button square data-add-matrix-column tooltip="Add Matrix Column"><i class="bi bi-arrow-90deg-left rotate-right"></i></button><button square data-remove-matrix-column tooltip="Remove Matrix Column"><i class="bi bi-x"></i></button>';
    document.querySelectorAll('[data-answer-mode="matrix"] .button-grid')[2].innerHTML = '<button square data-add-matrix-row tooltip="Add Matrix Row"><i class="bi bi-arrow-return-left"></i></button><button square data-remove-matrix-row tooltip="Remove Matrix Row"><i class="bi bi-x"></i></button>';
    if (document.querySelector("[data-add-matrix-column]")) document.querySelector("[data-add-matrix-column]").addEventListener("click", addColumn);
    if (document.querySelector("[data-remove-matrix-column]")) document.querySelector("[data-remove-matrix-column]").addEventListener("click", removeColumn);
    if (document.querySelector("[data-add-matrix-row]")) document.querySelector("[data-add-matrix-row]").addEventListener("click", addRow);
    if (document.querySelector("[data-remove-matrix-row]")) document.querySelector("[data-remove-matrix-row]").addEventListener("click", removeRow);
  }
} catch (error) {
  if (storage.get("developer")) {
    alert(`Error @ clicker.js: ${error.message}`);
  } else {
    ui.reportBugModal(null, String(error.stack));
  }
  throw error;
};
