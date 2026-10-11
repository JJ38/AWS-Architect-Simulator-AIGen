# Terraform Resource Templates — Reference for `TerraformConverter`

Reference templates for the four services currently in `constants.ts`
(`EC2` → `aws_instance`, `S3` → `aws_s3_bucket`, `Lambda` →
`aws_lambda_function`, `API Gateway` → `aws_apigatewayv2_api`), plus a
broader set of AWS Free Tier services worth adding to `constants.ts` later.
Each block below lists **every** argument the AWS provider accepts, tagged:

- `# REQUIRED` — Terraform refuses to `plan`/`apply` without it
- `# common` — not required, but shows up in most real configs; good
  candidates for whatever fields `diagramToTerrafrom` actually populates
- no tag — accepted, but a corner case; fine to omit at first

This is a lookup for writing the converter, not something to check in as
generated output.

**Free tier numbers below are approximate and will drift** — AWS changes
free tier terms periodically (e.g. CloudFront and EFS both moved from
12-months-free to Always Free over time). Treat the figures here the same
way this project treats simulated cost — illustrative, not authoritative —
and confirm anything load-bearing against AWS's current pricing page.

Each section also lists valid **edge types** for that service — `sync`
(caller blocks for a response), `async` (fire-and-forget trigger), `pull`
(downstream service polls at its own pace) — split into what it accepts
**as source** and **as target**. This mirrors the canvas's edge-type model:
it drives which options the edge type picker offers for a given connection,
and later which Terraform resources the converter emits for it (e.g. a
`pull` edge into Lambda implies an `aws_lambda_event_source_mapping`).

**The `sync`/`async` split as target is about what the ack means, not
whether the underlying HTTP call blocks** — every AWS API call blocks
briefly for a response, so that alone can't be the criterion. Ask instead:
when the caller gets its response back, is the thing it asked for actually
*done* (`sync` — a query result, a stored/confirmed write, an encrypted
blob), or has the caller only handed off a message/event for a decoupled
continuation it doesn't wait for (`async` — enqueued, published, matched,
ingested, but not yet delivered/processed/consumed)? `SendMessage`,
`Publish`, and `PutEvents` are the same shape under this rule and must land
on the same side.

## `aws_instance` (EC2)

```hcl
resource "aws_instance" "example" {
  ami           = "ami-0abcdef1234567890" # common — see note below
  instance_type = "t3.micro"              # common — see note below

  subnet_id                   = aws_subnet.example.id           # common
  vpc_security_group_ids      = [aws_security_group.example.id] # common
  key_name                    = "my-keypair"                    # common
  associate_public_ip_address = true                            # common
  iam_instance_profile        = aws_iam_instance_profile.example.name
  user_data                   = file("startup.sh")              # common
  user_data_replace_on_change = false
  availability_zone           = "eu-west-2a"
  monitoring                  = false
  disable_api_termination     = false
  disable_api_stop            = false
  ebs_optimized                = false
  tenancy                      = "default"

  credit_specification {      # common for t3/t4g — see note below
    cpu_credits = "standard"
  }

  metadata_options {          # common — enforces IMDSv2
    http_tokens = "required"
  }

  root_block_device {
    volume_size = 8           # common
    volume_type = "gp3"       # common
    encrypted   = true
  }

  tags = {                    # common
    Name = "example-instance"
  }
}
```

Unlike every other service template in this file, **nothing on
`aws_instance` is schema-required** as of the current provider — `ami` and
`instance_type` are both Optional, because either can be supplied by a
`launch_template` block instead. This doc doesn't model `launch_template`,
so in practice both are still needed to get a bootable instance; they're
tagged `# common` here rather than `# REQUIRED` to stay accurate to the
schema, not because they're skippable. `ami` is also region- and
OS-specific — there's no universal default, the diagram would need to
carry (or default to) one per region/OS choice.

Two other things worth flagging:
- `vpc_security_group_ids` (used above) and `security_groups` are **not**
  interchangeable — `security_groups` only works for EC2-Classic/the
  default VPC, `vpc_security_group_ids` is the one that works for any VPC
  subnet, which is why it's the one modeled here.
