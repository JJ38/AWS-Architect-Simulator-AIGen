import { useState } from 'react';
import type { Edge, Node } from '@xyflow/react';
import { useNotification } from '../../Providers/NotificationProvider';
import { SaveWidgetController } from '../../Controllers/SaveWidgetController';
import '../../styles/SaveWidget.css'
import RoundedButton from '../Buttons/RoundedButton'
import type { AppEdge, AppNode } from '../../types';

export default function SaveWidget({ 
    setShowSaveWidget, 
    stateLoadedSaveName, 
    setLoadedSaveName, 
    stateNodes, 
    stateEdges,
    stateDeploymentSettings 
}
    : 
{
    setShowSaveWidget: React.Dispatch<React.SetStateAction<boolean>>; 
    stateLoadedSaveName: string | null; 
    setLoadedSaveName: React.Dispatch<React.SetStateAction<string | null>>; 
    stateNodes: AppNode[], 
    stateEdges: AppEdge[],
    stateDeploymentSettings: Record<string, any>
}){

    const showNotification = useNotification();
    const [stateSelectedSave, setSelectedSave] = useState<string | null>(null);
    const [stateSaveWidgetController] = useState(() => new SaveWidgetController(setShowSaveWidget, showNotification));
    console.log(stateSelectedSave)
    return(

        <div className="saveWidgetWrapper">

            <div className="saveWidgetButtonWrapper">

                <RoundedButton
                    onClickHandler={() => stateSaveWidgetController.handleCancelClick()}
                    buttonText='Cancel'
                />
                
                {

                    stateLoadedSaveName &&

                    <RoundedButton
                        onClickHandler={() => stateSaveWidgetController.handleSaveClick(stateLoadedSaveName, stateNodes, stateEdges, stateDeploymentSettings)}
                        buttonText='Save'
                    />

                }

                <RoundedButton
                    onClickHandler={() => stateSaveWidgetController.handleSaveAsClick(stateNodes, stateEdges, stateDeploymentSettings, setLoadedSaveName)}
                    buttonText='Save As'
                />

            </div>

        </div>
    )

}