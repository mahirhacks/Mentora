/**
 * Strict Structured Outputs JSON Schema for TeachingChoreography.
 * Built from shared Zod enums / limits so openaiDecide stays aligned with
 * TeachingChoreographySchema. Board ops use anyOf (OpenAI strict cannot use
 * Zod discriminatedUnion oneOf without this shape).
 */
import { StudentResponseClassificationSchema } from "./lesson.js";

/** Keep in sync with TeachingCueSchema / TeachingCueTriggerSchema max bounds. */
export const CHOREOGRAPHY_JSON_LIMITS = {
  cuesMax: 6,
  actionsBeforeMax: 10,
  actionsDuringMax: 6,
  actionsAfterMax: 8,
  triggerActionsMax: 6,
  understandingDeltaMin: -0.25,
  understandingDeltaMax: 0.25,
  voiceScriptMax: 280,
} as const;

function cellSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      id: { type: "string" },
      label: { type: ["string", "null"] },
      kind: { type: ["string", "null"], enum: ["text", "equation", null] },
    },
    required: ["id", "label", "kind"],
  };
}

function boardOpAnyOf() {
  return {
    anyOf: [
      {
        type: "object",
        additionalProperties: false,
        properties: {
          op: { type: "string", const: "create_shape" },
          objectId: { type: "string" },
          shape: { type: "string", enum: ["rectangle", "circle"] },
          region: {
            type: ["string", "null"],
            enum: ["title", "left", "right", "bottom", "center", null],
          },
          size: {
            type: ["string", "null"],
            enum: ["sm", "md", "lg", null],
          },
          label: { type: ["string", "null"] },
        },
        required: ["op", "objectId", "shape", "region", "size", "label"],
      },
      {
        type: "object",
        additionalProperties: false,
        properties: {
          op: { type: "string", const: "divide_region" },
          parentId: { type: "string" },
          layout: {
            type: "string",
            enum: ["2x2-grid", "1x2-row", "2x1-col", "3x1-row", "1x3-col"],
          },
          colRatios: {
            type: ["array", "null"],
            items: { type: "number" },
          },
          rowRatios: {
            type: ["array", "null"],
            items: { type: "number" },
          },
          cells: { type: "array", items: cellSchema() },
          drawGuides: { type: ["boolean", "null"] },
        },
        required: [
          "op",
          "parentId",
          "layout",
          "colRatios",
          "rowRatios",
          "cells",
          "drawGuides",
        ],
      },
      {
        type: "object",
        additionalProperties: false,
        properties: {
          op: { type: "string", const: "label_in" },
          parentId: { type: "string" },
          objectId: { type: "string" },
          text: { type: "string" },
          kind: {
            type: ["string", "null"],
            enum: ["text", "equation", null],
          },
        },
        required: ["op", "parentId", "objectId", "text", "kind"],
      },
      {
        type: "object",
        additionalProperties: false,
        properties: {
          op: { type: "string", const: "place_relative" },
          targetId: { type: "string" },
          where: {
            type: "string",
            enum: ["above", "below", "left", "right", "inside"],
          },
          objectId: { type: "string" },
          text: { type: ["string", "null"] },
          latex: { type: ["string", "null"] },
          gap: {
            type: ["string", "null"],
            enum: ["tight", "normal", "far", null],
          },
        },
        required: [
          "op",
          "targetId",
          "where",
          "objectId",
          "text",
          "latex",
          "gap",
        ],
      },
      {
        type: "object",
        additionalProperties: false,
        properties: {
          op: { type: "string", const: "point_at" },
          objectId: { type: "string" },
          holdMs: { type: ["number", "null"] },
        },
        required: ["op", "objectId", "holdMs"],
      },
      {
        type: "object",
        additionalProperties: false,
        properties: {
          op: { type: "string", const: "highlight" },
          objectId: { type: "string" },
          holdMs: { type: ["number", "null"] },
        },
        required: ["op", "objectId", "holdMs"],
      },
      {
        type: "object",
        additionalProperties: false,
        properties: {
          op: { type: "string", const: "pause" },
          ms: { type: ["number", "null"] },
        },
        required: ["op", "ms"],
      },
    ],
  };
}

/** Exact schema object passed to OpenAI Responses `text.format.schema`. */
export function buildTeachingChoreographyJsonSchema() {
  const L = CHOREOGRAPHY_JSON_LIMITS;
  return {
    type: "object" as const,
    additionalProperties: false as const,
    properties: {
      classification: {
        type: "string" as const,
        enum: [...StudentResponseClassificationSchema.options],
      },
      understandingDelta: {
        type: "number" as const,
        minimum: L.understandingDeltaMin,
        maximum: L.understandingDeltaMax,
      },
      cues: {
        type: "array" as const,
        minItems: 1,
        maxItems: L.cuesMax,
        items: {
          type: "object" as const,
          additionalProperties: false as const,
          properties: {
            cueId: { type: "string" as const },
            voiceScript: {
              type: "string" as const,
              maxLength: L.voiceScriptMax,
            },
            actionsBefore: {
              type: "array" as const,
              maxItems: L.actionsBeforeMax,
              items: boardOpAnyOf(),
            },
            actionsDuring: {
              type: "array" as const,
              maxItems: L.actionsDuringMax,
              items: {
                type: "object" as const,
                additionalProperties: false as const,
                properties: {
                  triggerId: { type: "string" as const },
                  triggerPhrase: { type: "string" as const },
                  actions: {
                    type: "array" as const,
                    maxItems: L.triggerActionsMax,
                    items: boardOpAnyOf(),
                  },
                  fallbackAtMs: { type: "number" as const },
                },
                required: [
                  "triggerId",
                  "triggerPhrase",
                  "actions",
                  "fallbackAtMs",
                ],
              },
            },
            actionsAfter: {
              type: "array" as const,
              maxItems: L.actionsAfterMax,
              items: boardOpAnyOf(),
            },
          },
          required: [
            "cueId",
            "voiceScript",
            "actionsBefore",
            "actionsDuring",
            "actionsAfter",
          ],
        },
      },
      nextQuestion: { type: "string" as const },
      referencedBoardObjectIds: {
        type: "array" as const,
        items: { type: "string" as const },
      },
      completedStepId: { type: ["string", "null"] as const },
    },
    required: [
      "classification",
      "understandingDelta",
      "cues",
      "nextQuestion",
      "referencedBoardObjectIds",
      "completedStepId",
    ],
  };
}

export const teachingChoreographyJsonSchema =
  buildTeachingChoreographyJsonSchema();
