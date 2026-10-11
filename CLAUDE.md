# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A visual AWS architecture editor (TypeScript, React, AWS, Terraform): drag-and-drop
nodes/connections on a canvas, convert the diagram to/from Terraform, and run a
simulation layer that estimates cost and capacity for a given traffic profile.
Illustrative accuracy is the goal (±25% / ranges), not precision — see `todo.md`
for the full roadmap, split into Track 1 (the app itself) and Track 2 (hosting
the app on AWS via Terraform, a separate concern from the app's own
AWS-visualization feature). Read `todo.md` for current priorities before
planning new work.

**Provenance**: this repo started as a fresh-history snapshot import of
`AWS-Architect-Simulator` (a separate, still-active learning project at the
same point in its development) — no shared git history, no shared remote. The
two repos are intentionally decoupled so this one can be built out
aggressively without touching the original.

## Commands

- `npm run dev` — start the Vite dev server
- `npm run build` — type-check (`tsc -b`) and production build
- `npm run lint` — ESLint (`eslint.config.js`)
- `npm run preview` — preview the production build

No test runner is configured yet.

Type-checking and linting are two separate tools that both surface as editor
diagnostics: `tsconfig.app.json` (`noUnusedLocals`/`noUnusedParameters` are on)
drives the TypeScript compiler's checks; `eslint.config.js` drives ESLint's
separate rule set. `npm run lint` only runs the latter. `npm run lint`
currently reports a backlog of pre-existing issues (mostly `no-explicit-any` in
the dynamic property system, and `edgeType`/`counterPart` params that are
unused in several `Resource` subclasses because they fulfil an abstract
interface) — not a blocker, but don't add to that pile without reason, and
clean up pieces of it opportunistically when touching nearby code.

## Architecture

Entry point: `index.html` → `src/main.tsx` renders `<Layout />` into `#root`.

The codebase follows a Controller/Model split rather than putting logic
directly in components:

- **`Layout.tsx`** is the shared-state root — owns all cross-cutting
  `useState` (selected service, nodes, edges, which widget is open, etc.) and
  passes derived, specific props down. `zustand` is installed for when this
  outgrows prop-drilling, but isn't wired in yet.
- **`Sidebar.tsx`** renders the service palette from `constants.ts`'s
  `services` array plus action buttons (Save/Load/Terraform — no Cost button;
  see `TrafficPuck` below, it's not a sidebar-toggled widget). Placement
  is click-to-select-then-click-to-place (click a sidebar button, then click
  the canvas pane) — not HTML5 drag-and-drop.
- **`Canvas.tsx`** wraps `@xyflow/react`'s `<ReactFlow>`, and also renders
  `ViewLayerSwitcher` (Normal/Cost/Capacity, top-right — Google-Maps-style
  layer control) and merges `canvasView`/`nodeMetric` into each node's `data`
  so `ImageNode.tsx` can render a small debug-style badge under a node when a
  non-Normal view is active, without changing how the node itself looks. Each
  `Controller` class (`CanvasController`, `SidebarController`,
  `PropertiesWidgetController`, `TerraformWidgetController`,
  `TrafficPuckController`, ...) is instantiated once per component via
  `useState(() => new XController(...))` and holds the event-handling logic;
  components stay thin — they wire props to controller methods and render.
- **`TrafficPuck.tsx`** is the cost/capacity UI — a persistent floating widget
  (not a modal toggled from the sidebar), always rendered from `Layout.tsx`.
  Three states: collapsed (small pill, bottom-right, sparkline + total),
  expanded (full editable chart + presets + an optional breakdown table),
  docked-left/docked-right (full-height sidebar panel, positioned via
  flexbox `order` around `.reactFlowWrapper` rather than DOM reordering).
  The simulation itself is always live — `Layout.tsx` derives it with
  `useMemo(() => runSimulation(...), [stateNodes, stateEdges,
  stateTrafficProfile])`, no "Run simulation" button anywhere.
- **`src/Models/Resource.ts`** is the abstract base every AWS service extends
  (`src/Models/Services/*.ts`: EC2, S3, Lambda, APIGatewayV2, SQS, DynamoDB).
  Each subclass defines its own Terraform property shape in a static `create`,
  and implements `toTerraformEdgePropertiesCaller`/`...Receiver` (edge-driven
  Terraform companion resources), `validate`, and `estimateCost` (see
  Simulation below). Adding a new service means adding one file here plus a
  `constants.ts` entry — the properties panel, Terraform preview, and cost
  widget all pick it up generically through this interface, no per-service UI
  code required.
- **`src/types.ts`** defines the property system all of the above shares:
  `Property<T>` (`value`/`type`/`options`/`dependant`/`link`), `PropertyRecord`,
  and `ResourceData`/`EdgeData`. `InputsRenderer.tsx` + `*WidgetController`'s
  `InputsController` implementation turn any `Record<string, PropertyRecord>`
  into editable form inputs generically — this is why new fields never need
  new JSX, on either side of the rule below.
  - **Where a new per-node input goes** (this has gone wrong before — a new
    field added only to one service and not applied consistently elsewhere):
    if it's a real Terraform argument, it belongs in `terraformProperties`
    (shows up in the Terraform preview/export). If it's purely a
    cost-estimation assumption with no Terraform equivalent — S3's
    `estimated_storage_gb`/`read_traffic_percent`, DynamoDB's
    `read_traffic_percent`, Lambda's `estimated_avg_duration_ms` — it goes in
    `componentProperties.simulation` instead, which renders as a visually
    separate section and is never included in Terraform output. When adding a
    cost-relevant field to one service, check whether the other services'
    `estimateCost` have the same kind of hidden assumption (a global constant
    standing in for something that should vary per node) and fix them
    together, not just the one you happened to be touching.
- **`src/Simulation/`** is the cost/capacity engine — kept as plain,
  framework-free TS functions (graph + traffic in, metrics out), per the
  original design goal, so it stays easy to test independent of React.
  `pricing.ts` holds the static illustrative pricing table (us-east-1, free
  tier ignored on purpose) and takes a `(workloadRps, durationSeconds)` pair
  rather than assuming a month, so the same formulas work for a flat estimate
  or a traffic-profile day. `trafficProfile.ts` models traffic as a
  `TrafficProfile` — one `{label, rps}` point per day, not a single number —
  with Flat/Ramp/Weekly-cycle/Holiday-spike generators.
  `trafficPropagation.ts` propagates one rps value through the diagram using
  each edge's already-resolved `callerID`/`receiverID` (so pull vs. push
  direction is handled automatically); `simulate.ts` calls this once per
  traffic-profile point (so once per day) and sums each node's
  `Resource.estimateCost()` into a period total, tracking both average and
  peak workload per node. Capacity-adequacy warnings (is this node big enough
  for its *peak* traffic) are a separate optional
  `Resource.checkCapacityWarnings(peakWorkloadRps)` hook, checked once after
  the day loop rather than per-day, so a resource that's fine most of the
  period and only overloaded on the peak day gets one clear warning instead of
  near-duplicates. See `todo.md`'s Simulation section for the specific
  simplifying assumptions this v1 makes.

