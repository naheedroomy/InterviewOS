import { ChevronUp, ChevronDown, Maximize2, Minimize2 } from "lucide-react";
import type { OverlayAppearance } from "../../lib/overlayAppearance";

interface TopPillProps {
    expanded: boolean;
    onToggle: () => void;
    onQuit: () => void;
    appearance: OverlayAppearance;
    /** Whether the overlay is currently expanded to fill the work area. */
    isMaximized?: boolean;
    /** Called when the user clicks the Expand/Restore button. */
    onToggleExpand?: () => void;
}

export default function TopPill({
    expanded,
    onToggle,
    onQuit,
    appearance,
    isMaximized = false,
    onToggleExpand,
}: TopPillProps) {
    return (
        <div className="flex justify-center mt-2 select-none z-50">
            <div
                className="
          draggable-area
          flex items-center gap-3
          rounded-full
          border
          overlay-pill-surface
          backdrop-blur-md
          pl-2.5 pr-2.5 py-1.5
          transition-all duration-300 ease-sculpted
        "
                style={appearance.pillStyle}
            >
                {/* EXPAND / RESTORE BUTTON */}
                {onToggleExpand && (
                  <button
                    onClick={onToggleExpand}
                    className={`
            w-8 h-8
            rounded-full
            overlay-icon-surface
            overlay-text-primary
            flex items-center justify-center
            interaction-base interaction-press
            hover:bg-accent-primary/10
          `}
                    style={appearance.iconStyle}
                    title={isMaximized ? 'Restore size' : 'Expand'}
                  >
                    {isMaximized ? (
                      <Minimize2 className="w-3.5 h-3.5" />
                    ) : (
                      <Maximize2 className="w-3.5 h-3.5" />
                    )}
                  </button>
                )}

                {/* CENTER SEGMENT */}
                <button
                    onClick={onToggle}
                    className={`
            flex items-center gap-2
            group
            px-4 py-1.5
            rounded-full
            backdrop-blur-md
            overlay-chip-surface
            overlay-text-interactive
            text-[12px]
            font-medium
            border
            interaction-base interaction-hover interaction-press
          `}
                    style={appearance.chipStyle}
                >
                    <span className="opacity-70 group-hover:opacity-100 transition-opacity duration-200">
                        {expanded ? (
                            <ChevronUp className="w-3.5 h-3.5" />
                        ) : (
                            <ChevronDown className="w-3.5 h-3.5" />
                        )}
                    </span>
                    <span className="tracking-wide opacity-80 group-hover:opacity-100">{expanded ? "Hide" : "Show"}</span>
                </button>

                {/* STOP / QUIT BUTTON */}
                <button
                    onClick={onQuit}
                    className={`
            w-8 h-8
            rounded-full
            overlay-icon-surface
            overlay-text-primary
            flex items-center justify-center
            interaction-base interaction-press
            hover:bg-red-500/10 hover:text-red-400
          `}
                    style={appearance.iconStyle}
                >
                    <div className="w-3.5 h-3.5 rounded-[3px] bg-current opacity-80" />
                </button>
            </div>
        </div>
    );
}
