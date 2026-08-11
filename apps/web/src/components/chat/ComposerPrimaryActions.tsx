import { memo, type FormEvent, type PointerEventHandler, useEffect, useState } from "react";
import { ChevronDownIcon, ChevronLeftIcon, Clock3Icon } from "lucide-react";
import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { Spinner } from "../ui/spinner";

interface PendingActionState {
  questionIndex: number;
  isLastQuestion: boolean;
  canAdvance: boolean;
  isResponding: boolean;
  isComplete: boolean;
}

interface ComposerPrimaryActionsProps {
  compact: boolean;
  pendingAction: PendingActionState | null;
  isRunning: boolean;
  showPlanFollowUpPrompt: boolean;
  promptHasText: boolean;
  isSendBusy: boolean;
  sendDisabledReason: string | null;
  isConnecting: boolean;
  isEnvironmentUnavailable: boolean;
  isPreparingWorktree: boolean;
  hasSendableContent: boolean;
  scheduleDisabledReason: string | null;
  preserveComposerFocusOnPointerDown?: boolean;
  onPreviousPendingQuestion: () => void;
  onInterrupt: () => void;
  onImplementPlanInNewThread: () => void;
  onSchedule: (delaySeconds: number) => void | Promise<void>;
}

export const formatPendingPrimaryActionLabel = (input: {
  compact: boolean;
  isLastQuestion: boolean;
  isResponding: boolean;
  questionIndex: number;
}) => {
  if (input.isResponding) {
    return "Submitting...";
  }
  if (input.compact) {
    return input.isLastQuestion ? "Submit" : "Next";
  }
  if (!input.isLastQuestion) {
    return "Next question";
  }
  return input.questionIndex > 0 ? "Submit answers" : "Submit answer";
};

export const preventScheduledMessageSubmitPropagation = (
  event: Pick<FormEvent<HTMLFormElement>, "preventDefault" | "stopPropagation">,
) => {
  event.preventDefault();
  // The popover is portalled out of the composer form in the DOM, but React
  // events still bubble through the component tree.
  event.stopPropagation();
};

const preventPointerFocus: PointerEventHandler<HTMLElement> = (event) => {
  event.preventDefault();
};

