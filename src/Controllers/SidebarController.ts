import type { AppEdge, AppNode, Service } from "../types";
import { createRightsizingTestDeployment } from "../exampleDeployments/rightsizingTestDeployment";

export class SidebarController{

    private setShowLoadWidget: React.Dispatch<React.SetStateAction<boolean>>;
    private setShowSaveWidget: React.Dispatch<React.SetStateAction<boolean>>;
    private setShowTerraformWidget: React.Dispatch<React.SetStateAction<boolean>>;
    private setSelectedService: React.Dispatch<React.SetStateAction<Service | null>>;
    private setNodes: React.Dispatch<React.SetStateAction<AppNode[]>>;
    private setEdges: React.Dispatch<React.SetStateAction<AppEdge[]>>;
    private showNotification: (success: boolean, message: string) => void;
    private selectedService: Service | null;

    public constructor(
        setShowLoadWidget: React.Dispatch<React.SetStateAction<boolean>>,
        setShowSaveWidget: React.Dispatch<React.SetStateAction<boolean>>,
        selectedService: Service | null,
        setSelectedService: React.Dispatch<React.SetStateAction<Service | null>>,
        setShowTerraformWidget: React.Dispatch<React.SetStateAction<boolean>>,
        setNodes: React.Dispatch<React.SetStateAction<AppNode[]>>,
        setEdges: React.Dispatch<React.SetStateAction<AppEdge[]>>,
        showNotification: (success: boolean, message: string) => void
    ){
        this.setShowLoadWidget = setShowLoadWidget;
        this.setShowSaveWidget = setShowSaveWidget;
        this.setShowTerraformWidget = setShowTerraformWidget;
        this.setSelectedService = setSelectedService;
        this.setNodes = setNodes;
        this.setEdges = setEdges;
        this.showNotification = showNotification;
        this.selectedService = selectedService;
    }

    public handleSaveButtonClick(): void{

        this.setShowSaveWidget(true);
    
    }

    public handleLoadClick(){

        if(this.setShowLoadWidget == null){
            return;
        }
        
        this.setShowLoadWidget(true);
        
    }

    public handleTerraformClick(){

        this.setShowTerraformWidget(true);

    }

    public handleLoadExampleClick(){

        const { nodes, edges } = createRightsizingTestDeployment();

        this.setNodes(nodes);
        this.setEdges(edges);
        this.showNotification(true, "Loaded example: rightsizing test deployment");

    }

    public handleSidebarButtonClick(service: Service): void{

        if(this.setSelectedService == null){
            return;
        }
    
        if(this.selectedService?.name === service.name){
            this.setSelectedService(null);
            return;
        }

        this.setSelectedService(service);

    }


}