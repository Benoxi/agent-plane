const DISPATCH_LOCK_PREFIX = "t3code:scheduled-message-dispatch:";
const localDispatches = new Set<string>();

type LockManagerLike = Pick<LockManager, "request">;

function browserLockManager(): LockManagerLike | null {
  if (typeof navigator === "undefined" || !("locks" in navigator)) {
    return null;
  }
  return navigator.locks;
}

/**
 * Runs a scheduled-message dispatch only while this tab owns its same-origin lock.
 * Web Locks cover sibling tabs; the in-memory fallback still prevents duplicate
 * coordinator effects in browsers which do not implement that API.
 */
export async function withScheduledMessageDispatchLease<T>(
  messageId: string,
  dispatch: () => Promise<T>,
  lockManager: LockManagerLike | null = browserLockManager(),
): Promise<{ acquired: false } | { acquired: true; value: T }> {
  if (lockManager) {
    return lockManager.request(
      `${DISPATCH_LOCK_PREFIX}${messageId}`,
      { ifAvailable: true, mode: "exclusive" },
      async (lock) =>
        lock ? { acquired: true as const, value: await dispatch() } : { acquired: false as const },
    );
  }

  if (localDispatches.has(messageId)) {
    return { acquired: false };
  }
  localDispatches.add(messageId);
  try {
    return { acquired: true, value: await dispatch() };
  } finally {
    localDispatches.delete(messageId);
  }
}

export const __testing = {
  resetLocalDispatches() {
    localDispatches.clear();
  },
};
