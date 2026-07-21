/**
 * Dynamic teaching color palettes keyed by the student's canvas background.
 * Only the palette for the active background is injected into the planner prompt.
 */

export interface TeachingColorPalette {
  canvas_color: string;
  canvas_label: string;
  marking_color: string;
  headline_1_color: string;
  headline_2_color: string;
  body_text_color: string;
  shape_stroke_color: string;
  shape_fill_color: string;
  accent_color: string;
  highlight_color: string;
  arrow_color: string;
}

const DEFAULT_BACKGROUND = "#f7f7f8";

const PALETTES: Record<string, TeachingColorPalette> = {
  // Paper / near-white board
  "#f7f7f8": {
    canvas_color: "#f7f7f8",
    canvas_label: "paper",
    marking_color: "#DC143C",
    headline_1_color: "#454545",
    headline_2_color: "#171717",
    body_text_color: "#1e293b",
    shape_stroke_color: "#1e293b",
    shape_fill_color: "rgba(59, 130, 246, 0.18)",
    accent_color: "#2563eb",
    highlight_color: "#f59e0b",
    arrow_color: "#0f766e",
  },
  // Warm cream board
  "#f3efe6": {
    canvas_color: "#f3efe6",
    canvas_label: "cream",
    marking_color: "#B91C1C",
    headline_1_color: "#3F3A32",
    headline_2_color: "#1C1917",
    body_text_color: "#292524",
    shape_stroke_color: "#44403C",
    shape_fill_color: "rgba(14, 116, 144, 0.18)",
    accent_color: "#0E7490",
    highlight_color: "#C2410C",
    arrow_color: "#115E59",
  },
  // Cool slate / blue-gray board
  "#e8eef5": {
    canvas_color: "#e8eef5",
    canvas_label: "slate",
    marking_color: "#BE123C",
    headline_1_color: "#334155",
    headline_2_color: "#0F172A",
    body_text_color: "#1E293B",
    shape_stroke_color: "#1E293B",
    shape_fill_color: "rgba(79, 70, 229, 0.16)",
    accent_color: "#4F46E5",
    highlight_color: "#D97706",
    arrow_color: "#0F766E",
  },
};

export function normalizeCanvasBackground(color: string | undefined): string {
  const normalized = (color ?? DEFAULT_BACKGROUND).trim().toLowerCase();
  return PALETTES[normalized] ? normalized : DEFAULT_BACKGROUND;
}

export function getTeachingColorPalette(
  canvasColor: string | undefined,
): TeachingColorPalette {
  return PALETTES[normalizeCanvasBackground(canvasColor)]!;
}

/** Compact prompt block — only the active palette, no unused alternatives. */
export function formatColorPaletteForPrompt(
  canvasColor: string | undefined,
): string {
  const palette = getTeachingColorPalette(canvasColor);
  return [
    `color_palette(canvas_color="${palette.canvas_label}" / ${palette.canvas_color}):`,
    `  marking_color: ${palette.marking_color}        # circles, underlines, emphasis marks`,
    `  headline_1_color: ${palette.headline_1_color}  # primary titles / key labels`,
    `  headline_2_color: ${palette.headline_2_color}  # secondary headings`,
    `  body_text_color: ${palette.body_text_color}    # equations, notes, body copy`,
    `  shape_stroke_color: ${palette.shape_stroke_color}`,
    `  shape_fill_color: ${palette.shape_fill_color}`,
    `  accent_color: ${palette.accent_color}          # important boxes / links`,
    `  highlight_color: ${palette.highlight_color}    # highlight tool strokes`,
    `  arrow_color: ${palette.arrow_color}`,
    "",
    "Use ONLY this palette for new board styles on the current canvas.",
    "Prefer these hex values in tool style.stroke / style.fill so marks stay readable.",
  ].join("\n");
}
