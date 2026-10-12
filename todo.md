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
- [x] Render a basic canvas: pan/zoom, background grid, controls (the grid
      itself — React Flow's `<Background>` — was actually missing until the
      design pass below added it; this checkbox was stale)
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
- [x] **Second bug fix (same area, reported immediately after the first):
      adding a totally unconnected node was still costing money, when no
      traffic reaches it at all.** The first fix above was necessary but not
      sufficient — "entry point" still just meant "zero incoming edges", so
      a node with *no edges whatsoever* (not wired to anything, in or out)
      still qualified and got the full traffic rate. Fixed: an entry point
      now additionally requires at least one *outgoing* edge — proof it's
      actually acting as a front door forwarding traffic onward, not just an
      unconnected node sitting on the canvas. A fully isolated node gets
      zero simulated traffic. This is a real, correct distinction, not a
      gap: EC2 compute hours and S3 storage cost don't depend on traffic at
      all, so an isolated EC2/S3 node still shows a nonzero cost (correctly
      — an idle instance still costs money); an isolated Lambda, SQS,
      DynamoDB-on-demand, or API Gateway node now correctly shows $0 (also
      correctly — nothing bills you for a request that was never made).
      Verified: a lone, fully-disconnected Lambda now shows $0.00 cost and
      0.0 req/s in both the cost widget and the canvas's Capacity view
- [x] **Added `src/Simulation/trafficPropagation.test.ts` (Vitest)** — two
      real bugs in the same function in a row meant manual Playwright
      spot-checks weren't sufficient. Covers: single/multiple independent
      entry points (no rate-splitting), fan-in summing, fan-out not
      splitting, isolated nodes getting zero traffic, an isolated node not
      perturbing an existing connected architecture, terminal nodes (has
      incoming, no outgoing — not treated as an entry point), cycle
      detection, and the empty-diagram case. `npm run test` runs it. This is
      the first test in the project — `propagateTraffic` was a natural place
      to start since it's a pure function with no React/DOM dependency.
