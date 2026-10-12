import { useState } from "react";
import { ExternalLink, Minimize2, PanelLeft, PanelRight } from "lucide-react";
import { TrafficPuckController } from "../../Controllers/TrafficPuckController";
import type { TrafficPuckMode } from "../../Controllers/TrafficPuckController";
import RoundedButton from "../Buttons/RoundedButton";
import IconButton from "../Buttons/IconButton";
import TrafficChart from "./TrafficChart";
import TrafficSparkline from "./TrafficSparkline";
import '../../styles/TrafficPuck.css';
import type { NodeSimulationResult, SimulationResult } from "../../Simulation/simulate";
import {
    DEFAULT_PERIOD_DAYS,
    averageRps,
    createFlatProfile,
    createRampProfile,
    createSpikeProfile,
    createWeeklyCycleProfile,
    peakPoint,
} from "../../Simulation/trafficProfile";
import type { TrafficProfile } from "../../Simulation/trafficProfile";

const MAX_DAY_RANGES_SHOWN = 8;

// Collapses consecutive "Day N" labels into ranges ("Day 21-27" instead of
// "Day 21, Day 22, ..., Day 27") - matters most for a resource that's
// undersized for the whole period, where listing every day individually
// buries the one-line point ("every day") in noise. Falls back to a plain,
// capped list for labels that aren't "<prefix><number>" shaped.
function formatDayRanges(labels: string[]): string{

    if(labels.length === 0){
        return "";
    }

    const parsed = labels.map((label) => {
        const match = label.match(/^(.*?)(\d+)$/);
        return match ? { prefix: match[1], num: parseInt(match[2], 10) } : null;
    });

    const prefix = parsed[0]?.prefix;
    const allConsistentlyNumbered = parsed.every((entry) => entry != null && entry.prefix === prefix);

    if(!allConsistentlyNumbered){
        return labels.slice(0, 6).join(", ") + (labels.length > 6 ? ` +${labels.length - 6} more` : "");
    }

    const sortedNumbers = parsed.map((entry) => entry!.num).sort((a, b) => a - b);
    const ranges: string[] = [];
    let rangeStart = sortedNumbers[0];
    let rangeEnd = sortedNumbers[0];

    for(let i = 1; i <= sortedNumbers.length; i++){

        const current = sortedNumbers[i];

        if(current === rangeEnd + 1){
            rangeEnd = current;
            continue;
        }

        ranges.push(rangeStart === rangeEnd ? `${prefix}${rangeStart}` : `${prefix}${rangeStart}–${rangeEnd}`);

        if(current != null){
            rangeStart = current;
            rangeEnd = current;
        }

    }

    if(ranges.length > MAX_DAY_RANGES_SHOWN){
        return ranges.slice(0, MAX_DAY_RANGES_SHOWN).join(", ") + ` +${ranges.length - MAX_DAY_RANGES_SHOWN} more`;
    }

    return ranges.join(", ");

}

// build() takes the period length so the same shape can be regenerated at a
// different length (see PERIOD_PRESETS) - e.g. re-applying "Holiday spike"
// at 90 days instead of 31 without losing the spike shape.
const PRESETS: { label: string; build: (days: number) => TrafficProfile }[] = [
    { label: "Flat", build: (days) => createFlatProfile(days, 10) },
    { label: "Ramp up", build: (days) => createRampProfile(days, 5, 40) },
    { label: "Weekly cycle", build: (days) => createWeeklyCycleProfile(days, 10, 2.5) },
    // Keep the peak at the same relative position (~74% through) regardless
    // of period length, not fixed at day 23.
    { label: "Holiday spike", build: (days) => createSpikeProfile(days, 8, 60, Math.round(days * (23 / DEFAULT_PERIOD_DAYS))) },
];

const PERIOD_PRESETS: { label: string; days: number }[] = [
    { label: "1 week", days: 7 },
    { label: "1 month", days: DEFAULT_PERIOD_DAYS },
    { label: "3 months", days: 90 },
    { label: "1 year", days: 365 },
];

