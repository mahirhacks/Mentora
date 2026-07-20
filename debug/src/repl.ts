import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import OpenAI from "openai";
import { createBoardState } from "../../server/tools/index.js";
import { loadEnv } from "./loadEnv.js";
import {
  playTeachingScript,
  printScriptExecutionResults,
  printTeachingScript,
  streamTeachingScript,
} from "./planner.js";
import { DebugSession, buildSystemPrompt } from "./session.js";
import {
  banner,
  color,
  error,
  info,
  jsonBlock,
  printHelp,
  success,
  warn,
} from "./terminalUi.js";

async function handleTeachingPrompt(
  client: OpenAI,
  model: string,
  session: DebugSession,
  prompt: string,
) {
  session.messages[0] = {
    role: "system",
    content: buildSystemPrompt(session.boardState),
  };
  session.addUserPrompt(prompt);

  banner("Streaming teaching script");
  info(`Prompt: ${prompt}`);

  const { script } = await streamTeachingScript(client, model, session);
  session.lastScript = script;

  const executionResults = playTeachingScript(
    session,
    script,
    session.autoExecute,
  );

  if (!session.autoExecute && script.some((step) => step.kind === "tool")) {
    info("Script prepared only. Use /execute on or /run to execute tool steps.");
  }

  session.addScriptTurn(script, executionResults);
  return { script, executionResults };
}

export async function runSinglePrompt(prompt: string) {
  const env = loadEnv();
  const client = new OpenAI({ apiKey: env.openaiApiKey });
  const session = new DebugSession(buildSystemPrompt(createBoardState()));
  session.autoExecute = true;

  const result = await handleTeachingPrompt(
    client,
    env.plannerModel,
    session,
    prompt,
  );
  console.log(
    `REHEARSAL_RESULT ${JSON.stringify({
      valid: result.script.length > 0,
      stepCount: result.script.length,
      toolCount: result.script.filter((step) => step.kind === "tool").length,
      toolFailures: result.executionResults.filter((entry) => !entry.ok)
        .length,
      clampedTools: result.executionResults.filter(
        (entry) =>
          entry.result &&
          typeof entry.result === "object" &&
          "clamped" in entry.result &&
          entry.result.clamped === true,
      ).length,
      autoErasedObjects: result.executionResults.reduce(
        (count, entry) =>
          count +
          (entry.result &&
          typeof entry.result === "object" &&
          "autoErased" in entry.result &&
          Array.isArray(entry.result.autoErased)
            ? entry.result.autoErased.length
            : 0),
        0,
      ),
      boardObjectCount: Object.keys(session.boardState.objects).length,
    })}`,
  );
}

export async function startRepl() {
  const env = loadEnv();
  const client = new OpenAI({ apiKey: env.openaiApiKey });
  let session = new DebugSession(buildSystemPrompt(createBoardState()));

  const rl = createInterface({ input, output });

  printHelp();
  info(`Planner model: ${color(env.plannerModel, "cyan")}`);
  info(`Auto-execute: ${color("off", "yellow")}`);

  while (true) {
    const prompt = (await rl.question(`\n${color("mentora>", "cyan")} `)).trim();
    if (!prompt) {
      continue;
    }

    if (prompt.startsWith("/")) {
      const outcome = handleCommand(prompt, session, env.plannerModel);
      if (outcome === "exit") {
        break;
      }
      if (outcome === "reset") {
        session = new DebugSession(buildSystemPrompt(createBoardState()));
        success("Session reset.");
      }
      continue;
    }

    try {
      await handleTeachingPrompt(client, env.plannerModel, session, prompt);
    } catch (caught) {
      error(caught instanceof Error ? caught.message : String(caught));
    }
  }

  rl.close();
  println("Goodbye.");
}

function handleCommand(
  prompt: string,
  session: DebugSession,
  model: string,
): "continue" | "reset" | "exit" {
  const [command, arg] = prompt.slice(1).split(/\s+/, 2);

  switch (command.toLowerCase()) {
    case "help":
      printHelp();
      return "continue";
    case "script":
      if (session.lastScript.length === 0) {
        warn("No teaching script from the last turn.");
        return "continue";
      }
      printTeachingScript(session.lastScript, session.boardState);
      return "continue";
    case "state":
      banner("Board state");
      jsonBlock(session.boardState);
      return "continue";
    case "reset":
      return "reset";
    case "execute":
      if (arg === "on") {
        session.autoExecute = true;
        success("Auto-execute enabled.");
      } else if (arg === "off") {
        session.autoExecute = false;
        warn("Auto-execute disabled.");
      } else {
        info(`Auto-execute is ${session.autoExecute ? "on" : "off"}`);
      }
      return "continue";
    case "run":
      if (session.lastScript.length === 0) {
        warn("No teaching script from the last turn.");
        return "continue";
      }
      printScriptExecutionResults(
        playTeachingScript(session, session.lastScript, true),
      );
      return "continue";
    case "model":
      info(`Planner model: ${color(model, "cyan")}`);
      return "continue";
    case "quit":
    case "exit":
      return "exit";
    default:
      warn(`Unknown command: /${command}`);
      return "continue";
  }
}

function println(text = "") {
  console.log(text);
}