export const ComposerPrimaryActions = memo(function ComposerPrimaryActions({
  compact,
  pendingAction,
  isRunning,
  showPlanFollowUpPrompt,
  promptHasText,
  isSendBusy,
  sendDisabledReason,
  isConnecting,
  isEnvironmentUnavailable,
  isPreparingWorktree,
  hasSendableContent,
  scheduleDisabledReason,
  preserveComposerFocusOnPointerDown = false,
  onPreviousPendingQuestion,
  onInterrupt,
  onImplementPlanInNewThread,
  onSchedule,
}: ComposerPrimaryActionsProps) {
  const pointerFocusProps = preserveComposerFocusOnPointerDown
    ? { onPointerDown: preventPointerFocus }
    : undefined;
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [delaySeconds, setDelaySeconds] = useState("30");

  useEffect(() => {
    if (!scheduleOpen) {
      setDelaySeconds("30");
    }
  }, [scheduleOpen]);
  const isSendDisabled = sendDisabledReason !== null;

  const renderStopGenerationButton = (insidePendingAction: boolean) => (
    <button
      type="button"
      className={cn(
        "flex cursor-pointer items-center justify-center rounded-full bg-destructive/90 text-white shadow-xs shadow-destructive/24 inset-shadow-[0_1px_--theme(--color-white/16%)] transition-all duration-150 hover:bg-destructive hover:scale-105 active:inset-shadow-[0_1px_--theme(--color-black/8%)] active:shadow-none",
        insidePendingAction ? "size-8 sm:size-7" : "size-8 sm:h-8 sm:w-8",
      )}
      {...pointerFocusProps}
      onClick={onInterrupt}
      aria-label="Stop generation"
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
        <rect x="2" y="2" width="8" height="8" rx="1.5" />
      </svg>
    </button>
  );

  if (pendingAction) {
    return (
      <div className={cn("flex items-center justify-end", compact ? "gap-1.5" : "gap-2")}>
        {isRunning ? renderStopGenerationButton(true) : null}
        {pendingAction.questionIndex > 0 ? (
          compact ? (
            <Button
              size="icon-sm"
              variant="outline"
              className="rounded-full"
              {...pointerFocusProps}
              onClick={onPreviousPendingQuestion}
              disabled={pendingAction.isResponding}
              aria-label="Previous question"
            >
              <ChevronLeftIcon className="size-3.5" />
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="rounded-full"
              {...pointerFocusProps}
              onClick={onPreviousPendingQuestion}
              disabled={pendingAction.isResponding}
            >
              Previous
            </Button>
          )
        ) : null}
        <Button
          type="submit"
          size="sm"
          className={cn(
            "rounded-full bg-message-action text-message-action-foreground hover:bg-message-action-hover",
            compact ? "px-3" : "px-4",
          )}
          {...pointerFocusProps}
          disabled={
            isEnvironmentUnavailable ||
            pendingAction.isResponding ||
            (pendingAction.isLastQuestion ? !pendingAction.isComplete : !pendingAction.canAdvance)
          }
        >
          {formatPendingPrimaryActionLabel({
            compact,
            isLastQuestion: pendingAction.isLastQuestion,
            isResponding: pendingAction.isResponding,
            questionIndex: pendingAction.questionIndex,
          })}
        </Button>
      </div>
    );
  }

  if (isRunning) {
    return renderStopGenerationButton(false);
  }

  if (showPlanFollowUpPrompt) {
    if (promptHasText) {
      return (
        <Button
          type="submit"
          size="sm"
          className={cn(
            "rounded-full bg-message-action text-message-action-foreground hover:bg-message-action-hover",
            compact ? "h-9 px-3 sm:h-8" : "h-9 px-4 sm:h-8",
          )}
          {...pointerFocusProps}
          disabled={isSendBusy || isSendDisabled || isConnecting || isEnvironmentUnavailable}
        >
          {isConnecting || isSendBusy ? "Sending..." : "Refine"}
        </Button>
      );
    }

    return (
      <div data-chat-composer-implement-actions="true" className="flex items-center justify-end">
        <Button
          type="submit"
          size="sm"
          className="h-9 rounded-l-full rounded-r-none bg-message-action px-4 text-message-action-foreground hover:bg-message-action-hover sm:h-8"
          {...pointerFocusProps}
          disabled={isSendBusy || isSendDisabled || isConnecting || isEnvironmentUnavailable}
        >
          {isConnecting || isSendBusy ? "Sending..." : "Implement"}
        </Button>
        <Menu>
          <MenuTrigger
            render={
              <Button
                size="sm"
                variant="default"
                className="h-9 rounded-l-none rounded-r-full border-l-message-action-foreground/20 bg-message-action px-2 text-message-action-foreground hover:bg-message-action-hover sm:h-8"
                aria-label="Implementation actions"
                {...pointerFocusProps}
                disabled={isSendBusy || isSendDisabled || isConnecting || isEnvironmentUnavailable}
              />
            }
          >
            <ChevronDownIcon className="size-3.5" />
          </MenuTrigger>
          <MenuPopup align="end" side="top">
            <MenuItem
              disabled={isSendBusy || isSendDisabled || isConnecting || isEnvironmentUnavailable}
              onClick={() => void onImplementPlanInNewThread()}
            >
              Implement in a new thread
            </MenuItem>
          </MenuPopup>
        </Menu>
      </div>
    );
  }

  const parsedDelaySeconds = Number.parseInt(delaySeconds, 10);
  const scheduleDisabled = scheduleDisabledReason !== null;

  return (
    <div className="flex items-center justify-end gap-2">
      <Popover open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <PopoverTrigger
          render={
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border/70 bg-card text-muted-foreground shadow-xs transition-colors duration-150 hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30 sm:h-8 sm:w-8"
              {...pointerFocusProps}
              disabled={scheduleDisabled}
              aria-label="Schedule message"
              title={scheduleDisabledReason ?? "Schedule message"}
            />
          }
        >
          <Clock3Icon className="size-3.5" />
        </PopoverTrigger>
        <PopoverPopup side="top" align="end" sideOffset={8} className="w-72 p-3">
          <form
            className="space-y-3"
            onSubmit={(event) => {
              preventScheduledMessageSubmitPropagation(event);
              if (!Number.isFinite(parsedDelaySeconds) || parsedDelaySeconds <= 0) {
                return;
              }
              void onSchedule(parsedDelaySeconds);
              setScheduleOpen(false);
            }}
          >
            <div className="space-y-1">
              <div className="font-medium text-sm">Schedule send</div>
              <div className="text-muted-foreground text-xs">
                Queue this message to send after a delay in seconds.
              </div>
            </div>
            <label className="block space-y-1">
              <span className="text-muted-foreground text-xs">Seconds</span>
              <Input
                nativeInput
                type="number"
                min={1}
                step={1}
                value={delaySeconds}
                onChange={(event) => {
                  setDelaySeconds(event.currentTarget.value);
                }}
                autoFocus
              />
            </label>
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setScheduleOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={!Number.isFinite(parsedDelaySeconds) || parsedDelaySeconds <= 0}
              >
                Schedule
              </Button>
            </div>
          </form>
        </PopoverPopup>
      </Popover>

      <button
        type="submit"
        className={cn(
          "relative isolate flex h-9 w-9 items-center justify-center overflow-hidden rounded-full text-message-action-foreground shadow-xs transition-all duration-150 enabled:cursor-pointer enabled:inset-shadow-[0_1px_--theme(--color-white/16%)] hover:scale-105 active:inset-shadow-[0_1px_--theme(--color-black/8%)] active:shadow-none disabled:pointer-events-none disabled:opacity-30 disabled:shadow-none disabled:hover:scale-100 sm:h-8 sm:w-8",
          "bg-message-action enabled:shadow-message-action/24 hover:bg-message-action-hover",
        )}
        {...pointerFocusProps}
        disabled={
          isSendBusy ||
          isSendDisabled ||
          isConnecting ||
          isEnvironmentUnavailable ||
          !hasSendableContent
        }
        aria-label={
          isEnvironmentUnavailable
            ? "Environment disconnected"
            : sendDisabledReason
              ? sendDisabledReason
              : isConnecting
                ? "Connecting"
                : isPreparingWorktree
                  ? "Preparing worktree"
                  : isSendBusy
                    ? "Sending"
                    : "Send message"
        }
      >
        {isConnecting || isSendBusy ? (
          <Spinner className="size-3.5" aria-hidden="true" />
        ) : (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path
              d="M7 11.5V2.5M7 2.5L3 6.5M7 2.5L11 6.5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>
    </div>
  );
});