const CAPACITY_STATUS_ICON: Record<string, string> = {
    ok: "✓",
    warning: "~",
    critical: "⚠",
};

function CapacityBadge({ capacity }: { capacity: NodeSimulationResult["capacity"] }){

    if(capacity.status === "not_applicable"){
        return <span className="trafficPuckCapacityBadge trafficPuckCapacityBadge-na" title={capacity.message}>auto</span>;
    }

    const icon = CAPACITY_STATUS_ICON[capacity.status] ?? "";
    const utilization = Math.round(capacity.peakUtilizationPercent ?? 0);

    return (
        <span className={`trafficPuckCapacityBadge trafficPuckCapacityBadge-${capacity.status}`} title={capacity.message}>
            {icon} {utilization}%
        </span>
    );

}

function RightsizingPanel({ simulationResult }: { simulationResult: SimulationResult }){

    const sizedNodes = simulationResult.perNode.filter((node) => node.capacity.status !== "not_applicable");
    const issues = simulationResult.perNode
        .filter((node) => node.capacity.status === "critical" || node.capacity.status === "warning")
        .sort((a, b) => (a.capacity.status === "critical" ? 0 : 1) - (b.capacity.status === "critical" ? 0 : 1));

    return (
        <div className="trafficPuckRightsizing">

            <h4 className="trafficPuckRightsizingTitle">Rightsizing</h4>

            {
                sizedNodes.length === 0 &&
                <p className="trafficPuckRightsizingEmpty">
                    Nothing to size yet — add an EC2 instance or a provisioned DynamoDB table to see recommendations here.
                </p>
            }

            {
                sizedNodes.length > 0 && issues.length === 0 &&
                <p className="trafficPuckRightsizingOk">
                    ✓ All {sizedNodes.length} sized resource{sizedNodes.length === 1 ? "" : "s"} look adequately provisioned for this traffic profile.
                </p>
            }

            {
                issues.length > 0 &&
                <>
                    <p className="trafficPuckRightsizingSummary">
                        {issues.length} of {sizedNodes.length} sized resource{sizedNodes.length === 1 ? "" : "s"} need attention:
                    </p>
                    <ul className="trafficPuckRightsizingList">
                        {
                            issues.map((node) =>
                                <li key={node.nodeId} className={`trafficPuckRightsizingCard trafficPuckRightsizingCard-${node.capacity.status}`}>
                                    <div className="trafficPuckRightsizingCardHeader">
                                        <span className="trafficPuckRightsizingCardService">{node.serviceName}</span>
                                        <span className="trafficPuckRightsizingCardNode">{node.nodeId}</span>
                                    </div>
                                    <p className="trafficPuckRightsizingCardMessage">{node.capacity.message}</p>
                                    {
                                        node.capacity.recommendation &&
                                        <p className="trafficPuckRightsizingCardRecommendation">{node.capacity.recommendation}</p>
                                    }
                                    {
                                        node.capacity.exceededDayLabels && node.capacity.exceededDayLabels.length > 0 &&
                                        <p className="trafficPuckRightsizingCardDays">
                                            Over capacity on: {formatDayRanges(node.capacity.exceededDayLabels)}
                                        </p>
                                    }
                                    {
                                        node.peakDroppedRps > 0 && node.hasDownstreamEdges &&
                                        <p className="trafficPuckRightsizingCardImpact">
                                            ~{node.peakDroppedRps.toFixed(1)} req/s at peak can't be forwarded downstream — every service after this one in the diagram sees reduced traffic (and cost) as a result.
                                        </p>
                                    }
                                </li>
                            )
                        }
                    </ul>
                </>
            }

        </div>
    );

}

