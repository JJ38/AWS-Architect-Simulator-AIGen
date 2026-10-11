import type { AppEdge, AppNode, CostEstimate } from "../types";
import type { ResourceStatics } from "../Models/Resource";
import { resourceContainer } from "../constants";
import { propagateTraffic } from "./trafficPropagation";

export interface NodeSimulationResult{

    nodeId: string,
    serviceName: string,
    workloadRps: number,
    cost: CostEstimate

}

export interface SimulationResult{

    totalMonthlyCostUSD: number,
    perNode: NodeSimulationResult[],
    warnings: string[]

}

// Pure function: diagram + a single steady-state traffic number in, cost/
// capacity metrics out. No React, no component state - kept framework-free
// so it stays easy to test and to reuse (e.g. from a future "what if" compare).
export function runSimulation(nodes: AppNode[], edges: AppEdge[], entryRps: number): SimulationResult{

    const { workloadRps, warnings } = propagateTraffic(nodes, edges, entryRps);

    const perNode: NodeSimulationResult[] = nodes.map((node) => {

        const serviceName = node.data.service.name;
        const resource: ResourceStatics = resourceContainer[serviceName!];
        const resourceInstance = new resource(node.data);

        const nodeWorkloadRps = workloadRps.get(node.id) ?? 0;
        const cost = resourceInstance.estimateCost(nodeWorkloadRps);

        return {
            nodeId: node.id,
            serviceName: serviceName,
            workloadRps: nodeWorkloadRps,
            cost: cost
        };

    });

    const totalMonthlyCostUSD = perNode.reduce((total, result) => total + result.cost.monthlyCostUSD, 0);

    return { totalMonthlyCostUSD, perNode, warnings };

}
