import { useState } from 'react';
import type { Service } from '../types.ts';
import { SidebarController } from '../Controllers/SidebarController.ts';
import { useNotification } from '../Providers/NotificationProvider.tsx';
import { services } from '../constants.ts';
import SidebarButton from './Buttons/ServiceButton.tsx';
import '../styles/Sidebar.css';


export default function Sidebar(
    {
        stateSelectedService,
        setSelectedService,
        setShowLoadWidget,
        setShowSaveWidget,
        setShowTerraformWidget
    }
        :
    {
        stateSelectedService: Service | null;
        setSelectedService: React.Dispatch<React.SetStateAction<Service | null>>;
        setShowLoadWidget: React.Dispatch<React.SetStateAction<boolean>>;
        setShowSaveWidget: React.Dispatch<React.SetStateAction<boolean>>;
        setShowTerraformWidget: React.Dispatch<React.SetStateAction<boolean>>;
    }
){

    const showNotification = useNotification();
    const [stateSidebarController] = useState(() => new SidebarController(setShowLoadWidget, setShowSaveWidget, stateSelectedService, setSelectedService, setShowTerraformWidget, showNotification));


    return  <div className="sidebar">

                <div>

                    {
                        Object.keys(services).map((key) => 
                            <SidebarButton 
                                serviceName={services[key].name} 
                                serviceDescription={services[key].description} 
                                serviceImg={services[key].icon} 
                                key={services[key].name} 
                                isSelected={stateSelectedService?.name === services[key].name}
                                onClick={() => stateSidebarController.handleSidebarButtonClick(services[key])}
                            />
                        )
                    }

                </div>


                <div>
                    <SidebarButton  
                        serviceName={"Terraform"} 
                        serviceDescription={"Convert to terraform"} 
                        serviceImg={"terraform_wired.svg"} 
                        key={"Terraform"} 
                        isSelected={false}
                        onClick={() => stateSidebarController.handleTerraformClick()}
                    />

                    <SidebarButton  
                        serviceName={"Load"} 
                        serviceDescription={"Load"} 
                        serviceImg={"load_icon.svg"} 
                        key={"Load"} 
                        isSelected={false}
                        onClick={() => stateSidebarController.handleLoadClick()}
                    />

                    <SidebarButton  
                        serviceName={"Save"} 
                        serviceDescription={"Save"} 
                        serviceImg={"save_icon.svg"} 
                        key={"Save"} 
                        isSelected={false}
                        onClick={() => stateSidebarController.handleSaveButtonClick()}
                    />
                </div>

            </div>;
  
}

