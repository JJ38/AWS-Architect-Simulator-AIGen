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
    hasDownstreamEdges: boolean,
    // total $ this node was discounted via free tier over the period - 0
    // for services with no modeled free tier, or once the shared pool runs
    // dry. See Resource.getFreeTierAllowance.
    freeTierSavingsUSD: number

}

export interface SimulationResult{

    totalCostUSD: number,
    totalFreeTierSavingsUSD: number,
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
    freeTierSavingsUSD: number,
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
        freeTierSavingsUSD: 0,
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

    // Free tier bookkeeping: estimateCost always returns FULL price - the
    // discount is applied afterward, as an EVEN CREDIT across every node of
    // a service type (see the redistribution pass below), not handed to
    // whichever node happens to be processed first. To do that fairly we
    // need, per (service type, free-tier reset period), both the service-
    // wide total full-price breakdown AND each individual node's own share
    // of it - bucketed by period since Lambda/SQS reset every ~30 days and
    // DynamoDB resets every single day.
    const periodServiceBreakdown = new Map<string, Map<number, Record<string, number>>>();
    const periodNodeBreakdown = new Map<string, Map<number, Record<string, number>>>();

    function addToPeriodBreakdown(store: Map<string, Map<number, Record<string, number>>>, key: string, periodIndex: number, breakdown: Record<string, number>): void{
        const periods = store.get(key) ?? new Map<number, Record<string, number>>();
        const existing = periods.get(periodIndex) ?? {};
        addToBreakdown(existing, breakdown);
        periods.set(periodIndex, existing);
        store.set(key, periods);
    }

    trafficProfile.points.forEach((point, dayIndex) => {

        const { workloadRps, droppedRps, hasDownstreamEdges: dayHasDownstreamEdges, warnings } = propagateTraffic(nodes, edges, point.rps, capacityCeilingRps);
        warnings.forEach((warning) => globalWarnings.add(warning));
        hasDownstreamEdges = dayHasDownstreamEdges;

        for(const node of nodes){

            const accumulator = accumulators.get(node.id)!;
            const nodeWorkloadRps = workloadRps.get(node.id) ?? 0;
            const nodeDroppedRps = droppedRps.get(node.id) ?? 0;

            const serviceName = node.data.service.name!;
            const resource: ResourceStatics = resourceContainer[serviceName];
            const resourceInstance = new resource(node.data);

            const dayCost = resourceInstance.estimateCost(nodeWorkloadRps, SECONDS_PER_DAY);

            accumulator.rpsSum += nodeWorkloadRps;
            accumulator.costUSD += dayCost.costUSD; // full price for now - corrected below
            addToBreakdown(accumulator.breakdown, dayCost.breakdown); // full price for now - corrected below
            dayCost.warnings.forEach((warning) => accumulator.dayWarnings.add(warning));
            accumulator.dailyWorkload.push({ label: point.label, rps: nodeWorkloadRps });
            accumulator.peakDroppedRps = Math.max(accumulator.peakDroppedRps, nodeDroppedRps);

            if(nodeWorkloadRps > accumulator.peakRps){
                accumulator.peakRps = nodeWorkloadRps;
                accumulator.peakLabel = point.label;
            }

            const resetDays = resourceInstance.getFreeTierResetDays();
            const periodIndex = Math.floor(dayIndex / resetDays);

            addToPeriodBreakdown(periodNodeBreakdown, node.id, periodIndex, dayCost.breakdown);
            addToPeriodBreakdown(periodServiceBreakdown, serviceName, periodIndex, dayCost.breakdown);

        }

    });

    // Free tier redistribution: for each period a service resets in, work
    // out what FRACTION of that period's total usage (summed across every
    // node of that type) the free allowance covers, then give every node
    // that same fraction off. If combined usage is within the allowance,
    // the fraction is 100% and every node ends up at exactly $0 - not just
    // whichever node happened to be processed first; if usage is over the
    // allowance, every node's bill is reduced by the same proportion,
    // sharing the credit fairly rather than handing it entirely to one node.
    nodes.forEach((node) => {

        const accumulator = accumulators.get(node.id)!;
        const serviceName = node.data.service.name!;
        const resource: ResourceStatics = resourceContainer[serviceName];
        const resourceInstance = new resource(node.data);

        const periodDurationSeconds = resourceInstance.getFreeTierResetDays() * SECONDS_PER_DAY;
        const allowanceUSD = resourceInstance.getFreeTierAllowance(periodDurationSeconds);

        const nodePeriods = periodNodeBreakdown.get(node.id) ?? new Map<number, Record<string, number>>();
        const servicePeriods = periodServiceBreakdown.get(serviceName) ?? new Map<number, Record<string, number>>();

        let discountedCostUSD = 0;
        let savingsUSD = 0;
        const discountedBreakdown: Record<string, number> = {};

        for(const [periodIndex, nodeMetrics] of nodePeriods){

            const serviceMetrics = servicePeriods.get(periodIndex) ?? {};

            for(const metric of Object.keys(nodeMetrics)){

                const nodeMetricUSD = nodeMetrics[metric];
                const serviceMetricUSD = serviceMetrics[metric] ?? 0;
                const metricAllowanceUSD = allowanceUSD[metric] ?? 0;

                const coveredFraction = serviceMetricUSD > 0
                    ? Math.min(serviceMetricUSD, metricAllowanceUSD) / serviceMetricUSD
                    : 0;

                const nodeFreeUSD = nodeMetricUSD * coveredFraction;
                const nodeBillableUSD = nodeMetricUSD - nodeFreeUSD;

                discountedBreakdown[metric] = (discountedBreakdown[metric] ?? 0) + nodeBillableUSD;
                discountedCostUSD += nodeBillableUSD;
                savingsUSD += nodeFreeUSD;

            }

        }

        accumulator.costUSD = discountedCostUSD;
        accumulator.breakdown = discountedBreakdown;
        accumulator.freeTierSavingsUSD = savingsUSD;

    });

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
            hasDownstreamEdges: hasDownstreamEdges.has(node.id),
            freeTierSavingsUSD: accumulator.freeTierSavingsUSD
        };

    });

    const totalCostUSD = perNode.reduce((total, result) => total + result.costUSD, 0);
    const totalFreeTierSavingsUSD = perNode.reduce((total, result) => total + result.freeTierSavingsUSD, 0);

    return { totalCostUSD, totalFreeTierSavingsUSD, periodDays, perNode, warnings: Array.from(globalWarnings) };

}
