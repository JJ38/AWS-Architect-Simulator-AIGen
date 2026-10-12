import type { CapacityAssessment, CodeChunk, CostEstimate, EdgeType, FreeTierPool, NodeDailyWorkload, PermissionType, Property, PropertyRecord, ResourceData, Service, ValidationResult } from "../types";
import { DAYS_PER_FREE_TIER_MONTH } from "../Simulation/pricing";


export interface ResourceStatics{

    new(data: ResourceData): Resource;
    create(id: string, service: Service): ResourceData;
    sourceTypes: EdgeType[];
    targetTypes: EdgeType[];
    permissionType: PermissionType;

}

export default abstract class Resource{

    public id: string;
    public service: Service;
    public resourceName: string;
    public terraformProperties: Record<string, PropertyRecord>;
    public iamProperties?: Record<string, PropertyRecord>;
    public componentProperties: Record<string, PropertyRecord>;


    public constructor(data: ResourceData){
        this.id = data.id;
        this.service = data.service;
        this.resourceName = data.resourceName;
        this.terraformProperties = data.terraformProperties;
        this.iamProperties = data.iamProperties;
        this.componentProperties = data.componentProperties;
    }


    abstract validate(): ValidationResult;
    abstract toTerraformEdgePropertiesCaller(edgeType: EdgeType, counterPart: Resource, resource?: Resource): Record<string, PropertyRecord> | null;
    abstract toTerraformEdgePropertiesReceiver(edgeType: EdgeType, counterPart: Resource, resource?: Resource): Record<string, PropertyRecord> | null;

    // workloadRps is this node's steady-state incoming requests/sec for one
    // slice of the traffic profile (see Simulation/trafficPropagation.ts),
    // sustained for durationSeconds - the simulation calls this once per
    // traffic-profile point (e.g. once per day) and sums the results, so the
    // cost math here must scale with durationSeconds, not assume a month.
    // Always full price - free tier is applied afterward, across every node
    // of a service type at once (see simulate.ts and getFreeTierAllowance
    // below), not per individual call, since the discount has to be shared
    // fairly across nodes rather than handed to whichever one asks first.
    abstract estimateCost(workloadRps: number, durationSeconds: number): CostEstimate;

    // Rightsizing/bottleneck check: given the resolved workload for every
    // point in the traffic profile (not just the peak - a resource can be
    // fine most of the period and only fall over on the one spike day, so
    // the *which days* question matters, not just *does it ever happen*),
    // judge whether this node's current configuration can handle it, and if
    // not, what to change. Default: no fixed capacity ceiling to size
    // against (true of every serverless/auto-scaling service - Lambda, SQS,
    // API Gateway, DynamoDB on-demand - this isn't a gap, it's the correct
    // answer for those). EC2 and DynamoDB-provisioned override this.
    assessCapacity(dailyWorkload: NodeDailyWorkload[]): CapacityAssessment{
        return { status: "not_applicable", message: "Scales automatically - no fixed capacity to size." };
    }

    // The same fixed ceiling assessCapacity sizes against, as a single
    // requests/sec number - null for anything that auto-scales (the default,
    // true of every serverless/auto-scaling service). This is what traffic
    // propagation clips against: a node downstream of a capacity-constrained
    // one should only see what that node can actually forward, not the full
    // offered load - an overloaded upstream service acts as a resistor on
    // the traffic reaching everything after it, not a transparent passthrough.
    // EC2 and DynamoDB-provisioned/Lambda-with-reservation override this with
    // the exact same math their assessCapacity uses, so the two can never
    // disagree about where the ceiling is.
    getCapacityCeilingRps(): number | null{
        return null;
    }

    // The free-tier allowance for this service type, in DOLLAR terms, keyed
    // by the same metric names as this service's own CostEstimate.breakdown
    // - already scaled to cover exactly one getFreeTierResetDays()-long
    // period (periodDurationSeconds is that period's length in seconds, so
    // a rate-based allowance like DynamoDB's RCU-hours can size itself
    // correctly regardless of whether the reset cadence is 1 day or 30).
    // Shared across every node of this service type in the diagram - see
    // simulate.ts for how the discount gets split fairly across them rather
    // than handed entirely to one. Default: none (most services have no
    // "always free" allowance that isn't tied to an AWS account's first 12
    // months - see pricing.ts for which do and why).
    getFreeTierAllowance(periodDurationSeconds: number): FreeTierPool{
        return {};
    }

    // How many simulated days before the pool above resets to full again.
    // 30 (one illustrative "month") for a genuinely consumable, usage-based
    // free tier (Lambda/SQS request counts) - matches AWS's real monthly
    // reset. DynamoDB overrides this to 1: its provisioned RCU/WCU free tier
    // isn't a depleting monthly budget at all, it's a continuous discount on
    // the first N units of CURRENTLY PROVISIONED capacity, which resetting
    // every single day reproduces correctly (no day's allocation carries
    // any memory of a previous day's).
    getFreeTierResetDays(): number{
        return DAYS_PER_FREE_TIER_MONTH;
    }


