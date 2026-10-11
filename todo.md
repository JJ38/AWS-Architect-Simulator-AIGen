# AWS Architect Simulator — Todo

Learning project: TypeScript, React, AWS, Terraform. Illustrative accuracy is fine
(±25% / ranges, not precision). Two loosely-coupled tracks — Track 1 (app) first,
Track 2 (AWS hosting) once there's something to host. Terraform export (diagram →
HCL) is now an active near-term goal, not a stretch goal — see the new section
below — separate from Terraform-for-hosting (Track 2). Terraform *import* (HCL →
diagram) remains a stretch goal for now.

## Track 1 — App: Diagram Building (current focus)

- [x] Install `@xyflow/react` (React Flow) and `zustand` for state
- [ ] Define the core JSON schema: node (id, service type, position, config) and
      edge (id, source, target, label/protocol) — this is the foundation
      everything else reads/writes, worth getting reasonably right early
- [x] Render a basic canvas: pan/zoom, background grid, controls
- [ ] Pick initial service catalog (~10-15 services): ALB, EC2/ASG, Lambda, RDS,
      DynamoDB, S3, CloudFront, SQS, API Gateway, Route53, ElastiCache
- [x] Build a sidebar/palette listing the service catalog (icon + name)
- [x] Drag-and-drop from sidebar onto canvas creates a new node
- [ ] Custom node component (icon, name, short config summary)
- [x] Click-drag between nodes creates an edge (connection)
- [ ] Node selection + properties panel (edit name, size/tier, config fields)
- [ ] Edge selection + properties: `type` (sync/async/pull, restricted to the
      valid intersection for that service pair — see edge-type sections in
      `terraform-resource-templates.md`), a plain-English one-liner explaining
      the selected type, plus a label field. Mockup:

```
┌─ Edge ──────────────────────────────────┐
│  S3 (bucket-uploads)  →  Lambda (fn-x)  │
│                                          │
│  Type:  [ Async ▾ ]                     │
│                                          │
│   ⓘ Async — S3 fires an event and moves │
│     on immediately. Lambda runs on its  │
│     own schedule; S3 never waits for a  │
│     result.                             │
│                                          │
│  Label: [______________________]       │
│                                          │
│  ── Terraform preview ────────────────  │
│   resource "aws_s3_bucket_notification" │
│   resource "aws_lambda_permission"      │
└──────────────────────────────────────────┘
```

- [ ] Restrict valid edge types per service pair. Each service gets
      `edgeRolesAsSource`/`edgeRolesAsTarget` lists (sync/async/pull). For a
      given edge, valid types = source node's `asSource` list ∩ target node's
      `asTarget` list. Two places this is used:
      1. `isValidConnection` (React Flow prop) — rejects the connection at
         drag-drop time if the intersection is empty (e.g. RDS → S3).
      2. Edge properties widget — the `type` dropdown only lists the
         intersection, not all three types unconditionally.
- [x] Delete node/edge (keyboard delete, right-click context menu)
- [ ] Wire canvas to a zustand store (addNode, addEdge, updateNode, removeNode,
      selection state) instead of prop-drilling
- [ ] Autosave/restore from localStorage
- [ ] Undo/redo (nice-to-have once the above is stable)

## Track 1 — App: Simulation (later)

- [ ] Traffic slider (single steady-state value first)
- [ ] Crude per-node cost/latency formulas (small static pricing table, not
      live AWS Pricing API)
- [ ] Capacity simulator (propagate traffic through the graph)
- [ ] Bottleneck detection/highlighting on canvas (node turns yellow/red)
- [ ] Static design-issue linting, independent of traffic (single AZ, no ASG,
      Lambda→RDS with no pooling, public S3, missing health checks, etc.) —
      cheap to build, high learning value, doesn't need the sim engine
- [ ] Traffic presets over time (steady, diurnal curve, spike, ramp) instead
      of a freeform time-series editor
- [ ] Dashboard (cost breakdown by service, latency, running totals over time)

Keep the simulation engine as plain framework-free TS functions (graph + traffic
in, metrics out) — testable, and keeps sim logic out of components.

## Track 1 — App: Terraform Export (prioritized, in progress)

- [ ] Node properties widget: "Terraform preview" toggle — render the resource
      block for the selected node from `terraform-resource-templates.md`'s
      templates, filled in from the node's current property values. Smaller
      first step than full export, and doubles as a learning aid.
- [ ] Per-node Terraform resource generation (`diagramToTerrafrom`-style
      converter): one node → its Terraform resource(s)
- [ ] Companion resource handling (Lambda's IAM role, API Gateway's
      integration/route/stage/permission bundle, etc.) — see "Cross-cutting
      pattern for the converter" in `terraform-resource-templates.md`
- [ ] Edge → Terraform mapping driven by edge `type` (sync/async/pull) — e.g.
      sync API Gateway→Lambda emits the integration bundle, async S3→Lambda
      emits `aws_s3_bucket_notification` + permission, pull SQS→Lambda emits
      `aws_lambda_event_source_mapping`
- [ ] Full diagram export: generate a complete `.tf` file from the node/edge
      graph

## Track 2 — Host on AWS via Terraform (after Track 1 has something to deploy)

- [x] Terraform remote state backend (S3 + DynamoDB lock) — done
- [ ] S3 bucket + CloudFront distribution (OAC) for static hosting of the built app
- [ ] Route53 (optional, if using a custom domain)
- [ ] CI step or manual `vite build` + deploy to S3 / invalidate CloudFront

## Stretch Goals

- [ ] Terraform import: parse HCL into the node/edge JSON schema (best-effort,
      read-only — not promising full round-trip sync)
- [ ] Live AWS Pricing API integration (replace static pricing table)