function CostBreakdownTable({ simulationResult }: { simulationResult: SimulationResult }){

    return (
        <div className="trafficPuckBreakdown">

            {
                simulationResult.warnings.length > 0 &&

                <ul className="trafficPuckWarnings">
                    {
                        simulationResult.warnings.map((warning, index) =>
                            <li key={index}>{warning}</li>
                        )
                    }
                </ul>
            }

            <div className="trafficPuckTableWrapper">
                <table className="trafficPuckTable">
                    <thead>
                        <tr>
                            <th>Service</th>
                            <th>Node</th>
                            <th>avg req/s</th>
                            <th>peak req/s</th>
                            <th>$ / period</th>
                            <th>Capacity</th>
                            <th>Notes</th>
                        </tr>
                    </thead>
                    <tbody>
                        {
                            simulationResult.perNode.map((nodeResult) =>
                                <tr key={nodeResult.nodeId}>
                                    <td>{nodeResult.serviceName}</td>
                                    <td className="trafficPuckTableMono">{nodeResult.nodeId}</td>
                                    <td className="trafficPuckTableMono">{nodeResult.averageWorkloadRps.toFixed(2)}</td>
                                    <td className="trafficPuckTableMono">{nodeResult.peakWorkloadRps.toFixed(2)} ({nodeResult.peakLabel})</td>
                                    <td className="trafficPuckTableMono">${nodeResult.costUSD.toFixed(2)}</td>
                                    <td><CapacityBadge capacity={nodeResult.capacity} /></td>
                                    <td>
                                        {
                                            nodeResult.warnings.map((warning, index) =>
                                                <div key={index} className="trafficPuckRowWarning">{warning}</div>
                                            )
                                        }
                                    </td>
                                </tr>
                            )
                        }
                    </tbody>
                </table>
            </div>

        </div>
    );

}

