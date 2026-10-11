// Static, illustrative us-east-1 pricing - not the live AWS Pricing API.
// Goal is ballpark accuracy (±25%) for comparing architectures, not exact billing.
// Free tiers are deliberately ignored (illustrative "always pay" numbers are
// easier to reason about and still roughly right at non-trivial traffic).

export const HOURS_PER_MONTH = 730;
export const SECONDS_PER_MONTH = HOURS_PER_MONTH * 60 * 60;

export function monthlyRequests(workloadRps: number): number {
    return workloadRps * SECONDS_PER_MONTH;
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
    "m5.large": 0.096,
    "m5.xlarge": 0.192,
    "m5.2xlarge": 0.384,
    "c5.large": 0.085,
    "c5.xlarge": 0.17,
};

export const EC2_DEFAULT_HOURLY_USD = 0.05; // fallback for an unrecognised/unset instance_type

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
