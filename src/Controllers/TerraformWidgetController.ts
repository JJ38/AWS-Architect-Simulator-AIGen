import type { Node } from "@xyflow/react";
import { TerraformConverter } from "../Models/TerraformConverter.ts";
import type { AppEdge, AppNode, CodeChunk, ComponentData, EdgeType, InputsController, Property, PropertyCategory } from "../types.ts";
import { regions, resourceContainer } from "../constants.ts";
import type { ResourceStatics } from "../Models/Resource.ts";

export class TerraformWidgetController implements InputsController{

    public setShowTerraformWidget: React.Dispatch<React.SetStateAction<boolean>>;
    public setNodes: React.Dispatch<React.SetStateAction<AppNode[]>>;
    public setEdge: React.Dispatch<React.SetStateAction<AppEdge[]>>;
    public showNotification: (success: boolean, message: string) => void;
    public setShowDownloadTerraformForm: React.Dispatch<React.SetStateAction<boolean>>
    public setDeploymentSettings: React.Dispatch<React.SetStateAction<Record<string, any>>>

    public deploymentProperties: Record<string, Record<string, Property<any>>> = {

        "terraform": {

            "required_providers": {
                value: {
                    name: "aws",
                    value: {
                       "source": {value: "hashicorp/aws", type:"string"},
                       "version": {value: "~> 5.0", type:"string"}
                    },
                    type: "tags"
                },
                type: "tags"
            },

            "backend": {

                value:{
                    "bucket": {value: "jamesbrass-aws-architect-sim-tfstate", type: "string"},
                    "key": {value: "aws-architect-simulator/terraform.tfstate", type: "string"},
                    "region": {value: null, type: "string", options: regions},
                    "use_lockfile": {value: false, type: "boolean"}
                },
                type:"tags"

            }

        }
    }
            

    public constructor(
        setShowTerraformWidget: React.Dispatch<React.SetStateAction<boolean>>, 
        showNotification: (success: boolean, message: string) => void, 
        setNodes: React.Dispatch<React.SetStateAction<AppNode[]>>, 
        setEdges: React.Dispatch<React.SetStateAction<AppEdge[]>>, 
        setShowDownloadTerraformForm: React.Dispatch<React.SetStateAction<boolean>>,
        setDeploymentSettings: React.Dispatch<React.SetStateAction<Record<string, any>>>
    ){
        this.setShowTerraformWidget = setShowTerraformWidget;
        this.setNodes = setNodes;
        this.setEdge = setEdges;
        this.showNotification = showNotification;
        this.setShowDownloadTerraformForm = setShowDownloadTerraformForm;
        this.setDeploymentSettings = setDeploymentSettings;
    }   

    public keyboardInputOnChange(event: React.ChangeEvent<HTMLInputElement, HTMLInputElement>, nodeProperty: Property<any>, propertyCategory: PropertyCategory, propertyRecordName: string[], inputName: string, componentID: string | null, componentSetter: React.Dispatch<React.SetStateAction<any>>): void {
      
    }
    public getDependantProperty(property: Property<any>, componentData: ComponentData | undefined): any{
       
    }
    public checkBoxOnChange(event: React.ChangeEvent<HTMLInputElement, HTMLInputElement>, nodeProperty: Property<any>, propertyCategory: PropertyCategory, propertyRecordName: string[], inputName: string, componentID: string | null, componentSetter: React.Dispatch<React.SetStateAction<any>>): void {

    }
    public onSelectChange(event: React.ChangeEvent<HTMLSelectElement, HTMLSelectElement>, nodeProperty: Property<any>, propertyCategory: PropertyCategory, propertyRecordName: string[], inputName: string, componentID: string | null, componentSetter: React.Dispatch<React.SetStateAction<any>>): void {
        
    }
    public shouldShowProperty(property: Property<any>, componentData: ComponentData | undefined): boolean {
        return true
    }

    public handleCancelClick(){
        this.setShowTerraformWidget(false);
    }

    public handleUploadClick(){ 

    }

    public handleDownloadClick(stateNodes: Node[]){


        if(stateNodes.length == 0){
            this.showNotification(false, "Add a service to convert it to terraform");
            return;    
        }

        //Get provider and backend state store info from user
        this.setShowDownloadTerraformForm(true);
        
    }

