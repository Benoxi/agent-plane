import * as Schema from "effect/Schema";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";

export class CopyTextClipboardWriteError extends Schema.TaggedErrorClass<CopyTextClipboardWriteError>()(
  "CopyTextClipboardWriteError",
  {
    target: Schema.String,
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Failed to copy ${this.target} to the clipboard.`;
  }
}

export class CopyTextHapticFeedbackError extends Schema.TaggedErrorClass<CopyTextHapticFeedbackError>()(
  "CopyTextHapticFeedbackError",
  {
    target: Schema.String,
    feedback: Schema.Literals(["light-impact", "selection"]),
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Failed to trigger ${this.feedback} haptic feedback after copying ${this.target}.`;
  }
}

export function copyTextWithHaptic(
  value: string,
  options: {
    readonly target?: string;
    readonly feedback?: "light-impact" | "selection";
  } = {},
): Promise<boolean> {
  const target = options.target ?? "text";
  const feedback = options.feedback ?? "light-impact";

  const clipboardWrite = Clipboard.setStringAsync(value).then(
    () => true,
    (cause) => {
      console.error(
        new CopyTextClipboardWriteError({
          target,
          cause,
        }),
      );
      return false;
    },
  );

  void (async () => {
    try {
      if (feedback === "selection") {
        await Haptics.selectionAsync();
      } else {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch (cause) {
      console.error(
        new CopyTextHapticFeedbackError({
          target,
          feedback,
          cause,
        }),
      );
    }
  })();

  return clipboardWrite;
}
