import { type XYPosition, type Node, type ViewportHelperFunctions, type Edge, addEdge } from "@xyflow/react";
import type { AppEdge, AppNode, EdgeType, ResourceData, Service } from "../types";
import { CanvasModel } from "../Models/CanvasModel.ts";
import { resourceContainer, serviceImageSize } from "../constants.ts";
import type Resource from "../Models/Resource.ts";
import type { ResourceStatics } from "../Models/Resource.ts";


export class CanvasController{

    public model: CanvasModel = new CanvasModel;

    private showNotification: (success: boolean, message: string) => void
    private screenToFlowPosition: ViewportHelperFunctions['screenToFlowPosition'];
    private setGhostNodes: React.Dispatch<React.SetStateAction<AppNode[]>>;
    private setNodes: React.Dispatch<React.SetStateAction<AppNode[]>>; 
    private setEdges: React.Dispatch<React.SetStateAction<AppEdge[]>>; 
    private setSelectedNodeID: React.Dispatch<React.SetStateAction<string | null>>
    private setSelectedEdgeID: React.Dispatch<React.SetStateAction<string | null>>
    private setSelectedService: React.Dispatch<React.SetStateAction<Service | null>>
     

    public constructor(
        showNotification: (success: boolean, message: string) => void,
        screenToFlowPosition: ViewportHelperFunctions['screenToFlowPosition'], 
        setGhostNodes: React.Dispatch<React.SetStateAction<AppNode[]>>,
        setNodes: React.Dispatch<React.SetStateAction<AppNode[]>>, 
        setEdges: React.Dispatch<React.SetStateAction<AppEdge[]>>, 
        setSelectedNodeID: React.Dispatch<React.SetStateAction<string | null>>,
        setSelectedEdgeID: React.Dispatch<React.SetStateAction<string | null>>,
        setSelectedService: React.Dispatch<React.SetStateAction<Service | null>>
    ){
        this.showNotification = showNotification;
        this.screenToFlowPosition = screenToFlowPosition;
        this.setGhostNodes = setGhostNodes;
        this.setNodes = setNodes;
        this.setEdges = setEdges;
        this.setSelectedNodeID = setSelectedNodeID;
        this.setSelectedEdgeID = setSelectedEdgeID;
        this.setSelectedService = setSelectedService;
    }

    private placeNode(selectedService: Service, position: XYPosition | null): void{
        
        const nodeID = `n-${crypto.randomUUID()}`

        const newNode: Node = { 
            id: nodeID, 
            position: position ?? {x:0, y:0}, 
            data: {        
                terraformProperties: null
            },
            type: 'imageNode', 
            measured: { width: 1, height: 1 },
        };

        if(selectedService.terraformType == "resource"){   
            const resourceFactory: ResourceStatics = resourceContainer[selectedService.name!];
            newNode['data'] = resourceFactory.create(nodeID, selectedService);
        }

        this.setNodes((stateNodes: AppNode[]) => [...stateNodes, newNode as AppNode]);
 
        this.setSelectedNodeID(nodeID);
        this.setGhostNodes([]);

        this.setSelectedService(null);

    }

    public handlePaneClick(event: React.MouseEvent, selectedService: Service | null, stateNodes: AppNode[]): void {

        this.setSelectedNodeID(null);

        if(selectedService == null) {
            return;
        }

        const position = this.getCanvasPosition(event);

        this.placeNode(selectedService, position);
    
    }

    public handlePaneMouseMove(event: React.MouseEvent, selectedService: Service | null): void{

        //when deselecting a service without placing the icon still shows

        if(selectedService == null) {
            return;
        }

        const position: XYPosition | null = this.getCanvasPosition(event);

        const newGhostNode: AppNode = { id: `n-ghostNode`, position: position, data: { service: selectedService} , type: 'imageNode', measured: { width: 1, height: 1 }} as AppNode;
        this.setGhostNodes([newGhostNode]);
        
    }

