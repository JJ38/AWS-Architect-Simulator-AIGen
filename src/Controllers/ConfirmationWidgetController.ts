import type { Edge } from "@xyflow/react";

export class ConfirmationWidgetController{

    // setNodes: React.Dispatch<React.SetStateAction<Node[]>>, setEdges: React.Dispatch<React.SetStateAction<Edge[]>>

    public constructor(){

    }

    public handleYesClick(){
        console.log("yes clicked");

    }

    public handleNoClick(){
        console.log("no clicked");

    }

}