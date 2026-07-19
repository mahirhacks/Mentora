import { describe, expect, it, vi } from "vitest";
import { BoardObjectRegistry } from "./ObjectRegistry";
import { BoardActionQueue } from "./ActionQueue";

describe("BoardActionQueue", () => {
  it("rejects invalid batches without executing", async () => {
    const registry = new BoardObjectRegistry();
    const queue = new BoardActionQueue(registry, {
      onRegistryChange: () => undefined,
      onFocusChange: () => undefined,
      onClearStudentLayer: () => undefined,
      sleep: async () => undefined,
    });

    const result = await queue.applyActions({
      actions: [{ type: "nope" }],
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe("VALIDATION_ERROR");
    expect(registry.listIds()).toHaveLength(0);
  });

  it("rejects duplicate create IDs in one batch", async () => {
    const registry = new BoardObjectRegistry();
    const queue = new BoardActionQueue(registry, {
      onRegistryChange: () => undefined,
      onFocusChange: () => undefined,
      onClearStudentLayer: () => undefined,
      sleep: async () => undefined,
    });

    const result = await queue.applyActions({
      actions: [
        {
          type: "draw_rectangle",
          objectId: "a",
          x: 0,
          y: 0,
          width: 10,
          height: 10,
        },
        {
          type: "draw_rectangle",
          objectId: "a",
          x: 1,
          y: 1,
          width: 10,
          height: 10,
        },
      ],
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe("DUPLICATE_ID");
  });

  it("returns OBJECT_NOT_FOUND for missing point target", async () => {
    const registry = new BoardObjectRegistry();
    const queue = new BoardActionQueue(registry, {
      onRegistryChange: () => undefined,
      onFocusChange: () => undefined,
      onClearStudentLayer: () => undefined,
      sleep: async () => undefined,
    });

    const result = await queue.applyActions({
      actions: [{ type: "point_at", objectId: "missing", holdMs: 500 }],
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe("OBJECT_NOT_FOUND");
    expect(result.objectId).toBe("missing");
  });

  it("does not await full holdMs for point_at before resolving", async () => {
    const registry = new BoardObjectRegistry();
    const sleep = vi.fn(async () => undefined);
    const queue = new BoardActionQueue(registry, {
      onRegistryChange: () => undefined,
      onFocusChange: () => undefined,
      onClearStudentLayer: () => undefined,
      sleep,
    });

    await queue.applyActions({
      actions: [
        {
          type: "draw_rectangle",
          objectId: "sq",
          x: 0,
          y: 0,
          width: 40,
          height: 40,
        },
      ],
    });

    const started = Date.now();
    const result = await queue.applyActions({
      actions: [{ type: "point_at", objectId: "sq", holdMs: 5000 }],
    });
    const elapsed = Date.now() - started;

    expect(result.success).toBe(true);
    expect(elapsed).toBeLessThan(1000);
  });
});