    public handleNodeClick(event: React.MouseEvent, node: AppNode, stateSelectedService: Service | null, stateSelectedNodeID: string | null): void{

        if(stateSelectedService != null){
            const position = this.getCanvasPosition(event);
            this.placeNode(stateSelectedService, position);
            return;
        }

        if(node.id !== stateSelectedNodeID){
            this.setSelectedNodeID(node.id);
            this.setSelectedEdgeID(null);
        }

    }

    public getCanvasPosition = (event: React.MouseEvent<Element, MouseEvent>): XYPosition | null => {

        if(this.screenToFlowPosition == null){
            return null;
        }

        const flowPosition = this.screenToFlowPosition({ x: event.clientX, y: event.clientY});
        const position: XYPosition = { x: flowPosition.x - (serviceImageSize.width / 2), y: flowPosition.y - (serviceImageSize.height / 2)}
        return position;
    }

    public handleEdgeClick(edge: Edge, stateSelectedEdgeID: string | null){
     
        if(edge.id !== stateSelectedEdgeID){
            this.setSelectedEdgeID(edge.id);
            this.setSelectedNodeID(null);
        }

    }

    public onConnect(params: any, stateNodes: AppNode[]){

        const sourceID = params.source;
        const targetID = params.target;
    
        const sourceNode = stateNodes.find((node: AppNode) => node.id == sourceID);
        const targetNode = stateNodes.find((node: AppNode) => node.id == targetID);

        if(sourceNode == undefined || targetNode == undefined){
            return;
        }
        
        const sourceServiceName = sourceNode?.data.service.name;
        const targetServiceName = targetNode?.data.service.name;
    
        if(sourceServiceName == null || targetServiceName == null){
            return;
        }

        const sourceResource = resourceContainer[sourceServiceName!];
        const targetResource = resourceContainer[targetServiceName!];
    
        const sourceEdgeTypes = sourceResource.sourceTypes;
        const targetEdgeTypes = targetResource.targetTypes;
    
        const validEdgeType = sourceEdgeTypes.filter((edgeType: EdgeType) => targetEdgeTypes.includes(edgeType));

        if(validEdgeType.length == 0){
            this.showNotification(false, "Invalid connection");
            return;
        }

        const defaultEdge = validEdgeType[0] ?? "";

        let callerInstance: Resource;
        let receiverInstance: Resource;
        let callerName: string;
        let receiverName: string;
        let callerID: string;
        let receiverID: string;

        
        if(defaultEdge == "pull"){

            callerInstance = new targetResource(targetNode.data);
            receiverInstance = new sourceResource(sourceNode.data);
            callerName = targetServiceName;
            receiverName = sourceServiceName;
            callerID = targetNode.id;
            receiverID = sourceNode.id;

        }else{

            callerInstance = new sourceResource(sourceNode.data);
            receiverInstance = new targetResource(targetNode.data);
            callerName = sourceServiceName;
            receiverName = targetServiceName;
            callerID = sourceNode.id;
            receiverID= targetNode.id;

        }

        params['type'] = "standardEdge";
        params['data'] = {
            metaData:{
                "callerName": callerName,
                "receiverName": receiverName,
            },
            componentProperties:{
                "behaviour": {
                    "edgeType": { value: defaultEdge, type: "edgeType", options: validEdgeType },
                }
            },
            resources:{
                callerID: callerID,
                receiverID: receiverID
            }
        };

        this.setEdges((edgesSnapshot) => addEdge(params, edgesSnapshot))
    
    }

    public getPropertiesWidgetTitle(selectedNodeData: ResourceData | undefined, stateNodes: AppNode[], selectedEdge: AppEdge | undefined): string{

        let title = "";

        if(selectedNodeData != undefined){
            title += selectedNodeData.service.description;
            title += ": ";
            title += selectedNodeData.id;
        }

         if(selectedEdge != undefined){

            const sourceNode = stateNodes.find((node) => node.id === selectedEdge?.source);
            const targetNode = stateNodes.find((node) => node.id === selectedEdge?.target);
            
            const sourceNodeDescription = sourceNode?.data.service.description;
            const targetNodeDescription = targetNode?.data.service.description;

            title += sourceNodeDescription;
            title += " -> ";
            title += targetNodeDescription;

        }

        return title;
    }


}