import * as ui from "/src/modules/ui.js";
import storage from '/src/modules/storage.js';
import * as themes from '/src/themes/themes.js';
import HTTPSockBroadcast from 'httpsock/broadcast.mjs';

var domain = null;
var broadcaster = null;
var connected = false;
var reconnectInterval = null;

var isDrawing = false;
var lastStroke = null;
var undoStack = [];
var redoStack = [];
var sendQueue = [];
var sendTimer = null;
var undoQueue = [];
var undoTimer = null;
var canvasIsClear = true;

const container = document.querySelector('[data-answer-mode="draw"]');
const undoButton = container.querySelector('[data-action="undo"]');
const redoButton = container.querySelector('[data-action="redo"]');
const clearButton = container.querySelector('[data-action="clear"]');
const saveIcon = container.querySelector('.bi-floppy');
const canvas = container.querySelector('canvas');
const context = canvas.getContext('2d');
const reconnect = document.querySelector('.live-drawings-reconnect');

reconnect?.addEventListener('click', () => {
    connect(domain);
});

document.getElementById('reconnect-draw-session')?.addEventListener('click', () => {
    ui.view();
    setTimeout(() => {
        connect(domain);
    }, 500);
});

canvas?.addEventListener('pointerdown', start, { passive: false });
canvas?.addEventListener('pointermove', move, { passive: false });
canvas?.addEventListener('pointerup', end, { passive: false });
canvas?.addEventListener('pointerleave', end, { passive: false });

const undoButtonHandler = (e) => {
    e.preventDefault();
    doUndo();
};

const redoButtonHandler = (e) => {
    e.preventDefault();
    doRedo();
};

const clearButtonHandler = (e) => {
    e.preventDefault();
    clearCanvas();
};

undoButton?.addEventListener('click', undoButtonHandler);
redoButton?.addEventListener('click', redoButtonHandler);
if (undoButton) undoButton._removeHold = setHold(undoButton, doUndo);
if (redoButton) redoButton._removeHold = setHold(redoButton, doRedo);
clearButton?.addEventListener('click', clearButtonHandler);

export function connect(drawDomain) {
    try {
        if (!domain) domain = drawDomain;
        if (!broadcaster) {
            broadcaster = new HTTPSockBroadcast({
                server: `${domain}/${storage.get('code')[0]}?noBroadcast=true`,
                cert: './certs/chain.pem',
                auth: {
                    username: storage.get('code') || '',
                    password: storage.get('password') || ''
                },
                callback: async (response) => {
                    try {
                        var responseJSON = JSON.parse(response);
                        var lastDrawingsMessageTimestamp = storage.get('lastDrawingsMessageTimestamp') || 0;
                        if ((responseJSON.type === 'messages') && (responseJSON.messages && responseJSON.messages.length)) {
                            responseJSON.messages.forEach(msg => {
                                if (msg.timestamp <= lastDrawingsMessageTimestamp) return;
                                if (msg.content === 'clear') clearCanvas();
                            });
                            storage.set('lastDrawingsMessageTimestamp', Date.now());
                        }
                    } catch (e) { e; }
                    if (saveIcon.classList.contains('active')) {
                        saveIcon.classList.add('saved');
                        if (undoButton) undoButton.disabled = !undoStack.length;
                        if (redoButton) redoButton.disabled = !redoStack.length;
                        if (clearButton) clearButton.disabled = canvasIsClear;
                    }
                    if (connected) return;
                    console.log('🟢 Connected to Live Drawings server!');
                    const strokes = await fetch(`${domain}/${storage.get('code')[0]}/strokes`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            usr: storage.get('code'),
                            pwd: storage.get('password'),
                        })
                    }).then(res => res.json()).catch(e => {
                        console.warn('Failed to fetch strokes:', e);
                    }) || [];
                    if (connected) return;
                    init(strokes);
                    connected = true;
                    if (!reconnectInterval) reconnectInterval = setInterval(() => {
                        connect(domain);
                    }, 5000);
                },
                close: (e) => close(e, true),
                error: (e) => close(e, true)
            });
            connected = false;
            reconnectInterval && clearInterval(reconnectInterval);
            reconnectInterval = null;
        }
        try {
            broadcaster.sendQuiet('ping');
        } catch (error) {
            console.warn('Live Drawings server ping failed:', error);
        }
    } catch (error) {
        if (storage.get("developer")) {
            alert(`Error @ draw.js: ${error.message}`);
        } else {
            ui.reportBugModal(null, String(error.stack));
        }
        throw error;
    }
}

