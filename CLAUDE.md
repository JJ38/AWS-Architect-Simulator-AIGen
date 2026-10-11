# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A learning project (TypeScript, React, AWS, Terraform) building a visual AWS architecture
editor: drag-and-drop nodes/connections on a canvas, with a later simulation layer for
cost/performance based on simulated traffic. Illustrative accuracy is the goal (±25% /
ranges), not precision — see `todo.md` for the full roadmap, split into Track 1 (the app
itself) and Track 2 (hosting the app on AWS via Terraform, a separate concern from the
app's own AWS-visualization feature). Read `todo.md` for current priorities before
planning new work.

## Commands

- `npm run dev` — start the Vite dev server
- `npm run build` — type-check (`tsc -b`) and production build
- `npm run lint` — ESLint (`eslint.config.js`)
- `npm run preview` — preview the production build

No test runner is configured yet.

Type-checking and linting are two separate tools that both surface as editor
diagnostics: `tsconfig.app.json` (`noUnusedLocals`/`noUnusedParameters` are on)
drives the TypeScript compiler's checks; `eslint.config.js` drives ESLint's
separate rule set. `npm run lint` only runs the latter.

## Architecture

Entry point: `index.html` → `src/main.tsx` renders `<Layout />` into `#root`.

- **`Layout.tsx`** is the shared-state root — the nearest common ancestor of
  `Sidebar` and `Canvas`, so any state both need (e.g. which service is selected
  for placement) is lifted here via `useState`, not into `main.tsx` (which is a
  one-time script, not a component, and can't hold hooks).
- **`Sidebar.tsx`** renders the service palette from a hardcoded `services` array
  and owns the selection toggle logic (compute `isSelected` per item, click
  handler decides select vs. deselect). Child components receive derived,
  specific props (`isSelected: boolean`, `onClick: () => void`) rather than the
  raw shared state — keeps them presentational.
- **`SidebarButton.tsx`** is presentational only.
- **`Canvas.tsx`** wraps `@xyflow/react`'s `<ReactFlow>` for the diagram surface.
- `zustand` is installed for when cross-component state outgrows prop-drilling
  (nodes/edges/selection all needing to stay in sync), but isn't wired in yet —
  current state is plain `useState` lifted to `Layout`.

**CSS convention**: one `.css` file per component under `src/styles/`, imported
directly in the matching `.tsx` file (e.g. `import '../styles/Sidebar.css'`).
These are plain CSS imports, not CSS Modules — class names are global across
the whole app regardless of which component's file defines them, so avoid
reusing generic class names (e.g. `wrapper`) across components; prefix instead
(`sidebar-wrapper`, `canvas-wrapper`). `main.css` sets a global
`box-sizing: border-box` reset and the `html`/`body`/`#root` height chain that
full-bleed layout components rely on (`height: 100%` all the way down, rather
than `vh` on nested elements).

**Service icons**: AWS icon SVGs live in `public/serviceImages/` and are
referenced as root-relative string paths (`/serviceImages/...`) directly in the
`services` data array, not imported as JS modules — this fits the data-driven
array-of-strings pattern instead of needing one `import` per icon. Files in
`public/` are served as-is with no bundler processing.

The **`terraform/`** directory is unrelated to the app's own architecture-
visualization feature — it provisions the AWS infra to *host* this app
(Track 2), starting with a remote state backend (S3 + DynamoDB lock).

Future **simulation engine** (Track 1, later): keep it as plain,
framework-free TS functions (graph + traffic in, metrics out) — testable, and
keeps sim logic out of components.

## Working conventions (this user is learning TS/React/AWS/Terraform)

- This is a learning project — the user wants to write the implementation
  themselves. Default to explaining approach/tradeoffs/mechanics rather than
  writing the code, even for requests that read as "how do I do X" or small
  scoped tasks. Only write code when explicitly asked to implement/add/fix
  something directly.
- When a conversation explains a new TS/React/AWS/Terraform concept (Context,
  hooks, etc. — not project-specific code review), add a short entry to
  `react-concepts.md` (repo root) rather than leaving it only in chat — this
  is the portable copy the user reads from environments without Claude
  access, so it's the source of truth, checked into git like any other file.
  Also mirror the entry into the cheatsheet artifact (same content, short and
  digestible) at
  https://claude.ai/code/artifact/4e73fff0-0437-4ed3-9bdc-1c43b24be4dd
  — republish to that same URL (pass it as `url` to the Artifact tool) so it
  updates in place instead of minting a new artifact each session.
- Prefer named handler functions over inline anonymous ones once logic is more
  than a one-liner — extract for readability, not because inline is wrong (it's
  the normal default for simple cases).
- Prefer a plain closure variable in comparisons (`selectedService === x ? ... `)
  over the `useState` updater-function form (`prev => ...`) when there's no
  stale-closure risk — clearer to read, and behaves identically in that case.
- Explanations should cover the *why* (browser/language mechanics), not just the
  fix — this user is deliberately building conceptual understanding of
  TypeScript/React/CSS mechanics alongside the app itself.