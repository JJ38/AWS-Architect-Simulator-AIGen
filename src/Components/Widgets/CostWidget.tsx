import { useState } from "react";
import { CostWidgetController } from "../../Controllers/CostWidgetController";
import { useNotification } from "../../Providers/NotificationProvider";
import RoundedButton from "../Buttons/RoundedButton";
import '../../styles/CostWidget.css';
import type { AppEdge, AppNode } from "../../types";
import type { SimulationResult } from "../../Simulation/simulate";

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
    const [stateEntryRps, setEntryRps] = useState<number>(10);
    const [stateSimulationResult, setSimulationResult] = useState<SimulationResult | null>(null);

    function handleRunClick(){

        const result = stateCostWidgetController.handleRunSimulation(stateNodes, stateEdges, stateEntryRps);
        setSimulationResult(result);

    }

    function handleEntryRpsChange(event: React.ChangeEvent<HTMLInputElement>){

        const parsed = Number(event.target.value);
        setEntryRps(Number.isNaN(parsed) ? 0 : parsed);

    }

    return(
        <div className="costWidgetWrapper">

            <h3 className="costWidgetTitle">Cost &amp; capacity simulation</h3>

            <p className="costWidgetDisclaimer">
                Illustrative estimates (±25%) from a static us-east-1 pricing table, not live AWS pricing.
            </p>

            <div className="costWidgetInputRow">
                <label htmlFor="entryRps">Incoming traffic (requests/sec):</label>
                <input
                    id="entryRps"
                    className="propertyInput"
                    type="number"
                    min="0"
                    value={stateEntryRps}
                    onChange={handleEntryRpsChange}
                />
            </div>

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
                        Total estimated cost: ${stateSimulationResult.totalMonthlyCostUSD.toFixed(2)} / month
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
                                <th>req/s</th>
                                <th>$/month</th>
                                <th>Notes</th>
                            </tr>
                        </thead>
                        <tbody>
                            {
                                stateSimulationResult.perNode.map((nodeResult) =>
                                    <tr key={nodeResult.nodeId}>
                                        <td>{nodeResult.serviceName}</td>
                                        <td>{nodeResult.nodeId}</td>
                                        <td>{nodeResult.workloadRps.toFixed(2)}</td>
                                        <td>${nodeResult.cost.monthlyCostUSD.toFixed(2)}</td>
                                        <td>
                                            {
                                                nodeResult.cost.warnings.map((warning, index) =>
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
