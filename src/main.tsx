import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App"
import "./index.css"

const THEME_CACHE_KEY = 'natively_resolved_theme';

// Set platform attribute synchronously — before React renders — so CSS selectors
// like html[data-platform="win32"] work immediately without a flash on first paint.
document.documentElement.setAttribute(
  'data-platform',
  window.electronAPI?.platform ?? (typeof process !== 'undefined' ? process.platform : '') ?? ''
);

// Step 1: Apply cached theme synchronously — before React renders.
// This ensures useResolvedTheme()'s initial useState read sees the correct value.
// Guard localStorage access against Chromium LevelDB corruption (ghostery/brave bug).
let cachedTheme: 'light' | 'dark' | null = null;
try {
  cachedTheme = localStorage.getItem(THEME_CACHE_KEY) as 'light' | 'dark' | null;
} catch {
  // localStorage unavailable/corrupt — fall back to system preference
}
const systemTheme = window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
const urlTheme = new URLSearchParams(window.location.search).get('theme');
const previewTheme = urlTheme === 'light' || urlTheme === 'dark' ? urlTheme : null;
document.documentElement.setAttribute('data-theme', previewTheme ?? cachedTheme ?? systemTheme);
if (previewTheme) {
  try { localStorage.setItem(THEME_CACHE_KEY, previewTheme); } catch { /* non-critical */ }
}

// Step 2: Confirm/correct from main process (authoritative) and keep cache in sync.
// URL overrides are for local visual preview, so they should not be overwritten
// by the persisted Electron/native theme a moment after first paint.
if (window.electronAPI?.getThemeMode && !previewTheme) {
  window.electronAPI.getThemeMode().then(({ resolved }) => {
    document.documentElement.setAttribute('data-theme', resolved);
    try { localStorage.setItem(THEME_CACHE_KEY, resolved); } catch { /* non-critical */ }
  });

  window.electronAPI?.onThemeChanged?.(({ resolved }) => {
    document.documentElement.setAttribute('data-theme', resolved);
    try { localStorage.setItem(THEME_CACHE_KEY, resolved); } catch { /* non-critical */ }
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
