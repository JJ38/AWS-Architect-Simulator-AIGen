import type { AppEdge, AppNode } from "../types";

export interface TrafficPropagationResult{

    // steady-state requests/sec reaching each node, keyed by node id
    workloadRps: Map<string, number>,
    warnings: string[]

}

// Propagates a single steady-state "requests/sec entering the system" number
// through the diagram. Treats every edge's caller as generating exactly as
// much outgoing traffic as it itself receives (a 1:1 passthrough assumption -
// no fan-out multipliers, batching, or caching yet). callerID/receiverID
// (already resolved by CanvasController.onConnect, independent of edge
// drawing direction - a "pull" edge's caller is the thing doing the pulling)
// gives us "who calls whom" directly, so traffic flows caller -> receiver.
export function propagateTraffic(nodes: AppNode[], edges: AppEdge[], entryRps: number): TrafficPropagationResult{

    const warnings: string[] = [];
    const workloadRps = new Map<string, number>();

    const nodeIds = nodes.map((node) => node.id);

    const outgoingEdgesByCaller = new Map<string, string[]>();
    const incomingEdgeCount = new Map<string, number>();

    nodeIds.forEach((id) => incomingEdgeCount.set(id, 0));

    for(const edge of edges){

        const callerID = edge.data?.resources?.callerID;
        const receiverID = edge.data?.resources?.receiverID;

        if(callerID == undefined || receiverID == undefined){
            continue;
        }

        const existing = outgoingEdgesByCaller.get(callerID) ?? [];
        existing.push(receiverID);
        outgoingEdgesByCaller.set(callerID, existing);

        incomingEdgeCount.set(receiverID, (incomingEdgeCount.get(receiverID) ?? 0) + 1);

    }

    const hasIncoming = (id: string): boolean => (incomingEdgeCount.get(id) ?? 0) > 0;
    const hasOutgoing = (id: string): boolean => (outgoingEdgesByCaller.get(id)?.length ?? 0) > 0;

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

    isolatedNodeIds.forEach((id) => workloadRps.set(id, 0));

    const nodesNeedingResolution = nodeIds.length - isolatedNodeIds.length;

    if(entryNodeIds.length === 0 && nodesNeedingResolution > 0){
        warnings.push("No traffic entry point found - every remaining node is downstream of something else with no wired front door, so traffic can't be resolved. Add an edge from a node with no incoming connections (or remove a cycle).");
        nodeIds.forEach((id) => { if(!isolatedNodeIds.includes(id)){ workloadRps.set(id, 0); } });
        return { workloadRps, warnings };
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

        const nodeRate = accumulatedIncomingRate.get(nodeId) ?? 0;
        workloadRps.set(nodeId, nodeRate);

        const downstream = outgoingEdgesByCaller.get(nodeId) ?? [];

        for(const receiverID of downstream){

            accumulatedIncomingRate.set(receiverID, (accumulatedIncomingRate.get(receiverID) ?? 0) + nodeRate);

            const remaining = (remainingInDegree.get(receiverID) ?? 0) - 1;
            remainingInDegree.set(receiverID, remaining);

            if(remaining <= 0){
                queue.push(receiverID);
            }

        }

    }

    const unresolved = nodeIds.filter((id) => !processed.has(id));

    if(unresolved.length > 0){
        warnings.push(`${unresolved.length} node(s) are part of a connection cycle and couldn't be resolved - their traffic is shown as 0 req/s.`);
        unresolved.forEach((id) => workloadRps.set(id, 0));
    }

    return { workloadRps, warnings };

}
