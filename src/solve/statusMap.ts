// src/solve/statusMap.ts
//
// LC status_code integer → verdict kind + display name.
// Reference: skygragon/leetcode-cli lib/helper.js statusToName (2019).
// Phase 3 adds the 'unknown' fallback per CONTEXT D-15 so we never crash
// when LC introduces a new status integer; the modal shows the raw msg
// with a `Copy payload` action for bug-report filing.
//
// Purity: no imports, no state, no I/O.

export type VerdictKind =
  | 'ac'
  | 'wa'
  | 'mle'
  | 'ole'
  | 'tle'
  | 're'
  | 'ie'
  | 'ce'
  | 'unknown-lc'
  | 'unknown';

export interface StatusInfo {
  kind: VerdictKind;
  displayName: string;
}

const KNOWN: Readonly<Record<number, StatusInfo>> = {
  10: { kind: 'ac',         displayName: '通过' },
  11: { kind: 'wa',         displayName: '答案错误' },
  12: { kind: 'mle',        displayName: '超出内存限制' },
  13: { kind: 'ole',        displayName: '超出输出限制' },
  14: { kind: 'tle',        displayName: '超出时间限制' },
  15: { kind: 're',         displayName: '运行错误' },
  16: { kind: 'ie',         displayName: '内部错误' },
  20: { kind: 'ce',         displayName: '编译错误' },
  21: { kind: 'unknown-lc', displayName: '未知错误' },
};

export function classifyStatus(code: number, _msg?: string): StatusInfo {
  const known = KNOWN[code];
  if (known) return known;
  return { kind: 'unknown', displayName: `未知判题状态（${code}）` };
}
