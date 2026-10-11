import type { Edge, Node } from "@xyflow/react";
import type { AppEdge, AppNode } from "../types";

export class SaveWidgetController{

    private setShowSaveWidget: React.Dispatch<React.SetStateAction<boolean>>;
    private showNotification: (success: boolean, message: string) => void;

    public constructor(setShowSaveWidget: React.Dispatch<React.SetStateAction<boolean>>, showNotification: (success: boolean, message: string) => void){
        this.setShowSaveWidget = setShowSaveWidget;
        this.showNotification = showNotification;
    }

    public handleCancelClick(){
        console.log("cancel clicked");
        this.setShowSaveWidget(false);
    }

    public handleSaveClick(stateLoadedSaveName: string | null, stateNodes: AppNode[], stateEdges: AppEdge[], stateDeploymentSettings: Record<string,any>){

        console.log(stateLoadedSaveName);
        this.save(stateLoadedSaveName, stateNodes, stateEdges, stateDeploymentSettings);
        this.setShowSaveWidget(false);

    }

    public handleSaveAsClick(stateNodes: AppNode[], stateEdges: AppEdge[], stateDeploymentSettings: Record<string,any>, setLoadedSaveName: React.Dispatch<React.SetStateAction<string | null>>){

        const saveName = window.prompt("Enter a name for this save:");
        const saveSuccessful = this.save(saveName, stateNodes, stateEdges, stateDeploymentSettings);

        if(saveSuccessful){
            setLoadedSaveName(saveName!);
        }

        this.setShowSaveWidget(false);

    }


    private save(saveName: string | null, stateNodes: AppNode[], stateEdges: AppEdge[], stateDeploymentSettings: Record<string, any>): boolean{

        if(saveName === "" || saveName === null || saveName === undefined){
            this.showNotification(false, "Error - invalid save name");
            return false;
        }

        const save = {
            nodes: stateNodes,
            edges: stateEdges,
            deployment: stateDeploymentSettings,
        }

        try{

            const JSONSave = JSON.stringify(save);
            localStorage.setItem(saveName!, JSONSave);

        }catch (error){

            console.log(error);
            this.showNotification(false, "Error saving " + saveName);
            return false;

        }

        this.showNotification(true, saveName + " saved successfully");
        return true;

    }

}