export function close(err = null, retry = false) {
    try {
        reconnectInterval && clearInterval(reconnectInterval);
        reconnectInterval = null;
        if (!retry) {
            console.log('Live Drawings server connection closed');
        } else if (connected) {
            console.log('Server disconnected, retrying', err || '');
            setTimeout(() => {
                connect(domain);
            }, 5000);
        } else {
            reconnect.classList.remove('connected');
            canvas.setAttribute('disabled', 'disabled');
            ui.view('draw-session-closed');
        }
        connected = false;
    } catch (error) {
        if (storage.get("developer")) {
            alert(`Error @ draw.js: ${error.message}`);
        } else {
            ui.reportBugModal(null, String(error.stack));
        }
        throw error;
    }
}

export function updateTheme() {

}

function currentPosition(e) {
    try {
        const rect = canvas.getBoundingClientRect();
        return {
            x: (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left,
            y: (e.clientY || (e.touches && e.touches[0].clientY)) - rect.top
        };
    } catch (error) {
        if (storage.get("developer")) {
            alert(`Error @ draw.js: ${error.message}`);
        } else {
            ui.reportBugModal(null, String(error.stack));
        }
        throw error;
    }
}

function start(e) {
    try {
        e.preventDefault();
        isDrawing = true;
        lastStroke = currentPosition(e);
    } catch (error) {
        if (storage.get("developer")) {
            alert(`Error @ draw.js: ${error.message}`);
        } else {
            ui.reportBugModal(null, String(error.stack));
        }
        throw error;
    }
}

function generateId() {
    try {
        return (crypto && crypto.randomUUID) ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2, 10);
    } catch (e) {
        return 'id-' + Math.random().toString(36).slice(2, 10);
    }
}

function move(e) {
    try {
        if (!isDrawing) return;
        e.preventDefault();
        canvasIsClear = false;
        saveIcon.classList.remove('active');
        saveIcon.classList.remove('saved');

        const position = currentPosition(e);
        context.beginPath();
        context.moveTo(lastStroke.x, lastStroke.y);
        context.lineTo(position.x, position.y);
        context.stroke();

        const stroke = {
            id: generateId(),
            from: lastStroke,
            to: position,
            width: context.lineWidth
        };

        lastStroke = position;
        undoStack.push(stroke);
        redoStack.length = 0;

        syncControls();
        queueDraw(stroke);
    } catch (error) {
        if (storage.get("developer")) {
            alert(`Error @ draw.js: ${error.message}`);
        } else {
            ui.reportBugModal(null, String(error.stack));
        }
        throw error;
    }
}

function end() {
    try {
        isDrawing = false;
        lastStroke = null;
    } catch (error) {
        if (storage.get("developer")) {
            alert(`Error @ draw.js: ${error.message}`);
        } else {
            ui.reportBugModal(null, String(error.stack));
        }
        throw error;
    }
}

function syncControls() {
    try {
        if (canvasIsClear) {
            clearButton?.setAttribute('disabled', 'disabled');
        } else {
            clearButton?.removeAttribute('disabled');
        }
    } catch (error) {
        if (storage.get("developer")) {
            alert(`Error @ draw.js: ${error.message}`);
        } else {
            ui.reportBugModal(null, String(error.stack));
        }
        throw error;
    }
}

function doUndo() {
    try {
        if (!undoStack.length) return false;
        saveIcon.classList.remove('active');
        saveIcon.classList.remove('saved');
        const stroke = undoStack.pop();
        redoStack.push(stroke);
        renderStrokes(undoStack, context);
        syncControls();
        if (stroke && stroke.id) {
            undoQueue.push(stroke.id);
            if (undoTimer) clearTimeout(undoTimer);
            undoTimer = setTimeout(flushUndoQueue, 2000);
        }
        return true;
    } catch (error) {
        if (storage.get("developer")) {
            alert(`Error @ draw.js: ${error.message}`);
        } else {
            ui.reportBugModal(null, String(error.stack));
        }
        throw error;
    }
}

