import { useState } from "react";
import { TerraformWidgetController } from "../../Controllers/TerraformWidgetController";
import { useNotification } from "../../Providers/NotificationProvider";
import RoundedButton from "../Buttons/RoundedButton";
import '../../styles/TerraformWidget.css';
import type { AppEdge, AppNode, CodeChunk } from "../../types";
import { resourceContainer } from "../../constants";
import type { ResourceStatics } from "../../Models/Resource";
import { InputsRenderer } from "../Helpers/InputsRenderer";



export default function TerraformWidget({ 
        setShowTerraformWidget, 
        stateNodes, 
        setNodes, 
        stateEdges, 
        setEdges,
        setDeploymentSettings 
    }
        : 
    { 
        setShowTerraformWidget: React.Dispatch<React.SetStateAction<boolean>>, 
        stateNodes: AppNode[], 
        setNodes: React.Dispatch<React.SetStateAction<AppNode[]>>, 
        stateEdges: AppEdge[], 
        setEdges: React.Dispatch<React.SetStateAction<AppEdge[]>> 
        setDeploymentSettings: React.Dispatch<React.SetStateAction<Record<string, any>>>
    }){

    const showNotification = useNotification();
    const [stateShowDownloadTerraformForm, setShowDownloadTerraformForm] = useState<boolean>(false);
    const [stateTerraformWidgetController] = useState(() => new TerraformWidgetController(setShowTerraformWidget, showNotification, setNodes, setEdges, setShowDownloadTerraformForm, setDeploymentSettings));
    
    return(
         <div className="terraformWidgetWrapper">

           <div className="terraformSettingsWrapper">


                    {

                        stateShowDownloadTerraformForm &&

                        <div className="terraformSettingsInputsWrapper">

                            {InputsRenderer(stateTerraformWidgetController, stateTerraformWidgetController.deploymentProperties, "terraform", undefined, null, null)}

                        </div>

                        // <div className="terraformFormWrapper">

                        //     <h4>Provider</h4>

                        //     <select id="">
                        //         <option value="aws">aws</option>
                        //     </select>

                        //     <div className="formSection">
                        //         <h4>Backend</h4>

                        //         <h5>Bucket name:</h5>

                        //         <input id="bucket_name" type="text" name="bucket_name"/>
                        //         <label htmlFor="bucket_name"></label>

                        //         <h5>File Path:</h5>

                        //         <input id="bucket_key" type="text" name="bucket_key" />
                        //         <label htmlFor="bucket_key"></label>

                        //         <h5>Region:</h5>

                        //         <select id="">

                        //             <option value="us-east-1">us-east-1</option>
                        //             <option value="us-east-2">us-east-2</option>

                        //             <option value="us-west-1">us-west-1</option>
                        //             <option value="us-west-2">us-west-2</option>

                        //             <option value="ap-south-1">ap-south-1</option>

                        //             <option value="ap-northeast-3">ap-northeast-3</option>
                        //             <option value="ap-northeast-2">ap-northeast-2</option>

                        //             <option value="ap-southeast-1">ap-southeast-1</option>
                        //             <option value="ap-southeast-2">ap-southeast-2</option>

                        //             <option value="ap-northeast-1">ap-northeast-1</option>

                        //             <option value="ap-south-1">ca-central-1</option>

                        //             <option value="ap-south-1">eu-central-1</option>

                        //             <option value="eu-west-1">eu-west-1</option>
                        //             <option value="eu-west-2">eu-west-2</option>
                        //             <option value="eu-west-3">eu-west-3</option>

                        //             <option value="eu-north-1">eu-north-1</option>

                        //             <option value="sa-east-1">sa-east-1</option>

                        //         </select>  


                        //         <h5>Lockfile:</h5>

                        //         <fieldset>

                        //             <input type="radio" id="lockfile_yes" name="lockfile_yes" value="true"/>
                        //             <label htmlFor="lockfile_yes">Yes</label>

                        //             <input type="radio" id="lockfile_no" name="lockfile_no" value="false"/>
                        //             <label htmlFor="lockfile_no">No</label>
                                    
                        //         </fieldset>

                        //         <br/>

                        //     </div> 

                        // </div>

                    }

            
                <div className="saveWidgetButtonWrapper">

                    {
                        !stateShowDownloadTerraformForm &&

                            <RoundedButton
                                onClickHandler={() => stateTerraformWidgetController.handleCancelClick()}
                                buttonText='Cancel'
                            />
                    }
                        
                    {

                        stateShowDownloadTerraformForm &&

                            <RoundedButton
                                onClickHandler={() => stateTerraformWidgetController.handleCancelDownloadClick()}
                                buttonText='Cancel Download'
                            />
                    }

                    {
                        !stateShowDownloadTerraformForm &&
                    
                            <RoundedButton
                                onClickHandler={() => stateTerraformWidgetController.handleUploadClick()}
                                buttonText='Upload'
                            />

                    }
                    
                    {
                        !stateShowDownloadTerraformForm &&

                        <RoundedButton
                            onClickHandler={() => stateTerraformWidgetController.handleDownloadClick(stateNodes)}
                            buttonText='Download'
                        />
                    }

                    {
                        stateShowDownloadTerraformForm &&

                        <RoundedButton
                            onClickHandler={() => stateTerraformWidgetController.handleConvertToTerraform(stateNodes, stateEdges)}
                            buttonText='Convert to terraform'
                        />
                    }

                </div>

            </div>

            

            {
                stateShowDownloadTerraformForm &&
                    

                    <div className="terraformTabs">


                        <input type="radio" className="terraformTabRadio" name="tab" id="tab-main" defaultChecked/>
                        <label htmlFor="tab-main" className="terraformTab">Main</label>

                        <input type="radio" className="terraformTabRadio" name="tab" id="tab-nodes"/>
                        <label htmlFor="tab-nodes" className="terraformTab">Nodes</label>

                        <input type="radio" className="terraformTabRadio" name="tab" id="tab-edges"/>
                        <label htmlFor="tab-edges" className="terraformTab">Edges</label>


                        <div id="panel-main" className='terraformWidgetSnippetWrapper'>
                            <pre>
                                <code className='terraformCode'>
                                    todo add main preview
                                </code>
                            </pre>
                        </div>



                        <div id="panel-nodes" className='terraformWidgetSnippetWrapper'>
                            <pre>
                                <code className='terraformCode'>
                                     {

                                        stateTerraformWidgetController.getNodesTerraformPreview(stateNodes).map(
                                            (codeChunk: CodeChunk, index: number) => {
                                                return <span key={index} className={codeChunk.className}>{codeChunk.value}</span>
                                            }
                                        )
                                    
                                    }
                                </code>
                            </pre>
                        </div>


                        <div id="panel-edges" className='terraformWidgetSnippetWrapper'>
                            <pre>
                                <code className='terraformCode'>
                                    {

                                        stateTerraformWidgetController.getEdgesTerraformPreview(stateEdges, stateNodes).map(
                                            (codeChunk: CodeChunk, index: number) => {
                                                return <span key={index} className={codeChunk.className}>{codeChunk.value}</span>
                                            }
                                        )
                                    
                                    }
                                </code>
                            </pre>
                        </div>
                    </div>
            }

        </div>
    );

}