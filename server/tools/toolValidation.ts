import { Ajv2020 } from "ajv/dist/2020.js";
import type { ErrorObject, ValidateFunction } from "ajv";
import type { ToolDefinition } from "./types.js";

const ajv = new Ajv2020({
  allErrors: true,
  strict: false,
  strictNumbers: true,
});

function formatErrors(errors: ErrorObject[] | null | undefined): string {
  if (!errors?.length) {
    return "input does not match the tool schema";
  }

  return errors
    .map((error) => {
      const path = error.instancePath || "/";
      return `${path} ${error.message ?? "is invalid"}`;
    })
    .join("; ");
}

export function compileToolValidators(
  tools: readonly ToolDefinition[],
): Map<string, ValidateFunction> {
  return new Map(
    tools.map((tool) => [
      tool.name,
      ajv.compile(tool.inputSchema),
    ]),
  );
}

export function validateToolInput(
  validators: Map<string, ValidateFunction>,
  toolName: string,
  input: unknown,
): { ok: true } | { ok: false; error: string } {
  const validate = validators.get(toolName);
  if (!validate) {
    return { ok: false, error: `Unknown tool: ${toolName}` };
  }

  if (!validate(input)) {
    return {
      ok: false,
      error: `Invalid input for ${toolName}: ${formatErrors(validate.errors)}`,
    };
  }

  return { ok: true };
}
