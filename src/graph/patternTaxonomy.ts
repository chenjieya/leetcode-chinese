// src/graph/patternTaxonomy.ts
//
// Phase 11 Plan 01 Task 1 — 22 seed patterns + name normalization.
//
// Purity contract:
//   - No imports (zero external deps).
//   - No I/O, no DOM, no Obsidian deps, no captured state.
//   - Same input -> same output.
//
// The 22 seed patterns are the 18 NeetCode patterns + 4 additions
// (Prefix Sum, Monotonic Stack, Topological Sort, Union-Find) per D-02.
// These are a SEED, not a ceiling — AI can create new pattern names
// when no seed pattern fits.

/**
 * Canonical 22-pattern seed taxonomy. AI is free to create new pattern
 * names when none of these fits — new patterns auto-create hub notes
 * with no user confirmation (D-02).
 */
export const SEED_PATTERNS: readonly string[] = [
  // Core data structures
  'Arrays & Hashing',
  'Two Pointers',
  'Sliding Window',
  'Stack',
  'Monotonic Stack',
  'Monotonic Queue',
  'Linked List',
  'Trees',
  'Tries',
  'Heap / Priority Queue',
  'Graphs',
  'Advanced Graphs',
  // Search & sort
  'Binary Search',
  'Sorting',
  // Dynamic programming
  '1-D Dynamic Programming',
  '2-D Dynamic Programming',
  'Digit DP',
  'Bitmask DP',
  // Greedy & intervals
  'Greedy',
  'Intervals',
  'Sweep Line',
  // String algorithms
  'String Matching',
  'Rolling Hash',
  // Math & number theory
  'Math & Geometry',
  'Number Theory',
  'Combinatorics',
  'Bit Manipulation',
  // Prefix/range techniques
  'Prefix Sum',
  'Segment Tree',
  'Binary Indexed Tree',
  // Graph algorithms
  'Topological Sort',
  'Union-Find',
  'Shortest Path',
  'Minimum Spanning Tree',
  // Backtracking & recursion
  'Backtracking',
  'Divide & Conquer',
  // Advanced
  'Matrix Exponentiation',
  'Meet In The Middle',
  'Game Theory',
  'Simulation',
] as const;

/** 内部模式名与文件名保持稳定，界面和笔记链接使用中文显示名。 */
const PATTERN_LABELS: Readonly<Record<string, string>> = {
  'Arrays & Hashing': '数组与哈希', 'Two Pointers': '双指针', 'Sliding Window': '滑动窗口',
  Stack: '栈', 'Monotonic Stack': '单调栈', 'Monotonic Queue': '单调队列',
  'Linked List': '链表', Trees: '树', Tries: '前缀树', 'Heap / Priority Queue': '堆与优先队列',
  Graphs: '图', 'Advanced Graphs': '进阶图算法', 'Binary Search': '二分查找', Sorting: '排序',
  '1-D Dynamic Programming': '一维动态规划', '2-D Dynamic Programming': '二维动态规划',
  'Digit DP': '数位动态规划', 'Bitmask DP': '状态压缩动态规划', Greedy: '贪心',
  Intervals: '区间', 'Sweep Line': '扫描线', 'String Matching': '字符串匹配', 'Rolling Hash': '滚动哈希',
  'Math & Geometry': '数学与几何', 'Number Theory': '数论', Combinatorics: '组合数学',
  'Bit Manipulation': '位运算', 'Prefix Sum': '前缀和', 'Segment Tree': '线段树',
  'Binary Indexed Tree': '树状数组', 'Topological Sort': '拓扑排序', 'Union-Find': '并查集',
  'Shortest Path': '最短路径', 'Minimum Spanning Tree': '最小生成树', Backtracking: '回溯',
  'Divide & Conquer': '分治', 'Matrix Exponentiation': '矩阵快速幂',
  'Meet In The Middle': '折半搜索', 'Game Theory': '博弈论', Simulation: '模拟', Other: '其他',
};

export function patternDisplayName(name: string): string {
  const normalized = normalizePatternName(name);
  return PATTERN_LABELS[normalized] ?? name;
}

/**
 * Normalize a pattern name. Seed-aware and capital-preserving:
 *   1. Trim and collapse internal whitespace to single spaces.
 *   2. Empty / whitespace-only input returns '' (never throws).
 *   3. If the collapsed name case-insensitively matches a SEED_PATTERN,
 *      return that seed VERBATIM (canonicalizes case variants to the seed).
 *   4. Otherwise (AI-invented name) capitalize the first char of each word
 *      WITHOUT lowercasing the remainder, preserving interior capitals.
 *
 * Examples:
 *   '  two   pointers  '          -> 'Two Pointers'        (seed canonicalization)
 *   '1-d dynamic programming'     -> '1-D Dynamic Programming' (seed, verbatim)
 *   'union-find'                  -> 'Union-Find'          (seed, verbatim)
 *   "Mo's Algorithm"              -> "Mo's Algorithm"      (invented, interior caps kept)
 *   'Heavy-Light Decomposition'   -> 'Heavy-Light Decomposition' (invented)
 */
export function normalizePatternName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  if (trimmed.length === 0) return '';
  const english = Object.keys(PATTERN_LABELS).find(key => PATTERN_LABELS[key] === trimmed);
  if (english) return english;

  const lower = trimmed.toLowerCase();
  for (const seed of SEED_PATTERNS) {
    if (seed.toLowerCase() === lower) return seed;
  }

  return trimmed
    .split(' ')
    .map((word) => {
      if (word.length === 0) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}
