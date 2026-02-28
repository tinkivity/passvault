import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAutoLogout } from './useAutoLogout';

describe('useAutoLogout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initializes secondsLeft to timeoutSeconds', () => {
    const { result } = renderHook(() =>
      useAutoLogout({ timeoutSeconds: 10, onLogout: vi.fn(), active: true })
    );
    expect(result.current.secondsLeft).toBe(10);
  });

  it('counts down by 1 each second', () => {
    const { result } = renderHook(() =>
      useAutoLogout({ timeoutSeconds: 5, onLogout: vi.fn(), active: true })
    );
    act(() => { vi.advanceTimersByTime(3000); });
    expect(result.current.secondsLeft).toBe(2);
  });

  it('fires onLogout exactly once when the timer reaches 0', () => {
    const onLogout = vi.fn();
    renderHook(() =>
      useAutoLogout({ timeoutSeconds: 3, onLogout, active: true })
    );
    act(() => { vi.advanceTimersByTime(3000); });
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('does not fire onLogout again after reaching 0', () => {
    const onLogout = vi.fn();
    renderHook(() =>
      useAutoLogout({ timeoutSeconds: 2, onLogout, active: true })
    );
    // Advance to 0 — fires onLogout and clears the interval
    act(() => { vi.advanceTimersByTime(2000); });
    // Advance further — interval is already cleared, no additional calls
    act(() => { vi.advanceTimersByTime(8000); });
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('does not start the timer when active is false', () => {
    const onLogout = vi.fn();
    const { result } = renderHook(() =>
      useAutoLogout({ timeoutSeconds: 3, onLogout, active: false })
    );
    act(() => { vi.advanceTimersByTime(5000); });
    expect(onLogout).not.toHaveBeenCalled();
    expect(result.current.secondsLeft).toBe(3);
  });

  it('reset() restores secondsLeft to timeoutSeconds', () => {
    const { result } = renderHook(() =>
      useAutoLogout({ timeoutSeconds: 10, onLogout: vi.fn(), active: true })
    );
    act(() => { vi.advanceTimersByTime(6000); });
    expect(result.current.secondsLeft).toBe(4);
    act(() => { result.current.reset(); });
    expect(result.current.secondsLeft).toBe(10);
  });

  it('clears the interval on unmount', () => {
    const onLogout = vi.fn();
    const { unmount } = renderHook(() =>
      useAutoLogout({ timeoutSeconds: 5, onLogout, active: true })
    );
    unmount();
    act(() => { vi.advanceTimersByTime(10000); });
    expect(onLogout).not.toHaveBeenCalled();
  });
});
