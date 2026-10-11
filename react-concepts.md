# React Concepts — Cheatsheet

Field notes from wiring up `Canvas.tsx`, in the order they came up — the mental
models, not the syntax. Kept up to date as new concepts get explained (see the
"Working conventions" section in `CLAUDE.md`).

## 01. Props vs. Context

Props flow one way, parent → child, and every component in between has to
pass them along even if it never uses them. A `Provider` skips that chain:
wrap a subtree in one, and any descendant reads the value directly with
`useContext`, no matter how deep.

```tsx
// above, once
<Ctx.Provider value={value}>
  <DeeplyNested />
</Ctx.Provider>

// anywhere below, no threading
const value = useContext(Ctx);
```

## 02. ReactFlowProvider is a special case

Most Providers just relay a value someone else already computed.
`ReactFlowProvider` owns its state itself — pan, zoom, node data — and
exposes that. Hooks like `useReactFlow()` only work inside it, or inside
`<ReactFlow>`, which wraps its own children in one automatically.

> **Gotcha:** if a component *renders* `<ReactFlow>` but isn't itself nested
> *inside* it, calling `useReactFlow()` there fails — no Provider ancestor
> exists yet at that point in the tree.

## 03. When Context is the wrong tool

| Cost | Why it bites |
| --- | --- |
| Every consumer re-renders | No partial subscriptions — any value change re-renders all readers, even ones using an unrelated field |
| Data flow goes opaque | Tracing a value means hunting for its Provider instead of following props up |
| Consumers get coupled | A component breaks (or falls to its default) if rendered outside that Provider's subtree |

Rule of thumb: `props` for local/shallow data · `Context` for infrequent,
global-ish values · a state library (`zustand`) once updates are frequent and
need selective subscriptions.

## 04. What a hook actually is

A function starting with `use` that lets a function component tap into
React's internal per-instance memory — storage that survives across renders,
which a plain JS function can't have since it forgets everything between
calls.

**Built-in** hooks (`useState`, `useContext`, `useEffect`, `useRef`) are the
real doors into that machinery. A **custom** hook like `useReactFlow()` is
just an ordinary function that calls built-in hooks internally and hands back
a tidier API.

## 05. Rules of hooks

> **Gotcha:** call hooks only at the top level — never inside an `if`, a
> loop, or a nested function. React matches each hook call to its stored slot
> by *call order*, not by name. Skip one conditionally and every hook after
> it silently reads the wrong slot.

## 06. Hooks vs. OOP getters/setters

Close as a first approximation — persistent storage tied to an "instance" —
but the retrieval mechanism and the setter's side effect both differ.

| OOP field access | React hook |
| --- | --- |
| Named: `this.count` | Positional: the *n*th `useState()` call this render |
| Setter mutates in place, silently | Setter stores the value *and* schedules the whole component function to re-run |
| Safe inside any conditional | Must be called unconditionally, same order every render |

## 07. Moving a Provider = lifting state up

One store, always — relocating `<ReactFlowProvider>` doesn't create a second
data source, it just repositions who counts as a descendant. Same instinct as
lifting `useState` up: put it at the nearest common ancestor of everyone who
needs it.

## 08. Finding where a Provider goes

"Who needs the hook" means *your own* code that calls it — not the library
component. `<ReactFlow>` already satisfies its own needs automatically;
that's never the question.

Trace it: which component literally writes `useReactFlow()`? Is it a
descendant of the Provider? If not, walk up to the nearest point that's an
ancestor of it — put the Provider there.

## 09. Hooks run at render time, not inside events

`useReactFlow()` only works while a component is actively rendering. An event
handler like `handlePaneMouseMove` runs later, disconnected from that render
— there's no render for the hook to attach to, so calling it in there throws.

Fix: call the hook once during render, capture the function it returns
(`screenToFlowPosition`), then pass *that reference* into the handler to
invoke whenever the event actually fires.

## 10. Don't hand-transcribe a library's type

When a value's type clearly "belongs" to a library, the library almost
always exports a named type for it — specifically so you don't have to
reverse-engineer the signature yourself. Pull out just the member you need
with an **indexed access type** instead of retyping the whole signature:

```ts
import type { ViewportHelperFunctions } from '@xyflow/react';

function handlePaneMouseMove(
  screenToFlowPosition: ViewportHelperFunctions['screenToFlowPosition'],
  // ...
```