- [x] **Third bug fix (reported via real usage): capacity-constrained nodes
      had zero effect on downstream traffic.** `propagateTraffic` resolved
      each node's workload by pure fan-in summation — an EC2 fleet sized for
      20 req/s sitting in front of DynamoDB never reduced what DynamoDB
      appeared to receive, even once offered traffic hit 300 req/s. The
      rightsizing engine correctly flagged the EC2 node as overloaded, but
      that assessment never fed back into propagation, so every node's own
      capacity ceiling and the traffic the rest of the diagram saw were
      completely decoupled — a saturated upstream service acted as a
      transparent passthrough instead of a resistor. Fixed: every `Resource`
      now exposes `getCapacityCeilingRps(): number | null` (the exact ceiling
      math `assessCapacity` already used, extracted so the two can never
      disagree — EC2 fleet throughput, DynamoDB provisioned RCU/WCU
      translated to an rps bound via the assumed read/write split, Lambda
      reserved concurrency via Little's Law; `null` for anything
      auto-scaling). `propagateTraffic` now clips each node's *outgoing* rate
      to `min(offered, ceiling)` before fanning it out to downstream edges —
      the node itself is still assessed and costed against the full offered
      load (so it's still correctly flagged as overloaded), only what
      reaches everything after it is capped. Also added a
      `peakDroppedRps`/`hasDownstreamEdges` pair so the rightsizing panel can
      say *"~40 req/s at peak can't be forwarded downstream"* on a flagged
      node — gated on actually having a downstream edge, so a terminal leaf
      node (e.g. a DynamoDB table nothing reads further from) doesn't claim
      an effect that doesn't exist. 14 new Vitest tests (41 total): clipping
      on fan-out/fan-in, per-service `getCapacityCeilingRps` matching
      `assessCapacity`'s own math, and an end-to-end `simulate.ts`
      integration test for the exact EC2→DynamoDB scenario reported.
      Verified end-to-end against the rightsizing test deployment:
      catalog-table's peak req/s is now correctly capped at catalog-web's
      ~20 req/s fleet ceiling instead of mirroring its full 60 req/s offered
      peak.
- [x] **Fourth bug fix (reported via real usage): fan-out had no way to
      express a split, only duplication.** Every node forwarded its full
      resolved rate down *every* outgoing edge unconditionally - correct for
      "this node makes a full-rate call to each of several destinations"
      (e.g. writing to both DynamoDB and S3 per request), but wrong for "this
      node's traffic is divided across several destinations" (e.g. an API
      Gateway route split, or two paths that reconverge at the same
      downstream node - direct writes to a table plus a queue+consumer relay
      into the *same* table - which summed to double the real traffic with
      no way to say otherwise). Fixed: added `calls_per_request` to each
      edge's `componentProperties.simulation` (same convention as node-level
      simulation-only inputs, renders automatically through the existing
      generic property panel - zero new UI code needed). Default `1`
      preserves today's behavior exactly; `<1` splits a node's traffic
      across several edges (fractions summing to ~1 means no inflation at a
      reconvergence point); `>1` models several calls to the same
      destination per request. Applied on top of the node's already-
      capacity-clipped rate (see the third fix above), not its raw offered
      load, so a node dropping requests under load doesn't also generate
      phantom extra downstream calls for traffic it never served.
      - **Also surfaced a real, independent, pre-existing bug while building
        this**: `PropertiesWidgetController.keyboardInputOnChange` stored
        `event.target.value` verbatim for every property, including
        `type: "number"` ones - but a DOM input's `.value` is *always* a
        string, even for `<input type="number">`. Every numeric property
        edited through the UI (EC2 `instance_count`, Lambda
        `estimated_avg_duration_ms`, DynamoDB `read_traffic_percent`, and
        now `calls_per_request`) was silently being stored as a string.
        This went unnoticed for years of use because JS's arithmetic
        operators auto-coerce strings (`"3" * 20 === 60`), so existing
        number fields "accidentally" kept working - until
        `calls_per_request`'s parsing logic, which deliberately does a
        strict `typeof === "number"` check (to safely reject negative/NaN
        input rather than silently miscounting traffic), hit a string every
        time and silently fell back to the default of 1, making the new
        feature appear to do nothing when edited through the UI. Fixed at
        the source: `keyboardInputOnChange` now coerces via `Number(...)`
        for `type: "number"` properties (empty string → `null`, not `NaN`),
        so every numeric field across the whole app is now genuinely
        numeric after editing, not just correct-by-coincidence.
      - 9 new Vitest tests (50 total): `calls_per_request` default/multiply/
        split/reconvergence-no-inflation/interaction-with-capacity-clipping/
        invalid-value-fallback in `trafficPropagation.test.ts`, plus 3 new
        `PropertiesWidgetController.test.ts` tests for the number-coercion
        fix itself (number stored as number, empty field stored as null not
        NaN, string properties unaffected).
      - Verified end-to-end in-browser: set `calls_per_request = 2` on the
        rightsizing deployment's checkout-fn → order-queue edge (modelling
        "2 messages enqueued per checkout") and confirmed both order-queue's
        and fulfillment-fn's avg/peak req/s doubled correctly (15.9→31.8,
        60→120), with Lambda's rightsizing recommendation recalculating
        correctly off the new peak (48 = 120 req/s × 400ms).
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
- [x] ~~Bottleneck detection/highlighting on the canvas~~ — done, see the
      Capacity sim / rightsizing section below (status-colored node badges
      in the Capacity canvas view, not just table text)
- [ ] Static design-issue linting independent of traffic (single AZ, no ASG,
      public S3, missing health checks, etc.)
- [ ] Latency modeling — cost only so far, no latency estimates
- [ ] Live AWS Pricing API integration (replace the static table)
- [x] ~~Variable period length in the UI~~ — a "Period:" preset row (1 week /
      1 month / 3 months / 1 year) sits above the traffic-shape presets in
      the puck; switching period re-applies the *currently active* traffic
      shape at the new day count (not a reset to flat), and the holiday
      spike's peak day scales proportionally with period length
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

## Track 1 — App: Capacity sim / rightsizing

