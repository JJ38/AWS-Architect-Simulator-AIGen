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
//
// Every node with zero incoming edges (including a node with no edges at all)
// is an "entry point" and independently receives the full entryRps - see the
// comment below for why that's not divided among them.
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

    const entryNodeIds = nodeIds.filter((id) => (incomingEdgeCount.get(id) ?? 0) === 0);

    if(entryNodeIds.length === 0 && nodeIds.length > 0){
        warnings.push("No entry point found - every node has an incoming connection, so traffic can't be resolved. Add a node with no incoming edges (or remove a cycle).");
        nodeIds.forEach((id) => workloadRps.set(id, 0));
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
    // is known, accumulating fan-in along the way.
    const remainingInDegree = new Map(incomingEdgeCount);
    const accumulatedIncomingRate = new Map<string, number>();
    nodeIds.forEach((id) => accumulatedIncomingRate.set(id, 0));

    entryNodeIds.forEach((id) => accumulatedIncomingRate.set(id, entryRps));

    const queue: string[] = [...entryNodeIds];
    const processed = new Set<string>();

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
