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
    capacity: CapacityAssessment

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
        costUSD: 0,
        breakdown: {},
        dayWarnings: new Set<string>(),
        dailyWorkload: []
    }));

    for(const point of trafficProfile.points){

        const { workloadRps, warnings } = propagateTraffic(nodes, edges, point.rps);
        warnings.forEach((warning) => globalWarnings.add(warning));

        for(const node of nodes){

            const accumulator = accumulators.get(node.id)!;
            const nodeWorkloadRps = workloadRps.get(node.id) ?? 0;

            const serviceName = node.data.service.name;
            const resource: ResourceStatics = resourceContainer[serviceName!];
            const resourceInstance = new resource(node.data);

            const dayCost = resourceInstance.estimateCost(nodeWorkloadRps, SECONDS_PER_DAY);

            accumulator.rpsSum += nodeWorkloadRps;
            accumulator.costUSD += dayCost.costUSD;
            addToBreakdown(accumulator.breakdown, dayCost.breakdown);
            dayCost.warnings.forEach((warning) => accumulator.dayWarnings.add(warning));
            accumulator.dailyWorkload.push({ label: point.label, rps: nodeWorkloadRps });

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
            capacity
        };

    });

    const totalCostUSD = perNode.reduce((total, result) => total + result.costUSD, 0);

    return { totalCostUSD, periodDays, perNode, warnings: Array.from(globalWarnings) };

}
