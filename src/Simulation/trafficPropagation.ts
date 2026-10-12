import type { AppEdge, AppNode, EdgeType } from "../types";

export interface TrafficPropagationResult{

    // steady-state requests/sec OFFERED to each node, keyed by node id - the
    // full incoming load, uncapped, which is what drives that node's own
    // cost and capacity assessment (it needs to see the real demand to
    // correctly flag itself as overloaded).
    workloadRps: Map<string, number>,
    // how much of that offered load did NOT get forwarded downstream because
    // this node is at/over its own capacity ceiling - 0 for nodes with no
    // ceiling (auto-scaling) or with headroom. This is what makes an
    // overloaded upstream service act as a resistor: everything after it in
    // the graph only ever sees workloadRps minus this.
    droppedRps: Map<string, number>,
    // which nodes actually have at least one outgoing edge in the diagram -
    // droppedRps is only meaningful to show a user as "downstream impact"
    // when there's a real downstream node to point at; a terminal/leaf node
    // (e.g. a DynamoDB table nothing reads further from) can still be over
    // its own capacity without that being true.
    hasDownstreamEdges: Set<string>,
    warnings: string[]

}

// Propagates a single steady-state "requests/sec entering the system" number
// through the diagram. By default each edge forwards exactly as much
// outgoing traffic as its source node receives (callsPerRequest = 1) - but
// that's a per-EDGE default, not a per-node constant: a single node can fan
// out differently down each of its outgoing edges (e.g. 1 call to one
// Lambda, 3 writes to a DynamoDB table, a 30/70 split across two other
// Lambdas), since in reality "one request in" rarely means "exactly one
// identical call out on every connection". A node is ALSO at/over its own
// capacity ceiling forwards only up to that ceiling and the rest is dropped
// (see droppedRps above and the ceiling clip in the Kahn's-algorithm loop
// below) - the per-edge multiplier is then applied on top of that already-
// clipped rate, so a node that's dropping requests under load doesn't also
// generate phantom extra downstream calls for traffic it never actually
// served. A capacity-constrained node is a resistor on the traffic reaching
// everything downstream of it, not a transparent passthrough - without this,
// a saturated upstream service's throttling would never show up as reduced
// load (and therefore reduced cost) on anything after it. callerID/receiverID
// (already resolved by CanvasController.onConnect, independent of edge
// drawing direction - a "pull" edge's caller is the thing doing the pulling)
// gives "who calls whom", and traffic flows caller -> receiver for push
// (sync/async) edges - but receiver -> caller for pull edges, since a pull
// receiver (e.g. a queue) is the thing accumulating traffic, and the caller
// (the puller) drains it rather than originating it. See the edge loop below.
// capacityCeilingRps: each node's fixed throughput ceiling (requests/sec),
// if it has one - the same number Resource.getCapacityCeilingRps() returns.
// Absent/null for a node means no ceiling (auto-scaling), so it forwards
// everything it's offered unchanged.
export function propagateTraffic(nodes: AppNode[], edges: AppEdge[], entryRps: number, capacityCeilingRps: Map<string, number | null> = new Map()): TrafficPropagationResult{

    const warnings: string[] = [];
    const workloadRps = new Map<string, number>();
    const droppedRps = new Map<string, number>();

    const nodeIds = nodes.map((node) => node.id);

    // Built from callerID/receiverID (cost-attribution roles), but NOT the
    // same graph for every edge type - see the pull-edge handling below.
    // Each entry also carries that specific edge's callsPerRequest - the
    // same node can fan out differently down different edges (e.g. 1 call to
    // one Lambda, 3 writes to a DynamoDB table, a 30/70 split across two
    // other Lambdas), so the multiplier has to travel with the edge, not the
    // node.
    const outgoingPropagationEdges = new Map<string, { targetId: string, callsPerRequest: number }[]>();
    const incomingEdgeCount = new Map<string, number>();

    nodeIds.forEach((id) => incomingEdgeCount.set(id, 0));

    for(const edge of edges){

        const callerID = edge.data?.resources?.callerID;
        const receiverID = edge.data?.resources?.receiverID;
        const edgeType: EdgeType | undefined = edge.data?.componentProperties?.behaviour?.edgeType?.value;

        if(callerID == undefined || receiverID == undefined){
            continue;
        }

        // Push edges (sync/async): the caller generates traffic that flows
        // to the receiver - propagation direction matches the cost roles.
        // Pull edges are the other way round for propagation purposes: the
        // receiver (e.g. a queue) accumulates traffic pushed into it by ITS
        // OWN upstream edges, and the caller (the puller, e.g. a consumer
        // Lambda) drains that backlog - so the puller's workload is derived
        // from the receiver's resolved rate, not an independent source.
        // Getting this wrong double-counts traffic and also makes a pull
        // consumer look like a second, unrelated entry point (it has no
        // incoming edge under the caller->receiver graph, since it's always
        // the "caller" in its own edge).
        const propagationSource = edgeType === "pull" ? receiverID : callerID;
        const propagationTarget = edgeType === "pull" ? callerID : receiverID;

        // How many calls down THIS edge per request the source node actually
        // processes - 1 (today's default/unchanged behavior) unless the user
        // has set otherwise. >1 models multiple calls per request to the
        // same destination (e.g. several DynamoDB writes); <1 models a
        // conditional/split edge (e.g. an API Gateway route, or "only
        // flagged orders call the fraud-check Lambda") - several edges off
        // one node whose fractions sum to ~1 split the node's traffic
        // instead of duplicating it. Invalid/negative values fall back to 1
        // rather than silently zeroing or negating traffic.
        const rawCallsPerRequest = edge.data?.componentProperties?.simulation?.calls_per_request?.value;
        const callsPerRequest = typeof rawCallsPerRequest === "number" && Number.isFinite(rawCallsPerRequest) && rawCallsPerRequest >= 0
            ? rawCallsPerRequest
            : 1;

        const existing = outgoingPropagationEdges.get(propagationSource) ?? [];
        existing.push({ targetId: propagationTarget, callsPerRequest });
        outgoingPropagationEdges.set(propagationSource, existing);

        incomingEdgeCount.set(propagationTarget, (incomingEdgeCount.get(propagationTarget) ?? 0) + 1);

    }

    const hasIncoming = (id: string): boolean => (incomingEdgeCount.get(id) ?? 0) > 0;
    const hasOutgoing = (id: string): boolean => (outgoingPropagationEdges.get(id)?.length ?? 0) > 0;

    // Purely a function of the edge graph, not traffic resolution - valid on
    // every return path below, including the early-exit ones.
    const hasDownstreamEdges = new Set<string>(nodeIds.filter((id) => hasOutgoing(id)));

    // A node only originates traffic if it's actually wired into the rest of
    // the diagram as a front door: no incoming edges (nothing upstream of it
    // in the diagram), AND at least one outgoing edge (it visibly forwards
    // traffic onward to something). A node with no edges at all isn't part of
    // any request flow - it gets zero simulated traffic. Its cost, if any,
    // comes only from traffic-independent components (EC2 compute hours, S3
    // storage) - that's a deliberate, correct distinction, not a gap: an idle
    // EC2 instance still costs money sitting there, but an un-invoked Lambda
    // genuinely costs $0, since Lambda bills per request.
    const entryNodeIds = nodeIds.filter((id) => !hasIncoming(id) && hasOutgoing(id));
    const isolatedNodeIds = nodeIds.filter((id) => !hasIncoming(id) && !hasOutgoing(id));

    isolatedNodeIds.forEach((id) => { workloadRps.set(id, 0); droppedRps.set(id, 0); });

    const nodesNeedingResolution = nodeIds.length - isolatedNodeIds.length;

    if(entryNodeIds.length === 0 && nodesNeedingResolution > 0){
        warnings.push("No traffic entry point found - every remaining node is downstream of something else with no wired front door, so traffic can't be resolved. Add an edge from a node with no incoming connections (or remove a cycle).");
        nodeIds.forEach((id) => { if(!isolatedNodeIds.includes(id)){ workloadRps.set(id, 0); } });
        nodeIds.forEach((id) => droppedRps.set(id, 0));
        return { workloadRps, droppedRps, hasDownstreamEdges, warnings };
    }

    // Each entry node independently receives the full entryRps - NOT a shared
    // fraction of it. Splitting it (entryRps / entryNodeIds.length) was the
    // previous behavior, and it's wrong: it means placing a second, unrelated,
    // not-yet-connected node on the canvas dilutes the traffic (and therefore
    // cost) of your already-built, already-connected architecture, since
    // they'd be treated as sharing one traffic budget. That breaks the basic
    // invariant that adding a node can only add cost, never remove it. Each
    // entry point is its own independent source of the configured rate -
    // multiple real entry points into a shared backend still correctly sum at
    // the first node where their edges converge (the Kahn's-algorithm fan-in
    // below already handles that).
    if(entryNodeIds.length > 1){
        warnings.push(`${entryNodeIds.length} entry points found - each independently assumed to receive the full ${entryRps.toFixed(2)} req/s (they're treated as separate traffic sources, not a shared budget).`);
    }

    // Kahn's algorithm: process nodes once every incoming edge's caller rate
    // is known, accumulating fan-in along the way. Isolated nodes are already
    // resolved above, so they're seeded as "processed" here and skipped.
    const remainingInDegree = new Map(incomingEdgeCount);
    const accumulatedIncomingRate = new Map<string, number>();
    nodeIds.forEach((id) => accumulatedIncomingRate.set(id, 0));

    entryNodeIds.forEach((id) => accumulatedIncomingRate.set(id, entryRps));

    const queue: string[] = [...entryNodeIds];
    const processed = new Set<string>(isolatedNodeIds);

    while(queue.length > 0){

        const nodeId = queue.shift()!;

        if(processed.has(nodeId)){
            continue;
        }

        processed.add(nodeId);

        // nodeRate is the full offered load - what this node is being asked
        // to handle, and what its own cost/capacity assessment is based on
        // (it must see the real demand to correctly flag itself as
        // overloaded). ceiling, if this node has one, caps what actually
        // gets forwarded past it: an overloaded node acts as a resistor on
        // everything downstream, not a transparent passthrough.
        const nodeRate = accumulatedIncomingRate.get(nodeId) ?? 0;
        workloadRps.set(nodeId, nodeRate);

        const ceiling = capacityCeilingRps.get(nodeId);
        const effectiveOutgoingRate = ceiling != null ? Math.min(nodeRate, ceiling) : nodeRate;
        droppedRps.set(nodeId, Math.max(0, nodeRate - effectiveOutgoingRate));

        const downstream = outgoingPropagationEdges.get(nodeId) ?? [];

        for(const { targetId, callsPerRequest } of downstream){

            accumulatedIncomingRate.set(targetId, (accumulatedIncomingRate.get(targetId) ?? 0) + effectiveOutgoingRate * callsPerRequest);

            const remaining = (remainingInDegree.get(targetId) ?? 0) - 1;
            remainingInDegree.set(targetId, remaining);

            if(remaining <= 0){
                queue.push(targetId);
            }

        }

    }

    const unresolved = nodeIds.filter((id) => !processed.has(id));

    if(unresolved.length > 0){
        warnings.push(`${unresolved.length} node(s) are part of a connection cycle and couldn't be resolved - their traffic is shown as 0 req/s.`);
        unresolved.forEach((id) => { workloadRps.set(id, 0); droppedRps.set(id, 0); });
    }

    return { workloadRps, droppedRps, hasDownstreamEdges, warnings };

}
