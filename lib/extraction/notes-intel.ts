export interface NotesIntelResult {
  source_file_name: string;

  topic_map: Array<{
    topic: string;
    subtopics_covered: string[];
    not_covered: string[];
  }>;

  topic_coverage: Array<{
    topic: string;
    subtopic: string;
    has_derivation: boolean;
    has_worked_example: boolean;
    has_definition: boolean;
    has_diagram: boolean;
    has_code: boolean;
    mention_density: number;
    explanation_depth: number;
    explicitly_highlighted: boolean;
    coverage_confidence: number;
  }>;

  concept_intel: Array<{
    topic: string;
    subtopic: string;
    intel: string;
    page_range: string;
  }>;

  verbatim: Array<{
    topic: string;
    subtopic: string;
    type: string;
    label: string;
    content: string;
    page: string;
  }>;

  diagrams: Array<{
    topic: string;
    subtopic: string;
    description: string;
    page: string;
  }>;
}

// ============================================================================
// Compressed AI Response Types (what Gemini returns)
// ============================================================================

export interface RawNotesIntelResult {
  tm: Array<{
    t: string;    // topic name (exact match from syllabus)
    sc: string[]; // subtopic names covered
    nc: string[]; // subtopic names not covered
  }>;
  tc: Array<{
    t: string;    // topic name
    st: string;   // subtopic name
    md: number;   // mention_density (0.0-1.0)
    ed: number;   // explanation_depth (0.0-1.0)
    cc: number;   // coverage_confidence (0.0-1.0)
    hd: boolean;  // has_derivation
    he: boolean;  // has_worked_example
    hf: boolean;  // has_definition
    hg: boolean;  // has_diagram
    hc: boolean;  // has_code
    eh: boolean;  // explicitly_highlighted
  }>;
  concept_intel: Array<{
    t: string;    // topic
    st: string;   // subtopic
    i: string[] | string; // intel text bullets (array of 4-8 items) or string for backward compatibility
    p: string;    // page_range
  }>;
  verbatim: Array<{
    t: string;    // topic
    st: string;   // subtopic (leaf)
    ty: string;   // type
    l: string;    // label
    c: string;    // content (exact text)
    p: string;    // page
  }>;
  diagrams: Array<{
    t: string;    // topic
    st: string;   // subtopic (leaf)
    d: string;    // description (10-20 words)
    p: string;    // page
  }>;
}

// ============================================================================
// Decoder: compressed → full
// ============================================================================

export function decodeNotesIntel(
  raw: RawNotesIntelResult,
  filename: string
): NotesIntelResult {
  return {
    source_file_name: filename,

    topic_map: raw.tm.map((item) => ({
      topic: item.t,
      subtopics_covered: item.sc,
      not_covered: item.nc,
    })),

    topic_coverage: raw.tc.map((item) => ({
      topic: item.t,
      subtopic: item.st,
      mention_density: item.md,
      explanation_depth: item.ed,
      coverage_confidence: item.cc,
      has_derivation: item.hd,
      has_worked_example: item.he,
      has_definition: item.hf,
      has_diagram: item.hg,
      has_code: item.hc,
      explicitly_highlighted: item.eh,
    })),

    concept_intel: raw.concept_intel.map((item) => ({
      topic: item.t,
      subtopic: item.st,
      intel: Array.isArray(item.i) ? '• ' + item.i.join('\n• ') : item.i,
      page_range: item.p,
    })),

    verbatim: raw.verbatim.map((item) => ({
      topic: item.t,
      subtopic: item.st,
      type: item.ty,
      label: item.l,
      content: item.c,
      page: item.p,
    })),

    diagrams: raw.diagrams.map((item) => ({
      topic: item.t,
      subtopic: item.st,
      description: item.d,
      page: item.p,
    })),
  };
}
