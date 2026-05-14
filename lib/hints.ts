export interface ParsedHints {
  teacherHints: string;
  paperPattern: string;
}

/**
 * Parses the hint_text column from teacher_hints table.
 * Supports:
 * 1. JSON string: { "teacherHints": "...", "paperPattern": "..." }
 * 2. Legacy Plain Text: Treated as teacherHints, paperPattern is empty.
 */
export function parseCombinedHints(value: string | null | undefined): ParsedHints {
  if (!value) {
    return { teacherHints: '', paperPattern: '' };
  }

  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object') {
      return {
        teacherHints: typeof parsed.teacherHints === 'string' ? parsed.teacherHints : '',
        paperPattern: typeof parsed.paperPattern === 'string' ? parsed.paperPattern : ''
      };
    }
  } catch {
    // Legacy values were saved as plain text only.
  }

  return { teacherHints: value, paperPattern: '' };
}

/**
 * Stringifies hints for storage.
 */
export function stringifyHints(teacherHints: string, paperPattern: string): string {
  return JSON.stringify({
    teacherHints: teacherHints.trim(),
    paperPattern: paperPattern.trim(),
  });
}
