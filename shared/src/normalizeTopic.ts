/**
 * Turn a free-form ask into a clean lesson subject.
 * "Teach me Python" → "Python"
 * "can you explain fractions please" → "fractions"
 */
export function normalizeTopic(raw: string): string {
  let t = raw.trim().replace(/\s+/g, " ");
  if (!t) return "New topic";

  t = t.replace(/^["'`]+|["'`]+$/g, "").trim();
  t = t.replace(/[.!?]+$/g, "").trim();

  const wrappers: RegExp[] = [
    /^(please\s+)?(can you|could you|would you)\s+(please\s+)?(teach|explain|show|help)\s+(me\s*[:\-–—]?\s*)?(about\s+|with\s+|how\s+to\s+)?/i,
    /^(please\s+)?(teach|explain|show)\s+(me\s*[:\-–—]?\s*)?(about\s+|how\s+(to\s+)?|with\s+)?/i,
    /^(i\s+)?(want to|wanna|need to|would like to)\s+(learn|understand|know)\s+(more\s+)?(about\s+)?/i,
    /^(help me\s+)(learn|understand|with)\s+(about\s+)?/i,
    /^(let'?s\s+)(learn|study|cover|do)\s+/i,
    /^(learn|study)\s+(about\s+)?/i,
  ];

  for (const re of wrappers) {
    const next = t.replace(re, "").trim();
    if (next && next.length >= 1 && next.toLowerCase() !== t.toLowerCase()) {
      t = next;
      break;
    }
  }

  t = t.replace(/^[:\-–—]\s*/, "").trim();
  t = t.replace(/^about\s+/i, "").trim();
  t = t.replace(/[.!?]+$/g, "").trim();

  if (!t) return raw.trim().replace(/[.!?]+$/g, "").trim() || "New topic";

  // Light title-case only when the whole phrase is lowercase.
  if (t === t.toLowerCase()) {
    t = t.replace(/\b\p{L}/u, (ch) => ch.toUpperCase());
  }

  return t;
}
