import { useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import type { AppEdge, AppNode, Service } from '../types.ts';
import Sidebar from './Sidebar.tsx';
import Canvas from './Canvas.tsx';
import LoadWidget from './Widgets/LoadSaveWidget.tsx';
import NotificationProvider from '../Providers/NotificationProvider.tsx';
import '../styles/Layout.css';
import SaveWidget from './Widgets/SaveWidget.tsx';
import TerraformWidget from './Widgets/TerraformWidget.tsx';
import ConfirmationProvider from '../Providers/ConfirmationProvider.tsx';

export default function Layout() {

    const [stateSelectedService, setSelectedService] = useState<Service | null>(null);
    const [stateNodes, setNodes] = useState<AppNode[]>([]);
    const [stateEdges, setEdges] = useState<AppEdge[]>([]);
    const [stateDeploymentSettings, setDeploymentSettings] = useState<Record<string, any>>({});
    const [stateShowLoadWidget, setShowLoadWidget] = useState<boolean>(false);
    const [stateShowSaveWidget, setShowSaveWidget] = useState<boolean>(false);
    const [stateShowTerraformWidget, setShowTerraformWidget] = useState<boolean>(false);
    const [stateLoadedSaveName, setLoadedSaveName] = useState<string | null>(null);


    return (
        <NotificationProvider>
            <ConfirmationProvider>
                <div className="layout">

                    <Sidebar 
                        stateSelectedService={stateSelectedService} 
                        setSelectedService={setSelectedService}
                        setShowLoadWidget={setShowLoadWidget}
                        setShowSaveWidget={setShowSaveWidget}
                        setShowTerraformWidget={setShowTerraformWidget}
                    />
                    <ReactFlowProvider>
                        <Canvas 
                            stateSelectedService={stateSelectedService} 
                            setSelectedService={setSelectedService}
                            stateNodes={stateNodes}
                            setNodes={setNodes}
                            stateEdges={stateEdges}
                            setEdges={setEdges}
                        />
                    </ReactFlowProvider>

                    {
                        stateShowTerraformWidget && 

                            <TerraformWidget 
                                setShowTerraformWidget={setShowTerraformWidget}
                                stateNodes={stateNodes}
                                setNodes={setNodes}
                                stateEdges={stateEdges}
                                setEdges={setEdges}
                                setDeploymentSettings={setDeploymentSettings}
                            />
                    }
                    
                    {
                        stateShowLoadWidget && 

                            <LoadWidget
                                setShowLoadWidget={setShowLoadWidget}
                                setEdges={setEdges}
                                setNodes={setNodes}
                                setDeploymentSettings={setDeploymentSettings}
                                setLoadedSaveName={setLoadedSaveName}
                            />
                    }

                    {
                        stateShowSaveWidget && 
                            <SaveWidget
                                setShowSaveWidget={setShowSaveWidget}
                                stateLoadedSaveName={stateLoadedSaveName}
                                setLoadedSaveName={setLoadedSaveName}
                                stateNodes={stateNodes}
                                stateEdges={stateEdges}
                                stateDeploymentSettings={stateDeploymentSettings}
                            />
                    }

                </div>
            </ConfirmationProvider>
        </NotificationProvider>
    );
}