`SomeType['propertyName']` reads as "the type of just this one member" —
same result as hand-writing it, but it can't drift out of sync if the
library's signature ever changes.

`any` is not the fallback for "this type is tedious" — it turns off
type-checking for that value entirely (no autocomplete, no error on a wrong
shape). It's an escape hatch for genuinely dynamic/untyped data, not a
shortcut.

## 11. `type` inside a mixed import

```ts
import { ReactFlow, useReactFlow, type ViewportHelperFunctions } from '@xyflow/react';
```

Types don't exist at runtime — they're erased entirely once compiled.
Real values (`ReactFlow`, `useReactFlow`) need to exist in the emitted JS;
`ViewportHelperFunctions` doesn't and never should. The inline `type` keyword
marks that one specifier as type-only so it gets stripped, which matters
because Vite's fast per-file transpiler (esbuild) can't always tell "value or
type?" from syntax alone — left ambiguous, it can try to import something
that doesn't actually exist in the compiled module. Use `import type { ... }`
for the whole statement only when *every* name in it is a type.

## 12. `setState` accepts a value OR an updater function

A state setter from `useState` has two valid call shapes: pass the new value
directly (`setNodes(newArray)`), or pass a function that receives the
*current* state and returns the new one (`setNodes(prev => [...prev,
newNode])`). Both are legitimate — not one "real" form and one shorthand.

The updater form exists because a plain captured variable (`stateNodes`) is a
snapshot from whatever render created the closure — if React batches
multiple updates before re-rendering, two updates both reading that same
stale snapshot can stomp on each other. The callback form always operates on
the true latest value, avoiding that.

Use the plain value when a handler only touches that state once per call (no
staleness risk); reach for the updater form when a value might be updated
more than once before a re-render lands, or when you're not sure — see the
"Working conventions" section in `CLAUDE.md` for the "plain closure unless
there's stale-closure risk" default.

**The type pitfall:** if you hand-write a setter's type instead of using
React's real one, it's easy to accidentally only allow one of the two
shapes:

```ts
// too narrow — only accepts an array, rejects the updater-function form
setNodes: (nodes: any[]) => void

// correct — React's actual type, a union of both shapes
setNodes: React.Dispatch<React.SetStateAction<typeof nodes>>
```

Same lesson as entry 10 above: prefer the library's real type over retyping
it by hand.

## 13. `memo` is a wrapper, and anonymous functions stay anonymous

`memo(Component)` is a higher-order function: it takes a component and
returns a *new* component that shallow-compares props before re-rendering,
skipping the render if nothing changed. It doesn't change how you write the
component itself.

A separate issue trips people copying docs examples: passing an inline
arrow function straight into `memo(...)` leaves that function genuinely
nameless at the JS level.

```ts
const Foo = () => {};   // Foo.name === "Foo" — inferred from the assignment
memo(() => {});          // this function's name === "" — it's an argument, not an assignment
```

"Name inference" only fires for assignment/declaration forms (`const x =`,
`let x =`, etc.) — a function passed directly as a call argument never
qualifies, no matter how deeply nested. React DevTools and stack traces use
that name to label components in the tree, so an anonymous one shows up
unhelpfully once you're several nodes deep trying to debug something.

Fix: name it before wrapping, either way works:

```ts
const CustomNode = ({ data, isConnectable }: Props) => { ... };
export default memo(CustomNode);

// or
function CustomNode({ data, isConnectable }: Props) { ... }
export default memo(CustomNode);
```

## 14. What `memo` is actually for (generic React, not React Flow)

By default, when a component re-renders, React re-renders **every descendant
in its subtree** — regardless of whether that descendant's own props
changed. Re-rendering cascades down from wherever a `useState` update
happened; it isn't gated per-component on "did my props change."

Example: a `Parent` holds a search input's text in `useState` and also
renders a list of `Item` components built from unrelated data. Every
keystroke re-renders `Parent` → by default every `Item` re-renders too, even
though none of their props touched the search text. Cheap items: nobody
notices. Expensive items (heavy formatting, big subtree, hundreds of them):
real wasted work on every keystroke.

`memo(Item)` shallow-compares new props against last render's props and
skips calling `Item`'s render function entirely if they're equal.

**Use it when:** a component re-renders often for reasons that live in an
ancestor and have nothing to do with its own props, *and* its render is
expensive enough that skipping it is worth the comparison — ideally
confirmed with the React DevTools Profiler, not guessed.