    toTerraformPreview(propertyRecords: Record<string, PropertyRecord>[]): CodeChunk[]{

        let codeChunks: CodeChunk[] = [];

        propertyRecords.forEach((propertyRecord) => {
            codeChunks = [...codeChunks, ...this.toTerraformResource(propertyRecord)];
        });

        return codeChunks;

    }

    toTerraformResource(properties: Record<string, PropertyRecord>): CodeChunk[]{

        const codeChunks: CodeChunk[] = [];

        for(const recordName of Object.keys(properties as Record<string, PropertyRecord>)){

            codeChunks.push({value: "resource ", className:"terraformKeyword"})
            codeChunks.push({value: recordName + " ", className:"terraformParameter"})
            codeChunks.push({value: this.resourceName, className:"terraformParameter"})

            codeChunks.push({value: "{", className:"terraformBracket"})
            
            codeChunks.push(...this.toTerraformPreviewParsePropertyRecord(properties[recordName], 0));
            codeChunks.push({value: "\n}\n\n", className:"terraformBracket"})

        }

        return codeChunks;
    }


    toTerraformPreviewParsePropertyRecord(propertyRecord: PropertyRecord, numberOfIndents: number): CodeChunk[]{

        let codeChunks: CodeChunk[] = [];

        for(const key of Object.keys(propertyRecord)){

            if(propertyRecord[key].value != null){

                codeChunks = [...codeChunks, ...this.toTerraformPreviewParseProperty(propertyRecord[key], key, numberOfIndents + 1)];
                
            }

        }
            
        return codeChunks;

    }


    toTerraformPreviewParseProperty(property: Property<any>, propertyName: string | null, numberOfIndents: number): CodeChunk[]{

        if(property == null){
            return [];
        }

        const codeChunks: CodeChunk[] = [];

        let indent: string = "";

        for(let i = 0; i < numberOfIndents; i++){
            indent += "  ";
        }

        codeChunks.push({value: `\n${indent}`, className:"terraformProperty"})

        if(propertyName != null){
            codeChunks.push({value: propertyName, className:"terraformProperty"})
            codeChunks.push({value: " = ", className:""})
        }

        codeChunks.push({value: "", className:""})

        switch (property.type) {

            case "tags": { 

                codeChunks.push({value: "{", className:""});

                if(property.value != null){
                    
                    const tagChunks = this.toTerraformPreviewParsePropertyRecord(property.value as PropertyRecord, numberOfIndents);
                    codeChunks.push(...tagChunks);
                    
                }

                codeChunks.push({value: `\n${indent}}`, className:""});

                break;
            }

            case "boolean": {
                codeChunks.push({value: property.value ? "true" : "false", className:"terraformValue"});
                break;
            }

            case "link": {

                //this is hardcoded for 1 nested value currently
                const link: string[] | undefined = property.link;

                if(link == undefined){
                    return[];
                }

                let dependantPropertyRecord: PropertyRecord = this.terraformProperties[link[0]];
                let dependantProperty: Property<any> = dependantPropertyRecord[link[1]];

                codeChunks.push({value: dependantProperty.value, className:"terraformValue"});
                break;
            }

            case "propertyArray": {

                codeChunks.push({value: "[", className:"terraformValue"});
       
                if(property.value != null){

                    let arrayChunks: CodeChunk[] = [];

                    property.value.forEach((value: Property<any>, index: number) => {
                        arrayChunks = [...arrayChunks, ...this.toTerraformPreviewParseProperty(value, null, numberOfIndents + 1)];
                    })

                    codeChunks.push(...arrayChunks);
                    
                }

                codeChunks.push({value: `\n${indent}]`, className:"terraformValue"});
                break;
            }

            default: {
                codeChunks.push({value: property.value, className:"terraformValue"});
                break;
            }
        }

        return codeChunks;

    }


    toTerraform(): string{

        let terraform: string = "resource ";

       
        for(const recordName of Object.keys(this.terraformProperties)){

            terraform += recordName + " ";
            terraform += this.resourceName;
            terraform += "{";


            for(const key of Object.keys(this.terraformProperties[recordName])){

                terraform += "\n  ";
                terraform += key;
                terraform += " = "

                //look at the property value. It might be a record/tags and need deconstructing further
                switch (key) {

                    case "tags": {
                        terraform += "TO DO implement tags";
                        break;
                    }

                    default: {
                        terraform += this.terraformProperties[recordName][key].value;
                    }
                }
            }

        }

        terraform += "\n}\n";

        return terraform;
    }

   
}