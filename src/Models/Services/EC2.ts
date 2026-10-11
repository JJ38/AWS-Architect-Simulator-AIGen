import Resource from "../Resource";
import type { EdgeType, PermissionType, PropertyRecord, ResourceData, Service, ValidationResult } from "../../types.ts";
import { IamFactory } from "../IamFactory.ts";

export default class EC2 extends Resource{

    public static sourceTypes: EdgeType[] = ["sync", "pull", "async"];
    public static targetTypes: EdgeType[] = ["sync"];
    public static permissionType: PermissionType = "IAM";
    
    public static create(id: string, service: Service): ResourceData{

        return {

            id: id,
            service: service,
            resourceName: id,
            metaData:{

            },
            terraformProperties: {
                "aws_instance": {
                    "ami": {value: "test", type: "string"},
                    "instance_type": {value: null, type: "string"},
                    "subnet_id": {value: null, type: "string"},
                    "vpc_security_group_ids": {value: null, type: "string"},
                    "key_name": {value: null, type: "string"},
                    "associate_public_ip_address": {value: null, type: "boolean"},
                    "iam_instance_profile": {value: null, type: "string"},
                    "user_data": {value: null, type: "string"},
                    "user_data_replace_on_change": {value: null, type: "boolean"},
                    "availability_zone": {value: null, type: "string"}, //make this a select input with the available AZs in the region
                    "monitoring": {value: null, type: "boolean"},
                    "disable_api_termination": {value: null, type: "boolean"},
                    "disable_api_stop": {value: null, type: "boolean"},
                    "ebs_optimized": {value: null, type: "boolean"},
                    "tenancy": {value: null, type: "string"},   
                    "credit_specification": {
                        value: {
                            "cpu_credits": {value: null, type: "string"}
                        },                  
                        type: "tags"
                    },
                    "metadata_options":  {
                        value: {
                            "http_tokens": {value: null, type: "string"}
                        },                  
                        type: "tags"
                    },
                    "root_block_device":  {
                        value: {
                            "volume_size": {value: null, type: "number"},
                            "volume_type": {value: null, type: "string"},
                            "delete_on_termination": {value: true, type: "boolean"},
                        },                  
                        type: "tags"
                    },
                    "tags":  {
                        value: {
                            "Name": {value: null, type: "string"}
                        },                  
                        type: "tags"
                    },
                },
                "aws_iam_role": IamFactory.makeIamRole("", "ec2.amazonaws.com")
            },
            componentProperties: {},
        }

    }


    toTerraformEdgePropertiesCaller(edgeType: EdgeType, counterPart: Resource, resource: Resource){

        const record: Record<string, PropertyRecord> = {};
        const roleName = resource?.terraformProperties?.aws_iam_role.name.value;

        record['aws_iam_policy'] = IamFactory.makeIamPolicy("policy_name", roleName);

        return record;
        
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