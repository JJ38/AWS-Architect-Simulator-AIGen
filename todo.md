# AWS Architect Simulator (AIGen) — Todo

Imported as a fresh snapshot from the original `AWS-Architect-Simulator` learning
project (no shared git history) to continue building without touching that repo.
See `CLAUDE.md` for working conventions. Illustrative accuracy is fine (±25% /
ranges, not precision). Two loosely-coupled tracks — Track 1 (app) first, Track 2
(AWS hosting) once there's something to host.

## Track 1 — App: Diagram Building

- [x] Install `@xyflow/react` (React Flow) and `zustand` (zustand still unused —
      state is plain `useState` lifted to `Layout`)
- [x] Core JSON schema: `ResourceData`/`EdgeData` (`src/types.ts`) — id, service,
      Terraform/component/IAM property records, metadata
- [x] Render a basic canvas: pan/zoom, background grid, controls
- [x] Service catalog: EC2, S3, Lambda, API Gateway V2, SQS, DynamoDB
      (`src/constants.ts`) — smaller than the original ~10-15 target; ALB, RDS,
      CloudFront, Route53, ElastiCache still unmodelled
- [x] Click-to-select-then-click-to-place from sidebar onto canvas (not HTML5
      drag-and-drop — click a sidebar service, then click the canvas pane)
- [ ] Custom node component shows icon only — no name/config summary on-canvas
      (full detail is in the properties panel on selection)
- [x] Click-drag between node handles creates an edge (connection)
- [x] Node selection + properties panel (`PropertiesWidget`), auto-generated
      from each `Resource` subclass's property records — no per-field UI code
      needed per service
- [x] Edge selection + properties: `type` (sync/async/pull) dropdown, Terraform
      preview. Valid types are restricted to the intersection of the source
      node's `sourceTypes` and target node's `targetTypes`
      (`CanvasController.onConnect` rejects the connection with a notification
      if the intersection is empty — equivalent to React Flow's
      `isValidConnection` prop, implemented a layer up instead)
- [ ] Plain-English one-liner explaining the selected edge type — not built
- [x] Delete node/edge (keyboard Delete)
- [ ] Wire canvas to a zustand store instead of prop-drilling
- [x] Manual named save/load to `localStorage` (`SaveWidget`/`LoadSaveWidget`) —
      not autosave-on-change
- [ ] Undo/redo

**Known UI bug (pre-existing, not yet fixed):** `PropertiesWidget` is pinned to
the canvas's top-left corner (`position: absolute; left: 15px; top: 15px`) and
stays open whenever a node/edge is selected, overlapping and intercepting
clicks on any node placed near that corner. Found while smoke-testing the cost
widget (had to place test nodes away from the corner to connect them). Worth
either repositioning the panel or making it collapsible.

## Track 1 — App: Terraform Export

- [x] Node properties widget: "Terraform preview" renders the resource block(s)
      for the selected node/edge, generated from its current property values
      (`Resource.toTerraformPreview`)
- [x] Per-node Terraform resource generation (`Resource.toTerraformResource`)
- [x] Companion resource handling: Lambda/EC2 generate an `aws_iam_role`
      alongside the main resource (`IamFactory`); edge-level IAM policy
      generation exists for the caller side
- [x] Edge → Terraform *preview* driven by edge `type`
      (`TerraformWidgetController.getEdgesTerraformPreview`,
      `PropertiesWidgetController.getEdgeTerraform`)
- [ ] Full diagram *export* (`TerraformConverter.diagramToTerraform`) only
      walks nodes, not edges — the "Convert to terraform" button doesn't
      currently produce the edge-level resources that the preview panel
      already knows how to render. No actual file download is wired up either
      (conversion just fires a success notification) — needs a `Blob` +
      anchor-click download of the generated `.tf` text
- [ ] Terraform *import* (HCL → diagram) — stretch goal, not started

## Track 1 — App: Simulation (cost & capacity)

- [x] Traffic input: a full time-series profile, not a single number —
      `src/Simulation/trafficProfile.ts`'s `TrafficProfile` is one
      `{label, rps}` point per day (31 by default). Presets: Flat, Ramp up,
      Weekly cycle, Holiday spike (a bell-shaped curve around a configurable
      peak day — the default is tuned like a December/Christmas-week spike
      for an online shop). `TrafficChart.tsx` renders it as a hand-rolled
      editable SVG line chart (no charting library) — drag any day's point to
      reshape the curve; see dataviz-skill notes below
- [x] Per-node cost formulas from a static, illustrative us-east-1 pricing
      table (`src/Simulation/pricing.ts`) — free tier ignored on purpose
      (keeps the "always pay" numbers easier to reason about and still
      roughly right at non-trivial traffic). Formulas take
      `(workloadRps, durationSeconds)` rather than assuming a month, so the
      same `Resource.estimateCost` works whether it's called once for a flat
      monthly estimate or once per day across a traffic profile
