export const variablesFirstTurn = {
  steps: [
    {
      step_type: "tool",
      tool_name: "create_shape",
      tool_input: {
        id: "variable_box",
        shape: "rectangle",
        x: 240,
        y: 140,
        width: 280,
        height: 180,
        label: "Python variable",
      },
    },
    {
      step_type: "tool",
      tool_name: "write_text",
      tool_input: {
        id: "age_name",
        text: "age",
        x: 300,
        y: 180,
        fontSize: 24,
        fontWeight: "bold",
      },
    },
    {
      step_type: "tool",
      tool_name: "write_text",
      tool_input: {
        id: "age_value",
        text: "24",
        x: 350,
        y: 245,
        fontSize: 28,
        fontWeight: "bold",
      },
    },
    {
      step_type: "observe",
      text: "The variable box contains the name age and value 24.",
      board_references: ["variable_box", "age_name", "age_value"],
    },
    {
      step_type: "speak",
      speech: {
        speech_id: "ask_stored_value",
        voice_script: "What value is stored in age?",
        board_references: ["variable_box", "age_name", "age_value"],
        question: "What value is stored in age?",
      },
    },
  ],
} satisfies Record<string, unknown>;

export const variablesSecondTurn = {
  steps: [
    {
      step_type: "speak",
      speech: {
        speech_id: "confirm_twenty_four",
        voice_script: "Correct. Age currently stores twenty-four.",
        board_references: ["variable_box", "age_name", "age_value"],
        question: null,
      },
    },
    {
      step_type: "tool",
      tool_name: "write_text",
      tool_input: {
        id: "age_expression",
        text: "age + 1",
        x: 700,
        y: 180,
        fontSize: 26,
        fontWeight: "bold",
      },
    },
    {
      step_type: "tool",
      tool_name: "write_text",
      tool_input: {
        id: "age_result",
        text: "25",
        x: 735,
        y: 250,
        fontSize: 30,
        fontWeight: "bold",
      },
    },
    {
      step_type: "observe",
      text: "The original value and age plus one result are both visible.",
      board_references: [
        "age_value",
        "age_expression",
        "age_result",
      ],
    },
    {
      step_type: "speak",
      speech: {
        speech_id: "ask_increment_result",
        voice_script: "If age stores twenty-four, what does age plus one equal?",
        board_references: [
          "age_value",
          "age_expression",
          "age_result",
        ],
        question: "What does age plus one equal?",
      },
    },
  ],
} satisfies Record<string, unknown>;

export const fractionsTurn = {
  steps: [
    {
      step_type: "tool",
      tool_name: "create_shape",
      tool_input: {
        id: "fraction_bar",
        shape: "rectangle",
        x: 220,
        y: 220,
        width: 600,
        height: 120,
      },
    },
    {
      step_type: "tool",
      tool_name: "divide_region",
      tool_input: {
        targetId: "fraction_bar",
        divisions: 4,
        direction: "vertical",
      },
    },
    {
      step_type: "tool",
      tool_name: "write_text",
      tool_input: {
        id: "fraction_caption",
        text: "1 out of 4 equal parts = 1/4",
        x: 360,
        y: 390,
        fontSize: 24,
      },
    },
    {
      step_type: "observe",
      text: "A bar is divided into four equal regions.",
      board_references: ["fraction_bar", "fraction_caption"],
    },
    {
      step_type: "speak",
      speech: {
        speech_id: "ask_fraction",
        voice_script: "If one of four equal parts is selected, what fraction is that?",
        board_references: ["fraction_bar", "fraction_caption"],
        question: "What fraction is one of four equal parts?",
      },
    },
  ],
} satisfies Record<string, unknown>;

export const arithmeticTurn = {
  steps: [
    {
      step_type: "tool",
      tool_name: "write_text",
      tool_input: {
        id: "sum_equation",
        text: "7 + 5 = 12",
        x: 640,
        y: 250,
        align: "center",
        fontSize: 36,
        fontWeight: "bold",
      },
    },
    {
      step_type: "tool",
      tool_name: "highlight",
      tool_input: {
        targetId: "sum_equation",
        padding: 12,
      },
    },
    {
      step_type: "speak",
      speech: {
        speech_id: "ask_sum",
        voice_script: "What is seven plus five?",
        board_references: ["sum_equation"],
        question: "What is seven plus five?",
      },
    },
  ],
} satisfies Record<string, unknown>;
