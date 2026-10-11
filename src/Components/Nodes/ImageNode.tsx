import { Handle, Position } from '@xyflow/react';
import '../../styles/ImageNode.css';

function imageNode({ data, isConnectable }: { data: any; isConnectable: boolean }) {

    return (
        <>
        
            <Handle
                type="target"
                position={Position.Left}
                onConnect={(params) => console.log('handle onConnect', params)}
                isConnectable={isConnectable}
            />
                <img className={`imageNodeWrapper ${data.isSelected ? "selectedNode" : "imageNode"}`} src={data.service?.image} alt={data.service?.description} />

            <Handle type="source" position={Position.Right} isConnectable={isConnectable} />
        </>
    );
}

export default imageNode;
