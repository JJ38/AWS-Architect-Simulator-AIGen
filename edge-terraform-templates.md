# Edge → Terraform — Design Notes

Companion to `terraform-resource-templates.md` (which covers what a *node*
emits) and the "Edge → Terraform mapping" item in `todo.md`. This file is
about what a *connection* emits: the reasoning behind it, not yet the
implementation.

## The shape: hooks on `Resource`, not a class per service pair

Each `Resource` subclass already declares `sourceTypes`/`targetTypes`
statically (see `Lambda.ts`, `S3.ts`, etc.), and `CanvasController.onConnect`
already intersects them to find valid edge types for a connection. The
natural extension for Terraform generation is two more methods on `Resource`,
overridden per subclass:

- `toTerraformEdgeAsSource(edgeType, targetResource)` — what do I emit when
  I'm the source of this edge?
- `toTerraformEdgeAsTarget(edgeType, sourceResource)` — what do I emit when
  I'm the target?

This avoids an O(services²) matrix of per-pair classes — each subclass only
ever has to reason about itself plus the handful of edge types it already
declares support for, same complexity class as the existing
`sourceTypes`/`targetTypes` declarations.

Generated output lands as additional entries in that node's own
`terraformProperties` (same dictionary `aws_lambda_function` already lives
in) — the `PropertiesWidget` already renders every top-level key as its own
collapsible section with zero new UI code, so nothing new needs to be built
there. Label each generated section by the edge that produced it (e.g.
"Permission — API Gateway → this"), not by the underlying AWS mechanism —
the user drew a connection, so "what did that connection produce" is the
legible framing, not "IAM policy" vs "service principal permission."

## Two real wrinkles

1. **Cross-resource references aren't the same problem as the existing
   `link` property type.** `link` (`Resource.ts`) resolves a value from
   *within the same node's* `terraformProperties` — explicitly "hardcoded
   for 1 nested value" today. Edge-generated blocks need the opposite: a
   reference to *another* resource's Terraform address
   (`aws_lambda_function.<name>.arn`), which means a resource needs to
   expose its type + local name as an addressable handle, not just its
   property values.

2. **Not every edge is purely additive.** Some edges mutate a node's
   *existing* `terraformProperties` rather than add a new block — DynamoDB's
   `stream_enabled` flipping on because of an outgoing async edge, or
   Lambda's `dead_letter_config` appearing because of an incoming async
   edge. The hooks need to be able to return a patch to `this
   .terraformProperties`, not only new standalone resources.

## The three questions that decide which permission resource shows up

Not every edge needs the same shape of permission. The deciding factor
isn't `edgeType` alone — it's **who is actually making the live AWS API
call**, and **what kind of thing they are**.

```
                    EDGE: source ──(edgeType)──► target
                                   │
                                   ▼
                 Q1 — what is edgeType?  (sync / async / pull)
                                   │
                ┌──────────────────┼──────────────────┐
                ▼                  ▼                  ▼
              sync               async               pull
                │                  │                  │
                └──────────────────┴──────────────────┘
                                   ▼
          Q2 — who actually MAKES the live AWS call for this edge?
               sync / async  → the SOURCE calls
               pull          → the TARGET calls (it polls backward)
                                   │
                                   ▼
          Q3 — is that caller an IAM-role holder or a service principal?
                ┌──────────────────┴──────────────────┐
                ▼                                     ▼
       IAM-role holder                        service principal
      (Lambda, EC2, ECS...)                (API Gateway, S3, EventBridge...)
                │                                     │
                ▼                                     ▼
    → policy statement added to              → resource-based permission
      the CALLER's own role                    block added on the CALLEE
      e.g. Lambda#1's execution role           e.g. aws_lambda_permission
      gets lambda:InvokeFunction on            naming apigateway.amazonaws.com,
      Lambda#2's arn                           attached to Lambda#2
```

**IAM-role holder vs. service principal, in one line:** IAM-role holder →
permission lives on the **caller**'s own role (identity-based policy).
Service principal → permission lives on the **callee** (resource-based
policy naming the service). See `react-concepts.md` entry 23 for the full
writeup of this distinction.

