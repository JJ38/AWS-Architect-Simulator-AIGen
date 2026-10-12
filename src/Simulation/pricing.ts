// Static, illustrative us-east-1 pricing - not the live AWS Pricing API.
// Goal is ballpark accuracy (±25%) for comparing architectures, not exact billing.
// Free tiers are deliberately ignored (illustrative "always pay" numbers are
// easier to reason about and still roughly right at non-trivial traffic).

export const SECONDS_PER_DAY = 24 * 60 * 60;
export const HOURS_PER_MONTH = 730;
export const SECONDS_PER_MONTH = HOURS_PER_MONTH * 60 * 60;

// Cost formulas take a (workloadRps, durationSeconds) pair rather than
// assuming "sustained for a month" - durationSeconds is however long that
// workload rate actually applies for (a day, in the traffic-profile
// simulation; a full month for a quick flat estimate).
export function requestsOverDuration(workloadRps: number, durationSeconds: number): number {
    return workloadRps * durationSeconds;
}

export function hoursInDuration(durationSeconds: number): number {
    return durationSeconds / 3600;
}

export function monthFractionOfDuration(durationSeconds: number): number {
    return durationSeconds / SECONDS_PER_MONTH;
}

// On-demand Linux, us-east-1, $/hr. Covers the instance types this project
// currently exposes as free-text in EC2's instance_type field.
export const EC2_HOURLY_USD: Record<string, number> = {
    "t3.nano": 0.0052,
    "t3.micro": 0.0104,
    "t3.small": 0.0208,
    "t3.medium": 0.0416,
    "t3.large": 0.0832,
    "t3.xlarge": 0.1664,
    "t3.2xlarge": 0.3328,
    "m5.large": 0.096,
    "m5.xlarge": 0.192,
    "m5.2xlarge": 0.384,
    "m5.4xlarge": 0.768,
    "c5.large": 0.085,
    "c5.xlarge": 0.17,
    "c5.2xlarge": 0.34,
    "c5.4xlarge": 0.68,
    "r5.large": 0.126,
    "r5.xlarge": 0.252,
};

export const EC2_DEFAULT_HOURLY_USD = 0.05; // fallback for an unrecognised/unset instance_type

// Illustrative max sustained requests/sec for ONE instance of a given type,
// for a "typical" small web/API workload - loosely scaled with vCPU count,
// not derived from any benchmark. This is the whole point of a rightsizing
// *sanity check*: it doesn't know what the instance actually does per
// request, so treat this as "is this roughly the right size class", not a
// load-test result. c5 (compute-optimized) gets a higher multiplier than
// t3/m5 for the same rough size, reflecting its actual positioning.
export const EC2_ESTIMATED_MAX_RPS: Record<string, number> = {
    "t3.nano": 10,
    "t3.micro": 20,
    "t3.small": 40,
    "t3.medium": 80,
    "t3.large": 160,
    "t3.xlarge": 320,
    "t3.2xlarge": 640,
    "m5.large": 200,
    "m5.xlarge": 400,
    "m5.2xlarge": 800,
    "m5.4xlarge": 1600,
    "c5.large": 250,
    "c5.xlarge": 500,
    "c5.2xlarge": 1000,
    "c5.4xlarge": 2000,
    // r5 (memory-optimized) has the same vCPU count per size as the matching
    // m5 tier, just more RAM - for a CPU-bound "typical web/API" workload
    // that's the dimension that matters here, so these mirror m5 1:1.
    "r5.large": 200,
    "r5.xlarge": 400,
};

export const EC2_DEFAULT_MAX_RPS = 20; // fallback for an unrecognised/unset instance_type - same tier as t3.micro

// Lambda, $/request and $/GB-second
export const LAMBDA_PRICE_PER_REQUEST_USD = 0.0000002;
export const LAMBDA_PRICE_PER_GB_SECOND_USD = 0.0000166667;
export const LAMBDA_DEFAULT_MEMORY_MB = 128;
// Terraform's `timeout` is a max cutoff, not a typical duration, so it isn't a
// reliable predictor of real execution time - assume a flat illustrative
// average instead.
export const LAMBDA_ASSUMED_AVG_DURATION_SECONDS = 0.2;

// DynamoDB on-demand ($ per million request units) and provisioned ($/hr per unit)
export const DYNAMODB_ON_DEMAND_PER_MILLION_READ_USD = 0.25;
export const DYNAMODB_ON_DEMAND_PER_MILLION_WRITE_USD = 1.25;
export const DYNAMODB_PROVISIONED_HOURLY_PER_RCU_USD = 0.00013;
export const DYNAMODB_PROVISIONED_HOURLY_PER_WCU_USD = 0.00065;

// S3 Standard
export const S3_STORAGE_PER_GB_MONTH_USD = 0.023;
export const S3_PUT_PRICE_PER_REQUEST_USD = 0.000005; // $0.005 / 1000
export const S3_GET_PRICE_PER_REQUEST_USD = 0.0000004; // $0.0004 / 1000

// SQS standard queue, $ per million requests
export const SQS_PRICE_PER_MILLION_REQUESTS_USD = 0.40;

// API Gateway V2 (HTTP API), $ per million requests
export const APIGATEWAYV2_PRICE_PER_MILLION_REQUESTS_USD = 1.00;

// Several services don't model read/write traffic as separate numbers yet -
// the simulation only tracks one steady-state requests/sec per node. Split it
// with this illustrative ratio until the traffic model is richer.
export const ASSUMED_READ_FRACTION = 0.8;
export const ASSUMED_WRITE_FRACTION = 0.2;
