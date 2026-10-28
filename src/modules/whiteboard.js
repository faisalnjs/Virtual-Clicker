import HTTPSockBroadcast from 'httpsock/broadcast.mjs';
import storage from './storage.js';
import '@excalidraw/excalidraw/index.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Excalidraw, restoreElements } from '@excalidraw/excalidraw';

const domain = ((location.hostname.includes('click')) || location.hostname.includes('127')) ? `https://${location.hostname.includes('beta') ? 'beta.' : ''}ws.api.check.vssfalcons.com` : `http://${document.domain}:1234`;
let broadcaster = null;
let pingTimer = null;
let reconnectTimer = null;
let latestScene = null;
let viewerRoot = null;
let viewerApi = null;
let currentScene = {};
let viewerTheme = whiteboardState().theme;
let manualViewport = false;
let automaticViewportUntil = 0;
const toggleWhiteboardButton = document.querySelector('[data-toggle-whiteboard]');
const toggleFullscreenWhiteboardButton = document.querySelector('[data-toggle-fullscreen-whiteboard]');

function clickerLayout() {
  const clicker = document.querySelector('.clicker');
  if (!clicker) return {};
  let content = clicker.querySelector('.clicker-content');
  if (!content) {
    content = document.createElement('div');
    content.className = 'clicker-content';
  }
  return { clicker, content };
}

function whiteboardState() {
  const styles = getComputedStyle(document.body);
  return {
    theme: styles.colorScheme.includes('dark') ? 'dark' : 'light',
    viewBackgroundColor: styles.getPropertyValue('--surface-color').trim(),
    currentItemStrokeColor: styles.getPropertyValue('--text-color').trim(),
  };
}

toggleWhiteboardButton.addEventListener('click', toggle);
toggleFullscreenWhiteboardButton.addEventListener('click', () => {
  document.querySelector('.clicker')?.classList.toggle('whiteboard-fullscreen');
  setTimeout(() => {
    requestAnimationFrame(autoFocus);
  }, 250);
});

function toggle() {
  const { clicker } = clickerLayout();
  if (!clicker) return;
  let viewer = document.getElementById('whiteboard');
  if (!viewer) {
    manualViewport = false;
    viewer = document.createElement('section');
    viewer.id = 'whiteboard';
    viewer.className = 'enhanced-card';
    const buttonGrid = document.createElement('div');
    buttonGrid.className = 'button-grid inputs';
    const focusWhiteboard = document.createElement('button');
    focusWhiteboard.textContent = 'Focus';
    focusWhiteboard.addEventListener('click', () => {
      manualViewport = false;
      requestAnimationFrame(focus);
    });
    buttonGrid.append(focusWhiteboard);
    viewer.append(buttonGrid);
    const root = document.createElement('div');
    root.className = 'whiteboard-wrapper';
    viewer.append(root);
    clicker.querySelector('.input-group').append(viewer);
    viewerRoot = createRoot(root);
    viewerTheme = whiteboardState().theme;
    renderWhiteboard();
    connect();
    return;
  }
  viewer.toggleAttribute('hidden');
  if (viewer.hidden) disconnect();
  else connect();
  renderScene();
  setTimeout(() => {
    requestAnimationFrame(autoFocus);
  }, 250);
}

function focus() {
  if (!viewerApi) return;
  automaticViewportUntil = performance.now() + 1000;
  const elements = viewerApi.getSceneElements();
  if (!elements.length) {
    viewerApi.updateScene({ appState: { zoom: { value: 1 } } });
    return;
  }
  viewerApi.scrollToContent(elements, { fitToContent: true, fitToViewport: true, viewportZoomFactor: 0.9, animate: true });
}

function autoFocus() {
  if (!manualViewport) focus();
}

function renderWhiteboard() {
  if (!viewerRoot) return;
  automaticViewportUntil = performance.now() + 1000;
  viewerRoot.render(React.createElement(Excalidraw, {
    initialData: latestScene || { elements: [], appState: whiteboardState(), files: {} },
    viewModeEnabled: true,
    theme: viewerTheme,
    excalidrawAPI: value => {
      viewerApi = value;
      requestAnimationFrame(autoFocus);
    },
    onScrollChange: () => {
      if (performance.now() > automaticViewportUntil) manualViewport = true;
    }
  }));
}

function syncWhiteboardTheme() {
  const theme = whiteboardState().theme;
  if (theme === viewerTheme) return;
  viewerTheme = theme;
  if (latestScene) latestScene.appState = { ...latestScene.appState, theme };
  automaticViewportUntil = performance.now() + 1000;
  viewerApi?.updateScene({ appState: { theme } });
  renderWhiteboard();
}

function renderScene() {
  if (!viewerApi || !latestScene) return;
  if (JSON.stringify(currentScene) === JSON.stringify(latestScene)) return;
  currentScene = latestScene;
  automaticViewportUntil = performance.now() + 1000;
  viewerApi.updateScene({ elements: latestScene.elements, appState: latestScene.appState });
  requestAnimationFrame(autoFocus);
}

function receive(response) {
  try {
    const data = JSON.parse(response);
    const scene = (data.type === 'whiteboard') ? data.scene : data.messages?.find(message => message.content?.type === 'whiteboard')?.content?.scene;
    if (!scene || !Array.isArray(scene.elements)) return;
    const { gridSize, viewBackgroundColor } = scene.appState || {};
    latestScene = {
      elements: restoreElements(scene.elements, null),
      appState: { ...whiteboardState(), gridSize, ...(viewBackgroundColor ? { viewBackgroundColor } : {}) },
      files: scene.files || {},
    };
    renderScene();
  } catch (error) {
    console.error('Error receiving whiteboard data:', error);
  }
}

function connect() {
  if (broadcaster || !document.getElementById('whiteboard') || document.getElementById('whiteboard').hidden || !storage.get('code') || !storage.get('password')) return;
  broadcaster = new HTTPSockBroadcast({
    server: `${domain}/${String(storage.get('code'))[0]}/whiteboard?noBroadcast=true`,
    cert: './certs/chain.pem',
    auth: {
      username: storage.get('code'),
      password: storage.get('password')
    },
    callback: receive,
    close: reconnect,
    error: reconnect
  });
  broadcaster.sendQuiet('ping');
  pingTimer = setInterval(() => broadcaster?.sendQuiet('ping'), 2000);
}

function reconnect() {
  broadcaster = null;
  clearInterval(pingTimer);
  pingTimer = null;
  if (!document.getElementById('whiteboard') || document.getElementById('whiteboard').hidden) return;
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(connect, 1000);
}

function disconnect() {
  clearInterval(pingTimer);
  clearTimeout(reconnectTimer);
  pingTimer = null;
  reconnectTimer = null;
  broadcaster?.close?.();
  broadcaster = null;
}

const themeObserver = new MutationObserver(syncWhiteboardTheme);
themeObserver.observe(document.body, { attributes: true, attributeFilter: ['data-theme', 'style'] });
themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncWhiteboardTheme);