export default function TrafficPuck(
    {
        stateTrafficProfile,
        setTrafficProfile,
        simulationResult
    }
        :
    {
        stateTrafficProfile: TrafficProfile,
        setTrafficProfile: React.Dispatch<React.SetStateAction<TrafficProfile>>,
        simulationResult: SimulationResult
    }
){

    const [stateMode, setMode] = useState<TrafficPuckMode>("collapsed");
    const [statePuckController] = useState(() => new TrafficPuckController(setMode));
    const [stateShowBreakdown, setShowBreakdown] = useState<boolean>(false);
    // Layout.tsx seeds stateTrafficProfile with createSpikeProfile matching
    // the "Holiday spike" preset below - kept in sync by convention, not a
    // shared constant, since Layout doesn't import PRESETS.
    const [stateActivePresetLabel, setActivePresetLabel] = useState<string>("Holiday spike");

    function handlePointChange(index: number, newRps: number){

        setTrafficProfile((profile) => ({
            points: profile.points.map((point, pointIndex) => pointIndex === index ? { ...point, rps: newRps } : point)
        }));

    }

    function handlePresetClick(preset: { label: string; build: (days: number) => TrafficProfile }){
        setActivePresetLabel(preset.label);
        setTrafficProfile(preset.build(stateTrafficProfile.points.length));
    }

    function handlePeriodClick(days: number){
        const activePreset = PRESETS.find((preset) => preset.label === stateActivePresetLabel) ?? PRESETS[0];
        setTrafficProfile(activePreset.build(days));
    }

    const average = averageRps(stateTrafficProfile);
    const peak = peakPoint(stateTrafficProfile);

    const criticalCount = simulationResult.perNode.filter((node) => node.capacity.status === "critical").length;
    const warningCount = simulationResult.perNode.filter((node) => node.capacity.status === "warning").length;

    if(stateMode === "collapsed"){

        return (
            <div className="trafficPuckCollapsed" onClick={() => statePuckController.handleExpandClick()}>
                {
                    criticalCount > 0 &&
                    <span className="trafficPuckCollapsedAlert trafficPuckCollapsedAlert-critical" title={`${criticalCount} resource${criticalCount === 1 ? "" : "s"} over capacity`}>
                        ⚠ {criticalCount}
                    </span>
                }
                {
                    criticalCount === 0 && warningCount > 0 &&
                    <span className="trafficPuckCollapsedAlert trafficPuckCollapsedAlert-warning" title={`${warningCount} resource${warningCount === 1 ? "" : "s"} close to capacity`}>
                        ~ {warningCount}
                    </span>
                }
                <TrafficSparkline points={stateTrafficProfile.points} />
                <span className="trafficPuckCollapsedTotal">${simulationResult.totalCostUSD.toFixed(0)} / {simulationResult.periodDays}d</span>
            </div>
        );

    }

    const isDocked = stateMode === "docked-left" || stateMode === "docked-right";

    const wrapperClassName = isDocked
        ? `trafficPuckDocked ${stateMode === "docked-left" ? "trafficPuckDockedLeft" : "trafficPuckDockedRight"}`
        : "trafficPuckExpanded";

    return (
        <div className={wrapperClassName}>

            <div className="trafficPuckHeader">

                <h3 className="trafficPuckTitle">Cost &amp; capacity simulation</h3>

                <div className="trafficPuckHeaderButtons">
                    {
                        isDocked
                            ? <IconButton onClickHandler={() => statePuckController.handleUndockClick()} icon={ExternalLink} label='Undock' />
                            : <>
                                <IconButton onClickHandler={() => statePuckController.handleDockLeftClick()} icon={PanelLeft} label='Dock to left side' />
                                <IconButton onClickHandler={() => statePuckController.handleDockRightClick()} icon={PanelRight} label='Dock to right side' />
                              </>
                    }
                    <IconButton onClickHandler={() => statePuckController.handleCollapseClick()} icon={Minimize2} label='Collapse' />
                </div>

            </div>

            <p className="trafficPuckDisclaimer">
                Illustrative estimates (±25%) from a static us-east-1 pricing table, not live AWS pricing.
            </p>

            <div className="trafficPuckPresetRow">
                <span className="trafficPuckPresetLabel">Period:</span>
                {
                    PERIOD_PRESETS.map((period) =>
                        <RoundedButton
                            key={period.label}
                            onClickHandler={() => handlePeriodClick(period.days)}
                            buttonText={period.label}
                        />
                    )
                }
            </div>

            <div className="trafficPuckPresetRow">
                <span className="trafficPuckPresetLabel">Traffic shape:</span>
                {
                    PRESETS.map((preset) =>
                        <RoundedButton
                            key={preset.label}
                            onClickHandler={() => handlePresetClick(preset)}
                            buttonText={preset.label}
                        />
                    )
                }
            </div>

            <p className="trafficPuckChartCaption">
                Traffic (requests/sec) over a {stateTrafficProfile.points.length}-day period - drag a point to edit it.
                Average {average.toFixed(1)} req/s, peak {peak?.rps.toFixed(1) ?? 0} req/s on {peak?.label}.
            </p>

            <TrafficChart points={stateTrafficProfile.points} onChange={handlePointChange} />

            <p className="trafficPuckTotal">
                Total estimated cost: ${simulationResult.totalCostUSD.toFixed(2)} over {simulationResult.periodDays} days
            </p>

            {
                simulationResult.totalFreeTierSavingsUSD > 0 &&
                <p className="trafficPuckFreeTierSavings">
                    Includes ${simulationResult.totalFreeTierSavingsUSD.toFixed(2)} saved via AWS's always-free tier (Lambda, SQS, DynamoDB provisioned capacity)
                </p>
            }

            <RightsizingPanel simulationResult={simulationResult} />

            {
                isDocked &&
                <CostBreakdownTable simulationResult={simulationResult} />
            }

            {
                !isDocked &&

                <>
                    <RoundedButton
                        onClickHandler={() => setShowBreakdown((show) => !show)}
                        buttonText={stateShowBreakdown ? 'Hide cost breakdown' : 'Show cost breakdown'}
                    />
                    {
                        stateShowBreakdown &&
                        <CostBreakdownTable simulationResult={simulationResult} />
                    }
                </>
            }

        </div>
    );

}
