import type { TrafficPoint } from '../../Simulation/trafficProfile';

const WIDTH = 120;
const HEIGHT = 32;

// Non-interactive glance-view of the traffic shape for the collapsed puck -
// deliberately not the full TrafficChart (no axes, no drag, no labels).
export default function TrafficSparkline({ points }: { points: TrafficPoint[] }){

    if(points.length === 0){
        return null;
    }

    const maxRps = Math.max(1, ...points.map((point) => point.rps));
    const stepX = points.length > 1 ? WIDTH / (points.length - 1) : 0;

    const linePath = points
        .map((point, index) => `${index === 0 ? 'M' : 'L'} ${(stepX * index).toFixed(1)} ${(HEIGHT - (point.rps / maxRps) * HEIGHT).toFixed(1)}`)
        .join(' ');

    return (
        <svg className="trafficSparklineSvg" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none">
            <path className="trafficSparklineLine" d={linePath} />
        </svg>
    );

}
