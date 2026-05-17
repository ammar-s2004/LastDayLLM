# Switch from SVG to Mermaid Diagrams

## Architecture Overview
The current system generates inline SVG diagrams directly via the Gemini API, which consumes high token bandwidth, is prone to formatting/JSON parsing errors, and is difficult to style consistently. We are migrating to **Mermaid diagrams**. The AI will generate raw Mermaid syntax (which is extremely token-efficient), and the frontend will render it into beautifully styled SVGs natively.

We will **not** modify the database schema. The existing `diagram_svg` column (type: `text`) in the `generated_questions` table will simply store the raw Mermaid string for new records.

---

## Phase 1: Frontend Infrastructure (Dependency & Component)

**Objective:** Equip the React frontend with the ability to safely parse and render Mermaid syntax into the dark-themed UI.

**Inputs:** Raw Mermaid string.
**Outputs:** Rendered SVG inside the UI.

### Tasks:
1. **Install Dependency:** 
   - Install the official `mermaid` npm package (`npm install mermaid`).
2. **Create Mermaid Component:**
   - Create a new file: `components/ui/mermaid.tsx`.
   - Build a React client component that accepts a `chart` string prop.
   - Use `mermaid.initialize` (or `mermaid.render`) inside a `useEffect` hook to parse the `chart` prop and inject the resulting SVG into a `div` ref.
   - Configure the `mermaid` initialization to use a dark theme matching the application (`theme: 'dark'`, with custom variables if needed for `#1a1a2e` backgrounds and `#e2e8f0` text).
   - Ensure the component handles parsing errors gracefully (e.g., catching errors and displaying a fallback message rather than crashing the page).

**Done when:** The `<Mermaid>` component can successfully take a hardcoded Mermaid string and render it cleanly on a test page or within an isolated environment.

---

## Phase 2: AI Prompt Update & UI Integration

**Objective:** Instruct the AI to generate Mermaid instead of SVG, and hook the new `<Mermaid>` component into the question view.

### Tasks:
1. **Update AI Prompt (`lib/ai-prompts.ts`):**
   - Locate the `DIAGRAMS — INLINE SVG` section.
   - Rename it to `DIAGRAMS — MERMAID SYNTAX`.
   - Remove all instructions regarding SVG nodes, `viewBox`, and dark-mode hex codes.
   - Add explicit instructions to generate raw **Mermaid syntax** (e.g., `graph TD; ...`).
   - Add a critical warning: The output must **not** be wrapped in markdown code blocks (e.g., no ` ```mermaid ` fences) since it goes directly into a JSON string value.
   - Update the output format example to reflect that `diagram_svg` will now hold Mermaid code: `"diagram_svg": "graph TD\n A-->B"` or `null`.

2. **Update UI Integration (`app/questions/[subjectId]/[moduleId]/page.tsx`):**
   - Import the new `<Mermaid>` component.
   - Locate the rendering block for diagrams:
     ```tsx
     {question.diagram_svg && question.diagram_svg.trim().startsWith('<svg') && (
        <div dangerouslySetInnerHTML={{ __html: question.diagram_svg }} />
     )}
     ```
   - Modify the logic to provide **backwards compatibility**:
     - If `question.diagram_svg` starts with `<svg`, continue to use `dangerouslySetInnerHTML`.
     - Else if `question.diagram_svg` contains text, pass it to `<Mermaid chart={question.diagram_svg} />`.

**Done when:** Running `generate-questions` produces valid Mermaid strings in the database, and the UI seamlessly renders them alongside any older SVG questions.

---
**Do not touch:** The Supabase database schema or the Trigger.dev background task logic (other than ensuring the Zod schema is not rigidly enforcing an `<svg>` prefix, which it currently is not).
