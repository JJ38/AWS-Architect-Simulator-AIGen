import { describe, expect, it } from "vitest";
import { propagateTraffic } from "./trafficPropagation";
import type { AppEdge, AppNode, EdgeType } from "../types";

function makeNode(id: string): AppNode{
    return { id, position: { x: 0, y: 0 }, data: {} } as unknown as AppNode;
}

function makeEdge(callerID: string, receiverID: string, edgeType?: EdgeType): AppEdge{
    return {
        id: `${callerID}->${receiverID}`,
        source: callerID,
        target: receiverID,
        data: {
            resources: { callerID, receiverID },
            componentProperties: edgeType == null ? undefined : { behaviour: { edgeType: { value: edgeType, type: "edgeType" } } }
        }
    } as unknown as AppEdge;
}

describe("propagateTraffic", () => {

    it("gives a single entry node (wired to something downstream) the full entry rate", () => {

        const nodes = [makeNode("a"), makeNode("b")];
        const edges = [makeEdge("a", "b")];
        const { workloadRps, warnings } = propagateTraffic(nodes, edges, 50);

        expect(workloadRps.get("a")).toBe(50);
        expect(warnings).toEqual([]);

    });

    it("propagates 1:1 through a simple chain", () => {

        const nodes = [makeNode("a"), makeNode("b"), makeNode("c")];
        const edges = [makeEdge("a", "b"), makeEdge("b", "c")];

        const { workloadRps } = propagateTraffic(nodes, edges, 50);

        expect(workloadRps.get("a")).toBe(50);
        expect(workloadRps.get("b")).toBe(50);
        expect(workloadRps.get("c")).toBe(50);

    });

    it("sums fan-in from multiple callers at one receiver", () => {

        const nodes = [makeNode("a"), makeNode("b"), makeNode("c")];
        const edges = [makeEdge("a", "c"), makeEdge("b", "c")];

        const { workloadRps } = propagateTraffic(nodes, edges, 50);

        expect(workloadRps.get("a")).toBe(50);
        expect(workloadRps.get("b")).toBe(50);
        expect(workloadRps.get("c")).toBe(100);

    });

    it("does not split fan-out - every downstream edge carries the full caller rate", () => {

        const nodes = [makeNode("a"), makeNode("b"), makeNode("c")];
        const edges = [makeEdge("a", "b"), makeEdge("a", "c")];

        const { workloadRps } = propagateTraffic(nodes, edges, 50);

        expect(workloadRps.get("b")).toBe(50);
        expect(workloadRps.get("c")).toBe(50);

    });

    // Regression: entryRps was being divided across every node with zero
    // incoming edges, so placing a second, unrelated entry point diluted the
    // traffic (and cost) of the already-connected architecture.
    it("gives each independent entry point the full rate, not a shared fraction", () => {

        // Two unrelated chains, each wired to its own downstream node - two
        // genuinely independent entry points, not a shared traffic budget.
        const nodes = [makeNode("a"), makeNode("x"), makeNode("b"), makeNode("y")];
        const edges = [makeEdge("a", "x"), makeEdge("b", "y")];
        const { workloadRps, warnings } = propagateTraffic(nodes, edges, 50);

        expect(workloadRps.get("a")).toBe(50);
        expect(workloadRps.get("b")).toBe(50);
        expect(warnings.length).toBe(1);

    });

    // Regression: a node with no edges at all (not wired to anything) was
    // being treated as an entry point and given the full traffic rate, even
    // though nothing in the diagram actually sends it any requests.
    it("gives a fully isolated node zero traffic", () => {

        const nodes = [makeNode("a")];
        const edges: AppEdge[] = [];

        // "a" has no outgoing edges, so it doesn't qualify as a wired entry
        // point even though it also has no incoming edges.
        const isolated = makeNode("isolated");
        const { workloadRps } = propagateTraffic([...nodes, isolated], edges, 50);

        // "a" alone with zero edges is indistinguishable from "isolated" -
        // both get zero, since neither forwards traffic anywhere.
        expect(workloadRps.get("a")).toBe(0);
        expect(workloadRps.get("isolated")).toBe(0);

    });

    it("does not let an added isolated node affect existing connected nodes' traffic or require dividing the rate", () => {

        const connectedNodes = [makeNode("gateway"), makeNode("lambda")];
        const connectedEdges = [makeEdge("gateway", "lambda")];

        const before = propagateTraffic(connectedNodes, connectedEdges, 50);
        expect(before.workloadRps.get("gateway")).toBe(50);
        expect(before.workloadRps.get("lambda")).toBe(50);

        const isolatedBucket = makeNode("bucket");
        const after = propagateTraffic([...connectedNodes, isolatedBucket], connectedEdges, 50);

        expect(after.workloadRps.get("gateway")).toBe(50);
        expect(after.workloadRps.get("lambda")).toBe(50);
        expect(after.workloadRps.get("bucket")).toBe(0);

    });

    it("gives a node with outgoing edges full entry traffic even with no incoming edges", () => {

        // A node with outgoing-but-no-incoming edges IS a legitimate entry
        // point (e.g. an API Gateway with nothing calling into it) - this is
        // the case the isolated-node fix must not break.
        const nodes = [makeNode("gateway"), makeNode("lambda")];
        const edges = [makeEdge("gateway", "lambda")];

        const { workloadRps } = propagateTraffic(nodes, edges, 75);

        expect(workloadRps.get("gateway")).toBe(75);

    });

    it("resolves a terminal node (incoming edges, no outgoing) from its incoming sum, not as an entry point", () => {

        const nodes = [makeNode("api"), makeNode("table")];
        const edges = [makeEdge("api", "table")];

        const { workloadRps } = propagateTraffic(nodes, edges, 30);

        expect(workloadRps.get("table")).toBe(30);

    });

    // Regression: a pull edge's caller (the puller/consumer) was being
    // treated as an independent traffic entry point, since it never appears
    // as a "receiver" in the caller/receiver graph (it's always the caller
    // in its own pull edge). That double-counted traffic at the thing being
    // pulled from and made a queue consumer's workload wrong. The real
    // deployment that first exposed this: checkout-fn pushes (async) into a
    // queue, fulfillment-fn pulls from the same queue - fulfillment-fn's
    // correct workload is whatever reaches the queue, not a second
    // independent 1x entryRps on top of it.
    it("derives a pull consumer's workload from what reaches the thing it pulls from, not as a second entry point", () => {

        const nodes = [makeNode("producer"), makeNode("queue"), makeNode("consumer")];
        const edges = [
            makeEdge("producer", "queue", "async"),
            makeEdge("consumer", "queue", "pull"), // consumer pulls from queue
        ];

        const { workloadRps, warnings } = propagateTraffic(nodes, edges, 50);

        expect(workloadRps.get("queue")).toBe(50);
        expect(workloadRps.get("consumer")).toBe(50);
        expect(warnings.length).toBe(0); // exactly one real entry point (producer)

    });

    it("detects a cycle with no wired entry point and zeroes it out with a warning instead of hanging", () => {

        const nodes = [makeNode("a"), makeNode("b")];
        const edges = [makeEdge("a", "b"), makeEdge("b", "a")];

        const { workloadRps, warnings } = propagateTraffic(nodes, edges, 50);

        expect(workloadRps.get("a")).toBe(0);
        expect(workloadRps.get("b")).toBe(0);
        expect(warnings.length).toBeGreaterThan(0);

    });

    it("handles an empty diagram without throwing", () => {

        const { workloadRps, warnings } = propagateTraffic([], [], 50);

        expect(workloadRps.size).toBe(0);
        expect(warnings).toEqual([]);

    });

    // A capacity-constrained node is a resistor on the traffic reaching
    // everything downstream of it, not a transparent passthrough - this is
    // the core of the fix: an overloaded upstream service (e.g. an
    // undersized EC2 fleet) must reduce what a downstream service (e.g.
    // DynamoDB) actually sees, not just flag itself as overloaded in
    // isolation while passing the full load through unchanged.
    describe("capacity ceiling clipping", () => {

        it("clips the outgoing rate at a saturated node, so downstream only sees what it could actually forward", () => {

            const nodes = [makeNode("a"), makeNode("b"), makeNode("c")];
            const edges = [makeEdge("a", "b"), makeEdge("b", "c")];
            const ceilings = new Map([["b", 30]]);

            const { workloadRps, droppedRps } = propagateTraffic(nodes, edges, 50, ceilings);

            // b itself is still assessed against the full offered load...
            expect(workloadRps.get("b")).toBe(50);
            // ...but only forwards what it can actually handle.
            expect(workloadRps.get("c")).toBe(30);
            expect(droppedRps.get("b")).toBe(20);
            expect(droppedRps.get("a")).toBe(0);

        });

        it("forwards the full offered rate unchanged when a node has headroom", () => {

            const nodes = [makeNode("a"), makeNode("b")];
            const edges = [makeEdge("a", "b")];
            const ceilings = new Map([["a", 1000]]);

            const { workloadRps, droppedRps } = propagateTraffic(nodes, edges, 50, ceilings);

            expect(workloadRps.get("b")).toBe(50);
            expect(droppedRps.get("a")).toBe(0);

        });

        it("clips every downstream edge to the same forwarded rate on fan-out, not splitting it further", () => {

            const nodes = [makeNode("a"), makeNode("b"), makeNode("c"), makeNode("d")];
            const edges = [makeEdge("a", "b"), makeEdge("b", "c"), makeEdge("b", "d")];
            const ceilings = new Map([["b", 20]]);

            const { workloadRps } = propagateTraffic(nodes, edges, 50, ceilings);

            expect(workloadRps.get("c")).toBe(20);
            expect(workloadRps.get("d")).toBe(20);

        });

        it("sums post-clip contributions from multiple capacity-constrained upstream nodes on fan-in", () => {

            const nodes = [makeNode("a"), makeNode("x"), makeNode("b"), makeNode("c")];
            const edges = [makeEdge("a", "c"), makeEdge("b", "c")];
            const ceilings = new Map([["a", 10], ["b", 15]]);

            const { workloadRps } = propagateTraffic(nodes, edges, 50, ceilings);

            expect(workloadRps.get("c")).toBe(25);

        });

        it("a node with no ceiling entry (auto-scaling) forwards its full offered rate", () => {

            const nodes = [makeNode("a"), makeNode("b")];
            const edges = [makeEdge("a", "b")];

            const { workloadRps, droppedRps } = propagateTraffic(nodes, edges, 500, new Map());

            expect(workloadRps.get("b")).toBe(500);
            expect(droppedRps.get("a")).toBe(0);

        });

        // A terminal/leaf node (e.g. a DynamoDB table nothing reads further
        // from) can be over its own capacity with nothing downstream to
        // actually impact - hasDownstreamEdges is what lets the UI avoid
        // claiming a downstream effect that doesn't exist.
        it("reports hasDownstreamEdges correctly for a chain node vs. a terminal leaf", () => {

            const nodes = [makeNode("a"), makeNode("b")];
            const edges = [makeEdge("a", "b")];

            const { hasDownstreamEdges } = propagateTraffic(nodes, edges, 50);

            expect(hasDownstreamEdges.has("a")).toBe(true);
            expect(hasDownstreamEdges.has("b")).toBe(false);

        });

    });

});