- `credit_specification.cpu_credits` matters specifically because the
  example uses `t3.micro` — burstable (`t`-family) instances default to
  `"standard"` credits, and switching to `"unlimited"` can bill extra for
  sustained CPU above the free baseline. Same free-tier-gotcha shape as the
  ECS/Fargate and Secrets Manager callouts further down this file.

**Edge types**
- As source: `sync` (calls out to RDS/DynamoDB/other APIs and waits), `async`
  (SDK `Invoke` with `InvocationType=Event`, or publishing to SNS/SQS/
  EventBridge — any AWS API caller can choose this, EC2 isn't restricted to
  sync), `pull` (app code on the instance polling SQS/Kinesis)
- As target: `sync` only (ALB/NLB routes a request to it and waits)

## `aws_s3_bucket` (S3)

```hcl
resource "aws_s3_bucket" "example" {
  bucket        = "my-globally-unique-bucket-name" # common (auto-generated if omitted)
  bucket_prefix = null                             # alternative to `bucket`
  force_destroy = false                            # common — allows delete while non-empty
  tags = {
    Name = "example-bucket"
  }
}
```

Unlike the others, **no argument is strictly required** — omit `bucket`
and AWS generates a random unique name. This is also the one service where
the "one node → one resource" assumption breaks hardest: since AWS provider
v4, versioning, public-access blocking, lifecycle rules, and ACLs all moved
out of `aws_s3_bucket` into their own separate resource types that must
reference this bucket by id:

```hcl
resource "aws_s3_bucket_versioning" "example" {
  bucket = aws_s3_bucket.example.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_public_access_block" "example" {
  bucket                  = aws_s3_bucket.example.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
```

If the diagram only has one "S3" node, decide now whether that node emits
just `aws_s3_bucket`, or a bundle including a sane-default
`aws_s3_bucket_public_access_block` (blocking public access is the safe
default almost everyone wants).

**Edge types**
- As source: `async` only (object-created/removed event notifications)
- As target: `sync` only (SDK `GetObject`/`PutObject`, CloudFront origin fetch)

## `aws_lambda_function` (Lambda)

```hcl
resource "aws_lambda_function" "example" {
  function_name = "example-fn"                # REQUIRED
  role          = aws_iam_role.example.arn     # REQUIRED — execution role ARN

  # --- code source: exactly one of these approaches ---
  filename         = "function.zip"            # common — local zip
  source_code_hash = filebase64sha256("function.zip") # common, pairs with filename
  # s3_bucket      = "my-bucket"                # alternative source
  # s3_key         = "function.zip"
  # image_uri      = "123456789012.dkr.ecr.../repo:tag" # if package_type = "Image"

  handler = "index.handler"                    # REQUIRED unless package_type = "Image"
  runtime = "nodejs20.x"                       # REQUIRED unless package_type = "Image"

  timeout                        = 3           # common (default 3s, often too low)
  memory_size                    = 128         # common
  package_type                   = "Zip"       # "Zip" | "Image"
  architectures                  = ["arm64"]   # common — see note below
  reserved_concurrent_executions = -1          # common — see note below
  publish                        = false       # common — publish a new version on each change

  environment {                                # common
    variables = {
      STAGE = "dev"
    }
  }

  vpc_config {
    subnet_ids         = [aws_subnet.example.id]
    security_group_ids = [aws_security_group.example.id]
  }

  dead_letter_config {        # common when this function is an async target — see note below
    target_arn = aws_sqs_queue.example.arn
  }

  ephemeral_storage {          # common — /tmp size, 512–10240 MB, default 512
    size = 512
  }

  layers = [aws_lambda_layer_version.example.arn]

  tags = {
    Name = "example-fn"
  }
}
```

`role` is the sharpest edge here: it's required, but it's an IAM resource,
not something that appears on the canvas as its own node. The converter
will likely need to synthesize a minimal `aws_iam_role` +
`aws_iam_role_policy_attachment` (basic execution policy) per Lambda node
rather than expecting the user to draw one.

Three more worth calling out, in the same "free-tier/cost gotcha" vein as
the EC2 `credit_specification` and ECS/Fargate notes elsewhere in this
file:

- `reserved_concurrent_executions` defaults to `-1` (unlimited) — a
  function with no edges drawn to anything rate-limiting it can scale out
  and run up cost/downstream load with no cap, which matters for a tool
  whose whole point is simulating traffic.
