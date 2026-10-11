import { resourceContainer } from "../constants";
import type { ResourceStatics } from "../Models/Resource";
import type Resource from "../Models/Resource";
import type { AppEdge, AppNode, Property, AppComponent, PropertyCategory, ResourceData, ComponentData, PropertyRecord, CodeChunk, InputsController } from "../types";

export class PropertiesWidgetController implements InputsController {

    private setNodes: React.Dispatch<React.SetStateAction<AppNode[]>>;
    private setEdges: React.Dispatch<React.SetStateAction<AppEdge[]>>;

    public constructor(
        setNodes: React.Dispatch<React.SetStateAction<AppNode[]>>, 
        setEdges: React.Dispatch<React.SetStateAction<AppEdge[]>>
    ){
        this.setEdges = setEdges;
        this.setNodes = setNodes;
    }


    public getEdgeTerraform(componentData: ComponentData | undefined, stateNodes: AppNode[]): CodeChunk[]{
        
        console.log(componentData);

        if(componentData == undefined){
            return [];
        }

        //get both resources.
        const callerName = componentData.metaData.callerName;
        const receiverName = componentData.metaData.receiverName;
    
        if(callerName == null || receiverName == null){
            return [];
        }

        const callerResource = resourceContainer[callerName!];
        const receiverResource = resourceContainer[receiverName!];
        
        if(componentData.resources == null || componentData.resources == null){
            return [];
        }
       
        const callerID: string = componentData?.resources?.callerID;
        const receiverID: string = componentData?.resources?.receiverID;

        //get nodes by id then create them to get latest node values
        const callerAppNode = stateNodes.find((node: AppNode) => node.id == callerID);
        const receiverAppNode = stateNodes.find((node: AppNode) => node.id == receiverID);

        if(callerAppNode == undefined || receiverAppNode == undefined){
            return [];
        }

        const callerInstance = new callerResource(callerAppNode.data);
        const receiverInstance = new receiverResource(receiverAppNode.data);

        //call receiver and caller terraformPreview for each.

        const edgeType = componentData.metaData.edgeType;
        
        const callerTerraform: Record<string, PropertyRecord> = callerInstance.toTerraformEdgePropertiesCaller(edgeType, receiverInstance, callerInstance) ?? {};
        const receiverTerraform: Record<string, PropertyRecord> = receiverInstance.toTerraformEdgePropertiesReceiver(edgeType, callerInstance, receiverInstance) ?? {};

        return [...callerInstance.toTerraformPreview([callerTerraform]), ...receiverInstance.toTerraformPreview([receiverTerraform])];
    }   

    
    public getSelectedResource(selectedNodeData: ResourceData | undefined): Resource | undefined{
        
        if(selectedNodeData == undefined || selectedNodeData.service == undefined){
            return;
        }

        const resource: ResourceStatics = resourceContainer[selectedNodeData?.service?.name!];
   
        const resourceInstance = new resource(selectedNodeData);
        
        return resourceInstance;
    }

    public shouldShowProperty(property: Property<any>, componentData: ComponentData | undefined): boolean {

        if(property.dependant != undefined){

            let dependant = componentData?.terraformProperties;
            let dependantProperty: Property<any> | undefined;
            const propertyPath = property.dependant.propertyPath;

            if(componentData == undefined || dependant == undefined){
                console.log("componentData == undefined || dependant == undefined");
                return false;
            }

            if(propertyPath.length == 0){
                return false;
            }

            const dependantPropertyRecord = dependant![propertyPath[0]]; // need because type is different at top level

            for(let i = 1 ; i < propertyPath.length; i++){
            
                const fieldName = propertyPath[i]
                
                dependantProperty = dependantPropertyRecord[fieldName];

                if(dependantProperty == undefined){
                    return false;
                }
            
            }

            if(dependantProperty == undefined){
                return false;
            }

            if(dependantProperty.value != property.dependant.value){
                return false;
            }
        }

        return true;
    }

    public getDependantProperty(property: Property<any>, componentData: ComponentData | undefined): any{

        const propertyPath = property.link

        if(propertyPath != undefined){
                //check if dependant value is set. if not return

            let dependant = componentData?.terraformProperties;
            let dependantProperty: Property<any> | undefined;

            if(propertyPath == undefined){
                return;
            }

            if(componentData == undefined || dependant == undefined){
                console.log("componentData == undefined || dependant == undefined");
                return "";
            }

            if(propertyPath.length == 0){
                return "";
            }

            const dependantPropertyRecord = dependant![propertyPath[0]]; // need because type is different at top level

            for(let i = 1 ; i < propertyPath.length; i++){
            
                const fieldName = propertyPath[i]
                
                dependantProperty = dependantPropertyRecord[fieldName];

                if(dependantProperty == undefined){
                    return "";
                }
            
            }

            if(dependantProperty == undefined){
                return "";
            }

            return dependantProperty.value;
           
        }

        return "";
        
    }
    
