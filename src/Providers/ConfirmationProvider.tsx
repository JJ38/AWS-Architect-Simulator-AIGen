import { createContext, useContext, useState } from "react";
import { ConfirmationWidgetController } from "../Controllers/ConfirmationWidgetController";
import ConfirmationWidget from "../Components/Widgets/ConfirmationWidget";

const ConfirmationContext = createContext<(() => void) | null>(null);

export default function ConfirmationProvider({ children }: {children: React.ReactNode}){

    const [stateShowConfirmationWidget, setShowConfirmationWidget] = useState<boolean>(false);

    const showNotification = () => {

        setShowConfirmationWidget(true);

    }

    const onNoClick = () => {
        setShowConfirmationWidget(false);
    }

    return( 
        <ConfirmationContext.Provider value={showNotification}>
            {children}
            {stateShowConfirmationWidget && <ConfirmationWidget message="Are you sure you want to delete this save?" onNoClick={onNoClick} onYesClick={() => {}}/> }
        </ConfirmationContext.Provider>
    );

}


//use so you dont have to import both use context and the Notification Context. This acts as a wrapper so only one import is need as well as doing a null check.
export function useConfirmation(){
    
    const context = useContext(ConfirmationContext);

    if(context == null){
        throw new Error("useConfirmation must be used within a ConfirmationProvider")
    }

    return context;
}
