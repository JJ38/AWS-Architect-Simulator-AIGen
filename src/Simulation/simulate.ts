import type { AppEdge, AppNode, CapacityAssessment, NodeDailyWorkload } from "../types";
import type { ResourceStatics } from "../Models/Resource";
import { resourceContainer } from "../constants";
import { propagateTraffic } from "./trafficPropagation";
import { SECONDS_PER_DAY } from "./pricing";
import type { TrafficProfile } from "./trafficProfile";

export interface NodeSimulationResult{

    nodeId: string,
    serviceName: string,
    averageWorkloadRps: number,
    peakWorkloadRps: number,
    peakLabel: string,
    costUSD: number,
    breakdown: Record<string, number>,
    warnings: string[],
    capacity: CapacityAssessment,
    // peak requests/sec, across the period, that this node itself dropped
    // because it was at/over capacity - i.e. offered load it did NOT forward
    // downstream. 0 for nodes with no ceiling or with headroom. This is the
    // flip side of capacity.exceededDayLabels: that's "is this node
    // overloaded", this is "how much of what it couldn't handle never
    // reached the rest of the diagram".
    peakDroppedRps: number,
    // whether this node has at least one outgoing edge in the diagram -
    // peakDroppedRps only means "downstream impact" when there's an actual
    // downstream node; a terminal/leaf node can be over capacity with
    // nothing after it to affect.
    hasDownstreamEdges: boolean

}

export interface SimulationResult{

    totalCostUSD: number,
    periodDays: number,
    perNode: NodeSimulationResult[],
    warnings: string[]

}

interface NodeAccumulator{

    rpsSum: number,
    peakRps: number,
    peakLabel: string,
    peakDroppedRps: number,
    costUSD: number,
    breakdown: Record<string, number>,
    dayWarnings: Set<string>,
    dailyWorkload: NodeDailyWorkload[]

}

function addToBreakdown(target: Record<string, number>, source: Record<string, number>): void{

    for(const key of Object.keys(source)){
        target[key] = (target[key] ?? 0) + source[key];
    }

}

// Pure function: diagram + a traffic profile (one rps value per day) in,
// cost/capacity/rightsizing metrics out. No React, no component state - kept
// framework-free so it stays easy to test and to reuse. Runs the traffic
// propagation + per-node cost estimate once per profile point and sums the
// results - this is what lets a Christmas-week spike cost more than a flat
// profile with the same average rps, and lets rightsizing see which specific
// days a resource is overloaded on rather than just its single peak number.
export function runSimulation(nodes: AppNode[], edges: AppEdge[], trafficProfile: TrafficProfile): SimulationResult{

    const globalWarnings = new Set<string>();
    const accumulators = new Map<string, NodeAccumulator>();

    nodes.forEach((node) => accumulators.set(node.id, {
        rpsSum: 0,
        peakRps: 0,
        peakLabel: trafficProfile.points[0]?.label ?? "",
        peakDroppedRps: 0,
        costUSD: 0,
        breakdown: {},
        dayWarnings: new Set<string>(),
        dailyWorkload: []
    }));

    // Each node's capacity ceiling is purely a function of its configuration
    // (instance_count, provisioned RCU/WCU, reserved concurrency) - none of
    // which vary day to day - so it's computed once up front rather than
    // inside the day loop, and reused by propagateTraffic to clip how much
    // traffic a saturated node forwards downstream.
    const capacityCeilingRps = new Map<string, number | null>();

    nodes.forEach((node) => {
        const serviceName = node.data.service.name;
        const resource: ResourceStatics = resourceContainer[serviceName!];
        const resourceInstance = new resource(node.data);
        capacityCeilingRps.set(node.id, resourceInstance.getCapacityCeilingRps());
    });

    // hasDownstreamEdges is purely a function of the edge graph, not traffic
    // - identical every iteration, so the last day's value is as good as any.
    let hasDownstreamEdges = new Set<string>();

    for(const point of trafficProfile.points){

        const { workloadRps, droppedRps, hasDownstreamEdges: dayHasDownstreamEdges, warnings } = propagateTraffic(nodes, edges, point.rps, capacityCeilingRps);
        warnings.forEach((warning) => globalWarnings.add(warning));
        hasDownstreamEdges = dayHasDownstreamEdges;

        for(const node of nodes){

            const accumulator = accumulators.get(node.id)!;
            const nodeWorkloadRps = workloadRps.get(node.id) ?? 0;
            const nodeDroppedRps = droppedRps.get(node.id) ?? 0;

            const serviceName = node.data.service.name;
            const resource: ResourceStatics = resourceContainer[serviceName!];
            const resourceInstance = new resource(node.data);

            const dayCost = resourceInstance.estimateCost(nodeWorkloadRps, SECONDS_PER_DAY);

            accumulator.rpsSum += nodeWorkloadRps;
            accumulator.costUSD += dayCost.costUSD;
            addToBreakdown(accumulator.breakdown, dayCost.breakdown);
            dayCost.warnings.forEach((warning) => accumulator.dayWarnings.add(warning));
            accumulator.dailyWorkload.push({ label: point.label, rps: nodeWorkloadRps });
            accumulator.peakDroppedRps = Math.max(accumulator.peakDroppedRps, nodeDroppedRps);

            if(nodeWorkloadRps > accumulator.peakRps){
                accumulator.peakRps = nodeWorkloadRps;
                accumulator.peakLabel = point.label;
            }

        }

    }

    const periodDays = trafficProfile.points.length;

    const perNode: NodeSimulationResult[] = nodes.map((node) => {

        const accumulator = accumulators.get(node.id)!;
        const serviceName = node.data.service.name;
        const resource: ResourceStatics = resourceContainer[serviceName!];
        const resourceInstance = new resource(node.data);

        const capacity = resourceInstance.assessCapacity(accumulator.dailyWorkload);

        return {
            nodeId: node.id,
            serviceName: serviceName,
            averageWorkloadRps: periodDays > 0 ? accumulator.rpsSum / periodDays : 0,
            peakWorkloadRps: accumulator.peakRps,
            peakLabel: accumulator.peakLabel,
            costUSD: accumulator.costUSD,
            breakdown: accumulator.breakdown,
            warnings: Array.from(accumulator.dayWarnings),
            capacity,
            peakDroppedRps: accumulator.peakDroppedRps,
            hasDownstreamEdges: hasDownstreamEdges.has(node.id)
        };

    });

    const totalCostUSD = perNode.reduce((total, result) => total + result.costUSD, 0);

    return { totalCostUSD, periodDays, perNode, warnings: Array.from(globalWarnings) };

}