**It does nothing (or wastes a comparison) when:** the component is cheap,
or — the common trap — you're passing it a prop that's a *new reference*
every render, like an inline `onClick={() => ...}` or `style={{...}}`
literal. `memo`'s comparison is shallow (`===` per prop), so a fresh
function/object reference fails the comparison every time even if its
contents are identical, and `memo` never gets to skip anything. This is why
`memo` on a child is usually paired with `useCallback`/`useMemo` upstream to
keep those prop references stable — `memo` alone, without that, is a common
"why isn't this doing anything" trap.

Not a default to reach for — an escape hatch from React's default cascade,
used after profiling shows wasted re-renders.

## 15. TS null safety vs. Dart's `?`/`!`

Same vocabulary as Dart, weaker guarantees by default.

**`?` as "nullable type"** only excludes `null`/`undefined` from a type when
the `strictNullChecks` compiler option is on (bundled into `strict`). With
it off — which is this project's current state, `tsconfig.app.json` sets
neither — `null`/`undefined` are silently assignable to anything, no error.
With it on, a plain `string` genuinely excludes them, same as Dart's
`String?` vs `String`.

**`?` is overloaded in TS; Dart's isn't:**

```ts
interface Foo { bar?: string }   // optional property — bar: string | undefined, may be absent
obj?.prop                         // optional chaining — runtime check, short-circuits to undefined
cond ? a : b                      // ordinary ternary, unrelated to null
```

**`!` (non-null assertion)** matches Dart's intent — "trust me, not null
here" — but not its safety. Dart's `!` is a real runtime check: wrong, and
it throws immediately at that line. TS's `!` emits zero runtime code; it's
a compile-time-only instruction to stop checking. Get it wrong and nothing
happens at the `!` — the bad value just keeps flowing through the program
typed as if it were fine, and fails later, often somewhere confusingly far
from the actual mistake.

## 16. JSX — the X is "XML", not "React"

JSX = "JavaScript XML" — the X names the angle-bracket markup syntax, not
React. Not valid JavaScript on its own; a compiler (here, TypeScript itself,
via the `jsx` option in `tsconfig.app.json`) transforms it into plain
function calls before anything runs:

```tsx
<div className="foo">{label}</div>
// compiles to roughly:
jsx('div', { className: 'foo', children: label })
```

JSX carries no runtime behavior of its own — it's purely "translate this
markup into a function call." What that function actually *does* is
whatever the compiler was configured to target. React invented JSX and it's
overwhelmingly associated with React, but it isn't React-exclusive —
Preact, Solid.js, and others reuse the same syntax pointed at their own
transform function.

**Why the file extension matters:** the compiler only applies the JSX
transform to files told to contain it — `.tsx`/`.jsx` vs `.ts`/`.js`.
Without that signal, `<Foo>` in a `.ts` file is genuinely ambiguous:
TypeScript's older angle-bracket cast syntax `<Type>value` uses the same
characters, so the parser needs the extension to know which meaning is
intended. A types-only file with no markup should be `.ts`; any file
rendering JSX needs `.tsx`.

## 17. `useState`'s lazy initializer — value vs. function

```ts
useState(new CanvasController())     // constructs on every render
useState(() => new CanvasController()) // constructs once, on mount only
```

Plain JS argument evaluation, not React magic: a function call always
evaluates its arguments eagerly, *before* the call happens. Pass the
constructor call directly and it runs every single render — React discarding
the result afterward doesn't undo the fact that the object already got
built (constructor side effects included).

Pass a function instead and construction is deferred to whenever something
actually *calls* that function. `useState` is written to call it only on the
initial mount and ignore it on every render after — so the expensive/
side-effecting work inside only ever runs once. This is React's "lazy
initial state" pattern: reach for the function form whenever the initial
value is expensive to compute or, as here, is itself a `new` call with
constructor side effects.

## 18. Terraform `resource` block template

```hcl
resource "<PROVIDER_TYPE>" "<LOCAL_NAME>" {
  argument_1 = value_1
  argument_2 = value_2
}
```

```hcl
resource "aws_s3_bucket" "app_storage" {
  bucket = "my-unique-bucket-name"
}
```

The two strings after `resource` mean different things. `"aws_s3_bucket"` is
the **resource type** — fixed by the provider, and it determines the whole
schema (which arguments exist, which are required). `"app_storage"` is a
**local name** you choose yourself — it never reaches AWS, it's just how this
config refers to the resource internally.

