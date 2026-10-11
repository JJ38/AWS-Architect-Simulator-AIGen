import '../styles/SavePill.css'

export default function SavePill({saveName, isSelected, onClickHandler}: {saveName: String; isSelected: boolean; onClickHandler: () => void}){

    return(

        <div className={`savePill ${isSelected && 'selectedSave'}`} onClick={() => onClickHandler()}>
            <p>{saveName}</p>
        </div>

    )

}
