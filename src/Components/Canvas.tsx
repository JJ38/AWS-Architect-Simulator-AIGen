import { useState, useCallback, useEffect } from 'react';
import { ReactFlow, applyNodeChanges, applyEdgeChanges, useReactFlow, addEdge } from '@xyflow/react';
import type { AppEdge, AppNode, CodeChunk, EdgeType, Service } from '../types.ts';
import { CanvasController } from '../Controllers/CanvasController.ts';
import '@xyflow/react/dist/style.css';
import '../styles/Canvas.css'; 
import PropertiesWidget from './Widgets/PropertiesWidget.tsx';
import type Resource from '../Models/Resource.ts';
import { useNotification } from '../Providers/NotificationProvider.tsx';

export default function Canvas(
  {
    stateSelectedService,
    setSelectedService,
    stateNodes,
    setNodes,
    stateEdges,
    setEdges
  }
    :
  {
    stateSelectedService: Service | null;
    setSelectedService: React.Dispatch<React.SetStateAction<Service | null>>;
    stateNodes: AppNode[];
    setNodes: React.Dispatch<React.SetStateAction<AppNode[]>>;
    stateEdges: AppEdge[];
    setEdges: React.Dispatch<React.SetStateAction<AppEdge[]>>;
  }
){

  const [stateGhostNodes, setGhostNodes] = useState<AppNode[]>([]);
  const [stateSelectedNodeID, setSelectedNodeID] = useState<string | null>(null);
  const [stateSelectedEdgeID, setSelectedEdgeID] = useState<string | null>(null);
  const { screenToFlowPosition } = useReactFlow();

  const showNotification = useNotification();

  const [stateCanvasController] = useState(() => new CanvasController(
    showNotification,
    screenToFlowPosition, 
    setGhostNodes, 
    setNodes, 
    setEdges, 
    setSelectedNodeID, 
    setSelectedEdgeID, 
    setSelectedService
  ))

  const selectedNode = stateNodes.find((node: AppNode) => node.id == stateSelectedNodeID);
  const selectedEdge = stateEdges.find((edge: AppEdge) => edge.id == stateSelectedEdgeID);

  const title: string = stateCanvasController.getPropertiesWidgetTitle(selectedNode?.data, stateNodes, selectedEdge);

  const onNodesChange = useCallback((changes: any) => setNodes((nodesSnapshot) => applyNodeChanges(changes, nodesSnapshot)), []);
  const onEdgesChange = useCallback((changes: any) => setEdges((edgesSnapshot) => applyEdgeChanges(changes, edgesSnapshot)), []);
  const onConnect = useCallback((params: any) => {stateCanvasController.onConnect(params, stateNodes)}, [stateNodes]);

  const nodesWithSelection = stateNodes.map((node) => ({
    ...node,
    data: { ...node.data, isSelected: node.id === stateSelectedNodeID }
  }));

  useEffect(() => {
    
    function handleKeyDown(event: KeyboardEvent){

      if(event.key !== "Delete") {
        return;
      }

      if(stateSelectedNodeID != null){
        setNodes((nodes: AppNode[]) => nodes.filter((node: AppNode) => node.id != stateSelectedNodeID));
        return;
      }

      if(stateSelectedEdgeID != null){
        setEdges((edges: AppEdge[]) => edges.filter((edge: AppEdge) => edge.id != stateSelectedEdgeID));
        return;
      }

    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)

  }, [stateSelectedNodeID, setNodes, stateSelectedEdgeID, setEdges]);

  return (
    <div className="reactFlowWrapper">
      <ReactFlow
        nodes={[...nodesWithSelection, ...stateGhostNodes]}
        edges={stateEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={(event, node) => stateCanvasController.handleNodeClick(event, node, stateSelectedService, stateSelectedNodeID)}
        onEdgeClick={(event, edge) => stateCanvasController.handleEdgeClick(edge, stateSelectedEdgeID)}
        edgesFocusable={true}
        onConnect={onConnect}
        nodeTypes={stateCanvasController.model.nodeTypes}
        edgeTypes={stateCanvasController.model.edgeTypes}
        fitView
        onPaneClick={(event) => stateCanvasController.handlePaneClick(event, stateSelectedService, stateNodes)}
        onPaneMouseMove={(event) => stateCanvasController.handlePaneMouseMove(event, stateSelectedService)}
        snapGrid={[20,20]}
        colorMode='dark'//dark, light, system
        elementsSelectable={false}
      />
      <PropertiesWidget 
        stateSelectedNodeID={stateSelectedNodeID} 
        selectedNodeData={selectedNode?.data}
        stateNodes={stateNodes}
        setNodes={setNodes}
        selectedEdgeData={selectedEdge?.data}
        stateSelectedEdgeID={stateSelectedEdgeID}
        setEdges={setEdges}
        title={title}
      >
      </PropertiesWidget>
    </div>

  );

}