- `architectures = ["arm64"]` costs less per GB-ms than the `x86_64`
  default and is still free-tier eligible — a reasonable default for this
  project to steer toward rather than just mirroring whatever AWS defaults
  to.
- `dead_letter_config` is the direct Terraform expression of this file's
  `async`-as-target edge type for Lambda (line ~176): since an async
  invocation's ack only means "accepted," not "processed," a DLQ is what
  catches the failures that happen after that ack. Natural candidate for
  the converter to auto-attach whenever an edge into a Lambda node is typed
  `async`.

One honesty note on sourcing: the provider docs also list `capacity_provider_config`,
`tenancy_config`, and `durable_config` blocks on this resource. Those didn't match
anything in my own training knowledge of Lambda, so they may be recent
additions I'm not aware of — I verified they're present in the current docs
but haven't verified what they actually configure, so treat them as
unconfirmed/niche and spot-check directly before relying on them. Left out
of the example above either way since they're not "common" by this file's
own criteria.

**Edge types**
- As source: `sync` (SDK calls to DynamoDB/RDS/other services), `async`
  (invoking another Lambda asynchronously, publishing to SNS/EventBridge)
- As target: `sync` (API Gateway or a direct invoke), `async` (S3/SNS/
  EventBridge triggers), `pull` (SQS/Kinesis/DynamoDB Streams event source
  mappings — Lambda's poller is doing the pulling under the hood)

## `aws_apigatewayv2_api` (API Gateway — HTTP API)

```hcl
resource "aws_apigatewayv2_api" "example" {
  name          = "example-api"   # REQUIRED
  protocol_type = "HTTP"          # REQUIRED — "HTTP" or "WEBSOCKET"

  target      = aws_lambda_function.example.arn # common — quick-create shortcut, skips routes/integrations below
  route_key   = "ANY /"                          # common — pairs with target, see note below
  description = "Example HTTP API"
  route_selection_expression = "$request.method $request.path"
  disable_execute_api_endpoint = false

  cors_configuration {          # common if a browser calls this API
    allow_origins = ["*"]
    allow_methods = ["GET", "POST"]
    allow_headers = ["content-type"] # common — see note below
  }

  tags = {
    Name = "example-api"
  }
}
```

Two things worth flagging, verified against the current provider docs:

- **`route_key` pairs with `target`** for the quick-create path — `target`
  alone creates the integration, but `route_key` is what says which
  method/path it answers (`"ANY /"` is the typical catch-all). Both are
  HTTP-API-only, same as `target` itself.
- **`cors_configuration.allow_headers` is a classic preflight footgun** —
  `allow_origins`/`allow_methods` alone are enough for a simple `GET`, but
  any browser request sending `Content-Type: application/json` (i.e. any
  JSON `POST`) fails CORS preflight without `content-type` explicitly
  listed here. Same "looks done until you actually test it from a
  browser" shape as the EC2/SQS gotchas elsewhere in this file.

Two alternatives not shown in the example, both corner cases for this
project's scope: `body` lets you define the whole API (routes,
integrations, models) from an OpenAPI spec instead of the
route/integration resources below — mutually exclusive with hand-building
them; `credentials_arn` supplies an IAM role for quick-create targets that
need AWS-level authorization (e.g. invoking another AWS service directly)
rather than a plain Lambda ARN.

Same pattern as Lambda's role: a bare `aws_apigatewayv2_api` with just
`name`/`protocol_type` creates an API with no routes — nothing actually
reachable. Real usage needs, at minimum:

```hcl
resource "aws_apigatewayv2_integration" "example" {
  api_id                 = aws_apigatewayv2_api.example.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.example.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "example" {
  api_id    = aws_apigatewayv2_api.example.id
  route_key = "GET /"
  target    = "integrations/${aws_apigatewayv2_integration.example.id}"
}

resource "aws_apigatewayv2_stage" "example" {
  api_id      = aws_apigatewayv2_api.example.id
  name        = "$default"
  auto_deploy = true
}

resource "aws_lambda_permission" "example" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.example.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.example.execution_arn}/*/*"
}
```

