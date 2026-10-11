import { type Edge, type Node } from '@xyflow/react';

export type Service = {
    name: string;
    description: string;
    terraformType: string | null; //e.g resource
    providerTypes: string[] | null; //e.d aws_lambda_function
    icon: string;
    image: string;
}

export type ValidationResult = {
    id: string;
    nodeType: string;
    valid: boolean;
    errors: string[];
}

export type ComponentData = ResourceData | EdgeData;

export type PropertyRecord = Record<string, Property<any>>;

type BaseComponentData = {
    metaData: Record<string, any>,
    componentProperties: Record<string, PropertyRecord>,
    terraformProperties: Record<string, PropertyRecord>,
    iamProperties?: Record<string, PropertyRecord>,
    resources?: Record<string, string>, 
}

export type ResourceData = BaseComponentData & {
    id: string,
    service: Service,
    resourceName: string
}

export type AppNode = Node<ResourceData>;

export type EdgeData = BaseComponentData & {
    edgeType: EdgeType
}

export type AppEdge = Edge<EdgeData>;

export type AppComponent = AppNode | AppEdge;

export interface Property<T>{

    value: T,
    type: PropertyType,
    options?: readonly T[]
    name?: string
    dependant?: {propertyPath: string[], value?: any}
    anchor?: boolean
    link?: string[]

}

export interface InputsController{

    keyboardInputOnChange(
        event: React.ChangeEvent<HTMLInputElement, HTMLInputElement>, 
        nodeProperty: Property<any>, 
        propertyCategory: PropertyCategory,
        propertyRecordName: string[],
        inputName: string, 
        componentID: string | null,
        componentSetter: React.Dispatch<React.SetStateAction<any>>
    ): void,
    getDependantProperty(property: Property<any>, componentData: ComponentData | undefined): any,
    checkBoxOnChange(
          event: React.ChangeEvent<HTMLInputElement, HTMLInputElement>, 
        nodeProperty: Property<any>, 
        propertyCategory: PropertyCategory,
        propertyRecordName: string[],
        inputName: string, 
        componentID: string | null,
        componentSetter: React.Dispatch<React.SetStateAction<any>>
    ): void,
    onSelectChange(
        event: React.ChangeEvent<HTMLSelectElement, HTMLSelectElement>, 
        nodeProperty: Property<any>, 
        propertyCategory: PropertyCategory,
        propertyRecordName: string[],
        inputName: string, 
        componentID: string | null,
        componentSetter: React.Dispatch<React.SetStateAction<any>>
    ): void,
    shouldShowProperty(property: Property<any>, componentData: ComponentData | undefined): boolean

}

export type PropertyCategory =
| "component"
| "terraform" 
| "iam"

//union type. Similar to an enum but more lightweight
export type PropertyType =
| "edgeType"
| "link"
| "json"
| "propertyArray"
| "stringArray"
| "text"
| "string"
| "boolean"
| "number"
| "tags"
| "nestedTags"
| "checkbox"
| "select"
| "radio";

export type EdgeType = "sync" | "async" | "pull";


export interface CodeChunk{

    value: any,
    className: string

}

export type PermissionType = "IAM" | "Service" | "Passive"; // A passive service should only ever show up as a pull source
