import { createContext, useContext, useEffect, useState } from "react";

export type Theme = "light" | "dark";

const THEME_STORAGE_KEY = "theme";

const ThemeContext = createContext<{ theme: Theme; toggleTheme: () => void } | null>(null);

function getInitialTheme(): Theme{

    const stored = localStorage.getItem(THEME_STORAGE_KEY);

    if(stored === "light" || stored === "dark"){
        return stored;
    }

    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";

}

export default function ThemeProvider({ children }: { children: React.ReactNode }){

    const [stateTheme, setTheme] = useState<Theme>(getInitialTheme);

    useEffect(() => {

        document.documentElement.setAttribute("data-theme", stateTheme);
        localStorage.setItem(THEME_STORAGE_KEY, stateTheme);

    }, [stateTheme]);

    function toggleTheme(){
        setTheme(stateTheme === "dark" ? "light" : "dark");
    }

    return (
        <ThemeContext.Provider value={{ theme: stateTheme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );

}

export function useTheme(){

    const context = useContext(ThemeContext);

    if(context == null){
        throw new Error("useTheme must be used within a ThemeProvider");
    }

    return context;

}