**CSS convention**: one `.css` file per component under `src/styles/`, imported
directly in the matching `.tsx` file (e.g. `import '../styles/Sidebar.css'`).
These are plain CSS imports, not CSS Modules — class names are global across
the whole app regardless of which component's file defines them, so avoid
reusing generic class names (e.g. `wrapper`) across components; prefix instead
(`sidebar-wrapper`, `canvas-wrapper`). `main.css` sets a global
`box-sizing: border-box` reset and the `html`/`body`/`#root` height chain that
full-bleed layout components rely on (`height: 100%` all the way down, rather
than `vh` on nested elements).

**Service icons**: AWS icon SVGs live in `public/` (`public/serviceIcons/`,
`public/serviceImages/`, plus a few top-level ones like `terraform_wired.svg`
and `cost_icon.svg`) and are referenced as relative string paths with no
leading slash (e.g. `serviceIcons/Res_Amazon-EC2...svg`, `cost_icon.svg`)
directly in data arrays/props, not imported as JS modules. Files in `public/`
are served as-is with no bundler processing.

The **`terraform/`** directory is unrelated to the app's own architecture-
visualization feature — it provisions the AWS infra to *host* this app
(Track 2), starting with a remote state backend (S3 + DynamoDB lock).

## Working conventions

- This repo is built primarily by Claude with minimal check-ins, by explicit
  user direction (distinct from the original `AWS-Architect-Simulator`, which
  is a learning project where the user writes the implementation and Claude
  mostly explains). Default to implementing directly rather than asking first,
  but still flag genuinely ambiguous product decisions (e.g. a new pricing
  assumption, a schema change that breaks saved diagrams) rather than
  guessing silently.
- Before marking any UI-facing change done: run `npm run build`, then actually
  drive the feature in a browser (dev server + a quick Playwright/browser
  check) rather than relying on the type-checker alone. Several real bugs in
  this codebase (see `todo.md`'s "Known UI bug") only show up when you
  interact with the rendered page.
- Prefer named handler functions over inline anonymous ones once logic is more
  than a one-liner — extract for readability, not because inline is wrong (it's
  the normal default for simple cases).
- Prefer a plain closure variable in comparisons (`selectedService === x ? ... `)
  over the `useState` updater-function form (`prev => ...`) when there's no
  stale-closure risk — clearer to read, and behaves identically in that case.
- `react-concepts.md` (repo root) is inherited from the original project's
  learning journal — it's reference material here, not something that needs
  updating as part of normal feature work.
