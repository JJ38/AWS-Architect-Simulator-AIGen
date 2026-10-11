import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../Providers/ThemeProvider';
import IconButton from './Buttons/IconButton';

export default function ThemeToggle(){

    const { theme, toggleTheme } = useTheme();

    return (
        <IconButton
            onClickHandler={toggleTheme}
            icon={theme === 'dark' ? Sun : Moon}
            label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        />
    );

}
