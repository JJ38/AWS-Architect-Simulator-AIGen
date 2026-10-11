import type { AppEdge, AppNode } from "../types";
import { runSimulation } from "../Simulation/simulate";
import type { SimulationResult } from "../Simulation/simulate";

export class CostWidgetController{

    private setShowCostWidget: React.Dispatch<React.SetStateAction<boolean>>;
    private showNotification: (success: boolean, message: string) => void;

    public constructor(setShowCostWidget: React.Dispatch<React.SetStateAction<boolean>>, showNotification: (success: boolean, message: string) => void){
        this.setShowCostWidget = setShowCostWidget;
        this.showNotification = showNotification;
    }

    public handleCancelClick(){
        this.setShowCostWidget(false);
    }

    public handleRunSimulation(stateNodes: AppNode[], stateEdges: AppEdge[], entryRps: number): SimulationResult | null{

        if(stateNodes.length === 0){
            this.showNotification(false, "Add a service to run a cost simulation");
            return null;
        }

        return runSimulation(stateNodes, stateEdges, entryRps);

    }

}
