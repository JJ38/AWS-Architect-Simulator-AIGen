import type { AppEdge, AppNode, CodeChunk } from "../types";
import type { ResourceStatics } from "./Resource";
import { resourceContainer } from "../constants";


export class TerraformConverter{

    private stateNodes: AppNode[];
    private stateEdges: AppEdge[];
    public providerTerraform: string = "";
    public resourceTerraform: string = "";


    public constructor({ stateNodes, stateEdges }: { stateNodes: AppNode[], stateEdges: AppEdge[]}){
        this.stateNodes = stateNodes;
        this.stateEdges = stateEdges;
    }    

    public validateDiagram(): boolean{

        //check if each node has required info
        for(let i = 0; i < this.stateNodes.length; i++){
            // const resource = this.stateNodes[i].resource;
        }
        

        return true;

    }

    public diagramToTerraform(): boolean{

        this.resourceTerraform = "";
        this.providerTerraform = "";

        for(let i = 0; i < this.stateNodes.length; i++){

            const resource: ResourceStatics = resourceContainer[this.stateNodes[i].data.service.name!];
            const resourceInstance = new resource(this.stateNodes[i].data);
            this.resourceTerraform += resourceInstance.toTerraform();

        }

        return true;

    }

}