**This is a fixed trait per service, not a per-edge flip.** Lambda is an
IAM-role holder on every edge it's part of — whether it's the caller or
not never changes what Lambda *is*. What changes per edge is only *whose*
trait Q3 looks up, and that's decided by Q2: Lambda → S3 (sync) checks
Lambda's trait (it's the caller); API Gateway → Lambda (sync) checks API
Gateway's trait instead (API Gateway is the caller there, Lambda's trait is
irrelevant to that edge). The heuristic for classifying a service: does it
run your code / hold its own execution or instance role (Lambda, EC2, ECS)?
→ IAM-role holder, always. Is it an AWS-managed mechanism that triggers
things on your behalf without running your code (API Gateway, S3 events,
EventBridge, SNS)? → service principal, always. (Real AWS has a corner-case
escape hatch — API Gateway's `credentials_arn` can assume a role instead —
but nothing in this project's catalog needs to model a service with a
dual/flexible nature.)

### Reference tables

**Permission type** — a fixed trait per service (see above):

| Permission Type | Meaning | Examples |
|---|---|---|
| IAM role | Has its own role; calls out using it | Lambda, EC2, ECS |
| Service principal | AWS-managed trigger; invokes on your behalf | API Gateway, S3, EventBridge, SNS |
| Passive | Never initiates a call itself | DynamoDB, RDS, ElastiCache |

**Edge type → caller** — decides *which side's* permission type gets looked up:

| Edge Type | Caller | Why |
|---|---|---|
| sync | Source | Source makes the call and waits for the result |
| async | Source | Source fires the call and moves on, no wait |
| pull | Target | Target polls the source at its own pace |

### Key points / concepts

- **The caller determines the permission, not source/target position on the
  canvas.** Source/target are just arrow direction; "caller" is who actually
  makes the live AWS API request, and that's worked out from edge type
  (table above) before anything about permissions gets decided.
- **A passive service should only ever appear as the source of a `pull`
  edge, never `sync`/`async`.** That's what keeps "who's the caller"
  resolvable without exceptions — see the DynamoDB Streams case below.
- **Permission type is a fixed trait per service, not a per-edge flip.** A
  service doesn't become an IAM-role holder on one edge and a service
  principal on another — it's one or the other (or passive), always.
- **Only the caller's permission type is ever consulted for a given edge.**
  The other side's trait is irrelevant to that specific edge, even though it
  still matters for whatever edges *that* side is the caller on.
- **A single node can accumulate permissions from several edges
  independently**, with no precedence conflict — each edge answers its own
  "who's the caller here" question separately, and the results just stack
  on that node's `terraformProperties`.
- **Permissions and plumbing are separate questions.** Q1–Q3 decide who's
  allowed to do the thing; Q4 decides what supporting resources a side
  needs just to make the connection function, independent of who's on the
  other end.

### Worked examples

**API Gateway → Lambda (sync):**

```
 Q1  edgeType = sync
 Q2  sync → SOURCE calls → caller = API Gateway
 Q3  what is API Gateway, as a caller into Lambda?  → a service principal
 →   resource-based permission goes on the CALLEE (Lambda):

     Lambda.terraformProperties.aws_lambda_permission = { ... }
```

**Lambda → Lambda (async)** — same questions, different answers:

```
 Q1  edgeType = async
 Q2  async → SOURCE calls → caller = Lambda #1
 Q3  what is Lambda #1, as a caller into Lambda #2?  → an IAM-role holder
 →   identity policy goes on the CALLER's own role (Lambda #1), NOT a
     permission block on Lambda #2:

     Lambda#1.terraformProperties.aws_iam_role_policy = { ... }
```

**SQS → Lambda (pull)** — the case where the *target* is the caller:

