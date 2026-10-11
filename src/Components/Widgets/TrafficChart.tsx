import { useRef, useState } from 'react';
import '../../styles/TrafficChart.css';
import type { TrafficPoint } from '../../Simulation/trafficProfile';

const VIEWBOX_WIDTH = 760;
const VIEWBOX_HEIGHT = 220;
const MARGIN = { top: 20, right: 16, bottom: 24, left: 44 };
const PLOT_WIDTH = VIEWBOX_WIDTH - MARGIN.left - MARGIN.right;
const PLOT_HEIGHT = VIEWBOX_HEIGHT - MARGIN.top - MARGIN.bottom;

function niceCeiling(value: number): number{

    if(value <= 0){
        return 10;
    }

    const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
    const normalized = value / magnitude;

    let step = 10;
    if(normalized <= 1){ step = 1; }
    else if(normalized <= 2){ step = 2; }
    else if(normalized <= 5){ step = 5; }

    return step * magnitude;

}

function screenToSvgY(svg: SVGSVGElement, clientY: number): number{

    const point = svg.createSVGPoint();
    point.x = 0;
    point.y = clientY;

    const matrix = svg.getScreenCTM();
    if(matrix == null){
        return 0;
    }

    return point.matrixTransform(matrix.inverse()).y;

}

export default function TrafficChart({ points, onChange }: { points: TrafficPoint[]; onChange: (index: number, newRps: number) => void }){

    const svgRef = useRef<SVGSVGElement | null>(null);
    const [stateDraggingIndex, setDraggingIndex] = useState<number | null>(null);
    const [stateHoverIndex, setHoverIndex] = useState<number | null>(null);
    // The y-domain is derived from the data, which includes whatever point is
    // currently being dragged - recomputing it on every pointermove would feed
    // the dragged value back into its own scale (drag up a little -> domain
    // grows -> the same cursor position now maps to an even bigger value ->
    // domain grows again). Freezing the domain for the duration of a drag
    // gesture breaks that loop; it's free to rescale once the gesture ends.
    const [stateDragDomainMax, setDragDomainMax] = useState<number | null>(null);

    const maxRps = Math.max(1, ...points.map((point) => point.rps));
    const liveDomainMax = niceCeiling(maxRps * 1.2);
    const yDomainMax = stateDragDomainMax ?? liveDomainMax;

    const stepX = points.length > 1 ? PLOT_WIDTH / (points.length - 1) : 0;

    function xForIndex(index: number): number{
        return MARGIN.left + stepX * index;
    }

    function yForRps(rps: number): number{
        return MARGIN.top + PLOT_HEIGHT * (1 - rps / yDomainMax);
    }

    function rpsForY(y: number): number{

        const fraction = 1 - (y - MARGIN.top) / PLOT_HEIGHT;
        const rps = fraction * yDomainMax;
        // Allow dragging above the current top gridline (that's how you grow
        // the domain), but cap it so an errant mouse jump outside the SVG
        // can't set an absurd value.
        return Math.max(0, Math.min(Math.round(rps * 10) / 10, yDomainMax * 3));

    }

    function handlePointerDown(index: number, event: React.PointerEvent){

        event.currentTarget.setPointerCapture(event.pointerId);
        setDraggingIndex(index);
        setDragDomainMax(liveDomainMax);

    }

    function handlePointerMove(event: React.PointerEvent<SVGSVGElement>){

        if(stateDraggingIndex == null || svgRef.current == null){
            return;
        }

        const newRps = rpsForY(screenToSvgY(svgRef.current, event.clientY));
        onChange(stateDraggingIndex, newRps);

    }

    function handlePointerUp(){
        setDraggingIndex(null);
        setDragDomainMax(null);
    }

    const linePath = points
        .map((point, index) => `${index === 0 ? 'M' : 'L'} ${xForIndex(index)} ${yForRps(point.rps)}`)
        .join(' ');

    const areaPath = points.length > 0
        ? `${linePath} L ${xForIndex(points.length - 1)} ${MARGIN.top + PLOT_HEIGHT} L ${xForIndex(0)} ${MARGIN.top + PLOT_HEIGHT} Z`
        : '';

    const peakIndex = points.reduce((peak, point, index) => (points[peak] == null || point.rps > points[peak].rps) ? index : peak, 0);

    // Guidance calls for a >=24px hit target per draggable point, but at 31
    // points the spacing between them is often well under that - an
    // uncapped 24px circle would make adjacent points impossible to grab
    // independently, so the hit radius is capped to half the point spacing.
    const hitRadius = Math.max(6, Math.min(12, stepX / 2));

    // Four horizontal gridlines at round fractions of the y domain.
    const gridlineFractions = [0, 0.25, 0.5, 0.75, 1];

    // Label every ~5th day to avoid x-axis clutter at 31 points.
    const xLabelStride = Math.max(1, Math.ceil(points.length / 7));

    return (
        <svg
            ref={svgRef}
            className="trafficChartSvg"
            viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
        >
            {
                gridlineFractions.map((fraction) => {

                    const y = MARGIN.top + PLOT_HEIGHT * (1 - fraction);
                    const value = Math.round(yDomainMax * fraction);

                    return (
                        <g key={fraction}>
                            <line
                                className="trafficChartGridline"
                                x1={MARGIN.left}
                                x2={VIEWBOX_WIDTH - MARGIN.right}
                                y1={y}
                                y2={y}
                            />
                            <text className="trafficChartAxisLabel" x={MARGIN.left - 8} y={y} textAnchor="end" dominantBaseline="middle">
                                {value}
                            </text>
                        </g>
                    );

                })
            }

            {
                points.map((point, index) => {

                    if(index % xLabelStride !== 0 && index !== points.length - 1){
                        return null;
                    }

                    return (
                        <text
                            key={point.label}
                            className="trafficChartAxisLabel"
                            x={xForIndex(index)}
                            y={VIEWBOX_HEIGHT - MARGIN.bottom + 16}
                            textAnchor="middle"
                        >
                            {point.label.replace('Day ', '')}
                        </text>
                    );

                })
            }

            <path className="trafficChartArea" d={areaPath} />
            <path className="trafficChartLine" d={linePath} />

            {
                points.map((point, index) => {

                    const cx = xForIndex(index);
                    const cy = yForRps(point.rps);
                    const isActive = stateDraggingIndex === index || stateHoverIndex === index;
                    const isPeak = index === peakIndex;

                    return (
                        <g key={point.label}>
                            {
                                isPeak &&
                                <text className="trafficChartPeakLabel" x={cx} y={cy - 12} textAnchor="middle">
                                    {point.rps} req/s
                                </text>
                            }
                            {
                                isActive &&
                                <text className="trafficChartDragLabel" x={cx} y={cy - 12} textAnchor="middle">
                                    {point.rps} req/s
                                </text>
                            }
                            <circle
                                className={`trafficChartPoint ${isActive ? 'trafficChartPointActive' : ''}`}
                                cx={cx}
                                cy={cy}
                                r={4}
                            />
                            {/* Hit circle renders last (on top in SVG z-order) so it
                                receives the pointer events instead of the small visible
                                dot underneath it - a transparent fill still participates
                                in hit-testing, it just doesn't paint anything. */}
                            <circle
                                className="trafficChartPointHit"
                                cx={cx}
                                cy={cy}
                                r={hitRadius}
                                onPointerDown={(event) => handlePointerDown(index, event)}
                                onPointerEnter={() => setHoverIndex(index)}
                                onPointerLeave={() => setHoverIndex(null)}
                            />
                        </g>
                    );

                })
            }

        </svg>
    );

}
