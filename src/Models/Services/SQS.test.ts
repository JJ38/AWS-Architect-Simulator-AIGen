import { describe, expect, it } from "vitest";
import SQS from "./SQS";
import { SQS_FREE_REQUESTS_PER_MONTH, SQS_PRICE_PER_MILLION_REQUESTS_USD } from "../../Simulation/pricing";
import type { ResourceData, Service } from "../../types";

const SQS_SERVICE: Service = { name: "SQS", description: "Simple Queue Service", terraformType: "resource", providerTypes: ["aws_sqs_queue"], icon: "", image: "" };

function makeSQS(): SQS{
    const data: ResourceData = SQS.create("n-test", SQS_SERVICE);
    return new SQS(data);
}

describe("SQS.estimateCost", () => {

    it("always returns full price - free tier is applied separately, across nodes, by simulate.ts", () => {

        const sqs = makeSQS();
        const cost = sqs.estimateCost(10, 86400);

        expect(cost.costUSD).toBeGreaterThan(0);
        expect(cost.breakdown.requests).toBe(cost.costUSD);

    });

});

// getFreeTierAllowance is expressed in $ (not raw request counts) so
// simulate.ts can compare it directly against accumulated $ breakdown
// totals without needing to know SQS's own pricing - see pricing.ts.
describe("SQS.getFreeTierAllowance", () => {

    it("exposes the $ equivalent of 1,000,000 requests/month (always-free, not time-limited)", () => {

        const sqs = makeSQS();
        const expectedUSD = SQS_FREE_REQUESTS_PER_MONTH * SQS_PRICE_PER_MILLION_REQUESTS_USD / 1_000_000;

        expect(sqs.getFreeTierAllowance(30 * 86400)).toEqual({ requests: expectedUSD });

    });

    it("resets every 30 days - a genuinely consumable monthly budget", () => {

        const sqs = makeSQS();
        expect(sqs.getFreeTierResetDays()).toBe(30);

    });

});