```
 Q1  edgeType = pull
 Q2  pull → TARGET calls (Lambda polls SQS in the background) → caller = Lambda
 Q3  what is Lambda, as a caller into SQS?  → an IAM-role holder
 →   identity policy goes on the CALLER's own role — here, the caller is
     the TARGET, so it's Lambda's role that gets the policy, granting it
     sqs:ReceiveMessage/DeleteMessage on the queue's arn:

     Lambda.terraformProperties.aws_iam_role_policy = { ... }
```

A single node can accumulate policy statements from *outgoing* edges where
it's the caller, resource-based permissions from *incoming* edges where its
caller is a service principal, **and** identity policies from *incoming*
`pull` edges where it itself is the caller polling backward — all
independently, no precedence conflict, because each answers a different
question for a different edge.

## A fourth, separate question: plumbing

Q1–Q3 is entirely about **permissions** — who's allowed to do the thing.
Independently, each side of an edge may need supporting resources just to
make the connection function at all, regardless of who's on the other end:

```
 Q4 — does this service, in this role (source/target), for this edgeType,
      always need its own supporting resources?

      API Gateway as a SYNC SOURCE → yes, always:
        API Gateway.terraformProperties.aws_apigatewayv2_integration = {...}
        API Gateway.terraformProperties.aws_apigatewayv2_route       = {...}
        API Gateway.terraformProperties.aws_apigatewayv2_stage       = {...}

      Lambda as a SYNC TARGET → no extra plumbing needed
```

So per edge, source and target are each asked, independently: "what plumbing
do I always need here (Q4)" and "what permission artifact does this specific
pairing need (Q1–Q3)." Both answers are just new keys appended to whichever
node's `terraformProperties` they belong to.

## Field-level editability inside a generated block

Not every field inside a generated block is free user input. Some are fully
determined by the edge (`principal`, `action`) and should render read-only,
the same way the existing `link` property type already renders computed
values as plain text instead of an `<input>`. Some are cross-resource
references (`source_arn` → the other node's arn) — a harder version of
`link`, since it needs to resolve a value from *another* node's Terraform
address, not the same node's own `terraformProperties` (see wrinkle #1
above). Only genuinely free fields (e.g. `statement_id`) need a real
editable input.

## Structural exceptions: a sparse lookup, not a matrix

The counterpart's *identity* (which specific node) only ever fills in
values. The counterpart's *type* almost always only affects values too —
but occasionally adds an extra field to the same base resource. That's a
real exception, not just a value difference, so it needs its own lookup —
but a small, sparse one, not a full pairwise matrix:

| Base resource | Counterpart type | Extra field |
|---|---|---|
| `aws_lambda_permission` | S3 | + `source_account` (confused-deputy guard) |
| `aws_lambda_permission` | API Gateway | none — base shape is enough |
| `aws_lambda_permission` | EventBridge | none |

Default assumption: **no exceptions.** Only add a row when there's a
specific, documented AWS quirk. This stays bounded rather than reopening
the O(services²) problem the caller/permission-type model was built to
avoid, for three reasons:

