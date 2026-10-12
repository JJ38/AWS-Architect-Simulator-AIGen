import Resource from "../Resource";
import type { CapacityAssessment, CostEstimate, EdgeType, NodeDailyWorkload, PermissionType, PropertyRecord, ResourceData, Service, ValidationResult } from "../../types.ts";
import { IamFactory } from "../IamFactory.ts";
import { LAMBDA_ASSUMED_AVG_DURATION_SECONDS, LAMBDA_DEFAULT_MEMORY_MB, LAMBDA_PRICE_PER_GB_SECOND_USD, LAMBDA_PRICE_PER_REQUEST_USD, requestsOverDuration } from "../../Simulation/pricing.ts";


export default class Lambda extends Resource{

    public static sourceTypes: EdgeType[] = ["sync", "async"];
    public static targetTypes: EdgeType[] = ["sync", "async", "pull"]
    public static permissionType: PermissionType = "IAM";
    public static iamRoleName: string = "lambda_role";

    public static create(id: string, service: Service): ResourceData{

        const resourceData: ResourceData = {
            id: id,
            service: service,
            resourceName: id,
            metaData:{

            },
            terraformProperties: {
                "aws_lambda_function": {
                    "function_name": {value: null, type: "string"},
                    "role": {value: null, type: "string"},
                    "filename": {value: null, type: "string"},
                    "source_code_hash": {value: null, type: "string"},
                    "handler": {value: null, type: "string"},
                    "runtime": {value: null, type: "string"},
                    "timeout": {value: null, type: "number"},
                    "memory_size": {value: null, type: "number"},
                    "package_type": {value: null, type: "string"},
                    "architectures": {
                        value: null,
                        type: "tags"
                    },
                    "reserved_concurrent_executions": {value: null, type: "number"},
                    "publish": {value: null, type: "boolean"},
                    "environment": {
                        value: {},
                        type: "tags"
                    },
                    "vpc_config": {
                        value: {},
                        type: "tags"
                    },
                    "dead_letter_config": {
                        value: {},
                        type: "tags"
                    },
                    "ephemeral_storage": {
                        value: {},
                        type: "tags"
                    },
                    "layers": {
                        value: {},
                        type: "tags"
                    },
                    "tags": {
                        value: {},
                        type: "tags"
                    },
                },
                "aws_iam_role": IamFactory.makeIamRole(this.iamRoleName, "lambda.amazonaws.com")
            },
            componentProperties: {
                // Not a real Terraform argument - Terraform's timeout is a max
                // cutoff, not a typical duration, so it can't drive the cost
                // estimate. This is a separate, user-editable assumption.
                "simulation": {
                    "estimated_avg_duration_ms": { value: LAMBDA_ASSUMED_AVG_DURATION_SECONDS * 1000, type: "number" }
                }
            },

        }

        return resourceData;

    }

    toTerraformEdgePropertiesCaller(edgeType: EdgeType, counterPart: Resource, resource?: Lambda): Record<string, PropertyRecord>{
        
        const record: Record<string, PropertyRecord> = {};
        const roleName = resource?.terraformProperties?.aws_iam_role.name.value;

        record['aws_iam_policy'] = IamFactory.makeIamPolicy("policy_name", roleName);

        return record;

    }

    toTerraformEdgePropertiesReceiver(edgeType: EdgeType, counterPart: Resource): Record<string, PropertyRecord>{

        const record: Record<string, PropertyRecord> = {};

        const resourcePropertyRecord: PropertyRecord = {
            "resource_attribute_name_wdw": {
                value: "resource attribute value", type: "string",
            }
        }

        record['resource_name_receiver'] = resourcePropertyRecord;

        return record;

    }

