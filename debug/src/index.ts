import { runSinglePrompt, startRepl } from "./repl.js";

const [, , ...promptParts] = process.argv;
const oneShotPrompt = promptParts.join(" ").trim();

if (oneShotPrompt) {
  runSinglePrompt(oneShotPrompt).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
} else {
  startRepl().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
