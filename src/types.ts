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
        componentSetter: React.Dispatch<React.SetStateAction<any>> | null
    ): void,
    getDependantProperty(property: Property<any>, componentData: ComponentData | undefined): any,
    checkBoxOnChange(
          event: React.ChangeEvent<HTMLInputElement, HTMLInputElement>,
        nodeProperty: Property<any>,
        propertyCategory: PropertyCategory,
        propertyRecordName: string[],
        inputName: string,
        componentID: string | null,
        componentSetter: React.Dispatch<React.SetStateAction<any>> | null
    ): void,
    onSelectChange(
        event: React.ChangeEvent<HTMLSelectElement, HTMLSelectElement>,
        nodeProperty: Property<any>,
        propertyCategory: PropertyCategory,
        propertyRecordName: string[],
        inputName: string,
        componentID: string | null,
        componentSetter: React.Dispatch<React.SetStateAction<any>> | null
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

// A service type's free-tier allowance in DOLLAR terms (not raw units),
// keyed by the same metric names as that service's own
// CostEstimate.breakdown (e.g. Lambda: {requests, compute}) and already
// scaled to whatever period getFreeTierResetDays() covers. Expressing it in
// $ (rather than request counts/RCU/etc.) lets simulate.ts compare it
// directly against accumulated breakdown totals without needing to know
// anything about a given service's pricing - see Resource.getFreeTierAllowance.
export type FreeTierPool = Record<string, number>;

export interface CostEstimate{

    costUSD: number, // cost for whatever durationSeconds was passed to estimateCost() - not necessarily a month
    breakdown: Record<string, number>, // e.g. {"compute": 12.3, "requests": 0.4} - sums to costUSD
    warnings: string[]

}

// One traffic-profile point's resolved workload for a single node - the
// rightsizing engine's input. A full period's worth of these (not just the
// peak) is what lets it say *when* a resource is overloaded, not just
// *whether* it ever is.
export interface NodeDailyWorkload{

    label: string,
    rps: number

}

export type CapacityStatus = "ok" | "warning" | "critical" | "not_applicable";

export interface CapacityAssessment{

    status: CapacityStatus,
    message: string, // short, always present - e.g. "62% of peak capacity" or "Scales automatically"
    recommendation?: string, // actionable fix, only present for warning/critical
    peakUtilizationPercent?: number, // peak workload / capacity ceiling * 100 - absent where there's no fixed ceiling (serverless)
    exceededDayLabels?: string[] // which traffic-profile points exceed the capacity ceiling, if any

}