    public handleConvertToTerraform(stateNodes: AppNode[], stateEdges: AppEdge[]){

        //create resource of each node.
        const terraformConverter = new TerraformConverter({stateNodes: stateNodes, stateEdges: stateEdges});

        const validDiagram = terraformConverter.validateDiagram();

        if(!validDiagram){
            this.showNotification(false, "Error - invalid diagram");
            return;
        }

        const successfulConversion = terraformConverter.diagramToTerraform();

        if(!successfulConversion){
            this.showNotification(false, "Error - conversion failed");
            return;
        } 

        this.showNotification(true, "Successfully converted to terraform");
        
    }

    public handleCancelDownloadClick(){
        this.setShowDownloadTerraformForm(false);
    }

    public mainToTerraformPreview(deploymentSettings: Record<string, any>): CodeChunk[]{

        const codeChunks: CodeChunk[] = [];

        codeChunks.push({value: "terraform {", className:"terraformKeyword"})

        codeChunks.push({value: "\n  required_providers {", className:"terraformKeyword"})

        codeChunks.push({value: "\n  aws = {", className:"terraformProperty"})
        codeChunks.push({value: "\n  source", className:"terraformProperty"})
        codeChunks.push({value: "\n  version", className:"terraformProperty"})

        codeChunks.push({value: " = ", className:""})



        return codeChunks;
    }

    public getNodesTerraformPreview(stateNodes: AppNode[]): CodeChunk[]{

        let codeChunks: CodeChunk[] = [];

        stateNodes?.map(
            (node: AppNode) => {

                const resource: ResourceStatics = resourceContainer[node.data.service.name!];
                const resourceInstance = new resource(node.data);

                const terraformProperties = resourceInstance.terraformProperties;

                codeChunks = [...codeChunks, ...resourceInstance.toTerraformPreview([terraformProperties])];

                codeChunks.push({value: "\n", className:""});
                codeChunks.push({value: "\n", className:""});

            }
        )

        return codeChunks;

    }


    public getEdgesTerraformPreview(stateEdges: AppEdge[], stateNodes: AppNode[]): CodeChunk[]{

        let codeChunks: CodeChunk[] = [];

        stateEdges?.map(
            (edge: AppEdge) => {

                //get resources on both sides of edge
                const callerID = edge.data?.resources?.callerID;
                const receiverID = edge.data?.resources?.receiverID;

                if(callerID === undefined || receiverID === undefined){
                    return [];
                }

                //create instances

                const callerNode = stateNodes.find((node: AppNode) => node.id === callerID);
                const receiverNode = stateNodes.find((node: AppNode) => node.id === receiverID);

                if(callerNode === undefined || receiverNode === undefined){
                    return [];
                }       


                const callerResource: ResourceStatics = resourceContainer[callerNode.data.service.name!];
                const callerResourceInstance = new callerResource(callerNode.data);

                const receiverResource: ResourceStatics = resourceContainer[receiverNode.data.service.name!];
                const receiverResourceInstance = new receiverResource(receiverNode.data); 

                //get terraform previews

                const edgeType: EdgeType = edge.data?.componentProperties.behaviour.edgeType.value;

                const callerEdgeTerraform = callerResourceInstance.toTerraformEdgePropertiesCaller(edgeType, receiverResourceInstance, callerResourceInstance) ?? {};
                const receiverEdgeTerraform = receiverResourceInstance.toTerraformEdgePropertiesReceiver(edgeType, callerResourceInstance, receiverResourceInstance)?? {};

                const callerEdgeTerraformPreview = callerResourceInstance.toTerraformPreview([callerEdgeTerraform]);
                const receiverEdgeTerraformPreview = receiverResourceInstance.toTerraformPreview([receiverEdgeTerraform]);


                //combine and return;
                codeChunks = [...codeChunks, ...callerEdgeTerraformPreview, ...receiverEdgeTerraformPreview];

                codeChunks.push({value: "\n", className:""});
                codeChunks.push({value: "\n", className:""});

            }
        )

        return codeChunks;

    }


}