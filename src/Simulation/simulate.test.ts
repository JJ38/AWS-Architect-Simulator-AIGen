import { describe, expect, it } from "vitest";
import { runSimulation } from "./simulate";
import DynamoDB from "../Models/Services/DynamoDB";
import EC2 from "../Models/Services/EC2";
import { services } from "../constants";
import type { AppEdge, AppNode, ResourceData } from "../types";

function makeNode(id: string, resourceClass: typeof EC2 | typeof DynamoDB, serviceKey: string, configure: (data: ResourceData) => void): AppNode{

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
