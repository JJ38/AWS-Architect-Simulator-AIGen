import { useState } from 'react';
import { Trash2, X } from 'lucide-react';
import { LoadSaveWidgetController } from '../../Controllers/LoadSaveWidgetController';
import { useNotification } from '../../Providers/NotificationProvider';
import '../../styles/LoadSaveWidget.css'
import RoundedButton from '../Buttons/RoundedButton'
import IconButton from '../Buttons/IconButton'
import SavePill from '../SavePill';
import { useConfirmation } from '../../Providers/ConfirmationProvider';
import type { AppEdge, AppNode } from '../../types';

export default function LoadWidget(
    { 
        setShowLoadWidget, 
        setEdges, 
        setNodes,
        setDeploymentSettings, 
        setLoadedSaveName 
    }
        : 
    {
        setShowLoadWidget: React.Dispatch<React.SetStateAction<boolean>>; 
        setEdges: React.Dispatch<React.SetStateAction<AppEdge[]>>; 
        setNodes: React.Dispatch<React.SetStateAction<AppNode[]>>;
        setDeploymentSettings: React.Dispatch<React.SetStateAction<Record<string,any>>>; 
        setLoadedSaveName: React.Dispatch<React.SetStateAction<string | null>>
    }){

    const showNotification = useNotification();
    const showConfirmation = useConfirmation();

    const [stateSelectedSave, setSelectedSave] = useState<string | null>(null);
    const [stateLoadSaveWidgetController] = useState(() => new LoadSaveWidgetController(setShowLoadWidget, showNotification, showConfirmation, setEdges, setNodes, setLoadedSaveName));

    return(

        <div className="loadSaveWidgetWrapper">

            <div className='savePillsWrapper'>

                {
                    stateLoadSaveWidgetController.model.saveKeys.map((key) => (
                        <SavePill
                            saveName={key}
                            isSelected={stateSelectedSave === key}
                            onClickHandler={() => setSelectedSave(key)}
                            key={key} 
                        />
                    ))
            
                }

            </div>

            <div className="loadSaveWidgetButtonWrapper">

                <IconButton
                    onClickHandler={() => stateLoadSaveWidgetController.handleCancelClick()}
                    icon={X}
                    label='Cancel'
                />

                <IconButton
                    onClickHandler={() => stateLoadSaveWidgetController.handleDeleteClick(stateSelectedSave)}
                    icon={Trash2}
                    label='Delete selected save'
                />

                <RoundedButton
                    onClickHandler={() => stateLoadSaveWidgetController.handleLoadClick(stateSelectedSave)}
                    buttonText='Load'
                />

            </div>

        </div>
    )

}