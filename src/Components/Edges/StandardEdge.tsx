import { BaseEdge, getSmoothStepPath, Position } from '@xyflow/react';
import '../../styles/StandardEdge.css';
import type { EdgeData } from '../../types';
 

//deconstruct to get types and animation working
export function StandardEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: {
  id: string,
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  sourcePosition: Position,
  targetPosition: Position,
  data: EdgeData | undefined,
}) {
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  
  return (
    <>
      <BaseEdge id={id} path={edgePath} className={`standardEdge`}/>
      <BaseEdge id={`${id}-pulse`} path={edgePath} interactionWidth={0} className={`standardEdge-pulse standardEdge-${data?.componentProperties.behaviour.edgeType.value}`}/>
    </>
  );
}