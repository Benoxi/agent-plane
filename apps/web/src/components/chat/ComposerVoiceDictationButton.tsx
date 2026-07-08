import type { PointerEventHandler } from "react";
import { MicIcon, SquareIcon } from "lucide-react";

import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

interface ComposerVoiceDictationButtonProps {
  disabled: boolean;
  unsupportedReason: string | null;
  isListening: boolean;
  elapsedSeconds: number;
  onToggle: () => void;
  preserveComposerFocusOnPointerDown?: boolean;
}

const preventPointerFocus: PointerEventHandler<HTMLElement> = (event) => {
  event.preventDefault();
};

export function ComposerVoiceDictationButton(props: ComposerVoiceDictationButtonProps) {
  const isDisabled = props.disabled || props.unsupportedReason !== null;
  const tooltip = props.unsupportedReason
    ? props.unsupportedReason
    : props.isListening
      ? `Stop dictation (${props.elapsedSeconds}s)`
      : "Dictate message";
  const ariaLabel = props.isListening ? "Stop voice dictation" : "Start voice dictation";

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="icon"
            className={cn(
              "h-9 w-9 rounded-full border-border/70 bg-card text-muted-foreground shadow-xs transition-colors duration-150 hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30 sm:h-8 sm:w-8",
              props.isListening &&
                "border-destructive/35 bg-destructive/10 text-destructive hover:bg-destructive/15 hover:text-destructive",
            )}
            disabled={isDisabled}
            aria-label={ariaLabel}
            title={tooltip}
            onPointerDown={
              props.preserveComposerFocusOnPointerDown ? preventPointerFocus : undefined
            }
            onClick={props.onToggle}
          />
        }
      >
        {props.isListening ? (
          <SquareIcon className="size-3.5 fill-current" />
        ) : (
          <MicIcon className="size-3.5" />
        )}
      </TooltipTrigger>
      <TooltipPopup side="top">{tooltip}</TooltipPopup>
    </Tooltip>
  );
}
