# renderer/

## Responsibility

Legacy/secondary renderer package. A standalone Create React App (CRA) scaffold
that predates the current Vite + Electron architecture. It is **not** part of the
active application build or runtime.

- Package name: `renderer` (v0.1.0, private).
- Stack: React 18 + react-dom 18, TypeScript 4.9.5, `react-scripts` 5.0.1
  (CRA toolchain), `web-vitals`, Testing Library (jest-dom, react, user-event).
- The root `answercue` package is the real app: it uses Vite 5 + React 19 and
  builds the Electron renderer from the repo root. This `renderer/` folder is a
  leftover CRA template and is not referenced by any root script, dependency, or
  build step.

## Design

- Standard CRA layout: `public/` static assets, `src/` TypeScript source,
  `tsconfig.json` (CRA defaults: `target: es5`, `jsx: react-jsx`, `noEmit`,
  `include: ["src"]`).
- `src/index.tsx` mounts `App` into `#root` via `ReactDOM.createRoot` under
  `React.StrictMode` and calls `reportWebVitals()`.
- `src/App.tsx` is the untouched CRA starter component (React logo, "Learn
  React" link) — no AnswerCue functionality.
- `public/index.html` is the default CRA template (title "React App", generic
  meta tags); `public/manifest.json` carries AnswerCue branding but is inert.
- No custom build config, no Electron wiring, no preload/IPC, no app logic.

## Flow

- Dev: `npm start` → `react-scripts start` (CRA dev server).
- Build: `npm build` → `react-scripts build` (CRA production bundle to `build/`).
- Test: `npm test` → `react-scripts test` (Jest via CRA).
- These scripts are self-contained to this folder and are not invoked by the
  root package's `dev`/`build`/`start`/`dist` pipelines.

## Integration

- **None.** The root `answercue` package does not import, bundle, or reference
  this folder. The active renderer is built by Vite from the repo root and
  loaded by Electron (`dist-electron/electron/main.js`).
- Status: **legacy / dormant.** Retained as a historical CRA scaffold. It can be
  removed or archived without affecting the application build, runtime, or
  tests. If it is ever revived, it would need to be migrated to the current
  Vite + React 19 + Electron toolchain.
