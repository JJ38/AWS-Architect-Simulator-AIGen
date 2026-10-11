import type { ComponentData, InputsController, Property, PropertyCategory, PropertyRecord } from "../../types";



function getPropertyInput(
    inputsController: InputsController, 
    componentData: ComponentData | undefined, 
    property: Property<any>, 
    propertyCategory: PropertyCategory,
    propertyRecordPath: string[],
    inputName: string, 
    componentID: string | null,  
    componentSetter: React.Dispatch<React.SetStateAction<any>> | null,
    key?: number
){
    // if(componentSetter == null){
    //     console.log("componentSetter == null")
    //     return;
    // }

    const inputType = property.type;

    switch(inputType){

        case "text":{
            const text = <p key={key}>{property.value}</p>
            return text;
        }


        case "link":{
            const text = <p key={key}>{inputsController.getDependantProperty(property, componentData)}</p>
            return text;
        }

        case "string":{
            console.log()
            const input = <input key={key} className="propertyInput" id={`${inputName}`} type="text" name={`${inputName}`} value={property.value ?? ""} onChange={(event) => {inputsController.keyboardInputOnChange(event, property, propertyCategory, propertyRecordPath, inputName, componentID, componentSetter)}}/>
            return input;
        }

        case "number":{

            const input = <input key={key} className="propertyInput" id={`${inputName}`} type="number" name={`${inputName}`} value={`${property.value ?? ""}`} onChange={(event) => {inputsController.keyboardInputOnChange(event, property, propertyCategory, propertyRecordPath, inputName, componentID, componentSetter)}}/>     
            return input;
        }

        case "boolean":{
            return <input key={key} className="propertyInput" id={`${inputName}`} type="checkbox" checked={property.value ?? false} name={`${inputName}`} onChange={(event) => {inputsController.checkBoxOnChange(event, property, propertyCategory, propertyRecordPath, inputName, componentID, componentSetter)}}/>
        }

        case "select":{

            if(property.options == undefined){
                return;
            }
            
            return <select name={`${key}`} id={`${key}`} onChange={(event) => {inputsController.onSelectChange(event, property, propertyCategory, propertyRecordPath, inputName, componentID, componentSetter)}}>
                {property.options.map((option: string, index: number) => {
                    return <option key={key + "_" + index} value={`${option}`} selected={option == property.value}>{option}</option>
                })}
            </select>
        }

        case "edgeType":{

            if(property.options == undefined){
                return;
            }
            
            return <select name={`${key}`} id={`${key}`} onChange={(event) => {inputsController.onSelectChange(event, property, propertyCategory, propertyRecordPath, inputName, componentID, componentSetter)}}>
                {property.options.map((option: string, index: number) => {
                    return <option key={key + "_" + index} value={`${option}`} selected={option == property.value}>{option}</option>
                })}
            </select>
        }


        case "tags":{

            if(property.value == null){
                return;
            }
            
            return <details key={inputName} className='propertyBlockWrapper'>
                <summary className='propertyRecordSectionSummary'>{inputName}</summary>
                <div className='propertyRecordSectionWrapper'>
                    {
                        Object.keys(property.value).map((key: string, index: number) => {

                            const newPropertyRecordPath = Array.from(propertyRecordPath);
                            newPropertyRecordPath.push(inputName);

                            return renderPropertyRow(
                                key,
                                property.value[key],
                                inputsController,
                                componentData,
                                propertyCategory,
                                newPropertyRecordPath,
                                componentID,
                                componentSetter,
                                index
                            );
                        })
                    }
                </div>
            </details>;
        }

        case "json": {
            return <textarea name="" id=""></textarea>
        }

        case "propertyArray": {


            return <details key={inputName} className='propertyBlockWrapper'>
                <summary className='propertyRecordSectionSummary'>{inputName}</summary>
                <div className='propertyRecordSectionWrapper'>
                    {
                        property.value.map((value: number, index: number) => {

                            const newPropertyRecordPath = Array.from(propertyRecordPath);
                            newPropertyRecordPath.push(inputName);

                            return renderPropertyRow(
                                index.toString(),
                                property.value[index],
                                inputsController,
                                componentData,
                                propertyCategory,
                                newPropertyRecordPath,
                                componentID,
                                componentSetter,
                                index
                            );
                        })
                    }
                </div>
            </details>;
        
        }
    }

    return <div>input</div>

}


function renderPropertyRow(
    inputName: string,
    property: Property<any>,
    inputsController: InputsController,
    componentData: ComponentData | undefined,
    propertyCategory: PropertyCategory,
    propertyRecordPath: string[],
    componentID: string | null,
    componentSetter: React.Dispatch<React.SetStateAction<any>> | null,
    key?: number
){

    if(property.type === "tags" || property.type === "propertyArray"){

        return getPropertyInput(
            inputsController,
            componentData,
            property,
            propertyCategory,
            propertyRecordPath,
            inputName,
            componentID,
            componentSetter,
            key
        );
    }

    return <div className='propertyInputWrapper' key={inputName}>
        <p className='propertyName'>{inputName}</p>
        {
            getPropertyInput(
                inputsController,
                componentData,
                property,
                propertyCategory,
                propertyRecordPath,
                inputName,
                componentID,
                componentSetter,
                key
            )
        }
    </div>;
}



export function InputsRenderer(
    inputsController: InputsController, 
    properties: Record<string, PropertyRecord>,
    propertyCategory: PropertyCategory,
    componentData: ComponentData | undefined, 
    componentID: string | null,  
    componentSetter: React.Dispatch<React.SetStateAction<any>> | null,
){

    return Object.keys(properties).map((propertyRecordPath) => {

            if(properties[propertyRecordPath] == null){
                return;
            }

            return <details  key={propertyRecordPath} className='propertyBlockWrapper'>
                        <summary className='propertyRecordSectionSummary'>{propertyRecordPath}</summary>

                        <div className='propertyRecordSectionWrapper'>
                            {              
                                Object.keys(properties[propertyRecordPath]).map((inputName, index) => {

                                    if(properties[propertyRecordPath][inputName] == null){
                                        console.log("properties[propertyRecordPath][inputName]");
                                        return;
                                    }

                                    const shouldShowProperty = inputsController.shouldShowProperty(properties[propertyRecordPath][inputName], componentData);

                                    if(!shouldShowProperty){
                                        return;
                                    }

                                    return renderPropertyRow(
                                        inputName,
                                        properties[propertyRecordPath][inputName],
                                        inputsController,
                                        componentData,
                                        propertyCategory,
                                        [propertyRecordPath],
                                        componentID,
                                        componentSetter,
                                        index
                                    );
                                })
                            }
                        </div>
                    </details>    
    })

}

