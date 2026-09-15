import { XIcon } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "../ui/button";

export function ScheduledMessagePreview(props: {
  text: string;
  scheduledFor: string;
  sending: boolean;
  onCancel: () => void;
}) {
  const contentId = useId();
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="flex min-w-0 w-full max-w-full items-start gap-1.5 overflow-hidden rounded-md border px-2 py-1 text-xs">
      <div className="min-w-0 flex-1">
        <div className="truncate text-muted-foreground">
          Scheduled {new Date(props.scheduledFor).toLocaleString()}
        </div>
        <div
          id={contentId}
          className={
            expanded
              ? "max-h-32 overflow-y-auto whitespace-pre-wrap [overflow-wrap:anywhere]"
              : "line-clamp-2 whitespace-pre-wrap [overflow-wrap:anywhere]"
          }
        >
          {props.text}
        </div>
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={contentId}
          className="mt-0.5 cursor-pointer text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Show less" : "Show full message"}
        </button>
      </div>
      <Button
        type="button"
        size="icon-xs"
        variant="ghost"
        disabled={props.sending}
        onClick={props.onCancel}
        aria-label="Cancel scheduled message"
        className="shrink-0"
      >
        <XIcon className="size-3" />
      </Button>
    </div>
  );
}
