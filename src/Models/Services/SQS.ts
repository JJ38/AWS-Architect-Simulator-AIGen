import Resource from "../Resource";
import type { CostEstimate, EdgeType, PermissionType, ResourceData, Service, ValidationResult } from "../../types.ts";
import { SQS_PRICE_PER_MILLION_REQUESTS_USD, monthlyRequests } from "../../Simulation/pricing.ts";

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

    estimateCost(workloadRps: number): CostEstimate {

        const requests = monthlyRequests(workloadRps);
        const requestCost = requests * SQS_PRICE_PER_MILLION_REQUESTS_USD / 1_000_000;

        return {
            monthlyCostUSD: requestCost,
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