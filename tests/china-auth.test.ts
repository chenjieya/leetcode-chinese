import { describe, expect, it, vi } from 'vitest';
import { AuthService } from '../src/auth/AuthService';

vi.mock('../src/auth/BrowserWindowLogin', () => ({
  openLogin: vi.fn(async () => ({ kind: 'success', cookies: { LEETCODE_SESSION: 'cn', csrftoken: 'csrf' } })),
  clearLeetCodePartitionCookies: vi.fn(),
}));

describe('中国站登录验证', () => {
  function setup(who: { username: string; isPremium: boolean } | null) {
    const settings = { setAuthCookies: vi.fn(), setUsername: vi.fn(), setIsPremium: vi.fn() };
    const client = { reauthenticate: vi.fn(), fetchWhoami: vi.fn(async () => who) };
    return { settings, service: new AuthService(settings as never, client as never) };
  }
  it('登录成功后保存中国站用户名', async () => {
    const { settings, service } = setup({ username: 'china-user', isPremium: false });
    expect(await service.login()).toBe(true);
    expect(settings.setUsername).toHaveBeenCalledWith('china-user');
  });
  it('不能将无效或国际站 cookie 误报为登录成功', async () => {
    const { settings, service } = setup(null);
    expect(await service.login()).toBe(false);
    expect(settings.setAuthCookies).toHaveBeenLastCalledWith(null);
    await service.loginManual({ LEETCODE_SESSION: 'international', csrftoken: 'csrf' });
    expect(settings.setAuthCookies).toHaveBeenLastCalledWith(null);
    expect(settings.setUsername).toHaveBeenLastCalledWith(null);
  });
});