The `target` shortcut on `aws_apigatewayv2_api` collapses integration +
default route + `$default` stage into one field — worth considering as the
converter's first pass for an API-Gateway-node-connected-to-a-Lambda-node
edge, before building the full four-resource version above.

**Edge types**
- As source: `sync` (default proxy integration — request/response), `async`
  (Lambda `Event` invocation type override — uncommon)
- As target: `sync` only — this is the diagram's external entry point;
  nothing else drawn on the canvas calls into it

## Beyond the current 4 — AWS Free Tier services

Scoped to services you'd plausibly draw as a *node* on an architecture
diagram — compute, storage, database, networking, messaging, security/
identity, monitoring. Excludes account-level tooling that has a free tier
but isn't itself a provisionable resource (Cost Explorer, Trusted Advisor,
Budgets, IAM Access Analyzer) — nothing to draw a node for there.

### Database

#### `aws_dynamodb_table` (DynamoDB) — Always Free: ~25 GB storage

```hcl
resource "aws_dynamodb_table" "example" {
  name         = "example-table"    # REQUIRED
  hash_key     = "id"                # REQUIRED — must match an `attribute` below
  billing_mode = "PAY_PER_REQUEST"   # common — avoids managing read/write capacity;
                                      # PROVISIONED also accepts on_demand_throughput instead

  attribute {                        # REQUIRED — one per key (hash/range)
    name = "id"
    type = "S"                       # S = string, N = number, B = binary
  }

  # range_key = "sort_key"           # common — sort key for a composite primary key
  # attribute {                       # needed only if range_key is set
  #   name = "sort_key"
  #   type = "S"
  # }

  stream_enabled   = false                 # common — see note below
  stream_view_type = "NEW_AND_OLD_IMAGES"   # REQUIRED if stream_enabled = true

  point_in_time_recovery {           # common — see note below
    enabled = true
  }

  deletion_protection_enabled = false # common — free, no reason not to default true

  # only needed if billing_mode = "PROVISIONED"
  # read_capacity  = 5
  # write_capacity = 5

  tags = {
    Name = "example-table"
  }
}
```

A few things worth flagging, verified against the current provider docs:

- **`stream_enabled`/`stream_view_type` are the actual implementation of
  this section's own "As source: `async`" edge type below** — without
  them, "DynamoDB Streams triggering a Lambda" has nothing backing it in
  the generated config. Same auto-attach idea as Lambda's
  `dead_letter_config` and SQS's `redrive_policy` earlier in this file: the
  converter should probably flip `stream_enabled = true` (and pick a
  `stream_view_type`) automatically whenever the canvas has an `async` edge
  leaving this node, rather than exposing it as a standalone toggle the
  user has to remember.
- **`point_in_time_recovery` is a reliability default, not a free one** —
  worth calling out because it breaks the pattern of the other "sane
  default" callouts in this file (S3 public-access-block, EC2
  `metadata_options`, SQS managed SSE), which cost nothing. PITR bills for
  continuous-backup storage beyond the table's own free-tier allowance, so
  flip it on deliberately, not by the same reflex as those other defaults.
- **`deletion_protection_enabled` has no such caveat** — it's free, and
  there's no real reason for this project not to default it to `true` the
  way it already treats S3's public-access-block as the obvious default.
- Composite keys (`range_key`) and `global_secondary_index` are real and
  common in production tables, but left as a commented-out hint rather
  than a full worked example here — same "corner case, don't need to
  model it yet" treatment the EC2 section gives nested blocks like
  `cpu_options`.
- Not shown because it needs no action: DynamoDB **encrypts at rest by
  default** with an AWS-owned key at no extra cost (the `server_side_encryption`
  block only matters if you want a customer-managed KMS key instead) — the
  opposite situation from S3 and SQS, where the safe default has to be
  turned on explicitly.

**Edge types**
- As source: `async` only (DynamoDB Streams triggering a Lambda)
- As target: `sync` only (`GetItem`/`PutItem`/`Query`)

#### `aws_db_instance` (RDS) — 12-months-free: 750 hrs/month on `db.t3.micro`/`db.t4g.micro`

