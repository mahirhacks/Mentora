const palette = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  magenta: "\x1b[35m",
  blue: "\x1b[34m",
  red: "\x1b[31m",
  gray: "\x1b[90m",
};

export function color(text: string, tone: keyof typeof palette): string {
  return `${palette[tone]}${text}${palette.reset}`;
}

export function banner(title: string) {
  const line = "─".repeat(Math.max(title.length + 4, 48));
  console.log(`\n${color(`┌${line}┐`, "cyan")}`);
  console.log(color(`│ ${title.padEnd(line.length - 2)} │`, "cyan"));
  console.log(color(`└${line}┘`, "cyan"));
}

export function section(label: string) {
  console.log(`\n${color(`▸ ${label}`, "bold")}`);
}

export function info(text: string) {
  console.log(color(text, "gray"));
}

export function success(text: string) {
  console.log(color(text, "green"));
}

export function warn(text: string) {
  console.log(color(text, "yellow"));
}

export function error(text: string) {
  console.log(color(text, "red"));
}

export function jsonBlock(value: unknown) {
  console.log(color(JSON.stringify(value, null, 2), "blue"));
}

export function inline(text: string) {
  process.stdout.write(text);
}

export function println(text = "") {
  console.log(text);
}

export function printHelp() {
  banner("Mentora teaching script debug");
  println("Ask Mentora to teach you anything. It will plan a script that mixes:");
  println("  speak → what the AI says out loud");
  println("  tool  → board drawing actions");
  println("  observe → simulated canvas read + explanation");
  println("");
  println(`${color("/help", "yellow")}      Show commands`);
  println(`${color("/script", "yellow")}    Show the last teaching script`);
  println(`${color("/state", "yellow")}     Print current board state`);
  println(`${color("/reset", "yellow")}     Clear conversation + board`);
  println(`${color("/run", "yellow")}       Execute tool steps from the last script`);
  println(`${color("/execute on|off", "yellow")}  Toggle auto-running tool steps`);
  println(`${color("/model", "yellow")}     Show planner model`);
  println(`${color("/quit", "yellow")}      Exit`);
}
