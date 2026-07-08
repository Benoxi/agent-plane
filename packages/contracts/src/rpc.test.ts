import { assert, it } from "@effect/vitest";

import { WS_METHODS } from "./rpc.ts";

it("includes scheduled-message RPC methods", () => {
  assert.strictEqual(WS_METHODS.scheduledMessagesList, "scheduledMessages.list");
  assert.strictEqual(WS_METHODS.scheduledMessagesCreate, "scheduledMessages.create");
  assert.strictEqual(WS_METHODS.scheduledMessagesDelete, "scheduledMessages.delete");
  assert.strictEqual(WS_METHODS.scheduledMessagesSubscribe, "scheduledMessages.subscribe");
});
