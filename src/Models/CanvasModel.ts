import { AnimatedSVGEdge } from "../Components/Edges/AnimatedSVGEdge";
import { StandardEdge } from "../Components/Edges/StandardEdge";
import ImageNode from "../Components/Nodes/ImageNode";

export class CanvasModel{

    public nodeTypes = {
        imageNode: ImageNode,
    };

    public edgeTypes = {
        standardEdge: StandardEdge,
        animatedSvg: AnimatedSVGEdge,
    };
        
    public constructor(){
    }

}