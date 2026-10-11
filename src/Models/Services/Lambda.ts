import Resource from "../Resource";
import type { EdgeType, PermissionType, Property, PropertyRecord, ResourceData, Service, ValidationResult } from "../../types.ts";
import { IamFactory } from "../IamFactory.ts";


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
            componentProperties: {},
            
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