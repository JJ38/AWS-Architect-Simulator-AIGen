import '../styles/ViewLayerSwitcher.css';

export type CanvasView = "normal" | "cost" | "capacity";

const VIEWS: { key: CanvasView; label: string }[] = [
    { key: "normal", label: "Normal" },
    { key: "cost", label: "Cost" },
    { key: "capacity", label: "Capacity" },
];

export default function ViewLayerSwitcher({ canvasView, setCanvasView }: { canvasView: CanvasView; setCanvasView: React.Dispatch<React.SetStateAction<CanvasView>> }){

    return (
        <div className="viewLayerSwitcher">
            {
                VIEWS.map((view) =>
                    <button
                        key={view.key}
                        className={`viewLayerSwitcherButton ${canvasView === view.key ? 'viewLayerSwitcherButtonActive' : ''}`}
                        onClick={() => setCanvasView(view.key)}
                    >
                        {view.label}
                    </button>
                )
            }
        </div>
    );

}