Goal (user's framing): rightsize services based on predicted traffic over
time, and highlight bottlenecks — e.g. if an EC2 instance isn't behind an
auto scaling group and traffic exceeds what it can handle, that should be
flagged to the user, working on timeseries data (not a single peak number),
staying a ballpark sanity check rather than a precise simulation. See the
"Honest scope note" a few bullets down for exactly what "flagged" means
today (a status + recommendation, not a modeled failure rate).

- [x] **Step 1 (this session): a comprehensive test deployment**, built
      specifically to validate bottleneck/rightsizing detection against,
      rather than inventing scenarios ad hoc. `src/exampleDeployments/
      rightsizingTestDeployment.ts` — an "online shop" architecture, built
      with the real `Resource.create()` factories (not hand-rolled JSON) so
      it can't drift from the actual node/edge data shape. Load it via the
      new sidebar flask-icon button ("Load example") — `SidebarController
      .handleLoadExampleClick()` calls `setNodes`/`setEdges` directly, no
      save/load-widget round trip needed.
      - **Three deliberately under-provisioned nodes**, each sized for a
        quiet month rather than a spike: `catalog-web` (EC2 `t3.micro`,
        wired straight to the entry point with no ASG - "no ASG" is
        represented just by that direct wiring, since ASGs aren't modelled
        as a separate service yet), `catalog-table` (DynamoDB `PROVISIONED`
        at 5 RCU / 2 WCU, immediately downstream of catalog-web - a
        deliberately realistic *compounding* pair, not contrived), and
        `fulfillment-fn` (Lambda, `reserved_concurrent_executions = 20`,
        added once Lambda rightsizing shipped - see the Step 3 entry below).
      - **A control group** (`checkout-fn` Lambda with no reservation,
        `order-queue` SQS, both S3 buckets, `shop-api`) that should show
        `not_applicable`/no warning at any traffic level — proves the
        detector flags the right things, not everything.
      - 8 nodes, 7 edges, all 6 services represented, S3 used in two
        different roles (`order-receipts` write-heavy, `product-images`
        read-heavy via `read_traffic_percent`).
      - To stress-test: load the example, open the traffic puck, pick
        "Holiday spike", then drag the day-24 peak point up well past the
        default 60 req/s (e.g. ~300) — the default Holiday-spike peak alone
        isn't high enough to trip any of the three bottlenecks.
      - Verified end-to-end in-browser via Playwright at a 300 req/s peak:
        all three sized nodes correctly flagged critical with distinct
        recommendations, every control-group node correctly `not_applicable`.
- [x] **Bug found and fixed while validating the deployment above: pull-edge
      consumers were double-counted as a second, independent traffic entry
      point.** `trafficPropagation.ts` built its propagation graph straight
      from `callerID`/`receiverID` for every edge type - correct for
      sync/async (caller originates, receiver receives), but backwards for
      pull: a pull edge's caller (e.g. `fulfillment-fn` pulling from
      `order-queue`) never appears as anyone's "receiver" in that graph, so
      it had zero incoming edges and qualified as its own independent entry
      point, receiving a *second* full `entryRps` on top of what actually
      flowed to the queue it was pulling from. Fixed by flipping the
      propagation direction specifically for pull edges (receiver → caller,
      since the receiver - the queue - is what accumulates traffic, and the
      puller drains it rather than originating it); `callerID`/`receiverID`
      keep their original cost-attribution meaning everywhere else. Caught
      because the test deployment above has exactly this shape
      (`checkout-fn` → `order-queue` → `fulfillment-fn`); added a regression
      test (`trafficPropagation.test.ts`, now 12 tests) using that same
      producer/queue/puller shape so it can't silently regress again.
- [x] **Fixed a latent circular-import bug** while wiring the example
      deployment's loader: `constants.ts` (imports every `Resource`
      subclass for `resourceContainer`) and `IamFactory.ts` (imported by
      several of those subclasses, needed `effect` from `constants.ts`)
      formed a cycle that happened to resolve safely only by luck of module
      evaluation order - until `SidebarController.ts` importing the new
      deployment file (which imports both a service class directly *and*
      `constants.ts`) changed that order enough to turn it into a real
      `ReferenceError: Cannot access 'EC2' before initialization` crash on
      page load. Fixed by extracting the two constants `IamFactory.ts`
      actually needs (`regions`, `effect`) into a new dependency-free
      `src/sharedConstants.ts`; `constants.ts` re-exports them for existing
      consumers.
