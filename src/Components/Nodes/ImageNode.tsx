import { Handle, Position } from '@xyflow/react';
import '../../styles/ImageNode.css';

const CAPACITY_STATUS_ICON: Record<string, string> = {
    ok: '✓',
    warning: '~',
    critical: '⚠',
    not_applicable: '',
};

function formatBadge(data: any): { text: string, className: string, title?: string } | null {

    if(data.nodeMetric == null){
        return null;
    }

    if(data.canvasView === 'cost'){

        const costUSD: number = data.nodeMetric.costUSD;
        const savingsUSD: number = data.nodeMetric.freeTierSavingsUSD ?? 0;

        if(savingsUSD <= 0){
            return { text: `$${costUSD.toFixed(2)}`, className: 'imageNodeBadge-cost' };
        }

        const text = costUSD === 0
            ? `$0.00 (free tier)`
            : `$${costUSD.toFixed(2)} (-$${savingsUSD.toFixed(2)} free tier)`;

        return {
            text,
            className: 'imageNodeBadge-cost imageNodeBadge-cost-freeTier',
            title: `Saved $${savingsUSD.toFixed(2)} via AWS's always-free tier this period.`
        };

    }

    if(data.canvasView === 'capacity'){

        const capacity = data.nodeMetric.capacity;

        if(capacity.status === 'not_applicable'){
            return { text: 'auto-scales', className: 'imageNodeBadge-capacity-na', title: capacity.message };
        }

        const icon = CAPACITY_STATUS_ICON[capacity.status] ?? '';
        const text = `${icon} ${Math.round(capacity.peakUtilizationPercent ?? 0)}% cap.`;
        const title = [capacity.message, capacity.recommendation].filter(Boolean).join(' ');

        return { text, className: `imageNodeBadge-capacity-${capacity.status}`, title };

    }

    return null;

}

function imageNode({ data, isConnectable }: { data: any; isConnectable: boolean }) {

    const badge = formatBadge(data);

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
                    badge != null &&
                    <div className={`imageNodeBadge ${badge.className}`} title={badge.title}>{badge.text}</div>
                }
            </div>

            <Handle type="source" position={Position.Right} isConnectable={isConnectable} />
        </>
    );
}

export default imageNode;
