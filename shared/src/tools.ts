/** OpenAI Realtime tool definitions (JSON Schema). Zod validates at runtime. */
export const REALTIME_TOOLS = [
  {
    type: "function" as const,
    name: "board_apply_actions",
    description:
      "Apply whiteboard actions in PIXEL coords on total pixels 1100x620 (origin top-left). Tool result includes boardMapText with 'px x1,y1 to x2,y2' ranges. Then continue the teaching loop: ask a check question and update_lesson_state waiting_for_student. Use point_at/show_pointer for the red teaching dot while explaining. Prefer short batches.",
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
      "Return a pixel-level whiteboard map: total pixels, each object as 'px x1,y1 to x2,y2' with center, student ink ranges, overlaps, and free slots. Call before placing or pointing if the last map is stale.",
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
