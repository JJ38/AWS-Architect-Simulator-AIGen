import type { LucideIcon } from 'lucide-react';
import '../../styles/IconButton.css';

export default function IconButton({ onClickHandler, icon: Icon, label, active }: { onClickHandler: () => void; icon: LucideIcon; label: string; active?: boolean }){

    return (
        <button
            type="button"
            className={`iconButton ${active ? 'iconButtonActive' : ''}`}
            onClick={onClickHandler}
            title={label}
            aria-label={label}
        >
            <Icon size={16} strokeWidth={2} />
        </button>
    );

}
