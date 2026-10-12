import { describe, expect, it } from "vitest";
import EC2 from "./EC2";
import type { NodeDailyWorkload, ResourceData, Service } from "../../types";

const EC2_SERVICE: Service = { name: "EC2", description: "Elastic Compute Cloud", terraformType: "resource", providerTypes: ["aws_instance"], icon: "", image: "" };

function makeEC2(instanceType: string | null, instanceCount: number | null): EC2{

    const data: ResourceData = EC2.create("n-test", EC2_SERVICE);

    data.terraformProperties.aws_instance.instance_type.value = instanceType;

    data.componentProperties.simulation.instance_count.value = instanceCount;

    return new EC2(data);

}

function flat(label: string, rps: number): NodeDailyWorkload{
    return { label, rps };
}

describe("EC2.assessCapacity", () => {

    it("is ok when peak traffic is comfortably under the instance's capacity", () => {

        const ec2 = makeEC2("m5.xlarge", 1); // ~400 req/s
        const result = ec2.assessCapacity([flat("Day 1", 50), flat("Day 2", 100)]);

        expect(result.status).toBe("ok");
        expect(result.exceededDayLabels).toBeUndefined();

    });

    it("is critical when peak traffic exceeds a single small instance with no ASG, and recommends a fleet size", () => {

        const ec2 = makeEC2("t3.micro", 1); // ~20 req/s
        const result = ec2.assessCapacity([flat("Day 1", 10), flat("Day 2", 100)]);

        expect(result.status).toBe("critical");
        expect(result.exceededDayLabels).toEqual(["Day 2"]);
        expect(result.recommendation).toMatch(/no auto scaling group/i);
        expect(result.recommendation).toMatch(/5x/); // ceil(100 / 20)

    });

    it("accounts for instance_count - the same peak is fine once the fleet has headroom", () => {

        // t3.micro ~20 req/s/instance - 100 req/s needs 5 instances at 100%
        // utilization (that's still "warning", no headroom); 8 gives margin.
        const single = makeEC2("t3.micro", 1).assessCapacity([flat("Day 1", 100)]);
        const fleet = makeEC2("t3.micro", 8).assessCapacity([flat("Day 1", 100)]);

        expect(single.status).toBe("critical");
        expect(fleet.status).toBe("ok");

    });

    it("flags only the specific days that actually exceed capacity, not the whole period", () => {

        const ec2 = makeEC2("t3.small", 1); // ~40 req/s
        const result = ec2.assessCapacity([
            flat("Day 1", 10),
            flat("Day 2", 10),
            flat("Day 3", 60), // over
            flat("Day 4", 10),
        ]);

        expect(result.exceededDayLabels).toEqual(["Day 3"]);
        expect(result.message).toMatch(/1 of 4/);

    });

    it("falls back to a default capacity for an unrecognised instance_type, rather than throwing", () => {

        const ec2 = makeEC2("not-a-real-type", 1);
        expect(() => ec2.assessCapacity([flat("Day 1", 5)])).not.toThrow();

    });

    it("defaults to a single instance (and warns) when instance_count isn't set", () => {

        const ec2 = makeEC2("t3.micro", null);

        const cost = ec2.estimateCost(5, 86400);
        expect(cost.warnings.some((w) => /instance_count/.test(w))).toBe(true);

        // Same capacity math as instanceCount=1.
        const result = ec2.assessCapacity([flat("Day 1", 100)]);
        expect(result.status).toBe("critical");

    });

});

// getCapacityCeilingRps is what traffic propagation clips downstream nodes'
// workload against - it must agree exactly with the fleet capacity
// assessCapacity sizes against, since both derive from the same math.
describe("EC2.getCapacityCeilingRps", () => {

    it("matches the fleet capacity (per-instance rps x instance_count) assessCapacity sizes against", () => {

        const ec2 = makeEC2("m5.xlarge", 3); // 400 req/s/instance
        expect(ec2.getCapacityCeilingRps()).toBe(1200);

    });

    it("never returns null - EC2 always has a fixed fleet ceiling, even with an unrecognised instance_type", () => {

        const ec2 = makeEC2("not-a-real-type", 1);
        expect(ec2.getCapacityCeilingRps()).toBeGreaterThan(0);

    });

});
