import * as ui from "/src/modules/ui.js";
import storage from '/src/modules/storage.js';
import * as themes from '/src/themes/themes.js';

export default function initDraw(domain) {
    const wsUrl = `${domain.replace('http', 'ws')}/ws`;
    var ws = null;
    var isDrawing = false;
    var lastStroke = null;
    var undoStack = [];
    var redoStack = [];
    var sendQueue = [];
    var sendTimer = null;
    var undoQueue = [];
    var undoTimer = null;

    const container = document.querySelector('[data-answer-mode="draw"]');
    const undoButton = container.querySelector('[data-action="undo"]');
    const redoButton = container.querySelector('[data-action="redo"]');
    if (!container) return null;

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
            if (undoButton) undoButton.disabled = !undoStack.length;
            if (redoButton) redoButton.disabled = !redoStack.length;
            if (!undoStack.length && !redoStack.length) {
                container.querySelector('[data-action="clear"]')?.setAttribute('disabled', 'disabled');
            } else {
                container.querySelector('[data-action="clear"]')?.removeAttribute('disabled');
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
            if (ws && (ws.readyState === WebSocket.OPEN)) {
                const toSend = undoQueue.slice();
                undoQueue = [];
                undoTimer = null;
                toSend.forEach(id => {
                    ws.send(JSON.stringify({ type: 'undo', strokeId: id }));
                });
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
            if (ws && (ws.readyState === WebSocket.OPEN)) {
                const toSend = sendQueue.slice();
                sendQueue = [];
                sendTimer = null;
                toSend.forEach(st => {
                    ws.send(JSON.stringify({ type: 'draw', stroke: st }));
                });
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
            strokes.forEach(s => {
                const stroke = s.stroke || s;
                if (!stroke) return;
                if (stroke.clear) {
                    context.clearRect(0, 0, canvas.width, canvas.height);
                    return;
                }
                if (stroke.from && stroke.to) {
                    context.beginPath();
                    context.moveTo(stroke.from.x, stroke.from.y);
                    context.lineTo(stroke.to.x, stroke.to.y);
                    context.lineWidth = stroke.width || context.lineWidth;
                    context.strokeStyle = themes.getCurrentTheme().textColor;
                    context.stroke();
                }
            });
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
        canvas.addEventListener('pointerdown', start, { passive: false });
        canvas.addEventListener('pointermove', move, { passive: false });
        canvas.addEventListener('pointerup', end, { passive: false });
        canvas.addEventListener('pointerleave', end, { passive: false });

        undoButton?.addEventListener('click', (e) => {
            e.preventDefault();
            doUndo();
        });
        redoButton?.addEventListener('click', (e) => {
            e.preventDefault();
            doRedo();
        });
        undoButton._removeHold = setHold(undoButton, doUndo);
        redoButton._removeHold = setHold(redoButton, doRedo);

        container.querySelector('[data-action="clear"]')?.addEventListener('click', () => {
            context.clearRect(0, 0, canvas.width, canvas.height);
            undoStack.push({ clear: true });
            redoStack.length = 0;
            syncControls();
            if (ws && (ws.readyState === WebSocket.OPEN)) ws.send(JSON.stringify({ type: 'clear' }));
        });

        if (wsUrl) {
            const params = new URLSearchParams({
                role: 'student',
                seatCode: storage.get('code') || '',
                source: 'clicker',
                password: storage.get('password') || ''
            });
            ws = new WebSocket(`${wsUrl}?${params.toString()}`);
            ws.addEventListener('open', () => {
                (async () => {
                    try {
                        const sessionKey = `clicker::${storage.get('code') || 'unknown'}`;
                        const getStrokes = await fetch(`${domain}/draw/session/${encodeURIComponent(sessionKey)}/strokes${storage.get('password') ? `?seatCode=${encodeURIComponent(storage.get('code') || '')}&password=${encodeURIComponent(storage.get('password'))}` : ''}`);
                        if (getStrokes.status === 200) {
                            const strokesJSON = await getStrokes.json();
                            if (strokesJSON.strokes && Array.isArray(strokesJSON.strokes) && strokesJSON.strokes.length) {
                                const normalized = [];
                                strokesJSON.strokes.forEach(s => {
                                    const st = s.stroke || s;
                                    if (!st) return;
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
            });
            ws.addEventListener('message', (e) => {
                try {
                    const data = JSON.parse(e.data);
                    if (data && (data.type === 'resetPeriod')) {
                        const period = String(data.period);
                        const myCode = String(storage.get('code') || '');
                        if (myCode.startsWith(period)) {
                            context.clearRect(0, 0, canvas.width, canvas.height);
                            undoStack.length = 0;
                            redoStack.length = 0;
                            syncControls();
                        }
                    }
                } catch (error) {
                    if (storage.get("developer")) {
                        alert(`Error @ draw.js: ${error.message}`);
                    } else {
                        ui.reportBugModal(null, String(error.stack));
                    }
                    throw error;
                }
            });
        }

        let destroy = function () {
            if (ws && (ws.readyState === WebSocket.OPEN)) ws.close();
            if (sendTimer) {
                clearTimeout(sendTimer);
                sendTimer = null;
            }
            canvas.removeEventListener('pointerdown', start, { passive: false });
            canvas.removeEventListener('pointermove', move, { passive: false });
            canvas.removeEventListener('pointerup', end, { passive: false });
            canvas.removeEventListener('pointerleave', end, { passive: false });
            if (undoButton && undoButton._removeHold) undoButton._removeHold();
            if (redoButton && redoButton._removeHold) redoButton._removeHold();
        };

        return { canvas, context: context, ws, destroy, _sendQueueSize: () => sendQueue.length };
    } catch (error) {
        if (storage.get("developer")) {
            alert(`Error @ draw.js: ${error.message}`);
        } else {
            ui.reportBugModal(null, String(error.stack));
        }
        throw error;
    }
}
