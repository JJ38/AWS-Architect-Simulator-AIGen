import '../../styles/SidebarButton.css';

export default function SidebarButton({ serviceName, serviceDescription, serviceImg, isSelected, onClick }: { serviceName: string; serviceDescription: string; serviceImg: string; isSelected: boolean; onClick: () => void }) {
    return (
        <div className="sidebarButton" onClick={onClick}>
            { <div className="sidebarButtonIcon">
                <img className={`sidebarButtonIconImg ${isSelected ? 'selectedSidebarButton' : ''}`} src={serviceImg} alt={serviceName} />
            </div> }
            {/* <span className="toolTip">{serviceDescription}</span>  */}
        </div>
    )
}