import { describe, expect, it } from "vitest";
import SQS from "./SQS";
import type { ResourceData, Service } from "../../types";

const SQS_SERVICE: Service = { name: "SQS", description: "Simple Queue Service", terraformType: "resource", providerTypes: ["aws_sqs_queue"], icon: "", image: "" };

function makeSQS(): SQS{
    const data: ResourceData = SQS.create("n-test", SQS_SERVICE);
    return new SQS(data);
}

describe("SQS.estimateCost - free tier", () => {

    it("charges full price when no free tier pool is passed (bare single-call usage)", () => {

        const sqs = makeSQS();
        // 1000 req/s * 86400s = 86.4M requests - well past any plausible free tier.
        const cost = sqs.estimateCost(1000, 86400);

        expect(cost.freeTierSavingsUSD).toBe(0);
        expect(cost.costUSD).toBeGreaterThan(0);

    });

    it("discounts requests covered by the free tier pool", () => {

        const sqs = makeSQS();
        // 10 req/s * 86400s = 864,000 requests - entirely inside a 1M pool.
        const cost = sqs.estimateCost(10, 86400, { requests: 1_000_000 });

        expect(cost.costUSD).toBe(0);
        expect(cost.freeTierSavingsUSD).toBeGreaterThan(0);
        expect(cost.freeTierRemainingAfter.requests).toBeCloseTo(1_000_000 - 864_000);

    });

    it("only discounts the portion that fits in the remaining pool, billing the rest", () => {

        const sqs = makeSQS();
        // 1000 req/s * 86400s = 86.4M requests, but only 500,000 free left.
        const cost = sqs.estimateCost(1000, 86400, { requests: 500_000 });

        expect(cost.freeTierRemainingAfter.requests).toBe(0);
        expect(cost.costUSD).toBeGreaterThan(0); // the 85.9M over the free amount is billed

    });

    it("exposes a 1,000,000 requests/month allowance (always-free, not time-limited)", () => {

        const sqs = makeSQS();
        expect(sqs.getFreeTierAllowance()).toEqual({ requests: 1_000_000 });

    });

});
