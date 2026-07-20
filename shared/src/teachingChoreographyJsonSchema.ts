/**
 * Strict Structured Outputs JSON Schema for TeachingChoreography.
 * Every property in each object is listed in `required`; optionals are nullable.
 * Board ops use anyOf (one schema per op) so OpenAI strict mode accepts them.
 */
export const teachingChoreographyJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    classification: {
      type: "string",
      enum: [
        "correct_with_understanding",
        "correct_with_hint",
        "partially_correct",
        "incorrect_calculation",
        "incorrect_concept",
        "missing_prerequisite",
        "does_not_know",
        "off_topic",
        "unclear_audio",
        "student_visual_attempt",
      ],
    },
    understandingDelta: { type: "number" },
    cues: {
      type: "array",
      minItems: 1,
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          cueId: { type: "string" },
          voiceScript: { type: "string" },
          actionsBefore: {
            type: "array",
            maxItems: 8,
            items: boardOpAnyOf(),
          },
          actionsDuring: {
            type: "array",
            maxItems: 4,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                triggerId: { type: "string" },
                triggerPhrase: { type: "string" },
                actions: {
                  type: "array",
                  maxItems: 4,
                  items: boardOpAnyOf(),
                },
                fallbackAtMs: { type: "number" },
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
            type: "array",
            maxItems: 6,
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
    nextQuestion: { type: "string" },
    referencedBoardObjectIds: {
      type: "array",
      items: { type: "string" },
    },
    completedStepId: { type: ["string", "null"] },
  },
  required: [
    "classification",
    "understandingDelta",
    "cues",
    "nextQuestion",
    "referencedBoardObjectIds",
    "completedStepId",
  ],
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
