import { SymbolView } from "../components/AppSymbol";
import { memo, useEffect, useRef, useState } from "react";
import { Alert, Pressable, type ColorValue } from "react-native";

import { copyTextWithHaptic } from "../lib/copyTextWithHaptic";

const COPY_FEEDBACK_DURATION_MS = 1200;

export const CopyTextButton = memo(function CopyTextButton(props: {
  readonly accessibilityLabel: string;
  readonly text: string;
  readonly tintColor: ColorValue;
  readonly copiedTintColor?: ColorValue;
  readonly backgroundColor?: ColorValue;
  readonly borderColor?: ColorValue;
  readonly iconSize?: number;
  readonly buttonSize?: number;
}) {
  const [copied, setCopied] = useState(false);
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (resetTimeoutRef.current) {
        clearTimeout(resetTimeoutRef.current);
      }
    },
    [],
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={copied ? "Copied" : props.accessibilityLabel}
      disabled={props.text.length === 0}
      hitSlop={8}
      onPress={() => {
        void copyTextWithHaptic(props.text, { target: "message" }).then((didCopy) => {
          if (!didCopy) {
            setCopied(false);
            Alert.alert(
              "Couldn't copy message",
              "Clipboard access was unavailable. Try again after checking app permissions.",
            );
            return;
          }

          setCopied(true);
          if (resetTimeoutRef.current) {
            clearTimeout(resetTimeoutRef.current);
          }
          resetTimeoutRef.current = setTimeout(() => {
            setCopied(false);
            resetTimeoutRef.current = null;
          }, COPY_FEEDBACK_DURATION_MS);
        });
      }}
      style={({ pressed }) => ({
        width: props.buttonSize ?? 30,
        height: props.buttonSize ?? 30,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 9,
        borderWidth: 1,
        borderColor: props.borderColor ?? props.tintColor,
        backgroundColor: props.backgroundColor ?? "transparent",
        opacity: pressed ? 0.52 : 1,
      })}
    >
      <SymbolView
        name={
          copied
            ? { ios: "checkmark", android: "check" }
            : { ios: "doc.on.doc", android: "content_copy" }
        }
        size={props.iconSize ?? 13}
        tintColor={copied ? (props.copiedTintColor ?? props.tintColor) : props.tintColor}
        type="monochrome"
      />
    </Pressable>
  );
});
