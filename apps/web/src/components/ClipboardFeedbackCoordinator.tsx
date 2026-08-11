import { useEffect } from "react";

import { clipboardFeedbackController } from "../clipboardFeedback";
import { stackedThreadToast, toastManager } from "./ui/toast";

export function ClipboardFeedbackCoordinator() {
  useEffect(
    () =>
      clipboardFeedbackController.subscribe((event) => {
        if (!event.announce) return;

        if (event.status === "success") {
          toastManager.add({
            type: "success",
            title: "Copied to clipboard",
            timeout: 1_500,
          });
          return;
        }

        if (event.status === "failure") {
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: "Couldn’t copy to clipboard",
              description:
                event.error?.message ??
                "Allow clipboard access in your browser settings, then try again.",
            }),
          );
        }
      }),
    [],
  );

  return null;
}
