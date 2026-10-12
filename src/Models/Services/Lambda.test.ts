import { describe, expect, it } from "vitest";
import Lambda from "./Lambda";
import type { NodeDailyWorkload, ResourceData, Service } from "../../types";

const LAMBDA_SERVICE: Service = { name: "Lambda", description: "Serverless Computing Service", terraformType: "resource", providerTypes: ["aws_lambda_function"], icon: "", image: "" };

function makeLambda(reservedConcurrency: number | null, avgDurationMs: number | null): Lambda{

    const data: ResourceData = Lambda.create("n-test", LAMBDA_SERVICE);

    data.terraformProperties.aws_lambda_function.reserved_concurrent_executions.value = reservedConcurrency;
    data.componentProperties.simulation.estimated_avg_duration_ms.value = avgDurationMs;

    return new Lambda(data);

}

function flat(label: string, rps: number): NodeDailyWorkload{
    return { label, rps };
}

describe("Lambda.assessCapacity", () => {

    it("is not_applicable when no reservation is set - uses the shared account pool", () => {

        const lambda = makeLambda(null, 200);
        const result = lambda.assessCapacity([flat("Day 1", 100000)]); // even a huge peak

        expect(result.status).toBe("not_applicable");

    });

    it("is ok when reserved concurrency comfortably covers peak throughput x duration (Little's Law)", () => {

        // 50 req/s * 0.2s = 10 concurrent executions needed at peak.
        const lambda = makeLambda(50, 200);
        const result = lambda.assessCapacity([flat("Day 1", 50)]);

        expect(result.status).toBe("ok");

    });

    it("is critical when reserved concurrency is too low for peak throughput, and recommends a specific value", () => {

        // 100 req/s * 0.5s = 50 concurrent executions needed - way over a
        // reservation of 5.
        const lambda = makeLambda(5, 500);
        const result = lambda.assessCapacity([flat("Day 1", 10), flat("Day 2", 100)]);

        expect(result.status).toBe("critical");
        expect(result.exceededDayLabels).toEqual(["Day 2"]);
        expect(result.recommendation).toMatch(/50/);
        expect(result.message).toMatch(/throttled/i);

    });

    it("flags only the days that actually exceed reserved concurrency", () => {

        const lambda = makeLambda(10, 200); // 10 concurrency, 0.2s duration -> 50 req/s ceiling

        const result = lambda.assessCapacity([
            flat("Day 1", 20),
            flat("Day 2", 60), // over: needs 12 concurrency
            flat("Day 3", 20),
        ]);

        expect(result.exceededDayLabels).toEqual(["Day 2"]);

    });

    it("uses the default assumed duration when estimated_avg_duration_ms isn't set", () => {

        const lambda = makeLambda(1, null);
        expect(() => lambda.assessCapacity([flat("Day 1", 5)])).not.toThrow();

    });

});

// getCapacityCeilingRps is what traffic propagation clips downstream nodes'
// workload against - Little's Law inverted (concurrency / duration), the
// same ceiling assessCapacity sizes against.
describe("Lambda.getCapacityCeilingRps", () => {

    it("is null when unreserved - draws from the shared account pool, no per-function ceiling to clip against", () => {

        const lambda = makeLambda(null, 200);
        expect(lambda.getCapacityCeilingRps()).toBeNull();

    });

    it("is reserved concurrency / average duration (seconds)", () => {

        const lambda = makeLambda(10, 200); // 10 / 0.2s = 50 req/s
        expect(lambda.getCapacityCeilingRps()).toBe(50);

    });

});
