import { describe, expect, it } from "vitest";
import DynamoDB from "./DynamoDB";
import type { NodeDailyWorkload, ResourceData, Service } from "../../types";

const DYNAMODB_SERVICE: Service = { name: "DynamoDB", description: "DynamoDB", terraformType: "resource", providerTypes: ["aws_dynamodb_table"], icon: "", image: "" };

function makeTable(billingMode: string, readCapacity: number, writeCapacity: number): DynamoDB{

    const data: ResourceData = DynamoDB.create("n-test", DYNAMODB_SERVICE);

    data.terraformProperties.aws_dynamodb_table.billing_mode.value = billingMode;
    data.terraformProperties.aws_dynamodb_table.read_capacity.value = readCapacity;
    data.terraformProperties.aws_dynamodb_table.write_capacity.value = writeCapacity;

    return new DynamoDB(data);

}

function flat(label: string, rps: number): NodeDailyWorkload{
    return { label, rps };
}

describe("DynamoDB.assessCapacity", () => {

    it("is not_applicable for on-demand billing - nothing to rightsize", () => {

        const table = makeTable("PAY_PER_REQUEST", 0, 0);
        const result = table.assessCapacity([flat("Day 1", 10000)]); // even a huge peak

        expect(result.status).toBe("not_applicable");

    });

    it("is ok when provisioned capacity comfortably covers the 80/20 read/write split", () => {

        // 100 req/s * 0.8 = 80 RCU, * 0.2 = 20 WCU needed at peak - give it
        // real headroom (not exactly 100% utilization, which is "warning").
        const table = makeTable("PROVISIONED", 150, 75);
        const result = table.assessCapacity([flat("Day 1", 100)]);

        expect(result.status).toBe("ok");

    });

    it("is critical when provisioned capacity is too low for peak traffic, and recommends specific RCU/WCU", () => {

        const table = makeTable("PROVISIONED", 5, 2);
        const result = table.assessCapacity([flat("Day 1", 2), flat("Day 2", 300)]);

        expect(result.status).toBe("critical");
        expect(result.exceededDayLabels).toEqual(["Day 2"]);
        // 300 * 0.8 = 240 RCU, 300 * 0.2 = 60 WCU
        expect(result.recommendation).toMatch(/240 RCU/);
        expect(result.recommendation).toMatch(/60 WCU/);

    });

    it("flags only the days that actually exceed provisioned capacity", () => {

        const table = makeTable("PROVISIONED", 50, 20);
        const result = table.assessCapacity([
            flat("Day 1", 10),
            flat("Day 2", 200), // over: needs 160 RCU
            flat("Day 3", 10),
        ]);

        expect(result.exceededDayLabels).toEqual(["Day 2"]);

    });

});

// getCapacityCeilingRps is what traffic propagation clips downstream nodes'
// workload against - it must land on the same binding (read or write)
// constraint assessCapacity sizes against.
describe("DynamoDB.getCapacityCeilingRps", () => {

    it("is null for on-demand - it scales automatically, nothing to clip against", () => {

        const table = makeTable("PAY_PER_REQUEST", 0, 0);
        expect(table.getCapacityCeilingRps()).toBeNull();

    });

    it("is the tighter of the read/write bounds, scaled back up by the assumed request mix", () => {

        // 5 RCU / 0.8 = 6.25 req/s read-bound; 2 WCU / 0.2 = 10 req/s
        // write-bound - read is tighter.
        const table = makeTable("PROVISIONED", 5, 2);
        expect(table.getCapacityCeilingRps()).toBeCloseTo(6.25);

    });

});
