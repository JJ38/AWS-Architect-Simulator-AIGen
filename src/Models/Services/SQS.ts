import Resource from "../Resource";
import type { CostEstimate, EdgeType, FreeTierPool, PermissionType, ResourceData, Service, ValidationResult } from "../../types.ts";
import { SQS_FREE_REQUESTS_PER_MONTH, SQS_PRICE_PER_MILLION_REQUESTS_USD, requestsOverDuration } from "../../Simulation/pricing.ts";

export default class SQS extends Resource{


    public static sourceTypes: EdgeType[] = ["pull"];
    public static targetTypes: EdgeType[] = ["async"];
    public static permissionType: PermissionType = "Passive";

    public static create(id: string, service: Service): ResourceData{

        return {

            id: id,
            service: service,
            resourceName: id,
            metaData:{

            },
            terraformProperties: {
                "aws_sqs_queue": {
                    "name": {value: id, type: "string"},
                    "delay_seconds": {value: null, type: "number"},
                    "max_message_size": {value: null, type: "number"},
                    "message_retention_seconds": {value: null, type: "number"},
                    "receive_wait_time_seconds": {value: null, type: "number"},
                    "redrive_policy": {
                        value: null,
                        type: "tags"
                    },
                    "tags": {
                        value: {},
                        type: "tags"
                    },
                }
            },
            componentProperties: {}
        }

    }


    toTerraformEdgePropertiesCaller(edgeType: EdgeType, counterPart: Resource){
        return null;
    }

    toTerraformEdgePropertiesReceiver(edgeType: EdgeType, counterPart: Resource){
        return null;
    }

    // "Always free" - 1M requests/month, not tied to an AWS account's first
    // 12 months (unlike S3/API Gateway's time-limited tiers), so it's
    // modeled - see pricing.ts. Expressed in $ (the allowance's dollar
    // equivalent at full price) so simulate.ts can compare it directly
    // against accumulated breakdown totals.
    getFreeTierAllowance(periodDurationSeconds: number): FreeTierPool{
        void periodDurationSeconds; // unused - SQS's allowance is a flat request count, not a rate, so it needs no period scaling (unlike DynamoDB's)
        return { requests: SQS_FREE_REQUESTS_PER_MONTH * SQS_PRICE_PER_MILLION_REQUESTS_USD / 1_000_000 };
    }

    estimateCost(workloadRps: number, durationSeconds: number): CostEstimate {

        const requests = requestsOverDuration(workloadRps, durationSeconds);
        const requestCost = requests * SQS_PRICE_PER_MILLION_REQUESTS_USD / 1_000_000;

        return {
            costUSD: requestCost,
            breakdown: { "requests": requestCost },
            warnings: []
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