```hcl
resource "aws_db_instance" "example" {
  engine               = "mysql"              # REQUIRED
  instance_class       = "db.t3.micro"        # REQUIRED — free-tier-eligible class
  allocated_storage    = 20                   # REQUIRED
  username             = "admin"              # REQUIRED
  password             = var.db_password      # REQUIRED — use a variable, never hardcode

  identifier              = "example-db"      # common
  engine_version           = "8.0"             # common
  db_name                  = "exampledb"       # common
  skip_final_snapshot      = true              # common — avoids a required snapshot on destroy
  publicly_accessible      = false             # common
  vpc_security_group_ids   = [aws_security_group.example.id] # common
  multi_az                 = false             # keep false — multi-AZ isn't free-tier eligible

  tags = {
    Name = "example-db"
  }
}
```

**Edge types**
- As source: none — doesn't originate calls to other AWS services in this model
- As target: `sync` only (DB connection/query — always blocks for a result)

#### `aws_elasticache_cluster` (ElastiCache) — Always Free: `cache.t2.micro`/`cache.t3.micro`, 750 hrs/month

```hcl
resource "aws_elasticache_cluster" "example" {
  cluster_id      = "example-cache"   # REQUIRED
  engine          = "redis"           # REQUIRED — "redis" or "memcached"
  node_type       = "cache.t3.micro"  # REQUIRED — free-tier-eligible class
  num_cache_nodes = 1                 # REQUIRED

  parameter_group_name = "default.redis7" # common
  engine_version        = "7.0"
  port                  = 6379            # common

  tags = {
    Name = "example-cache"
  }
}
```

**Edge types**
- As source: none
- As target: `sync` only (cache client `GET`/`SET`)

### Storage

#### `aws_efs_file_system` (EFS) — Always Free: ~5 GB storage

```hcl
resource "aws_efs_file_system" "example" {
  # no argument is strictly required — same shape as aws_s3_bucket
  creation_token   = "example-efs"    # common — idempotency token
  performance_mode = "generalPurpose" # common
  throughput_mode  = "bursting"       # common
  encrypted        = true             # common

  tags = {
    Name = "example-efs"
  }
}
```

**Edge types**
- As source: none
- As target: `sync` only (mounted filesystem read/write)

### Networking

#### `aws_vpc` + `aws_subnet` + `aws_internet_gateway` — Always Free (the network shell itself has no charge; NAT Gateways and data transfer do)

```hcl
resource "aws_vpc" "example" {
  cidr_block = "10.0.0.0/16" # REQUIRED

  tags = {
    Name = "example-vpc"
  }
}

resource "aws_subnet" "example" {
  vpc_id     = aws_vpc.example.id # REQUIRED
  cidr_block = "10.0.1.0/24"      # REQUIRED

  availability_zone       = "eu-west-2a" # common
  map_public_ip_on_launch = true         # common — needed for a "public" subnet

  tags = {
    Name = "example-subnet"
  }
}

resource "aws_internet_gateway" "example" {
  vpc_id = aws_vpc.example.id # REQUIRED

  tags = {
    Name = "example-igw"
  }
}
```

This trio is the odd one out for your node model: on a real diagram it's
usually drawn as the *boundary box* everything else sits inside, not a
service icon of its own. Worth deciding whether a "VPC" node emits this
bundle with sane subnet/IGW defaults, or whether it's implicit and every
other resource just gets a default `vpc_id`/`subnet_id` wired in behind the
scenes.

**Edge types:** N/A — this is the boundary box, not a traffic participant;
no source/target edge types apply.

#### `aws_cloudfront_distribution` (CloudFront) — Always Free: ~1 TB data transfer out + 10M requests/month

```hcl
resource "aws_cloudfront_distribution" "example" {
  enabled = true # REQUIRED

  origin {                            # REQUIRED — at least one
    domain_name = aws_s3_bucket.example.bucket_regional_domain_name
    origin_id   = "example-origin"
  }

  default_cache_behavior {            # REQUIRED
    allowed_methods        = ["GET", "HEAD"]
    cached_methods          = ["GET", "HEAD"]
    target_origin_id        = "example-origin"
    viewer_protocol_policy  = "redirect-to-https" # common

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }
  }

  restrictions {                      # REQUIRED
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {                # REQUIRED
    cloudfront_default_certificate = true
  }

  default_root_object = "index.html"  # common

  tags = {
    Name = "example-cdn"
  }
}
```