- [x] Capacity simulator: `src/Simulation/trafficPropagation.ts` propagates a
      single rps value through the graph using each edge's already-resolved
      `callerID`/`receiverID` (so pull-edge direction is handled automatically
      — no separate pull-vs-push logic needed). Kahn's-algorithm topological
      walk, fan-in sums multiple incoming edges, multiple entry nodes split
      the input rate evenly, cycles are detected and zeroed out with a warning.
      `simulate.ts` calls this once *per traffic-profile point* (so once per
      day) and sums each node's per-day cost into a period total — this is
      what makes a spike day cost more than a flat day at the same average
- [x] Peak-vs-average aware per-node results: each node's simulation result
      carries both `averageWorkloadRps` and `peakWorkloadRps`/`peakLabel`
      (which day the peak fell on). Capacity-adequacy warnings (EC2 traffic
      too high for one instance, DynamoDB provisioned capacity too low) are
      checked once against the *peak*, via a new optional
      `Resource.checkCapacityWarnings(peakWorkloadRps)` hook — kept separate
      from the per-day cost loop so a resource can be fine most of the period
      and only flagged for the one spike day, without spamming 31 near-duplicate
      warnings
- [x] `CostWidget`/`CostWidgetController` — sidebar button, preset buttons,
      editable traffic chart, run button, total cost over the period, per-node
      table (avg/peak req/s, cost, warnings). Smoke-tested via Playwright:
      placed+connected API Gateway V2 → Lambda, ran the default Holiday-spike
      profile ($68.89/31 days), switched presets, and dragged a chart point
      (confirmed the resulting avg/peak numbers moved correctly)
- [ ] Bottleneck detection/highlighting *on the canvas* — capacity warnings
      still only show as text in the cost widget's per-node table, not as node
      coloring
- [ ] Static design-issue linting independent of traffic (single AZ, no ASG,
      public S3, missing health checks, etc.)
- [ ] Latency modeling — cost only so far, no latency estimates
- [ ] Live AWS Pricing API integration (replace the static table)
- [ ] Variable period length in the UI — `DEFAULT_PERIOD_DAYS` (31) is
      currently fixed; the data model supports any length, just no control to
      change it yet
- [ ] Calendar-aware day labels ("Dec 24" instead of "Day 24") — the engine is
      deliberately period-agnostic (not December-specific), so labels are
      generic; real calendar dates would be a presentation-layer addition

**dataviz-skill notes for `TrafficChart.tsx`** (read before touching chart
code again): light-mode tokens, not dark — the widgets in this app are white
modals, even though the canvas itself is dark. Single series needs no legend
(chart caption names it). Validated series color: `#2a78d6` (categorical slot
1, passes `validate_palette.js` against surface `#fcfcfb`). Known gotcha hit
once already: SVG hit-testing is in paint order — a draggable point's larger
invisible hit-circle must render *after* (on top of) the small visible dot, or
the dot swallows the pointer events and dragging silently does nothing.
Second gotcha: don't derive the y-axis domain from live state that the drag
handler itself is mutating — it creates a feedback loop (domain grows →
changes how the next pointermove is interpreted → domain grows more); freeze
the domain for the duration of a drag gesture instead.

**Known v1 simplifications baked into the simulation engine** (documented here
so they're deliberate, not forgotten):
- 1:1 traffic passthrough per edge — a node's outgoing rate to each downstream
  edge equals its own incoming rate; no fan-out multipliers (e.g. "this Lambda
  calls DynamoDB twice per invocation" isn't modelled)
- Lambda's average execution duration is a flat assumed constant
  (`LAMBDA_ASSUMED_AVG_DURATION_SECONDS`), not derived from `timeout` (which is
  a max cutoff, not a typical duration)
- S3 and DynamoDB on-demand costs assume an 80/20 read/write split
  (`ASSUMED_READ_FRACTION`/`ASSUMED_WRITE_FRACTION`) since the simulation only
  tracks one traffic number per node, not separate read/write rates
- S3 storage cost depends on a new `estimated_storage_gb` property added to
  S3's `componentProperties` (not a real Terraform argument — bucket size is
  runtime data) — defaults to 10GB per bucket
- EC2 cost is compute-only (instance running 24/7); no ASG/scaling cost model

Keep the simulation engine as plain framework-free TS functions (graph +
traffic in, metrics out) — see `src/Simulation/` — testable, and keeps sim
logic out of components.

## Track 2 — Host on AWS via Terraform (after Track 1 has something to deploy)

- [x] Terraform remote state backend (S3 + DynamoDB lock) — done
- [ ] S3 bucket + CloudFront distribution (OAC) for static hosting of the built app
- [ ] Route53 (optional, if using a custom domain)
- [ ] CI step or manual `vite build` + deploy to S3 / invalidate CloudFront

## Stretch Goals

- [ ] Terraform import: parse HCL into the node/edge JSON schema (best-effort,
      read-only — not promising full round-trip sync)
- [ ] Live AWS Pricing API integration (replace static pricing table)
