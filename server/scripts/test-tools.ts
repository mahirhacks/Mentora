#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  boardTools,
  createBoardState,
  listTools,
  runTool,
  type BoardState,
} from "../tools/index.js";

function printUsage() {
  console.log(`Mentora board tools CLI

Usage:
  npm run tools -- list
  npm run tools -- run <tool_name> '<json_input>'
  npm run tools -- demo
  npm run tools -- state [path_to_state.json]

Examples:
  npm run tools -- list
  npm run tools -- run create_shape '{"shape":"rectangle","x":80,"y":60,"width":180,"height":120}'
  npm run tools -- run divide_region '{"targetId":"shape_abc","divisions":3}'
  npm run tools -- demo
`);
}

function loadState(path?: string): BoardState {
  if (!path) {
    return createBoardState();
  }

  const raw = readFileSync(resolve(path), "utf8");
  return JSON.parse(raw) as BoardState;
}

async function main() {
  const [, , command, ...rest] = process.argv;

  if (!command || command === "help" || command === "--help") {
    printUsage();
    return;
  }

  if (command === "list") {
    for (const tool of listTools()) {
      console.log(`- ${tool.name}: ${tool.description}`);
    }
    return;
  }

  if (command === "schemas") {
    const toolName = rest[0];
    if (!toolName) {
      console.error("Usage: npm run tools -- schemas <tool_name>");
      process.exit(1);
    }

    const tool = boardTools.find((entry) => entry.name === toolName);
    if (!tool) {
      console.error(`Unknown tool: ${toolName}`);
      process.exit(1);
    }

    console.log(JSON.stringify({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      resultSchema: tool.resultSchema,
    }, null, 2));
    return;
  }

  if (command === "run") {
    const toolName = rest[0];
    const inputJson = rest[1] ?? "{}";
    const statePath = rest[2];

    if (!toolName) {
      console.error("Usage: npm run tools -- run <tool_name> '<json_input>' [state.json]");
      process.exit(1);
    }

    const state = loadState(statePath);
    const input = JSON.parse(inputJson) as unknown;
    const outcome = runTool(toolName, input, state);

    console.log(JSON.stringify(outcome, null, 2));
    process.exit(outcome.ok ? 0 : 1);
  }

  if (command === "demo") {
    let state = createBoardState();

    const steps: Array<{ tool: string; input: Record<string, unknown> }> = [
      {
        tool: "create_shape",
        input: {
          id: "fraction_bar",
          shape: "rectangle",
          x: 100,
          y: 120,
          width: 360,
          height: 72,
          style: { stroke: "#2d6cdf", fill: "#dbeafe" },
        },
      },
      {
        tool: "divide_region",
        input: { targetId: "fraction_bar", divisions: 4, direction: "vertical" },
      },
      {
        tool: "label_in",
        input: { targetId: "fraction_bar", text: "1/4", position: "center" },
      },
      {
        tool: "highlight",
        input: { targetId: "fraction_bar", padding: 10 },
      },
      {
        tool: "point_at",
        input: { targetId: "fraction_bar", label: "Focus here" },
      },
    ];

    for (const step of steps) {
      const outcome = runTool(step.tool, step.input, state);
      console.log(`\n> ${step.tool}`);
      console.log(JSON.stringify(outcome, null, 2));
      if (!outcome.ok) {
        process.exit(1);
      }
      state = outcome.state;
    }

    return;
  }

  if (command === "state") {
    const statePath = rest[0];
    const state = loadState(statePath);
    console.log(JSON.stringify(state, null, 2));
    return;
  }

  console.error(`Unknown command: ${command}`);
  printUsage();
  process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
