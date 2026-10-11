import '../../styles/ConfirmationWidget.css'
import RoundedButton from '../Buttons/RoundedButton'

export default function ConfirmationWidget({ message, onNoClick, onYesClick }: { message: string; onNoClick: () => void, onYesClick: () => void }){

    return(

        <div className="saveWidgetWrapper">

            <p className="confirmationWidgetMessage">{message}</p>

            <div className="saveWidgetButtonWrapper">

                <RoundedButton
                    onClickHandler={onYesClick}
                    buttonText='Yes'
                />
                
               <RoundedButton
                    onClickHandler={onNoClick}
                    buttonText='No'
                />

            </div>

        </div>
    )

}