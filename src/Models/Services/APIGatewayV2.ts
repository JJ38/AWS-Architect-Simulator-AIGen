import Resource from "../Resource";
import type { EdgeType, PermissionType, ResourceData, Service, ValidationResult } from "../../types.ts";


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