1. It's keyed by (permission block type, counterpart's type) — not (every
   service, every service). There are only a handful of permission-block
   resource types in the whole model (`aws_lambda_permission` is the main
   one at this catalog's size), so the table has very few rows.
2. It almost only applies to the **service-principal** shape. The
   IAM-role-holder shape (a policy statement on the caller's own role)
   doesn't have this kind of quirk in AWS's docs — it's "add this action on
   this resource," full stop.
3. This is the same thing `terraform-resource-templates.md` already does
   informally (SQS's `redrive_policy`, EC2's `credit_specification` notes)
   — this just formalizes the subset of those gotchas that are specifically
   about permission blocks for a given caller type, which is a small,
   known, finite list that doesn't grow with the service catalog.

## First implementation target: Lambda ↔ DynamoDB

The two valid edges between these nodes today, per the existing
`sourceTypes`/`targetTypes` intersection:

- Lambda → DynamoDB: only `sync` (`Lambda.sourceTypes ∩ DynamoDB.targetTypes`
  = `{sync, async} ∩ {sync}` = `{sync}`)
- DynamoDB → Lambda: only `async` as currently coded in `DynamoDB.ts`
  (`DynamoDB.sourceTypes ∩ Lambda.targetTypes` = `{async} ∩ {sync, async,
  pull}` = `{async}`) — **this is the Streams case flagged earlier as
  mislabeled.** The Terraform below treats it as `pull`, matching its real
  mechanics; `DynamoDB.ts`'s `sourceTypes` needs updating from `["async"]`
  to `["pull"]` to match before this can actually be wired up.

### Lambda → DynamoDB (`sync`)

```
 Q1  edgeType = sync
 Q2  sync → SOURCE calls → caller = Lambda
 Q3  Lambda's permission type → IAM role holder
 →   policy statement on the CALLER's own role (Lambda)
 Q4  plumbing → none either side; this is a plain SDK call
```

One new entry in `Lambda.terraformProperties`:

```hcl
resource "aws_iam_role_policy" "lambda_dynamodb_access" {
  name = "lambda-dynamodb-access"
  role = aws_iam_role.lambda_exec.id          # link → Lambda's own role

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem",
        "dynamodb:Query"
      ]
      Resource = aws_dynamodb_table.example.arn # link → DynamoDB node's arn
    }]
  })
}
```

`role` links to Lambda's own `aws_iam_role` (same-node reference — the
existing `link` type handles this). `Resource` is the cross-resource
reference flagged as wrinkle #1 — it needs DynamoDB's Terraform address, not
anything in Lambda's own `terraformProperties`. The `Action` list is a
reasonable default set of DynamoDB CRUD actions; a real implementation
might later narrow it based on which operations are actually configured.

### DynamoDB → Lambda (`pull`, i.e. Streams)

```
 Q1  edgeType = pull
 Q2  pull → TARGET calls (Lambda polls the stream) → caller = Lambda
 Q3  Lambda's permission type → IAM role holder
 →   policy statement on the CALLER's own role (Lambda) — same shape as
     above, different actions/resource
 Q4  plumbing → BOTH sides need something, independent of who's the caller:
       DynamoDB (source, non-caller) → mutate its own aws_dynamodb_table:
         stream_enabled = true
       Lambda (target, caller) → new aws_lambda_event_source_mapping
```

Mutation to DynamoDB's *existing* `aws_dynamodb_table` block (wrinkle #2 —
not a new resource):

```hcl
resource "aws_dynamodb_table" "example" {
  # ...existing attributes unchanged...
  stream_enabled   = true
  stream_view_type = "NEW_AND_OLD_IMAGES"
}
```

New policy entry in `Lambda.terraformProperties` (permission, Q1–Q3):

```hcl
resource "aws_iam_role_policy" "lambda_dynamodb_stream_access" {
  name = "lambda-dynamodb-stream-access"
  role = aws_iam_role.lambda_exec.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "dynamodb:DescribeStream",
        "dynamodb:GetRecords",
        "dynamodb:GetShardIterator",
        "dynamodb:ListStreams"
      ]
      Resource = aws_dynamodb_table.example.stream_arn
    }]
  })
}
```

New plumbing entry, also in `Lambda.terraformProperties` (Q4 — this is what
actually wires the trigger up; the policy above only grants permission, it
doesn't create the trigger itself):

```hcl
resource "aws_lambda_event_source_mapping" "dynamodb_stream_trigger" {
  event_source_arn  = aws_dynamodb_table.example.stream_arn
  function_name     = aws_lambda_function.example.arn
  starting_position = "LATEST"
}
```

Both of Lambda's new entries exist only because of this one edge; neither
would be present on a Lambda node with no incoming Streams connection.

## Open questions / not yet decided

- How does a resource expose "my Terraform type + local name" as an
  addressable handle for another resource's generated block to reference?
- Exact shape of the hook return value — new resource(s), a patch to
  `this.terraformProperties`, or both?
- Unique-key strategy for `terraformProperties` when multiple edges imply
  the same resource type on one node (e.g. two incoming service-principal
  edges both wanting `aws_lambda_permission`) — needs a per-edge-unique key
  with a friendlier display label, since the widget currently uses the key
  itself as the visible `<summary>` text.
