export function normalizeExamType(examType: string | null): string | null {
  return examType?.trim().toUpperCase() ?? null;
}

export function getScopeKeyForExamType(examType: string | null): string | null {
  const normalized = normalizeExamType(examType);

  if (normalized === "TT1" || normalized === "TERM TEST 1") {
    return "TERM TEST 1";
  }

  if (normalized === "TT2" || normalized === "TERM TEST 2") {
    return "TERM TEST 2";
  }

  return null;
}

export function isTTType(examType: string | null): boolean {
  const normalized = normalizeExamType(examType);
  return normalized === "TT1" || normalized === "TT2";
}

export function isEndSemType(examType: string | null): boolean {
  const normalized = normalizeExamType(examType);
  return normalized === "END_SEMESTER" || normalized === "END_SEM";
}

export interface TopicInfo {
  topic_id: string;
  module_id: string | null;
}

export type ScopedTopicsByExamType = Map<string, Set<string>>;

/**
 * Expands scoped topic sets to include child topic IDs.
 * The scope gate stores parent topic IDs, but question links reference child IDs.
 * This function adds all child IDs whose parent is in the scope set.
 *
 * @param scopedTopicsByExamType - Map of exam type -> Set of parent topic IDs
 * @param childToParentMap - Map of child topic ID -> parent topic ID
 * @returns New map with the same structure, but each set also contains child IDs
 */
export function expandScopeWithChildren(
  scopedTopicsByExamType: ScopedTopicsByExamType,
  childToParentMap: Map<string, string>
): ScopedTopicsByExamType {
  const expanded: ScopedTopicsByExamType = new Map();

  for (const [examType, parentIds] of scopedTopicsByExamType.entries()) {
    const expandedSet = new Set<string>(parentIds);

    for (const [childId, parentId] of childToParentMap.entries()) {
      if (parentIds.has(parentId)) {
        expandedSet.add(childId);
      }
    }

    expanded.set(examType, expandedSet);
  }

  return expanded;
}

export function deriveAllowedLeafTopicIds(
  rawScopeParentIds: Set<string>,
  allTopics: Array<{ id: string; parent_topic_id: string | null }>
): Set<string> | undefined {
  if (rawScopeParentIds.size === 0) {
    return undefined;
  }

  const parentToChildrenMap = new Map<string, string[]>();

  for (const topic of allTopics) {
    if (!topic.parent_topic_id) continue;

    const children = parentToChildrenMap.get(topic.parent_topic_id) ?? [];
    children.push(topic.id);
    parentToChildrenMap.set(topic.parent_topic_id, children);
  }

  const allowedTopicIds = new Set<string>();

  for (const parentId of rawScopeParentIds) {
    const children = parentToChildrenMap.get(parentId);

    if (children && children.length > 0) {
      for (const childId of children) {
        allowedTopicIds.add(childId);
      }
    } else {
      allowedTopicIds.add(parentId);
    }
  }

  return allowedTopicIds;
}