    estimateCost(workloadRps: number, durationSeconds: number): CostEstimate {

        const warnings: string[] = [];
        const memoryMB: number = this.terraformProperties?.aws_lambda_function?.memory_size?.value ?? LAMBDA_DEFAULT_MEMORY_MB;

        if(this.terraformProperties?.aws_lambda_function?.memory_size?.value == null){
            warnings.push(`No memory_size set - assuming the default ${LAMBDA_DEFAULT_MEMORY_MB}MB.`);
        }

        const avgDurationMs: number = this.componentProperties?.simulation?.estimated_avg_duration_ms?.value ?? (LAMBDA_ASSUMED_AVG_DURATION_SECONDS * 1000);

        if(this.componentProperties?.simulation?.estimated_avg_duration_ms?.value == null){
            warnings.push(`No estimated_avg_duration_ms set - assuming ${LAMBDA_ASSUMED_AVG_DURATION_SECONDS * 1000}ms (Terraform's timeout is a max cutoff, not a typical duration, so it can't be used here).`);
        }

        const requests = requestsOverDuration(workloadRps, durationSeconds);
        const requestCost = requests * LAMBDA_PRICE_PER_REQUEST_USD;

        const gbSeconds = requests * (memoryMB / 1024) * (avgDurationMs / 1000);
        const computeCost = gbSeconds * LAMBDA_PRICE_PER_GB_SECOND_USD;

        return {
            costUSD: requestCost + computeCost,
            breakdown: { "requests": requestCost, "compute": computeCost },
            warnings: warnings
        };

    }

    // Unlike EC2's instance throughput (an illustrative estimate) or
    // DynamoDB's RCU/WCU (a real but separate limit), Lambda concurrency is
    // the actual mechanism AWS throttles on: exceeding
    // reserved_concurrent_executions returns a real 429
    // TooManyRequestsException. Little's Law gives the required concurrency
    // from throughput and duration: concurrent executions ~= requests/sec x
    // average duration (seconds). A function with NO reservation draws from
    // the shared account-wide pool (default 1000, account-level, shared
    // across every function) - modelling that shared pool across multiple
    // nodes is out of scope here, so an unreserved function is treated as
    // not_applicable rather than guessed at.
    assessCapacity(dailyWorkload: NodeDailyWorkload[]): CapacityAssessment{

        const reservedConcurrency: number | null = this.terraformProperties?.aws_lambda_function?.reserved_concurrent_executions?.value ?? null;

        if(reservedConcurrency == null){
            return { status: "not_applicable", message: "No reserved concurrency set - draws from the shared account-wide pool, not a per-function limit to size here." };
        }

        const avgDurationMs: number = this.componentProperties?.simulation?.estimated_avg_duration_ms?.value ?? (LAMBDA_ASSUMED_AVG_DURATION_SECONDS * 1000);
        const avgDurationSeconds = avgDurationMs / 1000;

        const requiredConcurrency = (rps: number): number => rps * avgDurationSeconds;

        const peak = dailyWorkload.reduce((max, day) => Math.max(max, day.rps), 0);
        const peakRequiredConcurrency = requiredConcurrency(peak);
        const peakUtilizationPercent = reservedConcurrency > 0
            ? (peakRequiredConcurrency / reservedConcurrency) * 100
            : (peakRequiredConcurrency > 0 ? 999 : 0);

        const exceededDayLabels = dailyWorkload
            .filter((day) => requiredConcurrency(day.rps) > reservedConcurrency)
            .map((day) => day.label);

        if(exceededDayLabels.length > 0){

            const recommendedConcurrency = Math.ceil(peakRequiredConcurrency);

            return {
                status: "critical",
                message: `Reserved concurrency (${reservedConcurrency}) is too low on ${exceededDayLabels.length} of ${dailyWorkload.length} day(s) - requests will be throttled (429).`,
                recommendation: `Raise reserved_concurrent_executions to at least ${recommendedConcurrency} to cover the peak (~${peak.toFixed(1)} req/s at ~${avgDurationMs}ms average duration), or remove the reservation to use the shared account pool.`,
                peakUtilizationPercent,
                exceededDayLabels
            };

        }

        if(peakUtilizationPercent >= 80){
            return {
                status: "warning",
                message: `Peak traffic needs ~${peakUtilizationPercent.toFixed(0)}% of reserved concurrency - little headroom.`,
                recommendation: "Consider raising reserved_concurrent_executions before the next traffic increase.",
                peakUtilizationPercent
            };
        }

        return {
            status: "ok",
            message: `Peak traffic needs ~${peakUtilizationPercent.toFixed(0)}% of reserved concurrency.`,
            peakUtilizationPercent
        };

    }

    public validate(): ValidationResult {

        let valid = true;
        const errors: string [] = [];

        const validationResult = {
            id: "",
            nodeType: "",
            valid: valid,
            errors: errors
        };

        return validationResult;

    }

}