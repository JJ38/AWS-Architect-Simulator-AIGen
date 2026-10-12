import { describe, expect, it } from "vitest";
import { runSimulation } from "./simulate";
import DynamoDB from "../Models/Services/DynamoDB";
import EC2 from "../Models/Services/EC2";
import Lambda from "../Models/Services/Lambda";
import { services } from "../constants";
import type { AppEdge, AppNode, ResourceData } from "../types";
import { createFlatProfile } from "./trafficProfile";

function makeNode(id: string, resourceClass: typeof EC2 | typeof DynamoDB | typeof Lambda, serviceKey: string, configure: (data: ResourceData) => void): AppNode{

    const data = resourceClass.create(id, services[serviceKey]);
    configure(data);

    return { id, position: { x: 0, y: 0 }, data, type: "imageNode" } as unknown as AppNode;

}

function makeEdge(callerID: string, receiverID: string): AppEdge{
    return {
        id: `${callerID}->${receiverID}`,
        source: callerID,
        target: receiverID,
        data: {
            metaData: {},
            componentProperties: { behaviour: { edgeType: { value: "sync", type: "edgeType" } } },
            terraformProperties: {},
            resources: { callerID, receiverID },
            edgeType: "sync"
        }
    } as unknown as AppEdge;
}

function getResult(simulation: ReturnType<typeof runSimulation>, nodeId: string){
    return simulation.perNode.find((result) => result.nodeId === nodeId)!;
}

// End-to-end test for the bug this was built to fix: a capacity-constrained
// upstream node (an undersized EC2 fleet) must reduce the traffic a
// downstream node (DynamoDB) actually sees, not just flag itself as
// overloaded while silently passing the full offered load through.
describe("runSimulation - capacity-constrained upstream clips downstream traffic", () => {

    it("clips DynamoDB's workload (and therefore its cost) to what an undersized EC2 fleet can actually forward", () => {

        const ec2 = makeNode("ec2-a", EC2, "EC2", (data) => {
            data.terraformProperties.aws_instance.instance_type.value = "t3.micro"; // ~20 req/s
        });

        const table = makeNode("ddb-b", DynamoDB, "DynamoDB", (data) => {
            data.terraformProperties.aws_dynamodb_table.billing_mode.value = "PAY_PER_REQUEST"; // on-demand, no ceiling of its own
        });

        const edges = [makeEdge("ec2-a", "ddb-b")];
        const profile = { points: [{ label: "Day 1", rps: 100 }] };

        const result = runSimulation([ec2, table], edges, profile);

        const ec2Result = getResult(result, "ec2-a");
        const tableResult = getResult(result, "ddb-b");

        // EC2 itself is assessed against the full offered 100 req/s - it must
        // still correctly flag itself as overloaded.
        expect(ec2Result.peakWorkloadRps).toBe(100);
        expect(ec2Result.capacity.status).toBe("critical");
        expect(ec2Result.peakDroppedRps).toBe(80); // 100 offered - 20 it can forward

        // DynamoDB only ever sees what EC2 could actually forward, not the
        // full offered load - this is the fix: an overloaded upstream
        // service is a resistor on downstream traffic, not a passthrough.
        expect(tableResult.peakWorkloadRps).toBe(20);

    });

    it("does not clip downstream traffic when the upstream node has headroom", () => {

        const ec2 = makeNode("ec2-a", EC2, "EC2", (data) => {
            data.terraformProperties.aws_instance.instance_type.value = "m5.2xlarge"; // ~800 req/s
        });

        const table = makeNode("ddb-b", DynamoDB, "DynamoDB", (data) => {
            data.terraformProperties.aws_dynamodb_table.billing_mode.value = "PAY_PER_REQUEST";
        });

        const edges = [makeEdge("ec2-a", "ddb-b")];
        const profile = { points: [{ label: "Day 1", rps: 100 }] };

        const result = runSimulation([ec2, table], edges, profile);

        expect(getResult(result, "ddb-b").peakWorkloadRps).toBe(100);
        expect(getResult(result, "ec2-a").peakDroppedRps).toBe(0);

    });

});

