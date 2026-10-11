import Resource from "../Resource";
import type { CostEstimate, Service, ValidationResult, EdgeType, ResourceData, PermissionType, PropertyRecord } from "../../types.ts";
import { ASSUMED_READ_FRACTION, ASSUMED_WRITE_FRACTION, S3_GET_PRICE_PER_REQUEST_USD, S3_PUT_PRICE_PER_REQUEST_USD, S3_STORAGE_PER_GB_MONTH_USD, monthlyRequests } from "../../Simulation/pricing.ts";


export default class S3 extends Resource{

    public static sourceTypes: EdgeType[] = ["async"];
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
                "aws_s3_bucket": {
                    "bucket": { value: id, type: "string", anchor: true},
                    "bucket_prefix": { value: null, type: "string"},
                    "force_destroy": { value: false, type: "boolean"},
                    "tags": { value: {}, type: "tags"}
                },
                "aws_s3_bucket_versioning": {
                    "bucket": { 
                        value: id, 
                        type: "link", 
                        link: ['aws_s3_bucket', 'bucket']
                    },
                    "versioning_configuration": 
                    { 
                        value: { 
                            "status": { value: "Enabled", type: "string" }
                        }, 
                        type: "tags"
                    }
                },
                "aws_s3_bucket_public_access_block": {
                    "bucket": {
                        value: id,
                        type: "link",
                        link: ['aws_s3_bucket', 'bucket']
                    },
                    "block_public_acls": { value: true, type: "boolean"},
                    "block_public_policy": { value: true, type: "boolean"},
                    "ignore_public_acls": { value: true, type: "boolean"},
                    "restrict_public_buckets": { value: true, type: "boolean"}
                }
            },
            componentProperties: {
                // Not a real Terraform argument - bucket size is runtime data, not
                // config - but the cost estimator needs some idea of stored volume.
                "simulation": {
                    "estimated_storage_gb": { value: 10, type: "number" }
                }
            }
        }

    }


    toTerraformEdgePropertiesCaller(edgeType: EdgeType, counterPart: Resource){
        return null;
    }

    toTerraformEdgePropertiesReceiver(edgeType: EdgeType, counterPart: Resource){
        
        const record: Record<string, PropertyRecord> = { };
    
        const resourcePropertyRecord: PropertyRecord = {
            "resource_attribute_name": {
                value: "resource attribute value", type: "string",
            }
        }

        record['resource_name'] = resourcePropertyRecord;


        return record;

    }

    estimateCost(workloadRps: number): CostEstimate {

        const warnings: string[] = [];
        const storageGB: number = this.componentProperties?.simulation?.estimated_storage_gb?.value ?? 0;

        if(this.componentProperties?.simulation?.estimated_storage_gb?.value == null){
            warnings.push("No estimated_storage_gb set - storage cost assumed to be $0.");
        }

        const storageCost = storageGB * S3_STORAGE_PER_GB_MONTH_USD;

        const requests = monthlyRequests(workloadRps);
        const requestCost =
            requests * ASSUMED_READ_FRACTION * S3_GET_PRICE_PER_REQUEST_USD +
            requests * ASSUMED_WRITE_FRACTION * S3_PUT_PRICE_PER_REQUEST_USD;

        warnings.push(`Assumes a ${ASSUMED_READ_FRACTION * 100}/${ASSUMED_WRITE_FRACTION * 100} read/write request split - the simulation only tracks one traffic number per node.`);

        return {
            monthlyCostUSD: storageCost + requestCost,
            breakdown: { "storage": storageCost, "requests": requestCost },
            warnings: warnings
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