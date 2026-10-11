import { useState } from "react";
import { CostWidgetController } from "../../Controllers/CostWidgetController";
import { useNotification } from "../../Providers/NotificationProvider";
import RoundedButton from "../Buttons/RoundedButton";
import TrafficChart from "./TrafficChart";
import '../../styles/CostWidget.css';
import type { AppEdge, AppNode } from "../../types";
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

export default function CostWidget({
        setShowCostWidget,
        stateNodes,
        stateEdges
    }
        :
    {
        setShowCostWidget: React.Dispatch<React.SetStateAction<boolean>>,
        stateNodes: AppNode[],
        stateEdges: AppEdge[]
    }){

    const showNotification = useNotification();
    const [stateCostWidgetController] = useState(() => new CostWidgetController(setShowCostWidget, showNotification));
    const [stateTrafficProfile, setTrafficProfile] = useState<TrafficProfile>(() => PRESETS[3].build());
    const [stateSimulationResult, setSimulationResult] = useState<SimulationResult | null>(null);

    function handlePointChange(index: number, newRps: number){

        setTrafficProfile((profile) => ({
            points: profile.points.map((point, pointIndex) => pointIndex === index ? { ...point, rps: newRps } : point)
        }));

    }

    function handlePresetClick(buildProfile: () => TrafficProfile){
        setTrafficProfile(buildProfile());
        setSimulationResult(null);
    }

    function handleRunClick(){

        const result = stateCostWidgetController.handleRunSimulation(stateNodes, stateEdges, stateTrafficProfile);
        setSimulationResult(result);

    }

    const average = averageRps(stateTrafficProfile);
    const peak = peakPoint(stateTrafficProfile);

    return(
        <div className="costWidgetWrapper">

            <h3 className="costWidgetTitle">Cost &amp; capacity simulation</h3>

            <p className="costWidgetDisclaimer">
                Illustrative estimates (±25%) from a static us-east-1 pricing table, not live AWS pricing.
            </p>

            <div className="costWidgetPresetRow">
                <span className="costWidgetPresetLabel">Traffic shape:</span>
                {
                    PRESETS.map((preset) =>
                        <RoundedButton
                            key={preset.label}
                            onClickHandler={() => handlePresetClick(preset.build)}
                            buttonText={preset.label}
                        />
                    )
                }
            </div>

            <p className="costWidgetChartCaption">
                Traffic (requests/sec) over a {stateTrafficProfile.points.length}-day period - drag a point to edit it.
                Average {average.toFixed(1)} req/s, peak {peak?.rps.toFixed(1) ?? 0} req/s on {peak?.label}.
            </p>

            <TrafficChart points={stateTrafficProfile.points} onChange={handlePointChange} />

            <div className="saveWidgetButtonWrapper">
                <RoundedButton
                    onClickHandler={() => stateCostWidgetController.handleCancelClick()}
                    buttonText='Close'
                />
                <RoundedButton
                    onClickHandler={handleRunClick}
                    buttonText='Run simulation'
                />
            </div>

            {
                stateSimulationResult != null &&

                <div className="costWidgetResults">

                    <p className="costWidgetTotal">
                        Total estimated cost: ${stateSimulationResult.totalCostUSD.toFixed(2)} over {stateSimulationResult.periodDays} days
                    </p>

                    {
                        stateSimulationResult.warnings.length > 0 &&

                        <ul className="costWidgetWarnings">
                            {
                                stateSimulationResult.warnings.map((warning, index) =>
                                    <li key={index}>{warning}</li>
                                )
                            }
                        </ul>
                    }

                    <table className="costWidgetTable">
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
                                stateSimulationResult.perNode.map((nodeResult) =>
                                    <tr key={nodeResult.nodeId}>
                                        <td>{nodeResult.serviceName}</td>
                                        <td>{nodeResult.nodeId}</td>
                                        <td>{nodeResult.averageWorkloadRps.toFixed(2)}</td>
                                        <td>{nodeResult.peakWorkloadRps.toFixed(2)} ({nodeResult.peakLabel})</td>
                                        <td>${nodeResult.costUSD.toFixed(2)}</td>
                                        <td>
                                            {
                                                nodeResult.warnings.map((warning, index) =>
                                                    <div key={index} className="costWidgetRowWarning">{warning}</div>
                                                )
                                            }
                                        </td>
                                    </tr>
                                )
                            }
                        </tbody>
                    </table>

                </div>
            }

        </div>
    );

}