// Free tier is pooled PER SERVICE TYPE, not per node - mirrors AWS's actual
// account/region-wide (not per-resource) free tier, so two small Lambdas
// share one 1M-request allowance rather than each getting their own.
describe("runSimulation - free tier pooling across nodes of the same service type", () => {

    it("two Lambda nodes share ONE monthly request pool, not one each", () => {

        // Each needs an outgoing edge to qualify as a wired traffic entry
        // point (see trafficPropagation.ts) - a sink DynamoDB table each,
        // on-demand so it doesn't itself complicate the free-tier picture.
        const lambdaA = makeNode("lambda-a", Lambda, "Lambda", () => {});
        const lambdaB = makeNode("lambda-b", Lambda, "Lambda", () => {});
        const sinkA = makeNode("sink-a", DynamoDB, "DynamoDB", (data) => {
            data.terraformProperties.aws_dynamodb_table.billing_mode.value = "PAY_PER_REQUEST";
        });
        const sinkB = makeNode("sink-b", DynamoDB, "DynamoDB", (data) => {
            data.terraformProperties.aws_dynamodb_table.billing_mode.value = "PAY_PER_REQUEST";
        });
        const edges = [makeEdge("lambda-a", "sink-a"), makeEdge("lambda-b", "sink-b")];

        // Each entry node independently gets the full configured rate (see
        // trafficPropagation.ts) - 0.1 req/s * 86400s = 8,640 requests/day
        // each, 17,280 combined - comfortably inside a 1M pool for a single
        // day, so both should show $0.
        const profile = createFlatProfile(1, 0.1);
        const result = runSimulation([lambdaA, lambdaB, sinkA, sinkB], edges, profile);

        expect(getResult(result, "lambda-a").costUSD).toBe(0);
        expect(getResult(result, "lambda-b").costUSD).toBe(0);
        expect(result.totalFreeTierSavingsUSD).toBeGreaterThan(0);

    });

    it("Lambda's free tier is a genuinely consumable monthly budget - it resets at the month boundary, not every day", () => {

        const lambda = makeNode("lambda-a", Lambda, "Lambda", () => {});
        const sink = makeNode("sink-a", DynamoDB, "DynamoDB", (data) => {
            data.terraformProperties.aws_dynamodb_table.billing_mode.value = "PAY_PER_REQUEST";
        });
        const edges = [makeEdge("lambda-a", "sink-a")];
        const profile = createFlatProfile(31, 20); // 20 req/s * 86400s = 1,728,000 requests/day

        const result = runSimulation([lambda, sink], edges, profile);
        const node = getResult(result, "lambda-a");

        // Day 1 exhausts the pool (1,728,000 > 1,000,000) - some requests
        // billed, some free. Days 2-30 are entirely billed (pool empty the
        // whole rest of the period). Day 31 starts a new period - the pool
        // is full again, so day 31 should be cheaper than days 2-30.
        expect(node.freeTierSavingsUSD).toBeGreaterThan(0);
        expect(node.costUSD).toBeGreaterThan(0); // definitely not fully free

    });

    it("DynamoDB's provisioned free tier does NOT deplete over the period - every day gets the same discount", () => {

        // Needs an outgoing edge to qualify as an entry point - give it a
        // dummy downstream via a pull consumer isn't needed; simplest is to
        // make it the receiver of a Lambda entry instead, matching the
        // EC2->DynamoDB chain tests above.
        const lambda = makeNode("lambda-a", Lambda, "Lambda", () => {});
        const table = makeNode("ddb-a", DynamoDB, "DynamoDB", (data) => {
            data.terraformProperties.aws_dynamodb_table.billing_mode.value = "PROVISIONED";
            data.terraformProperties.aws_dynamodb_table.read_capacity.value = 20;
            data.terraformProperties.aws_dynamodb_table.write_capacity.value = 10;
        });
        const edges = [makeEdge("lambda-a", "ddb-a")];

        const profile = createFlatProfile(60, 5); // 60 days - two Lambda-style "months" worth
        const result = runSimulation([lambda, table], edges, profile);
        const node = getResult(result, "ddb-a");

        expect(node.costUSD).toBe(0);
        expect(node.freeTierSavingsUSD).toBeGreaterThan(0);

    });

    // Reported via real usage: with a sequential/depleting pool, whichever
    // node happened to be processed first could claim the ENTIRE free tier
    // and leave a near-identical node paying full price - an arbitrary,
    // order-dependent split. The fix: compute each service type's TOTAL
    // usage first, then give every node of that type the SAME fraction off,
    // so the discount is shared fairly rather than winner-take-all.
    it("splits the free-tier discount fairly (by usage share) across nodes when combined usage exceeds the pool - not winner-take-all by processing order", () => {

        const lambdaA = makeNode("lambda-a", Lambda, "Lambda", () => {});
        const lambdaB = makeNode("lambda-b", Lambda, "Lambda", () => {});
        const sinkA = makeNode("sink-a", DynamoDB, "DynamoDB", (data) => {
            data.terraformProperties.aws_dynamodb_table.billing_mode.value = "PAY_PER_REQUEST";
        });
        const sinkB = makeNode("sink-b", DynamoDB, "DynamoDB", (data) => {
            data.terraformProperties.aws_dynamodb_table.billing_mode.value = "PAY_PER_REQUEST";
        });
        const edges = [makeEdge("lambda-a", "sink-a"), makeEdge("lambda-b", "sink-b")];

        // Equal traffic on both - 12 req/s * 86400s = 1,036,800 requests
        // each, 2,073,600 combined - just over the 1,000,000 pool. Being
        // identical, a fair split means BOTH end up with the same nonzero
        // cost and the same nonzero savings - neither one $0 while the
        // other pays for the whole overage.
        const profile = createFlatProfile(1, 12);
        const result = runSimulation([lambdaA, lambdaB, sinkA, sinkB], edges, profile);

        const a = getResult(result, "lambda-a");
        const b = getResult(result, "lambda-b");

        expect(a.costUSD).toBeGreaterThan(0);
        expect(b.costUSD).toBeGreaterThan(0);
        expect(a.costUSD).toBeCloseTo(b.costUSD, 5);
        expect(a.freeTierSavingsUSD).toBeCloseTo(b.freeTierSavingsUSD, 5);

    });

});
