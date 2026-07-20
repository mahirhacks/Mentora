import { describe, it, expect } from "vitest";
import {
  TeachingChoreographySchema,
  TeachingCueSchema,
  TeachingCueTriggerSchema,
  teachingChoreographyJsonSchema,
  StudentResponseClassificationSchema,
} from "./index.js";

/** Mirrors the exact object openaiDecide sends as text.format.schema */
function schemaSentByOpenaiDecide() {
  return teachingChoreographyJsonSchema;
}

describe("teachingChoreographyJsonSchema (openaiDecide payload)", () => {
  it("is a strict root object with additionalProperties false", () => {
    const schema = schemaSentByOpenaiDecide();
    expect(schema.type).toBe("object");
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(
      expect.arrayContaining([
        "classification",
        "understandingDelta",
        "cues",
        "nextQuestion",
        "referencedBoardObjectIds",
        "completedStepId",
      ]),
    );
  });

  it("lists every property of each object in required (OpenAI strict)", () => {
    const schema = schemaSentByOpenaiDecide();
    const cue = schema.properties.cues.items;
    expect(cue.additionalProperties).toBe(false);
    expect(new Set(cue.required)).toEqual(
      new Set(Object.keys(cue.properties)),
    );

    const trigger = cue.properties.actionsDuring.items;
    expect(trigger.additionalProperties).toBe(false);
    expect(new Set(trigger.required)).toEqual(
      new Set(Object.keys(trigger.properties)),
    );

    for (const variant of cue.properties.actionsBefore.items.anyOf) {
      expect(variant.additionalProperties).toBe(false);
      expect(new Set(variant.required)).toEqual(
        new Set(Object.keys(variant.properties)),
      );
    }
  });

  it("uses the same classification enum as Zod", () => {
    const schema = schemaSentByOpenaiDecide();
    expect(schema.properties.classification.enum).toEqual([
      ...StudentResponseClassificationSchema.options,
    ]);
  });

  it("aligns array maxItems with Zod cue/trigger limits", () => {
    const schema = schemaSentByOpenaiDecide();
    const cue = schema.properties.cues.items;
    // TeachingCueSchema: before max 10, during max 6, after max 8
    expect(cue.properties.actionsBefore.maxItems).toBe(10);
    expect(cue.properties.actionsDuring.maxItems).toBe(6);
    expect(cue.properties.actionsAfter.maxItems).toBe(8);
    // TeachingCueTriggerSchema: actions max 6
    expect(cue.properties.actionsDuring.items.properties.actions.maxItems).toBe(
      6,
    );
  });

  it("bounds understandingDelta like Zod", () => {
    const schema = schemaSentByOpenaiDecide();
    expect(schema.properties.understandingDelta.minimum).toBe(-0.25);
    expect(schema.properties.understandingDelta.maximum).toBe(0.25);
  });

  it("keeps completedStepId required and nullable for strict mode", () => {
    const schema = schemaSentByOpenaiDecide();
    expect(schema.required).toContain("completedStepId");
    expect(schema.properties.completedStepId.type).toEqual(["string", "null"]);
  });

  it("Zod choreography schema still accepts a repaired fixture shape", () => {
    const parsed = TeachingChoreographySchema.safeParse({
      classification: "correct_with_understanding",
      understandingDelta: 0.1,
      nextQuestion: "What next?",
      referencedBoardObjectIds: [],
      completedStepId: null,
      cues: [
        {
          cueId: "c1",
          voiceScript: "Look at the board.",
          actionsBefore: [],
          actionsDuring: [],
          actionsAfter: [],
        },
      ],
    });
    expect(parsed.success).toBe(true);
    expect(TeachingCueSchema.safeParse(parsed.data?.cues[0]).success).toBe(
      true,
    );
    expect(
      TeachingCueTriggerSchema.safeParse({
        triggerId: "t1",
        triggerPhrase: "look",
        actions: [],
        fallbackAtMs: 400,
      }).success,
    ).toBe(true);
  });
});