function flushUndoQueue() {
    try {
        if (!undoQueue.length) {
            undoTimer = null;
            return;
        }
        if (isDrawing) {
            undoTimer = setTimeout(flushUndoQueue, 2000);
            return;
        }
        if (canvasIsClear) return;
        if (broadcaster && broadcaster.connected) {
            const toSend = undoQueue.slice();
            undoQueue = [];
            undoTimer = null;
            broadcaster.sendQuiet({ type: 'undo', source: 'clicker', strokes: toSend });
            saveIcon.classList.add('active');
        } else {
            undoTimer = setTimeout(flushUndoQueue, 2000);
        }
    } catch (error) {
        if (storage.get("developer")) {
            alert(`Error @ draw.js: ${error.message}`);
        } else {
            ui.reportBugModal(null, String(error.stack));
        }
        throw error;
    }
}

function doRedo() {
    try {
        if (!redoStack.length) return false;
        saveIcon.classList.remove('active');
        saveIcon.classList.remove('saved');
        const stroke = redoStack.pop();
        undoStack.push(stroke);
        renderStrokes(undoStack, context);
        syncControls();
        queueDraw(stroke);
        return true;
    } catch (error) {
        if (storage.get("developer")) {
            alert(`Error @ draw.js: ${error.message}`);
        } else {
            ui.reportBugModal(null, String(error.stack));
        }
        throw error;
    }
}

function queueDraw(stroke) {
    try {
        if (!stroke) return;
        sendQueue.push(stroke);
        if (sendTimer) clearTimeout(sendTimer);
        sendTimer = setTimeout(flushSendQueue, 2000);
    } catch (error) {
        if (storage.get("developer")) {
            alert(`Error @ draw.js: ${error.message}`);
        } else {
            ui.reportBugModal(null, String(error.stack));
        }
        throw error;
    }
}

function flushSendQueue() {
    try {
        if (!sendQueue.length) {
            sendTimer = null;
            return;
        }
        if (isDrawing) {
            sendTimer = setTimeout(flushSendQueue, 2000);
            return;
        }
        if (canvasIsClear) return;
        if (broadcaster && broadcaster.connected) {
            const toSend = sendQueue.slice();
            sendQueue = [];
            sendTimer = null;
            broadcaster.sendQuiet({ type: 'draw', source: 'clicker', strokes: toSend });
            saveIcon.classList.add('active');
        } else {
            sendTimer = setTimeout(flushSendQueue, 2000);
        }
    } catch (error) {
        if (storage.get("developer")) {
            alert(`Error @ draw.js: ${error.message}`);
        } else {
            ui.reportBugModal(null, String(error.stack));
        }
        throw error;
    }
}

function setHold(button, action) {
    const step = () => {
        try {
            const ok = action();
            if (!ok) {
                stop();
                return;
            }
            delay = Math.max(40, delay * 0.85);
            timer = setTimeout(step, delay);
        } catch (error) {
            if (storage.get("developer")) {
                alert(`Error @ draw.js: ${error.message}`);
            } else {
                ui.reportBugModal(null, String(error.stack));
            }
            throw error;
        }
    };
    function start() {
        try {
            if (!action()) return;
            delay = 400;
            timer = setTimeout(step, delay);
        } catch (error) {
            if (storage.get("developer")) {
                alert(`Error @ draw.js: ${error.message}`);
            } else {
                ui.reportBugModal(null, String(error.stack));
            }
            throw error;
        }
    }
    function stop() {
        try {
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
        } catch (error) {
            if (storage.get("developer")) {
                alert(`Error @ draw.js: ${error.message}`);
            } else {
                ui.reportBugModal(null, String(error.stack));
            }
            throw error;
        }
    }
    try {
        if (!button) return;
        var timer = null;
        var delay = 400;
        const onPointerDown = (ev) => {
            ev.preventDefault();
            start();
        };
        const onPointerUp = stop;
        const onPointerLeave = stop;
        const onKeyDown = (ev) => {
            if ((ev.key === ' ') || (ev.key === 'Enter')) {
                ev.preventDefault();
                start();
            }
        };
        const onKeyUp = (ev) => {
            if ((ev.key === ' ') || (ev.key === 'Enter')) stop();
        };
        button.addEventListener('pointerdown', onPointerDown);
        button.addEventListener('pointerup', onPointerUp);
        button.addEventListener('pointerleave', onPointerLeave);
        button.addEventListener('keydown', onKeyDown);
        button.addEventListener('keyup', onKeyUp);
        return function removeHold() {
            button.removeEventListener('pointerdown', onPointerDown);
            button.removeEventListener('pointerup', onPointerUp);
            button.removeEventListener('pointerleave', onPointerLeave);
            button.removeEventListener('keydown', onKeyDown);
            button.removeEventListener('keyup', onKeyUp);
            stop();
        };
    } catch (error) {
        if (storage.get("developer")) {
            alert(`Error @ draw.js: ${error.message}`);
        } else {
            ui.reportBugModal(null, String(error.stack));
        }
        throw error;
    }
}

