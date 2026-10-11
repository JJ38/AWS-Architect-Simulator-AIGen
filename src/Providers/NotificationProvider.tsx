import { createContext, useContext, useState } from "react";
import Notification from "../Components/Notification";

const NotificationContext = createContext<((success: boolean, message: string) => void) | null>(null);

export default function NotificationProvider({ children }: {children: React.ReactNode}){

    const [stateShowNotification, setShowNotification] = useState<boolean>(false);
    const [stateNotificationSuccess, setNotificationSuccess] = useState<boolean>(true);
    const [stateNotificationMessage, setNotificationMessage] = useState<string>('');

    const showNotification = (success: boolean, message: string) => {
        
        console.log("success: " + success);
        console.log("message: " + message);


        setShowNotification(true);
        setNotificationSuccess(success);
        setNotificationMessage(message);
        setInterval(() => {setShowNotification(false);}, 8000);

    }

    return( 
        <NotificationContext.Provider value={showNotification}>
            {children}
            {stateShowNotification && <Notification success={stateNotificationSuccess} message={stateNotificationMessage} />}
        </NotificationContext.Provider>
    );

}

//use so you dont have to import both use context and the Notification Context. This acts as a wrapper so only one import is need as well as doing a null check.
export function useNotification(){
    
    const context = useContext(NotificationContext);

    if(context == null){
        throw new Error("useNotification must be used within a NotificationProvider")
    }

    return context;
}
