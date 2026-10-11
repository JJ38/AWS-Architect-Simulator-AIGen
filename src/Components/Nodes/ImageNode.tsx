import { Handle, Position } from '@xyflow/react';
import '../../styles/ImageNode.css';

function formatBadgeText(data: any): string | null {

    if(data.canvasView === 'cost' && data.nodeMetric != null){
        return `$${data.nodeMetric.costUSD.toFixed(2)}`;
    }

    if(data.canvasView === 'capacity' && data.nodeMetric != null){
        const warningMarker = data.nodeMetric.hasWarning ? ' ⚠' : '';
        return `${data.nodeMetric.peakWorkloadRps.toFixed(1)} req/s${warningMarker}`;
    }

    return null;

}

function imageNode({ data, isConnectable }: { data: any; isConnectable: boolean }) {

    const badgeText = formatBadgeText(data);

    return (
        <>

            <Handle
                type="target"
                position={Position.Left}
                onConnect={(params) => console.log('handle onConnect', params)}
                isConnectable={isConnectable}
            />
            <div className="imageNodeOuter">
                <img className={`imageNodeWrapper ${data.isSelected ? "selectedNode" : "imageNode"}`} src={data.service?.image} alt={data.service?.description} />
                {
                    badgeText != null &&
                    <div className={`imageNodeBadge imageNodeBadge-${data.canvasView}`}>{badgeText}</div>
                }
            </div>

            <Handle type="source" position={Position.Right} isConnectable={isConnectable} />
        </>
    );
}

export default imageNode;