function renderStrokes(strokes, context) {
    try {
        context.clearRect(0, 0, canvas.width, canvas.height);
        for (var s of strokes) {
            const stroke = s.stroke || s;
            if (!stroke) return;
            if (stroke.clear) {
                context.clearRect(0, 0, canvas.width, canvas.height);
                canvasIsClear = true;
                return;
            }
            if (stroke.from && stroke.to) {
                canvasIsClear = false;
                context.beginPath();
                context.moveTo(stroke.from.x, stroke.from.y);
                context.lineTo(stroke.to.x, stroke.to.y);
                context.lineWidth = stroke.width || context.lineWidth;
                context.strokeStyle = themes.getCurrentTheme().textColor;
                context.stroke();
            }
        }
        if (strokes[strokes.length - 1] && (!strokes[strokes.length - 1].clear && undoButton)) undoButton.disabled = false;
        if (canvasIsClear) clearButton?.setAttribute('disabled', 'disabled');
    } catch (error) {
        if (storage.get("developer")) {
            alert(`Error @ draw.js: ${error.message}`);
        } else {
            ui.reportBugModal(null, String(error.stack));
        }
        throw error;
    }
}

function clearCanvas(silent = false) {
    try {
        clearButton.setAttribute('disabled', 'disabled');
        context.clearRect(0, 0, canvas.width, canvas.height);
        canvasIsClear = true;
        undoStack = [];
        redoStack = [];
        sendQueue = [];
        undoTimer = null;
        sendTimer = null;
        syncControls();
        if (!silent && broadcaster && broadcaster.connected) broadcaster.sendQuiet({ type: 'clear', source: 'clicker' });
        if (undoButton) undoButton.setAttribute('disabled', 'disabled');
        if (redoButton) redoButton.setAttribute('disabled', 'disabled');
    } catch (error) {
        if (storage.get("developer")) {
            alert(`Error @ draw.js: ${error.message}`);
        } else {
            ui.reportBugModal(null, String(error.stack));
        }
        throw error;
    }
}

async function init(strokes = []) {
    try {
        canvas.style.width = '100%';
        canvas.style.height = '400px';
        canvas.style.padding = '0';
        canvas.style.borderRadius = '0.5rem';
        canvas.style.backgroundColor = themes.getCurrentTheme().surfaceColor;
        canvas.width = container.clientWidth;
        canvas.height = 400;
        canvas.style.touchAction = 'none';
        context.lineWidth = 3;
        context.lineCap = 'round';
        context.strokeStyle = themes.getCurrentTheme().textColor;
        if (undoButton) undoButton.disabled = true;
        if (redoButton) redoButton.disabled = true;
        if (clearButton) clearButton.disabled = true;
        if (strokes && Array.isArray(strokes) && strokes.length) {
            const normalized = [];
            strokes.forEach(s => {
                var st = s.stroke || s;
                if (!st) return;
                try {
                    if (typeof st === 'string') {
                        const parsed = JSON.parse(st);
                        if (!parsed || (typeof parsed !== 'object')) return;
                        st = parsed;
                    }
                } catch (e) {
                    return;
                }
                if (st.clear) {
                    normalized.length = 0;
                    return;
                }
                normalized.push(st);
            });
            undoStack = normalized.slice();
            redoStack.length = 0;
            renderStrokes(undoStack, context);
            syncControls();
        }
        canvas.removeAttribute('disabled');
        reconnect.classList.add('connected');
    } catch (error) {
        if (storage.get("developer")) {
            alert(`Error @ draw.js: ${error.message}`);
        } else {
            ui.reportBugModal(null, String(error.stack));
        }
        throw error;
    }
}
