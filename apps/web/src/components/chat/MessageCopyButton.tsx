import { memo } from "react";
import { CopyIcon, CheckIcon } from "lucide-react";
import { Button } from "../ui/button";
import { useCopyToClipboard } from "~/hooks/useCopyToClipboard";
import { cn } from "~/lib/utils";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

const ANCHORED_TOAST_TIMEOUT_MS = 1000;

export const MessageCopyButton = memo(function MessageCopyButton({
  text,
  size = "xs",
  variant = "outline",
  className,
  ariaLabel = "Copy message",
  tooltipLabel = "Copy message",
}: {
  text: string;
  size?: "xs" | "icon-xs";
  variant?: "outline" | "ghost";
  className?: string;
  ariaLabel?: string;
  tooltipLabel?: string;
}) {
  const { copyToClipboard, isCopied } = useCopyToClipboard<void>({
    target: ariaLabel.toLowerCase(),
    timeout: ANCHORED_TOAST_TIMEOUT_MS,
  });

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={ariaLabel}
            disabled={isCopied}
            onClick={() => copyToClipboard(text)}
            type="button"
            size={size}
            variant={variant}
            className={cn("text-muted-foreground hover:text-foreground", className)}
          />
        }
      >
        {isCopied ? <CheckIcon className="size-3 text-primary" /> : <CopyIcon className="size-3" />}
      </TooltipTrigger>
      <TooltipPopup>
        <p>{tooltipLabel}</p>
      </TooltipPopup>
    </Tooltip>
  );
});