- [x] **Step 2: the rightsizing engine itself**, replacing the crude flat
      threshold with per-service, timeseries-aware sizing logic. The
      `Resource.checkCapacityWarnings(peakWorkloadRps: number): string[]`
      hook (peak-only, returned plain strings) was replaced wholesale with
      `Resource.assessCapacity(dailyWorkload: NodeDailyWorkload[]):
      CapacityAssessment` — the full per-day series for the period, not just
      its peak, and a structured result (`src/types.ts`):
      `{ status: "ok"|"warning"|"critical"|"not_applicable", message,
      recommendation?, peakUtilizationPercent?, exceededDayLabels? }`.
      `simulate.ts` now accumulates each node's full `dailyWorkload` during
      the day loop (it already had the per-day numbers for cost purposes;
      this just keeps them instead of discarding after computing the peak)
      and calls `assessCapacity` once per node after the loop.
      - **EC2**: added an illustrative per-instance-type throughput table
        (`EC2_ESTIMATED_MAX_RPS` in `pricing.ts`, loosely scaled by vCPU
        class — explicitly *not* a benchmark, a sanity-check number) and a
        new simulation-only `instance_count` property (same
        `componentProperties.simulation` pattern as S3/Lambda/DynamoDB) —
        since this app doesn't model an auto scaling group as its own
        resource, fleet size is represented directly on the EC2 node itself;
        `instance_count: 1` *is* "no ASG". Fleet capacity = per-instance RPS
        × `instance_count`; cost scales by the same factor. Recommendation
        text explicitly calls out "no ASG" when `instance_count` is 1 and
        gives a concrete `ceil(peakRps / perInstanceRps)` instance count.
      - **DynamoDB**: on-demand is `not_applicable` (scales automatically,
        correctly nothing to recommend); provisioned mode finds every day
        whose required RCU/WCU (from that day's resolved traffic × the
        read/write split) exceeds what's configured — not just the peak day
        — and recommends the specific RCU/WCU the actual peak needs.
      - **Status thresholds**: `critical` = over capacity on ≥1 day,
        `warning` = peak utilization ≥80% with no day actually over,
        `ok` = comfortable margin. `not_applicable` (Lambda, SQS, API
        Gateway, DynamoDB on-demand) is a real, correct, distinct status —
        "this scales automatically, there's nothing to rightsize" is true
        and worth saying, not a gap.
      - 22 Vitest tests total now (`EC2.test.ts`, `DynamoDB.test.ts` new;
        `trafficPropagation.test.ts` unchanged at 12) covering: adequate
        sizing, undersized-with-no-ASG recommending a fleet size,
        `instance_count` actually changing the verdict, per-day exceedance
        (not whole-period), unrecognised-type fallback (doesn't throw),
        on-demand DynamoDB being not_applicable even at huge traffic, and
        specific RCU/WCU recommendations.
      - Verified end-to-end in-browser against the rightsizing test
        deployment at a stressed 300 req/s peak: both bottleneck nodes
        correctly flagged `critical` (EC2: "over capacity on 7 of 31 days...
        run at least 15x t3.micro"; DynamoDB: "too low on 31 of 31 days...
        provision at least 240 RCU / 60 WCU") and all six serverless nodes
        correctly showed `not_applicable` / no warning — and the per-day
        analysis immediately surfaced something a peak-only check would
        have missed: DynamoDB's provisioned capacity was too low *every
        single day*, not just during the spike, while EC2 only failed near
        the peak. That distinction is the actual point of working on
        timeseries data rather than one peak number.
      - **Honest scope note**: this is a *sanity-check/ballpark* assessment
        (adequate / tight / over, with a concrete recommendation), not a
        literal failure-rate or latency-degradation simulation. "Requests
        start failing" is represented as a status + "N of M days over
        capacity", not as a modeled error rate or queueing delay. Building
        an actual failure/latency model would be a substantially bigger
        step (needs a queueing or saturation curve, not just a capacity
        ceiling) - noted below as a possible future direction, not started.
- [x] **UI**: a dedicated "Rightsizing" section in `TrafficPuck` (new
      `RightsizingPanel`/`CapacityBadge` components), always visible (not
      hidden behind the cost-breakdown toggle) since it's the headline
      sanity-check info — "N of M sized resources need attention", one card
      per flagged node (service, node id, message, recommendation, which
      days), red-tinted for critical/amber for warning, sorted
      critical-first. A single green line ("all N sized resources look
      adequately provisioned") when there's nothing to flag. The existing
      cost breakdown table also gained a compact "Capacity" column
      (colored ✓/~/⚠ + utilization%) so the two views of the same data stay
      next to each other. On the canvas, the Capacity layer's per-node
      badges are now status-colored instead of a flat warning triangle:
      green/amber/red border+text for ok/warning/critical, a muted italic
      "auto-scales" tag for not_applicable (serverless) nodes, full message
      + recommendation on hover via the native `title` tooltip.
- [x] **Step 3: Lambda reserved-concurrency rightsizing** - a third
      capacity-capable service, and notably the most *precisely* correct one
      of the three: EC2's throughput table is an illustrative estimate and
      DynamoDB's RCU/WCU is a real but separate limit, but Lambda
      concurrency is the actual mechanism AWS throttles on - exceeding
      `reserved_concurrent_executions` is a genuine `429
      TooManyRequestsException`, not an estimate. Uses Little's Law
      (`concurrency ≈ requests/sec × average duration`) against
      `estimated_avg_duration_ms` to find required concurrency per day. A
      function with **no** reservation is `not_applicable` - it draws from
      the shared account-wide pool (default 1000, shared across every
      function in the account/region), and modelling that shared pool
      across multiple nodes is out of scope, so an unreserved function isn't
      guessed at rather than measured against the wrong limit.
      - Added to the rightsizing test deployment: `fulfillment-fn` now has
        `reserved_concurrent_executions = 20`, sized for the baseline
        traffic (comfortable at ~8 req/s) but not the spike - a third,
        realistic "sized for a quiet month" bottleneck, while `checkout-fn`
        stays unreserved as the genuine not_applicable control case.
      - 5 new Vitest tests (`Lambda.test.ts`, 27 tests total across the
        project) covering: not_applicable with no reservation even at huge
        traffic, adequate sizing via Little's Law, critical with a specific
        recommended concurrency value, per-day (not whole-period)
        exceedance, and the missing-duration default not throwing.
      - Verified end-to-end against the (now three-bottleneck) deployment at
        a 300 req/s stress peak: all three nodes correctly flagged critical
        with distinct, genuinely different "blast radius" patterns that
        validate the whole point of doing this per-day rather than
        peak-only - EC2 over capacity 7 of 31 days, DynamoDB 31 of 31 (its
        baseline was already too low, not just the spike), Lambda only 1 of
        31 (only the single highest-traffic day actually exceeds 20
        concurrent executions). Same day, same diagram, three different
        stories - exactly what a reader needs a sanity check to tell them.
- [ ] **Possible next step, not started**: an actual failure/latency model
      (e.g. a saturation curve past 100% utilization, or queueing delay for
      SQS/pull consumers specifically) rather than a binary
      over-capacity-or-not per day. Would need a real design discussion
      first, not a guess. Note: the *propagation* half of this gap — an
      overloaded node silently having zero effect on downstream traffic — is
      now fixed (see the capacity-ceiling-clipping entry above); what's still
      missing is modeling what happens to the dropped requests themselves
      (hard failure, retry, queueing delay) rather than just not forwarding
      them.
- [x] ~~EC2 pricing/capacity table coverage~~ — expanded both
      `EC2_HOURLY_USD` and `EC2_ESTIMATED_MAX_RPS` from 11 to 17 instance
      types in lockstep (added t3.2xlarge, m5.4xlarge, c5.2xlarge,
      c5.4xlarge, r5.large, r5.xlarge — `instance_type` is a free-text
      field, not a closed dropdown, so a user typing any of these no longer
      silently falls back to the default estimate). Still illustrative, not
      benchmarked - r5 RPS mirrors the vCPU-matched m5 tier since this is a
      CPU-bound-workload heuristic, not a memory one.
- [ ] SQS, API Gateway, and S3 are all `not_applicable` (no modelled capacity
      ceiling) - a reasonable match for real AWS behavior at the traffic
      levels this tool is meant for (standard SQS queues and S3 prefix
      throughput limits are very high; API Gateway's default account
      throttle is thousands of req/s), not an oversight, but worth
      revisiting if this tool is ever used to simulate genuinely
      massive-scale traffic.
- [x] **UI polish pass**: the collapsed puck (the default, most-common
      state) previously gave zero rightsizing signal - you had to expand it
      to find out anything was wrong. Added a small `⚠ N`/`~ N` alert badge
      to the collapsed pill (critical count takes priority over warning
      count; nothing shown when everything's fine) so the sanity-check
      signal is visible without interaction. Also replaced the rightsizing
      cards' truncated day list ("Day 1, Day 2, Day 3, Day 4, Day 5, Day 6
      +25 more") with collapsed consecutive ranges ("Day 1–31") - the
      DynamoDB "undersized literally every day" finding reads immediately
      now instead of requiring the reader to infer it from a truncation
      count.

## Track 1 — App: Visual design ("Blueprint" theme + light/dark)

- [x] Deliberate design pass (per explicit feedback that the UI "looks a bit"
      generic) — used the `frontend-design` skill rather than improvising.
      Landed on a "blueprint drafting table" concept: navy/cyan, tied to the
      actual subject matter (this is a diagram tool), not a default SaaS
      look. Full token system in `src/styles/theme.css` — see the "Design
      system" section in `CLAUDE.md` for the details other work should
      follow (token names, the chart-vs-UI color split, where icons vs text
      are the right call). Highlights:
      - Light/dark theme toggle (`ThemeProvider.tsx`, sun/moon `IconButton`
        top-right of canvas), follows the OS by default, persists to
        `localStorage` once toggled. Covers the *whole* app, not just the
        canvas — every widget/modal was swept from hardcoded hex to the
        token system so nothing is stuck light-only or dark-only anymore
      - IBM Plex Sans + IBM Plex Mono (the latter specifically for node IDs,
        terraform preview, and numeric table columns — not applied
        blanket-wide)
      - React Flow's own background grid (`<Background>`) was actually never
        added before this pass, despite `colorMode='dark'` being hardcoded —
        now theme-aware (`colorMode={theme}`) with a `Lines` variant grid
        that reads as literal blueprint/graph paper
      - `lucide-react` + a shared `IconButton` — converted the explicitly-
        flagged "Dock left"/"Dock right"/"Undock"/"Collapse" text buttons on
        `TrafficPuck`, plus Cancel/Delete/Upload/Download across the other
        modals, to icon buttons (always with a `label` → tooltip + aria-label).
        Left text buttons where an icon would be guessing (traffic presets,
        Save vs Save As, "Convert to terraform")
      - Fixed the `/period` copy on the collapsed puck to show the actual
        period length (`$212 / 31d`) instead of the generic word "period" —
        the expanded view already said "over 31 days" correctly, only the
        collapsed pill had the vague version
      - Parked, not built: a cost color-heatmap on canvas nodes was
        considered and explicitly deferred last session ("expensive compared
        to what?" — no baseline defined yet); still true here, still just a
        debug-style `$X.XX`/`X.X req/s` badge, no node tinting
- [ ] Icon-only buttons are at a fixed 30×30px regardless of viewport —
      no responsive/mobile pass has been done anywhere in the app

## Track 2 — Host on AWS via Terraform (after Track 1 has something to deploy)

- [x] Terraform remote state backend (S3 + DynamoDB lock) — done
- [ ] S3 bucket + CloudFront distribution (OAC) for static hosting of the built app
- [ ] Route53 (optional, if using a custom domain)
- [ ] CI step or manual `vite build` + deploy to S3 / invalidate CloudFront

## Stretch Goals

- [ ] Terraform import: parse HCL into the node/edge JSON schema (best-effort,
      read-only — not promising full round-trip sync)
- [ ] Live AWS Pricing API integration (replace static pricing table)
