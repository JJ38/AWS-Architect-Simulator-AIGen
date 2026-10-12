import type { CapacityAssessment, CostEstimate, EdgeType, NodeDailyWorkload, PermissionType, ResourceData, Service, ValidationResult } from "../../types";
import Resource from "../Resource";
import { ASSUMED_READ_FRACTION, ASSUMED_WRITE_FRACTION, DYNAMODB_ON_DEMAND_PER_MILLION_READ_USD, DYNAMODB_ON_DEMAND_PER_MILLION_WRITE_USD, DYNAMODB_PROVISIONED_HOURLY_PER_RCU_USD, DYNAMODB_PROVISIONED_HOURLY_PER_WCU_USD, hoursInDuration, requestsOverDuration } from "../../Simulation/pricing";

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
            componentProperties: {
                // Not a real Terraform argument - request mix is traffic data, not
                // config - but it drives both the on-demand cost split and the
                // provisioned-capacity adequacy check below.
                "simulation": {
                    "read_traffic_percent": { value: ASSUMED_READ_FRACTION * 100, type: "number" }
                }
            }
        }

    }

    toTerraformEdgePropertiesCaller(edgeType: EdgeType, counterPart: Resource){
        return null;
    }

    toTerraformEdgePropertiesReceiver(edgeType: EdgeType, counterPart: Resource){
        return null;
    }

    private getReadFraction(): { readFraction: number, wasDefaulted: boolean }{

        const readPercent: number | null = this.componentProperties?.simulation?.read_traffic_percent?.value ?? null;

        if(readPercent == null){
            return { readFraction: ASSUMED_READ_FRACTION, wasDefaulted: true };
        }

        return { readFraction: readPercent / 100, wasDefaulted: false };

    }

    estimateCost(workloadRps: number, durationSeconds: number): CostEstimate {

        const warnings: string[] = [];
        const billingMode: string = this.terraformProperties?.aws_dynamodb_table?.billing_mode?.value ?? "PAY_PER_REQUEST";

        if(billingMode === "PROVISIONED"){

            const readCapacity: number = this.terraformProperties?.aws_dynamodb_table?.read_capacity?.value ?? 0;
            const writeCapacity: number = this.terraformProperties?.aws_dynamodb_table?.write_capacity?.value ?? 0;

            const readCost = readCapacity * DYNAMODB_PROVISIONED_HOURLY_PER_RCU_USD * hoursInDuration(durationSeconds);
            const writeCost = writeCapacity * DYNAMODB_PROVISIONED_HOURLY_PER_WCU_USD * hoursInDuration(durationSeconds);

            return {
                costUSD: readCost + writeCost,
                breakdown: { "read_capacity": readCost, "write_capacity": writeCost },
                warnings: warnings
            };

        }

        const { readFraction, wasDefaulted } = this.getReadFraction();
        const writeFraction = 1 - readFraction;

        if(wasDefaulted){
            warnings.push(`No read_traffic_percent set - assuming the default ${ASSUMED_READ_FRACTION * 100}/${ASSUMED_WRITE_FRACTION * 100} read/write split.`);
        }

        const requests = requestsOverDuration(workloadRps, durationSeconds);
        const readCost = requests * readFraction * DYNAMODB_ON_DEMAND_PER_MILLION_READ_USD / 1_000_000;
        const writeCost = requests * writeFraction * DYNAMODB_ON_DEMAND_PER_MILLION_WRITE_USD / 1_000_000;

        return {
            costUSD: readCost + writeCost,
            breakdown: { "read_requests": readCost, "write_requests": writeCost },
            warnings: warnings
        };

    }

    // Provisioned capacity translated into a single rps ceiling: whichever of
    // read/write is tighter, scaled back up by its share of the assumed
    // request mix (a day is over capacity once EITHER its read or write
    // requirement crosses its own capacity, so the binding constraint is
    // whichever produces the lower rps bound). null (no ceiling) for
    // on-demand, which scales automatically.
    getCapacityCeilingRps(): number | null{

        const billingMode: string = this.terraformProperties?.aws_dynamodb_table?.billing_mode?.value ?? "PAY_PER_REQUEST";

        if(billingMode !== "PROVISIONED"){
            return null;
        }

        const readCapacity: number = this.terraformProperties?.aws_dynamodb_table?.read_capacity?.value ?? 0;
        const writeCapacity: number = this.terraformProperties?.aws_dynamodb_table?.write_capacity?.value ?? 0;

        const { readFraction } = this.getReadFraction();
        const writeFraction = 1 - readFraction;

        const readBoundRps = readFraction > 0 ? readCapacity / readFraction : Infinity;
        const writeBoundRps = writeFraction > 0 ? writeCapacity / writeFraction : Infinity;

        return Math.min(readBoundRps, writeBoundRps);

    }

    // On-demand scales automatically - nothing to rightsize. Provisioned
    // mode is the rightsizing case: find every day whose required RCU/WCU
    // (derived from that day's resolved traffic) exceeds what's configured,
    // not just the peak day, and recommend sizing for the actual peak.
    assessCapacity(dailyWorkload: NodeDailyWorkload[]): CapacityAssessment{

        const billingMode: string = this.terraformProperties?.aws_dynamodb_table?.billing_mode?.value ?? "PAY_PER_REQUEST";

        if(billingMode !== "PROVISIONED"){
            return { status: "not_applicable", message: "On-demand billing - scales automatically, no capacity to size." };
        }

        const readCapacity: number = this.terraformProperties?.aws_dynamodb_table?.read_capacity?.value ?? 0;
        const writeCapacity: number = this.terraformProperties?.aws_dynamodb_table?.write_capacity?.value ?? 0;

        const { readFraction } = this.getReadFraction();
        const writeFraction = 1 - readFraction;

        const peak = dailyWorkload.reduce((max, day) => Math.max(max, day.rps), 0);
        const peakRequiredRead = peak * readFraction;
        const peakRequiredWrite = peak * writeFraction;

        const exceededDayLabels = dailyWorkload
            .filter((day) => day.rps * readFraction > readCapacity || day.rps * writeFraction > writeCapacity)
            .map((day) => day.label);

        // Whichever of read/write is tighter relative to its own capacity
        // drives the headline utilization number.
        const readUtilization = readCapacity > 0 ? (peakRequiredRead / readCapacity) * 100 : (peakRequiredRead > 0 ? Infinity : 0);
        const writeUtilization = writeCapacity > 0 ? (peakRequiredWrite / writeCapacity) * 100 : (peakRequiredWrite > 0 ? Infinity : 0);
        const peakUtilizationPercent = Math.max(readUtilization, writeUtilization);

        if(exceededDayLabels.length > 0){

            const recommendedRead = Math.ceil(peakRequiredRead);
            const recommendedWrite = Math.ceil(peakRequiredWrite);

            return {
                status: "critical",
                message: `Provisioned capacity (${readCapacity} RCU / ${writeCapacity} WCU) is too low on ${exceededDayLabels.length} of ${dailyWorkload.length} day(s).`,
                recommendation: `Provision at least ${recommendedRead} RCU / ${recommendedWrite} WCU to cover the peak (~${peak.toFixed(1)} req/s, assuming a ${(readFraction * 100).toFixed(0)}/${(writeFraction * 100).toFixed(0)} read/write split) - or switch to on-demand billing if traffic is this spiky.`,
                peakUtilizationPercent: Number.isFinite(peakUtilizationPercent) ? peakUtilizationPercent : 999,
                exceededDayLabels
            };

        }

        if(peakUtilizationPercent >= 80){
            return {
                status: "warning",
                message: `Peak traffic needs ~${peakUtilizationPercent.toFixed(0)}% of provisioned capacity - comfortable for now, but little headroom.`,
                recommendation: "Consider raising provisioned capacity, or switching to on-demand if traffic is unpredictable.",
                peakUtilizationPercent
            };
        }

        return {
            status: "ok",
            message: `Peak traffic needs ~${peakUtilizationPercent.toFixed(0)}% of provisioned capacity.`,
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