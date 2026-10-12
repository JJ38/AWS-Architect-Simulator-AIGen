import Resource from "../Resource";
import type { CapacityAssessment, CostEstimate, EdgeType, FreeTierPool, NodeDailyWorkload, PermissionType, PropertyRecord, ResourceData, Service, ValidationResult } from "../../types.ts";
import { IamFactory } from "../IamFactory.ts";
import { EC2_DEFAULT_HOURLY_USD, EC2_DEFAULT_MAX_RPS, EC2_ESTIMATED_MAX_RPS, EC2_HOURLY_USD, hoursInDuration } from "../../Simulation/pricing.ts";

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
            componentProperties: {
                // Not a real Terraform argument - this app doesn't model an
                // auto scaling group as a separate resource yet, so fleet
                // size is represented directly here. 1 = a single bare
                // instance with no ASG behind it (the common mistake this
                // whole feature exists to catch).
                "simulation": {
                    "instance_count": { value: 1, type: "number" }
                }
            },
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

    private getInstanceCount(): { instanceCount: number, wasDefaulted: boolean }{

        const instanceCount: number | null = this.componentProperties?.simulation?.instance_count?.value ?? null;

        if(instanceCount == null){
            return { instanceCount: 1, wasDefaulted: true };
        }

        return { instanceCount, wasDefaulted: false };

    }

    // EC2 bills per instance running, not per-request - cost scales with
    // durationSeconds and instance_count, regardless of workloadRps. See
    // assessCapacity for the traffic-vs-fleet-size check.
    //
    // No free tier modeled: EC2's 750 free t2/t3.micro hours/month only
    // applies for an AWS account's first 12 months - see pricing.ts.
    estimateCost(workloadRps: number, durationSeconds: number, freeTierRemaining: FreeTierPool = {}): CostEstimate {

        const warnings: string[] = [];

        const instanceType: string | null = this.terraformProperties?.aws_instance?.instance_type?.value ?? null;

        let hourlyUSD = EC2_DEFAULT_HOURLY_USD;

        if(instanceType == null){
            warnings.push("No instance_type set - using a default small-instance price estimate.");
        }else if(EC2_HOURLY_USD[instanceType] != undefined){
            hourlyUSD = EC2_HOURLY_USD[instanceType];
        }else{
            warnings.push(`Unrecognised instance_type "${instanceType}" - using a default price estimate.`);
        }

        const { instanceCount, wasDefaulted } = this.getInstanceCount();

        if(wasDefaulted){
            warnings.push("No instance_count set - assuming a single instance.");
        }

        const computeCost = hourlyUSD * instanceCount * hoursInDuration(durationSeconds);

        return {
            costUSD: computeCost,
            breakdown: { "compute": computeCost },
            warnings: warnings,
            freeTierSavingsUSD: 0,
            freeTierRemainingAfter: freeTierRemaining
        };

    }

    // Fleet capacity = per-instance throughput x instance_count - the same
    // ceiling assessCapacity sizes against and traffic propagation clips
    // downstream traffic to.
    getCapacityCeilingRps(): number{

        const instanceType: string | null = this.terraformProperties?.aws_instance?.instance_type?.value ?? null;
        const perInstanceMaxRps = (instanceType != null ? EC2_ESTIMATED_MAX_RPS[instanceType] : undefined) ?? EC2_DEFAULT_MAX_RPS;
        const { instanceCount } = this.getInstanceCount();

        return perInstanceMaxRps * instanceCount;

    }

    // Rightsizing check: is the fleet (instance_type x instance_count) big
    // enough for the traffic profile's shape, not just its peak? A resource
    // that's fine for 29 of 31 days and only falls over on the Dec 24 spike
    // is a materially different situation from one that's undersized
    // year-round, even though both have the same peak - exceededDayLabels
    // is what lets the UI (and a reader) tell those apart.
    assessCapacity(dailyWorkload: NodeDailyWorkload[]): CapacityAssessment{

        const instanceType: string | null = this.terraformProperties?.aws_instance?.instance_type?.value ?? null;
        const perInstanceMaxRps = (instanceType != null ? EC2_ESTIMATED_MAX_RPS[instanceType] : undefined) ?? EC2_DEFAULT_MAX_RPS;
        const { instanceCount } = this.getInstanceCount();
        const fleetCapacityRps = this.getCapacityCeilingRps();

        const peak = dailyWorkload.reduce((max, day) => Math.max(max, day.rps), 0);
        const peakUtilizationPercent = fleetCapacityRps > 0 ? (peak / fleetCapacityRps) * 100 : 0;
        const exceededDayLabels = dailyWorkload.filter((day) => day.rps > fleetCapacityRps).map((day) => day.label);

        if(exceededDayLabels.length > 0){

            const neededInstanceCount = Math.max(1, Math.ceil(peak / perInstanceMaxRps));

            const recommendation = instanceCount <= 1
                ? `This is a single instance with no auto scaling group behind it. Run at least ${neededInstanceCount}x ${instanceType ?? "this instance type"} behind an ASG (or resize to a larger type) to cover the peak.`
                : `Scale the fleet to at least ${neededInstanceCount}x ${instanceType ?? "this instance type"} (currently ${instanceCount}) to cover the peak.`;

            return {
                status: "critical",
                message: `Over capacity on ${exceededDayLabels.length} of ${dailyWorkload.length} day(s) - peak is ${peakUtilizationPercent.toFixed(0)}% of fleet capacity.`,
                recommendation,
                peakUtilizationPercent,
                exceededDayLabels
            };

        }

        if(peakUtilizationPercent >= 80){
            return {
                status: "warning",
                message: `Peak traffic is ${peakUtilizationPercent.toFixed(0)}% of fleet capacity - comfortable for now, but little headroom.`,
                recommendation: `Consider adding another ${instanceType ?? "instance"} (or an ASG with headroom) before the next traffic increase.`,
                peakUtilizationPercent
            };
        }

        return {
            status: "ok",
            message: `Peak traffic is ${peakUtilizationPercent.toFixed(0)}% of fleet capacity.`,
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