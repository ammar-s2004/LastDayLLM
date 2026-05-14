import type { SupabaseClient } from "@supabase/supabase-js";

export interface ScopeEntry {
  topic_id: string;
  selected_sub_topics: string[] | null;
}

/**
 * Resolves parent topic IDs + optional sub-topic string filters
 * into the actual scorable child topic UUIDs.
 *
 * - If `selected_sub_topics` is null  → return ALL children of that parent
 * - If `selected_sub_topics` is array → return only children whose name matches
 * - If a parent has 0 children (leaf) → return the parent ID itself
 *
 * Returns a flat, deduplicated array of child (or leaf-parent) UUIDs.
 */
export async function resolveChildTopicIds(
  supabase: SupabaseClient,
  scopeEntries: ScopeEntry[]
): Promise<string[]> {
  if (scopeEntries.length === 0) return [];

  const parentIds = scopeEntries.map((e) => e.topic_id);

  // Fetch all children of the given parents in one query
  const { data: children, error } = await supabase
    .from("topics")
    .select("id, name, parent_topic_id")
    .in("parent_topic_id", parentIds);

  if (error) {
    throw new Error(`[resolveChildTopicIds] Failed to fetch children: ${error.message}`);
  }

  const childRows = children ?? [];

  // Group children by parent_topic_id
  const childrenByParent = new Map<string, Array<{ id: string; name: string }>>();
  for (const child of childRows) {
    const parentId = child.parent_topic_id as string;
    const existing = childrenByParent.get(parentId) ?? [];
    existing.push({ id: child.id, name: child.name });
    childrenByParent.set(parentId, existing);
  }

  const resolvedIds = new Set<string>();

  for (const entry of scopeEntries) {
    const parentChildren = childrenByParent.get(entry.topic_id);

    if (!parentChildren || parentChildren.length === 0) {
      // Leaf parent — no children exist, score the parent itself
      resolvedIds.add(entry.topic_id);
      continue;
    }

    if (entry.selected_sub_topics === null) {
      // All sub-topics selected
      for (const child of parentChildren) {
        resolvedIds.add(child.id);
      }
    } else {
      // Filter to only the selected sub-topic names
      const selectedSet = new Set(
        entry.selected_sub_topics.map((s) => s.trim().toLowerCase())
      );

      for (const child of parentChildren) {
        if (selectedSet.has(child.name.trim().toLowerCase())) {
          resolvedIds.add(child.id);
        }
      }

      // If no matches found (stale selection), fall back to all children
      if (resolvedIds.size === 0) {
        for (const child of parentChildren) {
          resolvedIds.add(child.id);
        }
      }
    }
  }

  return Array.from(resolvedIds);
}
