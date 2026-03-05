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

    const container = document.querySelector('[data-answer-mode="draw"]');
    const undoButton = container.querySelector('[data-action="undo"]');
    const redoButton = container.querySelector('[data-action="redo"]');
    if (!container) return null;

    const canvas = container.querySelector('canvas');
    canvas.style.width = '100%';
    canvas.style.height = '400px';
    canvas.style.padding = '0 0.5em';
    canvas.style.borderRadius = '0.5rem';
    canvas.style.backgroundColor = themes.getCurrentTheme().surfaceColor;
    canvas.width = container.clientWidth;
    canvas.height = 400;
    canvas.style.touchAction = 'none';

    const ctx = canvas.getContext('2d');
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.strokeStyle = themes.getCurrentTheme().textColor;

    function currentPosition(e) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left,
            y: (e.clientY || (e.touches && e.touches[0].clientY)) - rect.top
        };
    }

    function start(e) {
        e.preventDefault();
        isDrawing = true;
        lastStroke = currentPosition(e);
    }

    function generateId() {
        try {
            return (crypto && crypto.randomUUID) ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2, 10);
        } catch (e) {
            return 'id-' + Math.random().toString(36).slice(2, 10);
        }
    }

    function move(e) {
        if (!isDrawing) return;
        e.preventDefault();

        const p = currentPosition(e);
        ctx.beginPath();
        ctx.moveTo(lastStroke.x, lastStroke.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();

        const stroke = { id: generateId(), from: lastStroke, to: p, color: themes.getCurrentTheme().textColor, width: ctx.lineWidth };
        lastStroke = p;
        undoStack.push(stroke);
        redoStack.length = 0;

        syncControls();
        queueDraw(stroke);
    }

    function end() {
        isDrawing = false;
        lastStroke = null;
    }

    function syncControls() {
        if (undoButton) undoButton.disabled = !undoStack.length;
        if (redoButton) redoButton.disabled = !redoStack.length;
        if (!undoStack.length && !redoStack.length) {
            container.querySelector('[data-action="clear"]')?.setAttribute('disabled', 'disabled');
        } else {
            container.querySelector('[data-action="clear"]')?.removeAttribute('disabled');
        }
    }

    function doUndo() {
        if (!undoStack.length) return false;
        const stroke = undoStack.pop();
        redoStack.push(stroke);
        renderStrokes(undoStack, ctx);
        syncControls();
        if (ws && (ws.readyState === WebSocket.OPEN) && stroke && stroke.id) ws.send(JSON.stringify({ type: 'undo', strokeId: stroke.id }));
        return true;
    }

    function doRedo() {
        if (!redoStack.length) return false;
        const stroke = redoStack.pop();
        undoStack.push(stroke);
        renderStrokes(undoStack, ctx);
        syncControls();
        queueDraw(stroke);
        return true;
    }

    function queueDraw(stroke) {
        if (!stroke) return;
        sendQueue.push(stroke);
        if (!sendTimer) sendTimer = setTimeout(flushSendQueue, 2000);
    }

    function flushSendQueue() {
        if (!sendQueue.length) {
            sendTimer = null;
            return;
        }
        if (ws && (ws.readyState === WebSocket.OPEN)) {
            const toSend = sendQueue.slice();
            sendQueue = [];
            sendTimer = null;
            try {
                toSend.forEach(st => {
                    try { ws.send(JSON.stringify({ type: 'draw', stroke: st })); } catch (e) { console.warn('ws send failed', e); }
                });
            } catch (e) {
                console.warn('flushSendQueue error', e);
            }
        } else {
            sendTimer = setTimeout(flushSendQueue, 2000);
        }
    }

    function setHold(button, action) {
        if (!button) return;
        var timer = null;
        var delay = 400;
        const step = () => {
            const ok = action();
            if (!ok) {
                stop();
                return;
            }
            delay = Math.max(40, delay * 0.85);
            timer = setTimeout(step, delay);
        };
        function start() {
            if (!action()) return;
            delay = 400;
            timer = setTimeout(step, delay);
        }
        function stop() {
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
        }
        button.addEventListener('pointerdown', (ev) => {
            ev.preventDefault();
            start();
        });
        button.addEventListener('pointerup', stop);
        button.addEventListener('pointerleave', stop);
        button.addEventListener('keydown', (ev) => {
            if ((ev.key === ' ') || (ev.key === 'Enter')) {
                ev.preventDefault();
                start();
            }
        });
        button.addEventListener('keyup', (ev) => {
            if ((ev.key === ' ') || (ev.key === 'Enter')) stop();
        });
    }

    function renderStrokes(strokes, ctx) {
        try {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            strokes.forEach(s => {
                const stroke = s.stroke || s;
                if (!stroke) return;
                if (stroke.clear) {
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    return;
                }
                if (stroke.from && stroke.to) {
                    ctx.beginPath();
                    ctx.moveTo(stroke.from.x, stroke.from.y);
                    ctx.lineTo(stroke.to.x, stroke.to.y);
                    ctx.lineWidth = stroke.width || ctx.lineWidth;
                    ctx.strokeStyle = stroke.color || themes.getCurrentTheme().textColor;
                    ctx.stroke();
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
        setHold(undoButton, doUndo);
        setHold(redoButton, doRedo);

        container.querySelector('[data-action="clear"]')?.addEventListener('click', () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            undoStack.push({ clear: true });
            redoStack.length = 0;
            syncControls();
            if (ws && (ws.readyState === WebSocket.OPEN)) ws.send(JSON.stringify({ type: 'clear' }));
        });

        if (wsUrl) {
            const params = new URLSearchParams({
                role: 'student',
                seatCode: storage.get('code') || '',
                source: 'clicker'
            });
            ws = new WebSocket(`${wsUrl}?${params.toString()}`);
            ws.addEventListener('open', () => {
                (async () => {
                    try {
                        const sessionKey = `clicker::${storage.get('code') || 'unknown'}`;
                        const getStrokes = await fetch(`${domain}/draw/session/${encodeURIComponent(sessionKey)}/strokes`);
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
                                renderStrokes(undoStack, ctx);
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
        }

        return { canvas, ctx, ws };
    } catch (error) {
        if (storage.get("developer")) {
            alert(`Error @ draw.js: ${error.message}`);
        } else {
            ui.reportBugModal(null, String(error.stack));
        }
        throw error;
    }
}
