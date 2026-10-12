import { describe, expect, it, vi } from "vitest";
import { PropertiesWidgetController } from "./PropertiesWidgetController";
import type { AppComponent, Property } from "../types";

type TestComponentData = {
    metaData: Record<string, unknown>,
    terraformProperties: Record<string, unknown>,
    componentProperties: { simulation: Record<string, Property<unknown>> }
};

function makeComponent(id: string, propertyName: string, property: Property<unknown>): AppComponent{
    const data: TestComponentData = {
        metaData: {},
        terraformProperties: {},
        componentProperties: { simulation: { [propertyName]: property } }
    };
    return { id, position: { x: 0, y: 0 }, data } as unknown as AppComponent;
}

function fakeChangeEvent(value: string): React.ChangeEvent<HTMLInputElement, HTMLInputElement>{
    return { target: { value } } as unknown as React.ChangeEvent<HTMLInputElement, HTMLInputElement>;
}

function runOnChange(controller: PropertiesWidgetController, component: AppComponent, propertyName: string, value: string): AppComponent[]{

    const property = (component.data as unknown as TestComponentData).componentProperties.simulation[propertyName];

    let updated: AppComponent[] = [];
    const setter = vi.fn((updater: (components: AppComponent[]) => AppComponent[]) => {
        updated = updater([component]);
    });

    controller.keyboardInputOnChange(
        fakeChangeEvent(value),
        property,
        "component",
        ["simulation"],
        propertyName,
        component.id,
        setter
    );

    return updated;

}

function readValue(updated: AppComponent[], propertyName: string): unknown{
    return (updated[0].data as unknown as TestComponentData).componentProperties.simulation[propertyName].value;
}

// event.target.value is always a string, even for <input type="number"> -
// storing it verbatim silently turned every numeric property (EC2
// instance_count, Lambda duration, edge calls_per_request, etc.) into a
// string once edited through the UI. It went unnoticed because JS's
// implicit coercion makes arithmetic "work" anyway ("3" * 20 === 60), but it
// breaks any consumer doing a strict typeof === "number" check.
describe("PropertiesWidgetController.keyboardInputOnChange - number coercion", () => {

    it("stores an actual number, not the raw string, for a type: number property", () => {

        const controller = new PropertiesWidgetController();
        const component = makeComponent("edge-a", "calls_per_request", { value: 1, type: "number" });

        const updated = runOnChange(controller, component, "calls_per_request", "2");
        const newValue = readValue(updated, "calls_per_request");

        expect(newValue).toBe(2);
        expect(typeof newValue).toBe("number");

    });

    it("stores null (not NaN) when the field is cleared", () => {

        const controller = new PropertiesWidgetController();
        const component = makeComponent("edge-a", "calls_per_request", { value: 1, type: "number" });

        const updated = runOnChange(controller, component, "calls_per_request", "");

        expect(readValue(updated, "calls_per_request")).toBeNull();

    });

    it("still stores a plain string for a type: string property - coercion only applies to numbers", () => {

        const controller = new PropertiesWidgetController();
        const component = makeComponent("node-a", "name", { value: "", type: "string" });

        const updated = runOnChange(controller, component, "name", "catalog-web");

        expect(readValue(updated, "name")).toBe("catalog-web");

    });

});
