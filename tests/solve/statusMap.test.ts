import { describe, it, expect } from 'vitest';
import { classifyStatus } from '../../src/solve/statusMap';

describe('classifyStatus (SOLVE-06, SOLVE-07, CONTEXT D-15)', () => {
  it('10 → Accepted (ac)', () => {
    const info = classifyStatus(10);
    expect(info.kind).toBe('ac');
    expect(info.displayName).toBe('通过');
  });

  it('11 → Wrong Answer (wa)', () => {
    const info = classifyStatus(11);
    expect(info.kind).toBe('wa');
    expect(info.displayName).toBe('答案错误');
  });

  it('12 → Memory Limit Exceeded (mle)', () => {
    const info = classifyStatus(12);
    expect(info.kind).toBe('mle');
    expect(info.displayName).toBe('超出内存限制');
  });

  it('13 → Output Limit Exceeded (ole)', () => {
    const info = classifyStatus(13);
    expect(info.kind).toBe('ole');
    expect(info.displayName).toBe('超出输出限制');
  });

  it('14 → Time Limit Exceeded (tle)', () => {
    const info = classifyStatus(14);
    expect(info.kind).toBe('tle');
    expect(info.displayName).toBe('超出时间限制');
  });

  it('15 → Runtime Error (re)', () => {
    const info = classifyStatus(15);
    expect(info.kind).toBe('re');
    expect(info.displayName).toBe('运行错误');
  });

  it('16 → Internal Error (ie)', () => {
    const info = classifyStatus(16);
    expect(info.kind).toBe('ie');
    expect(info.displayName).toBe('内部错误');
  });

  it('20 → Compile Error (ce)', () => {
    const info = classifyStatus(20);
    expect(info.kind).toBe('ce');
    expect(info.displayName).toBe('编译错误');
  });

  it('21 → Unknown Error (unknown-lc)', () => {
    const info = classifyStatus(21);
    expect(info.kind).toBe('unknown-lc');
    expect(info.displayName).toBe('未知错误');
  });

  it('unrecognized code falls back to kind `unknown` with msg display (D-15)', () => {
    const info = classifyStatus(999, 'Mysterious new status');
    expect(info.kind).toBe('unknown');
    expect(info.displayName).toBe('未知判题状态（999）');
  });

  it('unrecognized code without msg renders `Unrecognized status {N}`', () => {
    const info = classifyStatus(42);
    expect(info.kind).toBe('unknown');
    expect(info.displayName).toContain('42');
  });

  it('is pure — same input returns same output', () => {
    expect(classifyStatus(10)).toEqual(classifyStatus(10));
  });
});
