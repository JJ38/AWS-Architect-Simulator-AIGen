import Resource from "../Resource";
import type { CostEstimate, EdgeType, FreeTierPool, PermissionType, ResourceData, Service, ValidationResult } from "../../types.ts";
import { APIGATEWAYV2_PRICE_PER_MILLION_REQUESTS_USD, requestsOverDuration } from "../../Simulation/pricing.ts";


export default class APIGatewayV2 extends Resource{
    
    public static sourceTypes: EdgeType[] = ["sync", "async"];
    public static targetTypes: EdgeType[] = ["sync"];
    public static permissionType: PermissionType = "Service";
    


    public static create(id: string, service: Service): ResourceData{

        return {

            id: id,
            service: service,
            resourceName: id,
            metaData:{

            },
            terraformProperties: {
                "aws_apigatewayv2_api": {
                    "name": {value: null, type: "string"},
                    "protocol_type": {value: null, type: "string"},
                    "target": {value: null, type: "string"},
                    "route_key": {value: null, type: "string"},
                    "description": {value: null, type: "string"},
                    "route_selection_expression": {value: null, type: "string"},
                    "disable_execute_api_endpoint": {value: null, type: "boolean"},
                    "cors_configuration": {
                        value: null,
                        type: "tags"
                    },
                    "tags": {
                        value: null,
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

    // No free tier modeled: API Gateway's 1M calls/month free tier only
    // applies for an AWS account's first 12 months - see pricing.ts.
    estimateCost(workloadRps: number, durationSeconds: number, freeTierRemaining: FreeTierPool = {}): CostEstimate {

        const requests = requestsOverDuration(workloadRps, durationSeconds);
        const requestCost = requests * APIGATEWAYV2_PRICE_PER_MILLION_REQUESTS_USD / 1_000_000;

        return {
            costUSD: requestCost,
            breakdown: { "requests": requestCost },
            warnings: [],
            freeTierSavingsUSD: 0,
            freeTierRemainingAfter: freeTierRemaining
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