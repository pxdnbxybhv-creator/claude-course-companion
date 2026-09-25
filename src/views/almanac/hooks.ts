import { useEffect, useState } from 'preact/hooks';
import type { RefObject } from 'preact';
import { state } from '../../app/store';

const mq = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

/** True when the chrome is dark (settings.theme, or the system when 'auto'). Reactive. */
export function useDark(): boolean {
  const theme = state.value.settings.theme;
  const [sys, setSys] = useState(() => !!mq?.matches);
  useEffect(() => {
    if (!mq) return;
    const on = () => setSys(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return theme === 'dark' || (theme === 'auto' && sys);
}

/** Content-box size of an element, updated on resize. */
export function useSize(ref: RefObject<HTMLElement>): { w: number; h: number } {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setSize((s) => (Math.abs(s.w - r.width) < 1 && Math.abs(s.h - r.height) < 1 ? s : { w: Math.round(r.width), h: Math.round(r.height) }));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return size;
}

export function dpr(): number {
  return Math.min(3, Math.max(1, (typeof window !== 'undefined' && window.devicePixelRatio) || 1));
}

/** Reactive `matchMedia(query).matches`. */
export function useMedia(query: string): boolean {
  const get = () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(query).matches;
  const [m, setM] = useState(get);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const q = window.matchMedia(query);
    const on = () => setM(q.matches);
    on();
    q.addEventListener?.('change', on);
    return () => q.removeEventListener?.('change', on);
  }, [query]);
  return m;
}
