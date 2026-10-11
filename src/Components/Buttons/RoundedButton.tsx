import '../../styles/RoundedButton.css'

export default function RoundedButton({ onClickHandler, buttonText }: { onClickHandler: () => void; buttonText: string }){

    return(
        <div 
            className="roundedButton" 
            onClick={onClickHandler}
        >
            {buttonText}
        </div>

    )

}