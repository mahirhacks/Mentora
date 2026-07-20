/** OpenAI Realtime tool definitions (JSON Schema). Zod validates at runtime. */
export const REALTIME_TOOLS = [
  {
    type: "function" as const,
    name: "board_place",
    description:
      "PREFERRED for titles, explanations, bullet lists, and callout boxes. Place content into a named zone (title|left|right|bottom). The client wraps text, sizes boxes, and keeps everything inside 1100x620 — you do NOT pick pixel x/y. Use clearZone=true to replace that zone. For diagrams use board_diagram.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        zone: {
          type: "string",
          enum: ["title", "left", "right", "bottom"],
          description:
            "title=top banner; left=diagram/key idea; right=explanations; bottom=summary strip",
        },
        clearZone: {
          type: "boolean",
          description: "Erase existing objects overlapping this zone first",
        },
        blocks: {
          type: "array",
          minItems: 1,
          maxItems: 12,
          items: {
            type: "object",
            additionalProperties: true,
            properties: {
              kind: {
                type: "string",
                enum: ["heading", "body", "bullets", "callout"],
              },
              text: { type: "string" },
              objectId: { type: "string" },
              objectIdPrefix: { type: "string" },
              lines: {
                type: "array",
                items: { type: "string" },
              },
            },
            required: ["kind"],
          },
        },
      },
      required: ["zone", "blocks"],
    },
  },
  {
    type: "function" as const,
    name: "board_diagram",
    description:
      "PREFERRED for diagrams. Emit coordinate-free structure only — the client computes pixels. Ops: create_shape (rectangle|circle in region left|right|center|title|bottom, size sm|md|lg), divide_region (parentId + layout 2x2-grid|1x2-row|2x1-col|3x1-row|1x3-col + cells[{id,label,kind}]), label_in, place_relative (above|below|left|right|inside), point_at/highlight by objectId, pause. Never send x/y. Refer to existing shapes by objectId.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        ops: {
          type: "array",
          minItems: 1,
          maxItems: 30,
          items: {
            type: "object",
            additionalProperties: true,
            properties: {
              op: {
                type: "string",
                enum: [
                  "create_shape",
                  "divide_region",
                  "label_in",
                  "place_relative",
                  "point_at",
                  "highlight",
                  "pause",
                ],
              },
            },
            required: ["op"],
          },
        },
      },
      required: ["ops"],
    },
  },
  {
    type: "function" as const,
    name: "board_apply_actions",
    description:
      "ESCAPE HATCH only. Low-level PIXEL actions on 1100x620. Prefer board_diagram (diagrams) and board_place (prose). If you must use this: point_at/highlight/show_pointer should use objectId when possible; avoid inventing x/y for new shapes.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        actions: {
          type: "array",
          minItems: 1,
          maxItems: 40,
          items: {
            type: "object",
            additionalProperties: true,
            properties: {
              type: { type: "string" },
            },
            required: ["type"],
          },
        },
      },
      required: ["actions"],
    },
  },
  {
    type: "function" as const,
    name: "get_board_layout",
    description:
      "Return object IDs and rough layout. Prefer board_diagram / board_place over freehand pixels. Call when you need available objectIds before divide_region / point_at.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {},
      required: [],
    },
  },
  {
    type: "function" as const,
    name: "create_lesson_plan",
    description:
      "Request a structured Mentora LessonPlan for the current topic from the planner.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        topic: { type: "string" },
        studentRequest: { type: "string" },
      },
      required: ["topic"],
    },
  },
  {
    type: "function" as const,
    name: "replan_lesson",
    description:
      "Replan remaining steps after repeated confusion. Preserve completed steps.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        reason: { type: "string" },
      },
      required: ["reason"],
    },
  },
  {
    type: "function" as const,
    name: "update_lesson_state",
    description: "Update teaching phase, step progress, understanding, and flags.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        phase: { type: "string" },
        currentStepIndex: { type: "number" },
        understanding: { type: "number" },
        hintLevel: { type: "number" },
        lastClassification: { type: "string" },
        wasInterrupted: { type: "boolean" },
        questionsAsked: { type: "number" },
        completedStepId: { type: "string" },
      },
      required: ["phase"],
    },
  },
  {
    type: "function" as const,
    name: "complete_lesson",
    description: "Mark the lesson complete with mastery evidence.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        mastered: { type: "boolean" },
        summary: { type: "string" },
        understanding: { type: "number" },
      },
      required: ["mastered"],
    },
  },
];