Reference one resource from another via `type.local_name.attribute`:

```hcl
resource "aws_eip" "web_ip" {
  instance = aws_instance.web.id
}
```

Some attributes (`id`, `arn`) are only known after the resource is actually
created — Terraform infers the dependency from the reference itself and
orders creation accordingly, no explicit ordering needed.

## 19. Looping through a `Record`

`Record<K, V>` is a TypeScript-only type — it erases to nothing at compile
time and is just shorthand for `{ [key: K]: V }`. At runtime it's an
ordinary object, so it loops like any object, no special API:

```ts
const properties: Record<string, unknown> = { bucket: 'my-bucket' };

for (const key of Object.keys(properties)) { /* key only */ }
for (const value of Object.values(properties)) { /* value only */ }
for (const [key, value] of Object.entries(properties)) { /* both */ }
```

`Object.entries()` is usually the right pick when you need both — it hands
you `[key, value]` pairs directly instead of re-indexing (`properties[key]`)
inside the loop, and TS carries the value type through (`[string, V][]` for
a `Record<string, V>`).

> **Gotcha:** `for...in` also loops an object's keys, but walks the
> prototype chain too — it picks up inherited enumerable properties, not
> just the object's own ones. `Object.keys`/`values`/`entries` only return
> own properties; prefer those unless you specifically need prototype-chain
> traversal (rare).

## 20. Two different `Node`s — a global-scope name collision

`tsconfig.app.json` sets `"lib": ["ES2023", "DOM"]`. The DOM lib declares a
**global ambient interface called `Node`** — the base type `Element`,
`Text`, etc. all extend — available in every `.ts`/`.tsx` file with no
import needed. `@xyflow/react` also exports a type named `Node`, but that
one is generic (`Node<NodeData, NodeType>`) and only shadows the DOM global
in files that actually write `import type { Node } from '@xyflow/react'`.

Same identifier, two unrelated types, picked by whatever's in scope. Write
`Node<ServiceNodeData>` in a file missing that import, and TS silently
resolves `Node` to the DOM version instead — which takes no type parameter
— so it correctly (if confusingly) errors "Type 'Node' is not generic."
Nothing about that message hints at the real cause: a forgotten import, not
a misunderstanding of generics.

> **Gotcha:** this only bites in files where the import is missing — so a
> project can have the same type name working in one file and failing in
> another, purely based on which imports happen to be present.

Fix: import explicitly wherever `Node` is used, or remove the ambiguity for
good by aliasing it — `import type { Node as FlowNode } from '@xyflow/react'`
— so there's never a chance of silently picking up the DOM global.

## 21. `useCallback`'s deps array controls the closure, not just re-renders

`useCallback(fn, deps)` doesn't just memoize a value — it memoizes the
*function itself*. With `deps = []`, React builds `fn` once, on the very
first render, and returns that exact same function reference forever after.
But the function's *body* still closes over whatever variables were in scope
when it was built — so it keeps reading whatever those variables were **at
mount**, no matter how many times they change later.

```ts
const onConnect = useCallback((params) => {
  console.log(stateNodes); // always the mount-time value — []
}, []); // told React: never rebuild this
```

Every subsequent `setNodes` call produces a new `stateNodes` array at render
time, but `onConnect` is never rebuilt to see it — the empty deps array told
`useCallback` not to. Fix: list every reactive value the function reads —
`}, [stateNodes]);` — so React rebuilds `onConnect` (a fresh closure over the
current value) whenever `stateNodes` actually changes.

This is the read-side counterpart to entry 12 (the `setState` updater form):
that entry is about a stale value on the *write* path; this one is about a
stale value on the *read* path, caused by under-declaring a hook's own deps
array rather than by React's update batching.

