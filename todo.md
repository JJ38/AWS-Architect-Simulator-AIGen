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

- [x] Traffic input: single steady-state requests/sec number (`CostWidget`) —
      not a slider yet, same "one number for now" idea from the original plan
- [x] Per-node cost formulas from a static, illustrative us-east-1 pricing
      table (`src/Simulation/pricing.ts`) — free tier ignored on purpose
      (keeps the "always pay" numbers easier to reason about and still
      roughly right at non-trivial traffic)
- [x] Capacity simulator: `src/Simulation/trafficPropagation.ts` propagates the
      entry rps through the graph using each edge's already-resolved
      `callerID`/`receiverID` (so pull-edge direction is handled automatically
      — no separate pull-vs-push logic needed). Kahn's-algorithm topological
      walk, fan-in sums multiple incoming edges, multiple entry nodes split
      the input rate evenly, cycles are detected and zeroed out with a warning
- [x] `src/Simulation/simulate.ts` orchestrates propagation + each `Resource`
      subclass's `estimateCost(workloadRps)` into a total + per-node breakdown
- [x] `CostWidget`/`CostWidgetController` — sidebar button, traffic input, run
      button, total cost, per-node table with warnings. Smoke-tested via
      Playwright: API Gateway V2 → Lambda at 50 req/s gives $131.40 + $81.03 =
      $212.43/month, matches the formulas by hand
- [ ] Bottleneck detection/highlighting *on the canvas* — currently
      capacity-related warnings (e.g. DynamoDB provisioned capacity too low,
      EC2 traffic high for a single instance) only show as text in the cost
      widget's per-node table, not as node coloring
- [ ] Static design-issue linting independent of traffic (single AZ, no ASG,
      public S3, missing health checks, etc.)
- [ ] Traffic presets over time (steady, diurnal, spike, ramp) — only a single
      steady-state number exists today
- [ ] Latency modeling — cost only so far, no latency estimates
- [ ] Live AWS Pricing API integration (replace the static table)

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
