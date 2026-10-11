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
      walk, fan-in sums multiple incoming edges, cycles are detected and
      zeroed out with a warning. `simulate.ts` calls this once *per
      traffic-profile point* (so once per day) and sums each node's per-day
      cost into a period total — this is what makes a spike day cost more
      than a flat day at the same average
- [x] **Bug fix (reported via real usage): adding an unconnected node was
      decreasing the total cost.** Every node with zero incoming edges counts
      as an "entry point", and the original code divided the configured
      traffic rate evenly across however many entry points existed
      (`entryRps / entryNodeIds.length`). That meant dropping a second,
      unrelated, not-yet-wired node onto the canvas diluted the traffic (and
      cost) of the *already-connected* architecture, since they were treated
      as sharing one traffic budget — violating the basic expectation that
      adding something can only add cost, never remove it. Fixed: each entry
      node now independently receives the *full* configured rate rather than
      a shared fraction. Multiple genuine entry points into one shared
      backend still correctly sum at the node where their edges converge
      (the existing fan-in logic was always correct; only the entry-node
      split was wrong). Verified: placed a connected API Gateway V2 → Lambda
      pair, noted their per-node costs, added a third *unconnected* S3 node,
      confirmed the API Gateway/Lambda costs were bit-for-bit identical
      afterward and the total only grew by exactly the new node's own cost
- [x] Peak-vs-average aware per-node results: each node's simulation result
      carries both `averageWorkloadRps` and `peakWorkloadRps`/`peakLabel`
      (which day the peak fell on). Capacity-adequacy warnings (EC2 traffic
      too high for one instance, DynamoDB provisioned capacity too low) are
      checked once against the *peak*, via a new optional
      `Resource.checkCapacityWarnings(peakWorkloadRps)` hook — kept separate
      from the per-day cost loop so a resource can be fine most of the period
      and only flagged for the one spike day, without spamming 31 near-duplicate
      warnings
- [x] ~~`CostWidget`/`CostWidgetController` modal~~ — replaced (see UI rework
      below) by `TrafficPuck`, a persistent floating widget
- [x] **UI rework** (per explicit feedback - the modal-with-a-"Run"-button
      design didn't fit how this gets used): the simulation is now always
      live. `Layout.tsx` derives `simulationResult` with `useMemo(() =>
      runSimulation(...), [stateNodes, stateEdges, stateTrafficProfile])` —
      no explicit "Run simulation" button anywhere anymore, it recomputes
      whenever the diagram or traffic profile changes. Two new pieces:
      - **`TrafficPuck`** (`src/Components/Widgets/TrafficPuck.tsx` +
        `TrafficPuckController.ts`) — a persistent floating widget, not a
        sidebar-toggled modal. Three states: collapsed (small pill, bottom-right,
        sparkline + total cost — `TrafficSparkline.tsx` is a tiny non-interactive
        presentational chart just for this), expanded (the full editable
        `TrafficChart` + presets + a `<Show cost breakdown>` toggle that reveals
        the per-node table), and docked-left/docked-right (a full-height sidebar
        panel via flexbox `order` — `.reactFlowWrapper` got an explicit `order:2`
        so the dock panel can slot in at `order:1` or `order:3` around it without
        any DOM reordering — chart + table always visible together, no breakdown
        toggle needed since there's room). Found and fixed a real overflow bug
        here: the breakdown table (500px min-width) silently clipped inside the
        380px docked panel until it got its own `overflow-x: auto` wrapper
        (verified via `scrollWidth`/`clientWidth` in Playwright, not just visually)
      - **`ViewLayerSwitcher`** (`src/Components/ViewLayerSwitcher.tsx`) — a
        Google-Maps-style layer control, top-right of the canvas: Normal / Cost
        / Capacity. Selecting a non-Normal view doesn't change how nodes look
        (explicit feedback: no cost-based color heatmap for now — "expensive
        compared to what?" is a real question without a defined baseline) - it
        adds a small debug-style badge under each node (`ImageNode.tsx`'s
        `imageNodeBadge`, fed via `canvasView`/`nodeMetric` merged into each
        node's `data` in `Canvas.tsx`): `$X.XX` in Cost view, `X.X req/s` (+ ⚠
        if the node has any warnings, capacity or otherwise) in Capacity view
      - Removed the sidebar's "Cost" button/handler entirely — the puck is
        always visible now, nothing to toggle
      - Known gap: the color-heatmap idea for the Cost layer is parked, not
        abandoned — needs a defined baseline (cheapest node on canvas? a fixed
        $ scale?) before it's worth building
      - Smoke-tested via Playwright end to end: placed+connected API Gateway V2
        → Lambda, confirmed the collapsed puck shows a live total with no
        button click, both canvas views render correct badges and Normal
        clears them, breakdown/dock/undock all work, docked table scrolls
        correctly after the overflow fix
- [x] Simulation-only inputs standardized across services, not just S3. Rule
      (per explicit feedback): if it's a real Terraform argument, it belongs in
      `terraformProperties` (auto-rendered UI, included in Terraform
      export/preview); if it's purely a cost-estimation assumption with no
      Terraform equivalent, it goes in a `componentProperties.simulation`
      section (same `InputsRenderer` mechanism, but visually and structurally
      separate — never reaches the Terraform preview). Audited all six
      services against this rule and fixed two inconsistencies: S3 only had
      `estimated_storage_gb`, not the read/write split it also silently
      assumed; Lambda's average-execution-duration assumption
      (`LAMBDA_ASSUMED_AVG_DURATION_SECONDS`) wasn't exposed at all. Now:
      - S3: `estimated_storage_gb`, `read_traffic_percent`
      - DynamoDB: `read_traffic_percent` (drives both the on-demand cost split
        and the provisioned-capacity warning, via a shared
        `getReadFraction()` helper so the two can't drift apart)
      - Lambda: `estimated_avg_duration_ms`
      - EC2/SQS/APIGatewayV2: no simulation-only inputs needed — their cost
        formulas don't currently assume anything beyond real Terraform args
        and the flat per-request price
      All default to the same values the old hardcoded constants used, so
      existing behavior doesn't change until a user edits them. Verified via
      Playwright: edited Lambda's `estimated_avg_duration_ms` through the
      properties panel (200ms → 5000ms) and confirmed the cost widget's number
      moved accordingly ($5.51 → $150.80)
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
- [x] ~~Traffic profile resets when the widget closes~~ — moot now;
      `stateTrafficProfile` lives in `Layout` (see UI rework above), not a
      widget that unmounts, so it persists for the session regardless of the
      puck's collapsed/expanded/docked state

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
