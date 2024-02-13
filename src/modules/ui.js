import "./ui.css";

export function alert(title, text, callback, blur) {
    return modal({
        title,
        body: new Element("p", text).element.outerHTML,
        buttons: [{
            text: "Close",
            close: true,
            onclick: callback,
        }],
        blur,
    });
}

export function prompt(title, text, buttons, blur) {
    return modal({
        title,
        body: new Element("p", text).element.outerHTML,
        buttons,
        blur,
    });
}

export function modal(options) {
    // Create dialog element
    const dialog = document.createElement("dialog");
    dialog.innerHTML = options.body;
    // Append dialog element to DOM
    document.body.append(dialog);
    // Show modal
    show(dialog, options.title, options.buttons, options.blur);
    // Remove dialog element on close
    dialog.addEventListener("close", () => {
        dialog.remove();
    });
    return dialog;
}

export function show(dialog, title, buttons, blur, effects = true) {
    (() => {
        const existing = dialog.querySelector("[data-modal-title]");
        if (existing) {
            existing.textContent = title;
            return existing;
        }
        else if (title) {
            const element = new Element("h2", title).element;
            element.setAttribute("data-modal-title", "");
            dialog.prepend(element);
            return element;
        }
    })();

    const modalButtons = (() => {
        const existing = dialog.querySelector("[data-modal-buttons]");
        if (existing) {
            existing.innerHTML = "";
            return existing;
        }
        else if (buttons?.length > 0) {
            const element = document.createElement("div");
            element.setAttribute("data-modal-buttons", "");
            dialog.append(element);
            return element;
        }
    })();

    buttons.forEach(button => {
        modalButtons.append(
            new Element("button", button.text, {
                click: () => {
                    button.close && close();
                    button.onclick && button.onclick();
                },
            }, button.class).element
        );
    });

    dialog.showModal();

    dialog.addEventListener("cancel", e => {
        e.preventDefault();
        close();
    });

    effects && animate(dialog, {
        scale: "0.9",
        opacity: "0",
    }, {
        scale: "1",
        opacity: "1",
    }, 250);

    function close() {
        if (effects) {
            animate(dialog, undefined, {
                scale: "0.9",
                opacity: "0",
            }, 250);
            setTimeout(() => {
                dialog.close();
            }, 250);
        } else {
            dialog.close();
        }
    }

    blur && modalButtons.querySelectorAll("button").forEach(button => button.blur());
}

export function view(path) {
    if (!path) {
        document.querySelectorAll("dialog[open]").forEach(dialog => dialog.close());
        return;
    }
    const pages = path.split("/");
    const target = document.querySelector(`[data-modal-page="${pages[pages.length - 1]}"]`);
    const title = target.getAttribute("data-page-title") || path;
    for (let i = 0; i < pages.length; i++) {
        const query = pages.slice(0, i + 1).map(item => `[data-modal-page="${item}"]`).join(">");
        const element = document.querySelector(query);
        element.querySelectorAll(":not([data-modal-title], [data-modal-buttons], .tooltip").forEach(element => {
            const page = element.getAttribute("data-modal-page");
            if (page == pages[i + 1]) {
                element.style.removeProperty("display");
            }
            else {
                element.style.display = "none";
            }
        });
    }
    const previous = pages.slice(0, pages.length - 1).join("/");
    const buttons = [
        {
            text: `<i class="ri-close-fill"></i> Close`,
            class: "pill",
            close: true,
        },
    ];
    if (previous) {
        buttons.unshift({
            text: `<i class="ri-arrow-left-s-line"></i> Back`,
            class: "pill",
            close: false,
            onclick: () => {
                view(previous);
            },
        });
    }
    show(
        document.querySelector(`[data-modal-page="${pages[0]}"]`),
        title,
        buttons,
    );
}