**Edge types**
- As source: `sync` only (forwards a request to its origin and waits to cache the response)
- As target: `sync` only (external entry point for client requests)

### Messaging & integration

#### `aws_sns_topic` (SNS) — Always Free: ~1M publishes/month

```hcl
resource "aws_sns_topic" "example" {
  name = "example-topic" # common — auto-generated if omitted, same as S3's `bucket`

  tags = {
    Name = "example-topic"
  }
}
```

**Edge types**
- As source: `async` only (fan-out delivery to subscribers is fire-and-forget)
- As target: `async` only — `Publish` returns as soon as SNS accepts the
  message, before any subscriber is notified; the ack confirms hand-off, not
  completion, same shape as EventBridge's `PutEvents` below

#### `aws_sqs_queue` (SQS) — Always Free: ~1M requests/month

```hcl
resource "aws_sqs_queue" "example" {
  name = "example-queue" # common — auto-generated if omitted

  fifo_queue                 = false    # common — set true + name ending ".fifo" for ordered delivery
  visibility_timeout_seconds = 30       # common
  message_retention_seconds  = 345600   # common (default 4 days)
  receive_wait_time_seconds  = 10       # common — long polling, see note below
  delay_seconds               = 0        # common
  sqs_managed_sse_enabled     = true     # common — free, encrypts at rest

  redrive_policy = jsonencode({          # common — this queue's own DLQ, see note below
    deadLetterTargetArn = aws_sqs_queue.dlq.arn
    maxReceiveCount     = 5
  })

  tags = {
    Name = "example-queue"
  }
}
```

A few things worth flagging, verified against the current provider docs:

- **`redrive_policy`'s `maxReceiveCount` must be a JSON number, not a
  string** (`5`, not `"5"`) — a documented, easy-to-get-wrong footgun since
  `jsonencode` will happily emit either depending on how you write the
  Terraform expression.
- This queue's own `redrive_policy` DLQ is a **different failure mode**
  than Lambda's `dead_letter_config` added in the Lambda section above:
  SQS's redrive fires when a *consumer* fails to successfully process a
  message `maxReceiveCount` times (the message itself is the thing being
  retried); Lambda's DLQ fires when an *async invocation* of the function
  fails. A `pull` edge from this queue into a Lambda node can legitimately
  want both — one guarding against a bad message, one guarding against a
  bad invocation.
- `policy` and `redrive_allow_policy` exist as inline top-level arguments
  here, but the docs recommend the dedicated `aws_sqs_queue_policy` and
  `aws_sqs_queue_redrive_allow_policy` resource types instead — the same
  "logically one node, multiple Terraform resource blocks" shape as S3's
  `aws_s3_bucket_versioning`/`aws_s3_bucket_public_access_block` split
  earlier in this file.
- `receive_wait_time_seconds` (long polling) is tagged `common` for a
  cost reason, not just a latency one: an empty receive still counts
  against SQS's ~1M-free-requests/month quota, so `0` (short polling, the
  default) burns through free-tier requests faster than necessary for an
  idle queue.
- FIFO-only arguments (`content_based_deduplication`, `deduplication_scope`,
  `fifo_throughput_limit`) only apply once `fifo_queue = true` and are left
  out of the base example above — they're a corner case conditional on
  that one flag, not something every queue needs.

**Edge types**
- As source: `pull` only (consumers poll the queue at their own pace)
- As target: `async` only — `SendMessage` returns once the message is
  enqueued, before any consumer has picked it up; same reasoning as SNS above

#### `aws_sfn_state_machine` (Step Functions) — Always Free: ~4,000 state transitions/month

```hcl
resource "aws_sfn_state_machine" "example" {
  name     = "example-workflow"          # REQUIRED
  role_arn = aws_iam_role.example.arn    # REQUIRED — same "companion IAM role" pattern as Lambda
  definition = jsonencode({              # REQUIRED — Amazon States Language JSON
    Comment = "example"
    StartAt = "HelloWorld"
    States = {
      HelloWorld = { Type = "Pass", End = true }
    }
  })

  type = "STANDARD" # common — "STANDARD" or "EXPRESS"

  tags = {
    Name = "example-workflow"
  }
}
```

