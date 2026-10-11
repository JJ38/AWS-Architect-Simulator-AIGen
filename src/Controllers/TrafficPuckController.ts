export type TrafficPuckMode = "collapsed" | "expanded" | "docked-left" | "docked-right";

export class TrafficPuckController{

    private setMode: React.Dispatch<React.SetStateAction<TrafficPuckMode>>;

    public constructor(setMode: React.Dispatch<React.SetStateAction<TrafficPuckMode>>){
        this.setMode = setMode;
    }

    public handleExpandClick(){
        this.setMode("expanded");
    }

    public handleCollapseClick(){
        this.setMode("collapsed");
    }

    public handleDockLeftClick(){
        this.setMode("docked-left");
    }

    public handleDockRightClick(){
        this.setMode("docked-right");
    }

    public handleUndockClick(){
        this.setMode("expanded");
    }

}
