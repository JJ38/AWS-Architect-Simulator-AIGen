import type { Service } from "../types";

export class SidebarController{

    private setShowLoadWidget: React.Dispatch<React.SetStateAction<boolean>>;
    private setShowSaveWidget: React.Dispatch<React.SetStateAction<boolean>>;
    private setShowTerraformWidget: React.Dispatch<React.SetStateAction<boolean>>;
    private setSelectedService: React.Dispatch<React.SetStateAction<Service | null>>;
    private selectedService: Service | null;
    private showNotification: (success: boolean, message: string) => void;

    public constructor(setShowLoadWidget: React.Dispatch<React.SetStateAction<boolean>>, setShowSaveWidget: React.Dispatch<React.SetStateAction<boolean>>, selectedService: Service | null, setSelectedService: React.Dispatch<React.SetStateAction<Service | null>>, setShowTerraformWidget: React.Dispatch<React.SetStateAction<boolean>>, showNotification: (success: boolean, message: string) => void){
        this.setShowLoadWidget = setShowLoadWidget;
        this.setShowSaveWidget = setShowSaveWidget;
        this.setShowTerraformWidget = setShowTerraformWidget;
        this.setSelectedService = setSelectedService;
        this.selectedService = selectedService;
        this.showNotification = showNotification;
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