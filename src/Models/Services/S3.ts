import Resource from "../Resource";
import type { CostEstimate, Service, ValidationResult, EdgeType, ResourceData, PermissionType, PropertyRecord } from "../../types.ts";
import { ASSUMED_READ_FRACTION, ASSUMED_WRITE_FRACTION, S3_GET_PRICE_PER_REQUEST_USD, S3_PUT_PRICE_PER_REQUEST_USD, S3_STORAGE_PER_GB_MONTH_USD, monthFractionOfDuration, requestsOverDuration } from "../../Simulation/pricing.ts";


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
                // Not real Terraform arguments - runtime/traffic data, not config -
                // but the cost estimator needs some idea of stored volume and
                // read/write mix. Kept separate from terraformProperties so the
                // Terraform preview/export never sees them.
                "simulation": {
                    "estimated_storage_gb": { value: 10, type: "number" },
                    "read_traffic_percent": { value: ASSUMED_READ_FRACTION * 100, type: "number" }
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

    // No free tier modeled: S3's 5GB storage + 20K GET + 2K PUT/month only
    // applies for an AWS account's first 12 months - see pricing.ts.
    estimateCost(workloadRps: number, durationSeconds: number): CostEstimate {

        const warnings: string[] = [];
        const storageGB: number = this.componentProperties?.simulation?.estimated_storage_gb?.value ?? 0;

        if(this.componentProperties?.simulation?.estimated_storage_gb?.value == null){
            warnings.push("No estimated_storage_gb set - storage cost assumed to be $0.");
        }

        const storageCost = storageGB * S3_STORAGE_PER_GB_MONTH_USD * monthFractionOfDuration(durationSeconds);

        const readPercent: number = this.componentProperties?.simulation?.read_traffic_percent?.value ?? (ASSUMED_READ_FRACTION * 100);

        if(this.componentProperties?.simulation?.read_traffic_percent?.value == null){
            warnings.push(`No read_traffic_percent set - assuming the default ${ASSUMED_READ_FRACTION * 100}/${ASSUMED_WRITE_FRACTION * 100} read/write split.`);
        }

        const readFraction = readPercent / 100;
        const writeFraction = 1 - readFraction;

        const requests = requestsOverDuration(workloadRps, durationSeconds);
        const requestCost =
            requests * readFraction * S3_GET_PRICE_PER_REQUEST_USD +
            requests * writeFraction * S3_PUT_PRICE_PER_REQUEST_USD;

        return {
            costUSD: storageCost + requestCost,
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