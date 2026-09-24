// A demo garden with a few months of believable history — for first-time visitors and screenshots.
import type { AppState, DateKey, Habit, PlantKind } from '../core/types';
import { addDays, weekday } from '../core/date';
import { hashString, makeRng } from '../core/rng';
import { defaultSettings } from './store';

const DEMO: { name: [string, string]; plant: PlantKind; days?: number[]; age: number; rate: number }[] = [
  { name: ['晨读半小时', 'Read 30 min'], plant: 'plum', age: 92, rate: 0.86 },
  { name: ['练字一页', 'Calligraphy'], plant: 'orchid', age: 40, rate: 0.8 },
  { name: ['跑步', 'Run'], plant: 'bamboo', days: [1, 3, 5, 6], age: 70, rate: 0.9 },
  { name: ['早睡', 'Sleep by 11'], plant: 'chrysanthemum', age: 21, rate: 0.62 },
  { name: ['冥想十分钟', 'Meditate'], plant: 'pine', age: 120, rate: 0.93 },
  { name: ['写代码', 'Ship code'], plant: 'lotus', age: 12, rate: 0.75 },
];

export function demoState(today: DateKey, lang: 'zh' | 'en', seed = 2026): AppState {
  const rng = makeRng(seed);
  const habits: Habit[] = [];
  const checkins: Record<string, DateKey[]> = {};
  DEMO.forEach((d, i) => {
    const id = `demo${i}`;
    const createdAt = addDays(today, -d.age);
    habits.push({ id, name: d.name[lang === 'zh' ? 0 : 1], plant: d.plant, seed: hashString(id + d.plant), createdAt, ...(d.days ? { days: d.days } : {}) });
    const days: DateKey[] = [];
    for (let k = d.age; k >= 1; k--) {
      const day = addDays(today, -k);
      if (d.days && !d.days.includes(weekday(day))) continue;
      // Habits get steadier with time.
      const p = d.rate * (0.75 + 0.25 * (1 - k / d.age));
      if (rng() < p) days.push(day);
    }
    if (i % 2 === 0) days.push(today);
    checkins[id] = days;
  });
  const notes: Record<DateKey, string> = {};
  const lines = lang === 'zh'
    ? ['雨后，桂花开了。', '读完了《浮生六记》。', '跑步时看见一只白鹭。', '早睡的第一天。', '给远方的朋友写了信。']
    : ['Osmanthus opened after the rain.', 'Finished Six Records of a Floating Life.', 'Saw an egret on my run.', 'First early night.', 'Wrote to an old friend.'];
  lines.forEach((l, i) => (notes[addDays(today, -(i * 3 + 1))] = l));
  const focus = Array.from({ length: 40 }, (_, i) => {
    const day = addDays(today, -Math.floor(i / 2));
    const [y, m, dd] = day.split('-').map(Number);
    return { start: new Date(y, m - 1, dd, 9 + (i % 2) * 5, 0).getTime(), minutes: [25, 25, 45, 30][i % 4], completed: rng() < 0.9 };
  });
  return {
    version: 1,
    habits,
    checkins,
    notes,
    focus,
    settings: { ...defaultSettings(), lang, sealName: lang === 'zh' ? '半亩' : '半亩' },
    onboarded: true,
  };
}