> **Gotcha:** an empty deps array reads as "this function never needs to
> change," which is only true if its body touches nothing that varies across
> renders. Reaching for `[]` out of habit (to "optimize" or because the linter
> isn't configured to catch it) silently freezes every closed-over value at
> whatever it was on the first render.

## 22. `useMemo` — same shallow-deps check as `useCallback`, for a value

`useMemo(fn, deps)` is `useCallback`'s sibling: instead of memoizing a
*function reference*, it memoizes whatever `fn` *returns*. The deps-array
mechanics from entry 21 apply identically — React compares each entry in the
new `deps` array against last render's, `Object.is`, shallow, no recursion
into objects. All equal → skip calling `fn`, hand back the cached value. Any
differ → call `fn` again, cache the new result.

```ts
const title = useMemo(
  () => controller.getPropertiesWidgetTitle(selectedNode?.data, selectedEdge),
  [selectedNode?.data, selectedEdge]
);
```

This is what makes `memo` (entry 14) actually pay off. `Canvas` re-renders on
every node-drag frame (each frame calls `setNodes`, and state lives one level
up). Without `useMemo`, a `title` computed inline in JSX — `title={controller
.getPropertiesWidgetTitle(...)}` — reruns on every one of those frames
regardless of whether `PropertiesWidget` itself re-renders, because building
the *prop value* happens in the parent's render, before React ever reaches
the child's `memo` check. Wrapping it in `useMemo` skips that recomputation
whenever the deps haven't changed — which, combined with `memo` on the child,
means neither the title math nor the child's render happens on frames where
nothing relevant moved.

**The deps-array trap is sharper here than with `useCallback`:** it's tempting
to list *every* value the function reads, the way entry 21 recommends for
closures. But a value only belongs in the array if changing it should
actually invalidate the cache — not just because the function happens to
touch it. If the function's true reactive inputs are two stable-reference
values (`selectedNode?.data`, `selectedEdge`) but it also reaches into a
larger array (e.g. all nodes, to look up an edge's endpoints) that gets a new
reference on every render for unrelated reasons, adding that array to the
deps defeats the memoization entirely — it'll "recompute" on the exact frames
you were trying to skip. The fix isn't a deps-array trick; it's narrowing the
function's inputs so what it actually needs to read lines up with what's
actually stable.

## 23. IAM-role holder vs. service principal

Two different shapes of "who's allowed to call what" in AWS, easy to conflate
because both end up as Terraform permission resources.

**IAM-role holder** — a resource you create (Lambda, EC2, ECS task) with its
own IAM role attached. It holds real credentials and calls out to other AWS
APIs *as itself*. Permission is granted by attaching a policy to **its own
role**: "here's what you're allowed to do."

**Service principal** — not something you create. It's AWS's own name for an
AWS *service* invoking into your resource (`s3.amazonaws.com`,
`apigateway.amazonaws.com`). It has no role you manage. Permission instead
lives on the **resource being called**, via a resource-based policy
(`aws_lambda_permission`, an S3 bucket policy): "this named service may call
me."

The distinction in one line: IAM-role holder → permission lives on the
**caller**. Service principal → permission lives on the **thing being
called**. ARNs appear in both cases just to identify which resource — that's
not what separates them.

This decides *which Terraform resource type* a connection needs: a caller
that's an IAM-role holder gets an identity policy attached to its role; a
caller that's a service principal gets a resource-based permission block on
the callee instead.

## 24. `aws_iam_role` vs. `aws_iam_role_policy` — two resources, one badge

**`aws_iam_role`** — the identity itself. Think of it as Lambda's ID badge:
created once, always the same shape, says "I am this Lambda."

**`aws_iam_role_policy`** — the list of doors that badge can open. Attached
separately, and grows over time: one connection to S3 adds a door, a
connection to DynamoDB adds another, all on the *same* badge.

AWS splits these into two resources on purpose — "having an identity" and
"what that identity can do" are different concerns, so permissions can be
added or removed later without ever touching the identity. That's why the
role is a *fixed* thing a resource always has (made once, e.g. in
`Lambda.create()`), while the policy is what each new edge/connection keeps
adding to.

## 25. `.tsx` doesn't mean "this file is a component"

Follow-on from entry 16: the extension is decided purely by "does this file's
source contain JSX syntax," not by whether what's inside is architecturally
a component. A plain helper function that happens to build and return a JSX
element — `getPropertyInput(...)`, called like any normal function call, not
rendered like `<GetPropertyInput />` — still needs `.tsx` the moment its body
writes `<div>`/`<input>`/etc. literally, even though nothing about it follows
component conventions (no default export, no fixed props shape, not subject
to the rules of hooks).

Practical effect for a controller/view split: event-handling and state-
mutation logic with no JSX in it stays in a `.ts` controller as before; any
function that constructs JSX — even a non-component helper — has to move to
a `.tsx` file instead. The controller/view boundary doesn't change; only the
file extension of the pieces that literally contain markup does.
