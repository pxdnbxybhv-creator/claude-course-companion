// The build mode's paper-and-ink overlay: the top bar (leave, the homestead's name, the purse,
// undo, turn the view), the sheet of things by shelf with painted thumbnails and prices, and the
// action bar while placing, moving or looking at one thing. Driven by the BuildMode controller.
import './build.css';
import { home } from '../../../../../app/home';
import { coins } from '../../../../../app/play';
import { CoinBadge } from '../../../../../ui/coins';
import { CATALOG, HOME_CATS, KIND, refund, itemText } from '../catalog';
import { thumbOf } from './thumbs';
import type { BuildMode } from './mode';

function Thumb(props: { kind: string; v: number }) {
  const src = thumbOf(props.kind);
  void props.v;
  return (
    <span class="hb-thumb" aria-hidden="true">
      {src ? <img src={src} alt="" draggable={false} /> : <span class="brush">{KIND[props.kind]?.zh.slice(0, 1)}</span>}
    </span>
  );
}

export function BuildUI(props: { ctrl: BuildMode }) {
  const c = props.ctrl;
  const s = c.ui.value;
  const t = (zh: string, en: string) => c.t(zh, en);
  const name = home.value.name || '半亩山居';
  const purse = coins.value;
  const kb = !s.touch;
  const k = s.kind ? KIND[s.kind] : undefined;
  const it = s.mode === 'select' ? c.selItem() : undefined;

  const status: Record<string, [string, string]> = {
    ok: ['可以安放', 'Fits'],
    bounds: ['出了地界', 'Off the plot'],
    gate: ['门口留路', 'Keep the gate clear'],
    overlap: ['已有东西', 'Occupied'],
    poor: ['铜钱不足', 'Not enough coins'],
    unknown: ['—', '—'],
  };
  const st = status[s.fit] ?? status.unknown;

  return (
    <>
      <div class="hb-top">
        <button type="button" class="hb-chip hb-exit is-round" onClick={() => c.exit()} aria-label={t('出营造', 'Leave build mode')} title={t('出营造 (B / Esc)', 'Leave build mode (B / Esc)')}>
          <span class="brush" aria-hidden="true">出</span>
        </button>
        <button type="button" class="hb-chip hb-name" onClick={() => void c.rename()} title={t('题园名', 'Name your homestead')}>
          <b>{name}</b><i aria-hidden="true">✎</i>
        </button>
        <span class="hb-chip hb-purse hb-live"><CoinBadge /></span>
        <button type="button" class="hb-chip is-round" disabled={!s.undo} onClick={() => c.undo()} aria-label={t('撤回', 'Undo')} title={t('撤回 (Z)', 'Undo (Z)')}>
          <span class="brush" aria-hidden="true">撤</span>
        </button>
        <button type="button" class="hb-chip is-round" onClick={() => c.turnView()} aria-label={t('转视角', 'Turn the view')} title={t('转视角 (V)', 'Turn the view (V)')}>
          <span aria-hidden="true">⟲</span>
        </button>
      </div>

      {s.mode === 'browse' && (
        <div class="hb-sheet hb-live">
          <div class="hb-tabs" role="tablist" aria-label={t('分类', 'Shelves')}>
            {HOME_CATS.map((cat) => (
              <button type="button" role="tab" key={cat.id} class="hb-tab" aria-selected={s.cat === cat.id} onClick={() => c.tab(cat.id)}>
                {c.lang === 'zh' ? cat.zh : <><span class="brush" aria-hidden="true">{cat.glyph}</span>{cat.en}</>}
              </button>
            ))}
          </div>
          <div class="hb-shelf" role="list">
            {CATALOG.filter((x) => x.cat === s.cat).map((x) => (
              <button type="button" role="listitem" key={x.id} class={'hb-card' + (purse < x.price ? ' is-poor' : '')} onClick={() => c.pick(x.id)} title={t(x.noteZh, x.noteEn)}>
                <Thumb kind={x.id} v={s.thumbs} />
                <span class="hb-card-name">{t(x.zh, x.en)}</span>
                <span class="hb-card-price">{x.price ? <CoinBadge value={x.price} size={12} /> : <span class="hb-free">{t('赠', 'Free')}</span>}</span>
              </button>
            ))}
          </div>
          <p class="hb-hint">
            {s.touch
              ? t('点选一样东西放进园子 · 点园中之物可移、转、卖 · 双指缩放', 'Pick something to place · tap a thing to move, turn or sell it · pinch to zoom')
              : t('点选一样放进园子 · 点园中之物可移、转、卖 · 滚轮缩放 · 拖动平移', 'Pick something to place · click a thing to move, turn or sell it · scroll to zoom · drag to pan')}
          </p>
        </div>
      )}

      {(s.mode === 'place' || s.mode === 'move') && k && (
        <div class="hb-bar">
          <div class="hb-bar-head">
            <Thumb kind={k.id} v={s.thumbs} />
            <div class="hb-bar-title">
              <b>{t(k.zh, k.en)}{s.mode === 'place' && k.price > 0 && <> · <CoinBadge value={k.price} size={13} /></>}</b>
              <small>{s.touch ? t('拖动虚影，或点地面', 'Drag the ghost, or tap the ground') : t('移动鼠标或方向键 · 点击安放', 'Mouse or arrow keys · click to place')}</small>
            </div>
            <span class={'hb-status ' + (s.fit === 'ok' ? 'is-ok' : 'is-bad')} role="status">{t(st[0], st[1])}</span>
          </div>
          <div class="hb-acts">
            <button type="button" class="hb-act" onClick={() => c.turn()}>
              <span class="brush" aria-hidden="true">转</span><small>{t('旋转', 'Turn')}{kb && <kbd>R</kbd>}</small>
            </button>
            <button type="button" class="hb-act is-go" disabled={s.fit !== 'ok'} onClick={() => c.confirm()}>
              <span class="brush" aria-hidden="true">{s.mode === 'move' ? '定' : '置'}</span><small>{s.mode === 'move' ? t('放这里', 'Put here') : t('安放', 'Place')}{kb && <kbd>↵</kbd>}</small>
            </button>
            <button type="button" class="hb-act" onClick={() => c.back()}>
              <span class="brush" aria-hidden="true">罢</span><small>{t('取消', 'Cancel')}{kb && <kbd>Esc</kbd>}</small>
            </button>
          </div>
        </div>
      )}

      {s.mode === 'select' && it && k && (
        <div class="hb-bar">
          <div class="hb-bar-head">
            <Thumb kind={k.id} v={s.thumbs} />
            <div class="hb-bar-title">
              <b>{t(k.zh, k.en)}{k.text && <>「{itemText(it).replace('/', '，')}」</>}</b>
              <small>{t(k.noteZh, k.noteEn)}</small>
            </div>
          </div>
          <div class="hb-acts">
            <button type="button" class="hb-act" onClick={() => c.startMove()}>
              <span class="brush" aria-hidden="true">移</span><small>{t('挪动', 'Move')}{kb && <kbd>M</kbd>}</small>
            </button>
            <button type="button" class="hb-act" onClick={() => c.turn()}>
              <span class="brush" aria-hidden="true">转</span><small>{t('旋转', 'Turn')}{kb && <kbd>R</kbd>}</small>
            </button>
            {k.text && (
              <button type="button" class="hb-act" onClick={() => void c.write()}>
                <span class="brush" aria-hidden="true">题</span><small>{t('题字', 'Write')}</small>
              </button>
            )}
            <button type="button" class="hb-act is-red" onClick={() => c.sell()}>
              <span class="brush" aria-hidden="true">卖</span>
              <small>{refund(k.price) ? <>+<CoinBadge value={refund(k.price)} size={11} /></> : t('拆除', 'Remove')}</small>
            </button>
            <button type="button" class="hb-act" onClick={() => c.back()}>
              <span class="brush" aria-hidden="true">罢</span><small>{t('返回', 'Back')}{kb && <kbd>Esc</kbd>}</small>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
