# Fix: TE Score Normalization
Date: 2026-05-03

## File
`lib/te/compute.ts` — ONLY file to touch.

## Root Cause
Lines 65–86 group results by module, find `maxRaw` per module, then set `te_score = te_raw / maxRaw`. This is wrong. TE raw scores come directly from the LLM on a 0–1 scale — they are already normalized. When a module has no LLM-scored topics, `maxRaw = 0` and the branch exits early leaving `te_score = 0` — but when `maxRaw > 0` due to the 0.1 default floor for unscored topics, every unscored topic divides 0.1 / 0.1 = 1.0, inflating their scores to maximum.

## Change
Remove the entire per-module grouping block (lines 65–86). Instead, after building `results`, do a single pass to set `te_score = te_raw` directly for every result.

### Before (lines 65–86)
```ts
const byModule = new Map<string, TEResult[]>();
for (const result of results) {
  const key = result.module_id ?? "__null__";
  const existing = byModule.get(key) ?? [];
  existing.push(result);
  byModule.set(key, existing);
}

for (const moduleResults of byModule.values()) {
  const maxRaw = moduleResults.reduce((max, result) => Math.max(max, result.te_raw), 0);

  if (maxRaw === 0) {
    for (const result of moduleResults) {
      result.te_score = 0;
    }
    continue;
  }

  for (const result of moduleResults) {
    result.te_score = result.te_raw / maxRaw;
  }
}
```

### After (replace the entire block with)
```ts
for (const result of results) {
  result.te_score = result.te_raw;
}
```

## What must NOT change
- `getConfidenceScalar` — untouched
- `computeTE` signature — untouched
- All interfaces — untouched
- The 0.1 floor logic (it lives in the caller / LLM prompt, not here)
- `trigger/tasks/compute-te.ts` — untouched
- Any other file

## Done Criteria
1. `lib/te/compute.ts` no longer contains `byModule`, `maxRaw`, or `/ maxRaw`
2. Single loop sets `result.te_score = result.te_raw` for all results
3. TypeScript compiles with no errors
4. No other files modified