    private validProperty(nodeProperty: Property<any>, componentID: string | null): boolean{

        if(nodeProperty == undefined){
            console.log("node properties undefined");
            return false;
        }

        if(componentID == null){
            console.log("componentID is null");
            return false;
        }

        return true;

    }

    private updatePropertyByPath(index: number, record: Record<string, PropertyRecord> | PropertyRecord, propertyRecordPath: string[], newNodeProperty: Property<any>): void{

        const key = propertyRecordPath[index];
        const isLeaf = index === propertyRecordPath.length - 1;

        if(isLeaf){
            (record as PropertyRecord)[key] = newNodeProperty;
            return;
        }

        // index 0 is Record<string, PropertyRecord> - the value at a block name is already a PropertyRecord.
        // every level after that is a PropertyRecord itself, so each entry is a Property and needs .value unwrapped.
        const nextRecord: PropertyRecord = index === 0
            ? (record as Record<string, PropertyRecord>)[key]
            : (record as PropertyRecord)[key].value as PropertyRecord;

        this.updatePropertyByPath(index + 1, nextRecord, propertyRecordPath, newNodeProperty);

    }

    private updateComponentProperty(newNodeProperty: Property<any>, 
        propertyCategory: PropertyCategory, 
        propertyRecordPath: string[], 
        componentID: string, 
        inputName: string, 
        componentSetter: React.Dispatch<React.SetStateAction<any>>)
    {
        
        //need a way to deal with nested inputs 
        componentSetter((components: AppComponent[]) => components.map((component: AppComponent) => {

            if(component.id !== componentID){
                return component;
            }

            const newComponent: AppComponent = structuredClone(component);

            if(newComponent.data == null){
                return newComponent;
            }

            const fullPath = [...propertyRecordPath, inputName];

            switch (propertyCategory){

                case "component": {
                    this.updatePropertyByPath(0, newComponent.data.componentProperties, fullPath, newNodeProperty);
                    break;
                }

                case "terraform": {
                    this.updatePropertyByPath(0, newComponent.data.terraformProperties, fullPath, newNodeProperty);
                    break;
                }

                case "iam": {

                    if(newComponent.data.iamProperties == undefined){
                        return;
                    }

                    this.updatePropertyByPath(0, newComponent.data.iamProperties, fullPath, newNodeProperty);
                    break;
                }

            }

            return newComponent;
            
        }));

    }


    public onSelectChange(
        event: React.ChangeEvent<HTMLSelectElement, HTMLSelectElement>, 
        nodeProperty: Property<any>, 
        propertyCategory: PropertyCategory,
        propertyRecordName: string[],
        inputName: string, 
        componentID: string | null,
        componentSetter: React.Dispatch<React.SetStateAction<any>>
    ){

        if(!this.validProperty(nodeProperty, componentID)) return;

        const newNodeProperty = structuredClone(nodeProperty);
        newNodeProperty.value = event.target.value;

        this.updateComponentProperty(newNodeProperty, propertyCategory, propertyRecordName, componentID!, inputName, componentSetter);

    }


    //make generic and pass in setter
    public keyboardInputOnChange(
        event: React.ChangeEvent<HTMLInputElement, HTMLInputElement>, 
        nodeProperty: Property<any>, 
        propertyCategory: PropertyCategory,
        propertyRecordName: string[],
        inputName: string, 
        componentID: string | null,
        componentSetter: React.Dispatch<React.SetStateAction<any>>
    ){  

        if(!this.validProperty(nodeProperty, componentID)) return;

        const newNodeProperty = structuredClone(nodeProperty);
        newNodeProperty.value = event.target.value;

        this.updateComponentProperty(newNodeProperty, propertyCategory, propertyRecordName, componentID!, inputName, componentSetter);

    }


    public checkBoxOnChange(
        event: React.ChangeEvent<HTMLInputElement, HTMLInputElement>, 
        nodeProperty: Property<any>, 
        propertyCategory: PropertyCategory,
        propertyRecordName: string[],
        inputName: string, 
        componentID: string | null,
        componentSetter: React.Dispatch<React.SetStateAction<any>>
    ){
        
        if(!this.validProperty(nodeProperty, componentID)) return;

        const newNodeProperty = structuredClone(nodeProperty);
        newNodeProperty.value = event.target.checked;

        this.updateComponentProperty(newNodeProperty, propertyCategory, propertyRecordName, componentID!, inputName, componentSetter);

    }

}