// 家园 · building the homestead: the way into the build mode (营造) — the gate-house's prompt, a
// 营 button while you stand on the plot, the B key — and the welcome on your first visit.
// What stands on the plot is drawn by the homestead's stage (./stage.ts, built by regions/home.ts).
import './build.css';
import type { WorldFeature } from '../../../types';
import { feature, tr } from '../../kit';
import { home } from '../../../../../app/home';
import { flag, play } from '../../../../../app/play';
import { HOME_PLOT } from '../../../map';
import { onPlot } from '../catalog';
import { stageOf } from './stage';
import { BuildMode } from './mode';

const homeBuild = feature('home-build', (bag, ctx) => {
  const stage = stageOf(ctx);
  if (!stage) return;
  const mode = new BuildMode(bag, stage);

  // the gate-house: 营造 from outside the gate
  const gate = new ctx.THREE.Vector3(HOME_PLOT.gate.x + 0.9, 0, HOME_PLOT.gate.z);
  gate.y = ctx.groundY(gate.x, gate.z);
  const name = () => home.value.name || '半亩山居';
  const it = {
    id: 'home:gate', position: gate, radius: 2.4,
    labelZh: `「${name()}」`, labelEn: `“${name()}” · Homestead`, actionZh: '营造', actionEn: 'Build',
    act: () => mode.enter(),
  };
  bag.interact(it);

  // the 营 button while standing on the plot
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'hb-enter';
  btn.hidden = true;
  btn.setAttribute('aria-label', tr(ctx, '营造家园', 'Build your homestead'));
  btn.innerHTML = `<span class="brush" aria-hidden="true">营</span><small>${tr(ctx, '营造', 'Build')}</small>`;
  btn.addEventListener('click', (e) => { e.stopPropagation(); (btn as HTMLButtonElement).blur(); mode.enter(); });
  const wrap = document.createElement('div');
  wrap.className = 'hb';
  wrap.appendChild(btn);
  const off = ctx.hud.mount(wrap);
  bag.onDispose(off);

  const onKey = (e: KeyboardEvent) => {
    if (e.code !== 'KeyB' || e.repeat || e.ctrlKey || e.metaKey || e.altKey || mode.active || btn.hidden) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    e.preventDefault();
    mode.enter();
  };
  window.addEventListener('keydown', onKey);
  bag.onDispose(() => window.removeEventListener('keydown', onKey));

  let n = 0;
  bag.frame(() => {
    if (++n % 6) return;
    const p = ctx.player.position;
    const show = !mode.active && !ctx.player.isFrozen && onPlot(p.x, p.z, 0.8);
    if (btn.hidden === show) btn.hidden = !show;
    const zh = `「${name()}」`;
    if (it.labelZh !== zh) { it.labelZh = zh; it.labelEn = `“${name()}” · Homestead`; }
  });

  // the first visit
  bag.onDispose(ctx.onRegion((id) => {
    if (id !== 'home' || play.value.flags['home:welcome']) return;
    flag('home:welcome');
    bag.later(1800, () => ctx.hud.toast('此地归你了。起屋种树，都由你。', 'This ground is yours now. Build and plant as you please.', 4200));
    bag.later(6400, () => ctx.hud.toast('进园后点「营」字，或在门楼前营造。', 'Inside, tap 营 to build — or build from the gate.', 3800));
  }));

  if (import.meta.env.DEV) {
    const w = window as unknown as { __home?: unknown };
    w.__home = { mode, stage };
    bag.onDispose(() => { if ((w.__home as { mode?: unknown } | undefined)?.mode === mode) delete w.__home; });
  }
});

export const HOME_BUILD_FEATURES: WorldFeature[] = [homeBuild];
