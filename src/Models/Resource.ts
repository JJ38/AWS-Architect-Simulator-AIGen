import type { CapacityAssessment, CodeChunk, CostEstimate, EdgeType, NodeDailyWorkload, PermissionType, Property, PropertyRecord, ResourceData, Service, ValidationResult } from "../types";


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