export function modeless(icon, message) {
    document.querySelector("div.modeless")?.remove();
    const element = document.createElement("div");
    const keyframes = [
        { opacity: 0 },
        { opacity: 1 },
    ];
    element.className = "modeless";
    element.append(
        new Element("h2", icon).element,
        new Element("p", message).element,
    );
    element.animate(keyframes, {
        duration: 100,
        fill: "forwards",
    });
    setTimeout(() => {
        element.animate(keyframes, {
            duration: 100,
            direction: "reverse",
            fill: "forwards",
        });
        setTimeout(() => {
            element.remove();
        }, 100);
    }, 2400);
    document.body.append(element);
}

export function addTooltip(element, text) {
    const tooltip = document.createElement("p");
    tooltip.textContent = text;
    tooltip.style.opacity = "0";
    tooltip.style.position = "absolute";
    tooltip.classList.add("tooltip");

    const parent = element.closest("dialog") || document.body;
    parent.append(tooltip);

    element.addEventListener("pointerenter", () => {
        tooltip.style.left = element.offsetLeft + (element.offsetWidth / 2) + "px";
        tooltip.style.top = element.offsetTop + "px";
        animate(tooltip, {
            translate: "-50% -90%",
            opacity: "0",
        }, {
            translate: "-50% calc(-100% - 0.5rem)",
            opacity: "1",
        }, 250);
    });

    element.addEventListener("pointerleave", () => {
        animate(tooltip, undefined, {
            translate: "-50% -90%",
            opacity: "0",
        }, 250);
    });
}

// From kennyhui.dev
export function animate(element, from, to, duration) {
    const animation = element.animate([
        from && from,
        to && to,
    ], {
        duration,
        easing: "cubic-bezier(0.65, 0, 0.35, 1)",
        fill: "forwards",
    });
    setTimeout(() => {
        animation.cancel();
        Object.assign(element.style, to);
    }, duration);
}

export class Element {
    constructor(tag, text, events, className) {
        this.tag = tag;
        this.text = text;
        this.events = events;
        this.className = className;
    }

    get element() {
        const element = document.createElement(this.tag);
        element.innerHTML = this.text;
        this.className && (element.className = this.className);
        this.events && Object.keys(this.events).forEach(type => {
            const listener = this.events[type];
            element.addEventListener(type, listener);
        });
        return element;
    }
}

document.querySelectorAll("[data-modal-view]").forEach(element => {
    element.addEventListener("click", () => {
        const path = element.getAttribute("data-modal-view");
        view(path);
    });
});

document.querySelectorAll("[data-color-input]").forEach(element => {
    const name = element.getAttribute("data-color-input");
    // Create child elements
    const colorPicker = document.createElement("input");
    colorPicker.type = "color";
    colorPicker.name = name;
    colorPicker.tabIndex = "-1";
    const colorPreview = document.createElement("div");
    colorPreview.setAttribute("data-color-preview", "");
    colorPreview.tabIndex = "0";
    colorPreview.role = "button";
    const colorCode = document.createElement("input");
    colorCode.type = "text";

    colorPicker.addEventListener("input", update);
    colorCode.addEventListener("blur", validate);
    colorCode.addEventListener("keydown", e => {
        if (e.key == "Enter") {
            validate();
        }
    });
    colorPreview.addEventListener("click", () => {
        colorPicker.focus();
    });
    colorPreview.addEventListener("keydown", e => {
        if (e.key == " " || e.key == "Enter") {
            e.preventDefault();
            colorPicker.focus();
        }
    });


    element.append(colorPicker, colorPreview, colorCode);
    update();

    function validate() {
        const value = colorCode.value;
        const valid = /^#[0-9a-fA-F]{6}$/.test(value);
        if (valid) {
            colorPicker.value = value;
        } else {
            colorCode.value = colorPicker.value;
        }
        update();
    }

    function update() {
        colorCode.value = colorPicker.value;
        colorPreview.style.backgroundColor = colorPicker.value;
    }
});