**Edge types**
- As source: `sync`, `async` — same target, different integration pattern per
  state (`.sync` waits for the result; the default doesn't)
- As target: `sync` (Express workflows / `StartSyncExecution`), `async`
  (Standard workflows / `StartExecution`, fire-and-forget)

#### `aws_cloudwatch_event_rule` + `aws_cloudwatch_event_target` (EventBridge default bus)

```hcl
resource "aws_cloudwatch_event_rule" "example" {
  name                = "example-rule" # common
  schedule_expression = "rate(5 minutes)" # common — or `event_pattern` for event-driven rules

  tags = {
    Name = "example-rule"
  }
}

resource "aws_cloudwatch_event_target" "example" {
  rule = aws_cloudwatch_event_rule.example.name # REQUIRED
  arn  = aws_lambda_function.example.arn        # REQUIRED — what the rule invokes
}
```

Same "no node for the plumbing" issue as API Gateway → Lambda: a rule
without a target does nothing, so these two resources are really one unit
from the diagram's perspective.

**Edge types**
- As source: `async` only (dispatches to targets like Lambda without waiting)
- As target: `async` only (`PutEvents` — publishers fire an event and don't
  wait for downstream processing)

### Security & identity

#### `aws_cognito_user_pool` (Cognito) — Always Free: ~50,000 monthly active users

```hcl
resource "aws_cognito_user_pool" "example" {
  name = "example-user-pool" # REQUIRED

  password_policy {           # common
    minimum_length = 8
  }

  auto_verified_attributes = ["email"] # common

  tags = {
    Name = "example-user-pool"
  }
}

resource "aws_cognito_user_pool_client" "example" {
  name         = "example-client"                # REQUIRED
  user_pool_id = aws_cognito_user_pool.example.id # REQUIRED
}
```

**Edge types**
- As source: `sync` — auth-flow Lambda triggers (e.g. `PostConfirmation`) are
  called synchronously; Cognito waits on the response to continue the auth
  flow, unlike most trigger-style edges
- As target: `sync` only (sign-up/sign-in API calls)

#### `aws_kms_key` (KMS) — Always Free: ~20,000 requests/month (the key itself has a small monthly charge, not free)

```hcl
resource "aws_kms_key" "example" {
  description             = "example key" # common
  deletion_window_in_days = 30            # common — 7 to 30, controls how long a delete is reversible
  enable_key_rotation     = true          # common

  tags = {
    Name = "example-key"
  }
}
```

**Edge types**
- As source: none
- As target: `sync` only (`Encrypt`/`Decrypt` calls)

#### `aws_secretsmanager_secret` (Secrets Manager) — **30-day trial only, not Always Free** — flagging because it's easy to assume it's free like the rest of this list

```hcl
resource "aws_secretsmanager_secret" "example" {
  name = "example-secret" # common

  tags = {
    Name = "example-secret"
  }
}

resource "aws_secretsmanager_secret_version" "example" {
  secret_id     = aws_secretsmanager_secret.example.id # REQUIRED
  secret_string = jsonencode({ username = "admin", password = "changeme" }) # common
}
```

**Edge types**
- As source: `sync` (invokes a rotation Lambda synchronously per rotation
  step, if rotation is configured)
- As target: `sync` only (`GetSecretValue`)

### Monitoring

#### `aws_cloudwatch_log_group` + `aws_cloudwatch_metric_alarm` — Always Free: ~10 custom metrics/alarms, some log ingestion

```hcl
resource "aws_cloudwatch_log_group" "example" {
  name              = "/example/log-group" # common — auto-generated if omitted
  retention_in_days = 14                   # common — omit and logs never expire (cost creep)

  tags = {
    Name = "example-log-group"
  }
}

resource "aws_cloudwatch_metric_alarm" "example" {
  alarm_name          = "example-alarm" # REQUIRED
  comparison_operator = "GreaterThanThreshold" # REQUIRED
  evaluation_periods  = 2               # REQUIRED
  metric_name         = "CPUUtilization" # REQUIRED
  namespace           = "AWS/EC2"        # REQUIRED
  period              = 300              # REQUIRED
  statistic           = "Average"        # REQUIRED
  threshold           = 80               # REQUIRED

  dimensions = {                         # common — scopes the alarm to one resource
    InstanceId = aws_instance.example.id
  }
}
```

**Edge types**
- As source: `async` only (an alarm firing an action — SNS notification, Auto
  Scaling policy — is fire-and-forget)
- As target: `async` only (every other service ships logs/metrics to it as a
  side effect, not waiting on any response)

### Compute — the one with a real caveat

#### `aws_ecs_cluster` + `aws_ecs_task_definition` + `aws_ecs_service` (ECS/Fargate)

```hcl
resource "aws_ecs_cluster" "example" {
  name = "example-cluster" # REQUIRED

  tags = {
    Name = "example-cluster"
  }
}

resource "aws_ecs_task_definition" "example" {
  family                   = "example-task"     # REQUIRED
  container_definitions    = jsonencode([{       # REQUIRED — JSON array of container specs
    name  = "example-container"
    image = "nginx:latest"
  }])
  requires_compatibilities = ["FARGATE"]         # common
  network_mode             = "awsvpc"            # REQUIRED for Fargate
  cpu                      = "256"               # REQUIRED for Fargate
  memory                   = "512"               # REQUIRED for Fargate
  execution_role_arn       = aws_iam_role.example.arn # common — pulls image, writes logs

  tags = {
    Name = "example-task"
  }
}

resource "aws_ecs_service" "example" {
  name            = "example-service"                    # REQUIRED
  cluster         = aws_ecs_cluster.example.id            # REQUIRED
  task_definition = aws_ecs_task_definition.example.arn   # REQUIRED
  desired_count   = 1                                     # common
  launch_type     = "FARGATE"                              # common

  network_configuration {  # REQUIRED for awsvpc network mode
    subnets          = [aws_subnet.example.id]
    security_groups  = [aws_security_group.example.id]
    assign_public_ip = true
  }
}
```

**Edge types**
- As source: `sync` (calls to RDS/DynamoDB/other APIs), `async` (same
  reasoning as EC2 — an async SDK invoke or SNS/SQS/EventBridge publish is
  just a caller choice, not restricted by compute type), `pull` (task code
  polling SQS/Kinesis) — same profile as EC2
- As target: `sync` only (ALB routes requests to a task and waits)

**Caveat:** Fargate compute itself is not in AWS's free tier — this is the
one entry here that doesn't actually belong on a strict "free tier
services" list. It's included because it's a very common thing to draw
next to EC2/Lambda, and because the mistake ("ECS is basically Lambda, so
it must be free too") is exactly the kind of thing a cost-simulation
feature should catch. The only genuinely free-tier path to running
containers is ECS with the **EC2** launch type on a free-tier-eligible
instance, piggybacking on EC2's free tier rather than Fargate having its
own.

Application Load Balancer (`aws_lb`) has the same issue in the other
direction — it's one of the most commonly diagrammed services and pairs
naturally with ECS/EC2, but it has no free tier at all (hourly + LCU
charges from hour one). Worth a template if/when you add it as a node, but
deliberately left out of this "free tier" pass since it would be
misleading to imply otherwise.

## Cross-cutting pattern for the converter

Every service except S3 needed at least one resource that has **no
corresponding node on the canvas** (Lambda's IAM role, API Gateway's
permission/integration/route/stage). Two ways to handle that in
`diagramToTerrafrom`:

1. Emit sane-default companion resources automatically per node type
   (a Lambda node always emits its own minimal execution role).
2. Only emit companions when a **connection on the canvas** implies they're
   needed (an edge from API Gateway → Lambda triggers the
   integration/route/permission bundle; a bare Lambda node with no edges
   just gets the role).

(2) is more work now but keeps generated config proportional to what's
actually drawn, rather than always emitting maximal boilerplate.

The expanded list above adds a second cross-cutting dependency on top of
IAM roles: **networking**. RDS, ElastiCache, and ECS (Fargate/`awsvpc`
mode) all require a `vpc_id`/`subnet_id`/security-group somewhere, the same
way Lambda optionally does via `vpc_config`. If the app doesn't want to
force the user to draw a VPC node for every diagram, the converter will
need a default VPC/subnet/security-group bundle it falls back to — same
shape as the "sane default" decision for S3's public-access block.
