import type { EdgeType, PermissionType, ResourceData, Service, ValidationResult } from "../../types";
import Resource from "../Resource";

//incomplete look at all types
export const dynamodb_billing_mode = [
    "PAY_PER_REQUEST",
    "PROVISIONED"
]

export default class DyanmoDB extends Resource{
    
    public static sourceTypes: EdgeType[] = ["pull"];
    public static targetTypes: EdgeType[] = ["sync"];
    public static permissionType: PermissionType = "Passive";


    public static create(id: string, service: Service): ResourceData{

        return {

            id: id,
            service: service,
            resourceName: id,
            metaData:{

            },
            terraformProperties: {
                "aws_dynamodb_table": {
                    "name": {value: id, type: "string"},
                    "hash_key": {value: null, type: "number"},
                    "billing_mode": {value: "PAY_PER_REQUEST", type: "select", options: dynamodb_billing_mode},
                    "attribute": {
                        value: null,
                        type: "tags"
                    },
                    "stream_enabled": {value: null, type: "boolean"},
                    "stream_view_type": {value: null, type: "string"},
                    "point_in_time_recovery": {
                        value: null,
                        type: "tags"
                    },
                    "deletion_protection_enabled": {value: null, type: "boolean"},
                    "read_capacity": {
                        value: null, 
                        type: "number", 
                        dependant: {
                            propertyPath: ['aws_dynamodb_table', 'billing_mode'], 
                            value: "PAY_PER_REQUEST",
                        }
                    }, //only if billing mode is PROVISIONED
                    "write_capacity": {
                        value: null, 
                        type: "number",
                        dependant: {
                            propertyPath: ['aws_dynamodb_table', 'billing_mode'], 
                            value: "PAY_PER_REQUEST",
                        }
                    }, //only if billing mode is PROVISIONED
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