import { useState } from "react";
import { TrafficPuckController } from "../../Controllers/TrafficPuckController";
import type { TrafficPuckMode } from "../../Controllers/TrafficPuckController";
import RoundedButton from "../Buttons/RoundedButton";
import TrafficChart from "./TrafficChart";
import TrafficSparkline from "./TrafficSparkline";
import '../../styles/TrafficPuck.css';
import type { SimulationResult } from "../../Simulation/simulate";
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

const PRESETS: { label: string; build: () => TrafficProfile }[] = [
    { label: "Flat", build: () => createFlatProfile(DEFAULT_PERIOD_DAYS, 10) },
    { label: "Ramp up", build: () => createRampProfile(DEFAULT_PERIOD_DAYS, 5, 40) },
    { label: "Weekly cycle", build: () => createWeeklyCycleProfile(DEFAULT_PERIOD_DAYS, 10, 2.5) },
    { label: "Holiday spike", build: () => createSpikeProfile(DEFAULT_PERIOD_DAYS, 8, 60, 23) },
];

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
                            <th>Notes</th>
                        </tr>
                    </thead>
                    <tbody>
                        {
                            simulationResult.perNode.map((nodeResult) =>
                                <tr key={nodeResult.nodeId}>
                                    <td>{nodeResult.serviceName}</td>
                                    <td>{nodeResult.nodeId}</td>
                                    <td>{nodeResult.averageWorkloadRps.toFixed(2)}</td>
                                    <td>{nodeResult.peakWorkloadRps.toFixed(2)} ({nodeResult.peakLabel})</td>
                                    <td>${nodeResult.costUSD.toFixed(2)}</td>
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

    function handlePointChange(index: number, newRps: number){

        setTrafficProfile((profile) => ({
            points: profile.points.map((point, pointIndex) => pointIndex === index ? { ...point, rps: newRps } : point)
        }));

    }

    const average = averageRps(stateTrafficProfile);
    const peak = peakPoint(stateTrafficProfile);

    if(stateMode === "collapsed"){

        return (
            <div className="trafficPuckCollapsed" onClick={() => statePuckController.handleExpandClick()}>
                <TrafficSparkline points={stateTrafficProfile.points} />
                <span className="trafficPuckCollapsedTotal">${simulationResult.totalCostUSD.toFixed(0)}/period</span>
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
                            ? <RoundedButton onClickHandler={() => statePuckController.handleUndockClick()} buttonText='Undock' />
                            : <>
                                <RoundedButton onClickHandler={() => statePuckController.handleDockLeftClick()} buttonText='Dock left' />
                                <RoundedButton onClickHandler={() => statePuckController.handleDockRightClick()} buttonText='Dock right' />
                              </>
                    }
                    <RoundedButton onClickHandler={() => statePuckController.handleCollapseClick()} buttonText='Collapse' />
                </div>

            </div>

            <p className="trafficPuckDisclaimer">
                Illustrative estimates (±25%) from a static us-east-1 pricing table, not live AWS pricing.
            </p>

            <div className="trafficPuckPresetRow">
                <span className="trafficPuckPresetLabel">Traffic shape:</span>
                {
                    PRESETS.map((preset) =>
                        <RoundedButton
                            key={preset.label}
                            onClickHandler={() => setTrafficProfile(preset.build())}
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
