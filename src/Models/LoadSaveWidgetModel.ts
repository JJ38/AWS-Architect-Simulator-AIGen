export class LoadSaveWidgetModel{

    public saveKeys: string[] = [];

    public constructor(){

        this.loadSaveKeys();

    }

    private loadSaveKeys(){

        for(let i = 0; i < localStorage.length; i++){

            const key = localStorage.key(i);
            
            if(key != null){
                this.saveKeys.push(key);
            }

        }

    }

}