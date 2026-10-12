import { useState, useCallback, useEffect } from 'react';
import { Background, BackgroundVariant, ReactFlow, applyNodeChanges, applyEdgeChanges, useReactFlow } from '@xyflow/react';
import type { AppEdge, AppNode, Service } from '../types.ts';
import { CanvasController } from '../Controllers/CanvasController.ts';
import '@xyflow/react/dist/style.css';
import '../styles/Canvas.css';
import PropertiesWidget from './Widgets/PropertiesWidget.tsx';
import ViewLayerSwitcher from './ViewLayerSwitcher.tsx';
import type { CanvasView } from './ViewLayerSwitcher.tsx';
import ThemeToggle from './ThemeToggle.tsx';
import { useNotification } from '../Providers/NotificationProvider.tsx';
import { useTheme } from '../Providers/ThemeProvider.tsx';
import type { SimulationResult } from '../Simulation/simulate.ts';

export default function Canvas(
  {
    stateSelectedService,
    setSelectedService,
    stateNodes,
    setNodes,
    stateEdges,
    setEdges,
    stateCanvasView,
    setCanvasView,
    simulationResult
  }
    :
  {
    stateSelectedService: Service | null;
    setSelectedService: React.Dispatch<React.SetStateAction<Service | null>>;
    stateNodes: AppNode[];
    setNodes: React.Dispatch<React.SetStateAction<AppNode[]>>;
    stateEdges: AppEdge[];
    setEdges: React.Dispatch<React.SetStateAction<AppEdge[]>>;
    stateCanvasView: CanvasView;
    setCanvasView: React.Dispatch<React.SetStateAction<CanvasView>>;
    simulationResult: SimulationResult;
  }
){

  const [stateGhostNodes, setGhostNodes] = useState<AppNode[]>([]);
  const [stateSelectedNodeID, setSelectedNodeID] = useState<string | null>(null);
  const [stateSelectedEdgeID, setSelectedEdgeID] = useState<string | null>(null);
  const { screenToFlowPosition } = useReactFlow();

  const showNotification = useNotification();
  const { theme } = useTheme();

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

  const nodesWithOverlay = stateNodes.map((node) => {

    const nodeResult = simulationResult.perNode.find((result) => result.nodeId === node.id);

    return {
      ...node,
      data: {
        ...node.data,
        isSelected: node.id === stateSelectedNodeID,
        canvasView: stateCanvasView,
        nodeMetric: nodeResult == null ? undefined : {
          costUSD: nodeResult.costUSD,
          peakWorkloadRps: nodeResult.peakWorkloadRps,
          capacity: nodeResult.capacity
        }
      }
    };

  });

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
        nodes={[...nodesWithOverlay, ...stateGhostNodes]}
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
        colorMode={theme}
        elementsSelectable={false}
      >
        <Background variant={BackgroundVariant.Lines} gap={20} color="var(--border)" />
      </ReactFlow>
      <div className="canvasTopRightControls">
        <ViewLayerSwitcher canvasView={stateCanvasView} setCanvasView={setCanvasView} />
        <ThemeToggle />
      </div>
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
