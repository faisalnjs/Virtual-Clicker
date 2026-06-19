import * as ui from "/src/modules/ui.js";
import storage from '/src/modules/storage.js';
import * as themes from '/src/themes/themes.js';
import HTTPSockClient from 'httpsock/client.mjs';
import HTTPSockBroadcast from 'httpsock/broadcast.mjs';

export default function initDraw(domain) {
    var isDrawing = false;
    var lastStroke = null;
    var undoStack = [];
    var redoStack = [];
    var sendQueue = [];
    var sendTimer = null;
    var undoQueue = [];
    var undoTimer = null;
    var client = null;
    var broadcaster = null;
    var canvasIsClear = true;

    const container = document.querySelector('[data-answer-mode="draw"]');
    if (!container) return null;
    const undoButton = container.querySelector('[data-action="undo"]');
    const redoButton = container.querySelector('[data-action="redo"]');
    const clearButton = container.querySelector('[data-action="clear"]');
    const savedIcon = container.querySelector('.bi-floppy');

    const canvas = container.querySelector('canvas');
    canvas.style.width = '100%';
    canvas.style.height = '400px';
    canvas.style.padding = '0';
    canvas.style.borderRadius = '0.5rem';
    canvas.style.backgroundColor = themes.getCurrentTheme().surfaceColor;
    canvas.width = container.clientWidth;
    canvas.height = 400;
    canvas.style.touchAction = 'none';

    const context = canvas.getContext('2d');
    context.lineWidth = 3;
    context.lineCap = 'round';
    context.strokeStyle = themes.getCurrentTheme().textColor;

    const reconnect = document.querySelector('.live-drawings-reconnect');
    reconnect.classList.remove('active');
    if (undoButton) undoButton.disabled = true;
    if (redoButton) redoButton.disabled = true;
    if (clearButton) clearButton.disabled = true;

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
            savedIcon.classList.remove('active');

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
            savedIcon.classList.remove('active');
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
            savedIcon.classList.remove('active');
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

    function messageHandler(data) {
        // console.log(data);
        switch (data.type) {
            case 'welcome':
                console.log('🟢 Connected to Live Drawings server!');
                (async () => {
                    try {
                        if (data.strokes && Array.isArray(data.strokes) && data.strokes.length) {
                            const normalized = [];
                            data.strokes.forEach(s => {
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
                    } catch (error) {
                        if (storage.get("developer")) {
                            alert(`Error @ draw.js: ${error.message}`);
                        } else {
                            ui.reportBugModal(null, String(error.stack));
                        }
                        throw error;
                    }
                })();

                broadcaster = new HTTPSockBroadcast({
                    server: `${domain}/${storage.get('code')[0]}`,
                    cert: './certs/chain.pem',
                    auth: {
                        username: storage.get('code') || '',
                        password: storage.get('password') || ''
                    },
                    callback: () => { },
                    close: streamClosed,
                    error: streamClosed
                });

                broadcaster.sendQuiet({ type: 'message', message: `${storage.get('code') || ''} has joined` });

                reconnect.classList.remove('active');
                break;
            case 'clear':
                try {
                    const parsed = (typeof data === 'string') ? JSON.parse(data) : data;
                    if (parsed && String(storage.get('code') || '').startsWith(String(parsed.period))) clearCanvas(true);
                } catch (error) {
                    if (storage.get("developer")) {
                        alert(`Error @ draw.js: ${error.message}`);
                    } else {
                        ui.reportBugModal(null, String(error.stack));
                    }
                    throw error;
                }
                break;
            case 'message':
                if (!data.message) break;
                var icon = 'bi bi-info-circle';
                var type = 'info';
                if (data.message.toLowerCase().includes('error')) {
                    icon = 'bi bi-x-circle';
                    type = 'error';
                } else if (data.message.toLowerCase().includes('success')) {
                    icon = 'bi bi-check-circle';
                    type = 'success';
                } else if (data.message.toLowerCase().includes('save')) {
                    icon = 'bi bi-floppy';
                    type = 'success';
                    canvasIsClear = false;
                    if (undoButton) undoButton.disabled = !undoStack.length;
                    if (redoButton) redoButton.disabled = !redoStack.length;
                    if (clearButton) clearButton.disabled = !undoStack.length;
                    savedIcon.classList.add('active');
                    break;
                } else if (data.message.toLowerCase().includes('clear')) {
                    icon = 'bi bi-eraser';
                    type = 'success';
                    if (undoButton) undoButton.disabled = !undoStack.length;
                    if (redoButton) redoButton.disabled = !redoStack.length;
                }
                if (data.message) ui.toast(data.message, 5000, type, icon);
                break;
        }
    }

    function streamClosed() {
        reconnect.classList.add('active');
        canvas.setAttribute('disabled', 'disabled');
    }

    function clearCanvas(silent = false) {
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
    }

    try {
        canvas.addEventListener('pointerdown', start, { passive: false });
        canvas.addEventListener('pointermove', move, { passive: false });
        canvas.addEventListener('pointerup', end, { passive: false });
        canvas.addEventListener('pointerleave', end, { passive: false });

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
        undoButton._removeHold = setHold(undoButton, doUndo);
        redoButton._removeHold = setHold(redoButton, doRedo);
        clearButton?.addEventListener('click', clearButtonHandler);

        client = new HTTPSockClient({
            server: `${domain}/${storage.get('code')[0]}`,
            cert: './certs/chain.pem',
            auth: {
                username: storage.get('code') || '',
                password: storage.get('password') || ''
            },
            callback: messageHandler,
            close: streamClosed,
            error: streamClosed
        });

        client.stream();

        let destroy = function () {
            if (client && client.connected) try {
                client.stop();
            } catch (e) {
                console.warn('draw destroy failed', e);
            }
            if (sendTimer) {
                clearTimeout(sendTimer);
                sendTimer = null;
            }
            canvas.removeEventListener('pointerdown', start, { passive: false });
            canvas.removeEventListener('pointermove', move, { passive: false });
            canvas.removeEventListener('pointerup', end, { passive: false });
            canvas.removeEventListener('pointerleave', end, { passive: false });
            undoButton?.removeEventListener('click', undoButtonHandler);
            redoButton?.removeEventListener('click', redoButtonHandler);
            clearButton?.removeEventListener('click', clearButtonHandler);
            if (undoButton && undoButton._removeHold) undoButton._removeHold();
            if (redoButton && redoButton._removeHold) redoButton._removeHold();
            reconnect.classList.add('active');
        };

        return { canvas, context: context, client, broadcaster, destroy, _sendQueueSize: () => sendQueue.length };
    } catch (error) {
        if (storage.get("developer")) {
            alert(`Error @ draw.js: ${error.message}`);
        } else {
            ui.reportBugModal(null, String(error.stack));
        }
        throw error;
    }
}
