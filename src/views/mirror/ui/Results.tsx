// 水月幻镜 · 画卷, the results scroll (GDD §18.10): the companion, map and 镜境; the 镜碎 seal (弃镜 /
// 中断 notes, 照破 beside it); the waves; the build; kills, damage by weapon, the biggest hit, 月华;
// the pay in plain lines (base → ×镜境 → ×map → ×heat → cap → rate → ceiling → 返照钱, coins, firsts,
// fee, net); 镜屑, mastery, unlocks as page reveals, records, seals, titles and the 候签. Buttons:
// 再入镜 (「−20」 when it costs), 回镜前, 存画 (a PNG: the host's save; on a phone the share sheet; a
// download only at the top level with a mouse; else the preview sheet, long-press or right-click).
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useT } from '../../../app/i18n';
import { lang } from '../../../app/store';
import { mirror } from '../../../app/mirror';
import { coins, play } from '../../../app/play';
import { hostSave } from '../../../app/hostSave';
import { todayKey } from '../../../core/date';
import { Sheet, toast } from '../../../ui/kit';
import { CoinIcon, fmtCoins } from '../../../ui/coins';
import { pentadText } from '../../../data/terms';
import { DIFF_REG, MAP_REG, RECORD_REG, WEAPON_REG, type WeaponId } from '../ids';
import type { RunReport } from '../types';
import { MASTERY } from '../data';
import { entryQuote, fmtBig } from '../logic';
import { Icon, Portrait, Seal } from './icons';
import { BuildRow } from './Shop';
import { CharacterPanel } from './Panel';
import { termName } from '../data/glossary';
import { titleName } from './Lobby';
import { CODEX_TOTAL, fmtInt, nameOf, payLines } from './text';

const CAUSE_NOTE: Record<string, [string, string]> = {
  abandon: ['弃镜', 'given up'], interrupt: ['中断', 'interrupted'], migrate: ['旧档', 'old save'], error: ['镜裂', 'engine failure'],
};

export function Results(props: { report: RunReport; snap: HTMLCanvasElement | null; onAgain: () => void; onLobby: () => void }) {
  const t = useT();
  const { report } = props;
  const { run, pay } = report;
  const lng = lang.value === 'en' ? 'en' : 'zh';
  const snapUrl = useMemo(() => { try { return props.snap?.toDataURL('image/png') ?? null; } catch { return null; } }, [props.snap]);
  const [preview, setPreview] = useState<string | null>(null);
  const q = entryQuote(mirror.value, coins.value, play.value.counters['mirror:paid'] ?? 0, todayKey());
  const rs = run.runStats;
  const weapons = (Object.keys(run.byWeapon) as WeaponId[])
    .map((id) => ({ id, ...run.byWeapon[id]! }))
    .sort((a, b) => b.dmg - a.dmg)
    .slice(0, 6);
  const maxDmg = Math.max(1, ...weapons.map((w) => w.dmg));
  const note = CAUSE_NOTE[report.cause];
  const reached = report.cause === 'death' ? report.W + 1 : report.W;
  const m = report.mastery;
  const prevT = m.level > 0 ? MASTERY[m.level - 1] : 0;
  const nextT = MASTERY[m.level] ?? MASTERY[MASTERY.length - 1];
  const frac = m.level >= MASTERY.length ? 1 : Math.max(0, Math.min(1, (m.after - prevT) / Math.max(1, nextT - prevT)));
  const main = useRef<HTMLElement>(null);
  useEffect(() => { main.current?.focus({ preventScroll: true }); }, []);

  const saveImage = async () => {
    let blob: Blob | null = null;
    try { blob = await drawScroll(report, props.snap, lng); } catch (e) { console.warn('[mirror] save', e); }
    if (!blob) { toast(t('画卷未能存下。', 'The scroll could not be saved.')); return; }
    const name = `mirror-${run.startedDay}-w${report.W}.png`;
    const how = await saveBlob(blob, name);
    if (how === 'saved') toast(t(`已保存 ${name}`, `Saved ${name}`));
    else if (how === 'preview') setPreview(URL.createObjectURL(blob));
  };

  return (
    <article class="mj-results page" ref={main} tabIndex={-1} aria-label={t('画卷', 'The scroll')}>
      <div class="mj-scroll">
        <i class="mj-roller" aria-hidden="true" />
        <div class="mj-scroll-body">
          <header class="mj-res-head">
            <Portrait id={run.char} size={88} />
            <div>
              <h1 class="brush">{nameOf(run.char, t)}</h1>
              <p class="muted">{t(MAP_REG.find((x) => x.id === run.map)!.zh, MAP_REG.find((x) => x.id === run.map)!.en)} · {t(DIFF_REG[run.diff].zh, DIFF_REG[run.diff].en)}{run.heat > 0 ? ` · ${termName('heat', t)} ${run.heat}` : ''}{run.daily ? t(' · 今日镜', ' · daily') : ''}</p>
            </div>
            <div class="mj-res-seals">
              <Seal text="镜碎" size={62} label={t('镜碎', 'The glass broke')} />
              {report.zhaopo && <Seal text="照破" size={52} style="zhu" label={t('照破', 'Broke through')} class="mj-res-zhaopo" />}
              {note && <small class="mj-res-note">{t(note[0], note[1])}</small>}
            </div>
          </header>

          <p class="mj-res-wave brush">{t(`第 ${reached} 重`, `Wave ${reached}`)}</p>
          <p class="mj-res-sub">{t(`已过 ${report.W} 重`, `${report.W} waves cleared`)}{run.ms >= 60_000 ? ` · ${Math.round(run.ms / 60000)} ${t('分', 'min')}` : ''}</p>

          {snapUrl && <img class="mj-res-snap" src={snapUrl} alt={t('这一局的墨迹', 'The ink of this run')} />}

          <h2 class="mj-h3">{t('行装', 'Build')}</h2>
          <BuildRow run={run} t={t} px={34} />
          <details class="mj-res-who">
            <summary>{t('这一局的人物', 'Your character this run')}</summary>
            <CharacterPanel run={run} t={t} density="card" base={null} />
          </details>

          <dl class="mj-res-nums">
            <div><dt>{t('击破', 'Kills')}</dt><dd class="num">{fmtInt(rs.kills ?? 0)}</dd></div>
            <div><dt>{t('最重一击', 'Biggest hit')}</dt><dd class="num">{fmtBig(rs.peakHit ?? 0, lng)}</dd></div>
            <div><dt>{t('月华', 'Moonlight')}</dt><dd class="num">{fmtBig(rs.moonCollected ?? 0, lng)}</dd></div>
            <div><dt>{t('伤害', 'Damage')}</dt><dd class="num">{fmtBig(rs.dmgDealt ?? 0, lng)}</dd></div>
          </dl>
          {weapons.length > 0 && (
            <div class="mj-res-weapons" aria-label={t('各兵器伤害', 'Damage by weapon')}>
              {weapons.map((w) => (
                <div class="mj-res-wrow">
                  <Icon id={`wpn:${w.id}`} px={24} />
                  <span class="mj-res-wname">{nameOf(w.id, t)}</span>
                  <i class="mj-bar"><b style={{ width: `${(w.dmg / maxDmg) * 100}%` }} /></i>
                  <span class="num">{fmtBig(w.dmg, lng)}</span>
                </div>
              ))}
            </div>
          )}

          <h2 class="mj-h3">{t('镜钱', 'Pay')}</h2>
          <table class="mj-paylines">
            <tbody>
              {payLines(pay, run.free, t).map((l) => (
                <tr class={l.strong ? 'is-strong' : ''}><th scope="row">{l.label}{l.note && <small> · {l.note}</small>}</th><td class="num">{l.value}</td></tr>
              ))}
            </tbody>
          </table>
          {pay.coins > 0 && <p class="mj-small muted">{t('一路铜钱每破一重即已入囊；袖中未入囊者随镜沉池。', 'Coins went to your purse as each wave fell; those still in your sleeve sank with the glass.')}</p>}

          <div class="mj-res-meta">
            <p><b>{termName('dust', t)}</b> <span class="num">+{report.dust}</span> <span class="muted">({t('共', 'total')} {fmtInt(mirror.value.dust)})</span></p>
            <div class="mj-mastery">
              <span>{t(`${nameOf(m.char, t)} · 心得 ${m.level} 级`, `${nameOf(m.char, t)} · mastery ${m.level}`)}</span>
              <i class="mj-bar"><b style={{ width: `${frac * 100}%` }} /></i>
              <span class="num">+{m.after - m.before}</span>
            </div>
            {m.levelUp && <p class="mj-levelup brush">{t(`心得升至 ${m.level} 级`, `Mastery rises to ${m.level}`)}</p>}
          </div>

          <CodexLine t={t} />
          {report.unlocks.length > 0 && (
            <section class="mj-reveals" aria-label={t('新开', 'Unlocked')}>
              <h2 class="mj-h3">{t('镜缘 · 新开', 'Newly unlocked')}</h2>
              <div class="mj-reveal-row">
                {report.unlocks.map((id, i) => (
                  <div class="mj-reveal" style={{ animationDelay: `${0.4 + i * 0.35}s` }}>
                    <Icon id={`${WEAPON_REG.some((w) => w.id === id) ? 'wpn' : 'item'}:${id}`} px={56} />
                    <span>{nameOf(id, t)}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
          {(report.records.length > 0 || report.firsts.length > 0 || report.seals.length > 0 || report.titles.length > 0 || report.slip !== null) && (
            <section class="mj-res-extra">
              {report.records.map((r) => <p class="mj-res-record">{t('新纪录', 'New record')} · {t(RECORD_REG.find((x) => x.id === r)!.zh, RECORD_REG.find((x) => x.id === r)!.en)}</p>)}
              {report.firsts.map((f) => (
                <p>{f.startsWith('boss:') ? t(`初破 ${nameOf(f.slice(5), t)} · +10 文`, `First ${nameOf(f.slice(5), t)} · +10`) : t(`初次照破 ${nameOf(f.slice(6).split('|')[0], t)} · ${DIFF_REG[Number(f.split('|')[1])]?.zh ?? ''} · +20 文`, `First clear of ${nameOf(f.slice(6).split('|')[0], t)} on ${DIFF_REG[Number(f.split('|')[1])]?.en ?? ''} · +20`)}</p>
              ))}
              {report.seals.length > 0 && (
                <div class="mj-res-sealrow">
                  {report.seals.map((s) => <Seal text={sealText(s)} size={40} label={sealText(s)} />)}
                </div>
              )}
              {report.titles.map((ti) => <p class="brush mj-res-title">{t('得名号', 'New title')} · {titleName(ti, t)}</p>)}
              {report.slip !== null && <p class="mj-res-slip">{t(`得候签「${pentadText(Math.floor(report.slip / 3), report.slip % 3).zh}」`, `Pentad slip “${pentadText(Math.floor(report.slip / 3), report.slip % 3).en}”`)}</p>}
            </section>
          )}
        </div>
        <i class="mj-roller is-bottom" aria-hidden="true" />
      </div>

      <div class="mj-res-actions">
        <button type="button" class="btn btn-seal mj-big" onClick={props.onAgain} disabled={q.paused || (!q.free && !q.unusedTicket && q.short > 0)}>
          <span class="brush">{t('再入镜', 'Again')}</span>
          {q.free ? <small>{t('今日免费', 'free today')}</small> : q.unusedTicket ? <small>{t('已付', 'paid')}</small> : q.short > 0 ? <small>{t(`还差 ${q.short} 文`, `${q.short} short`)}</small> : (
            <span class="coin-badge num mj-fee">
              <span aria-hidden="true">−</span><CoinIcon /><span aria-hidden="true">{fmtCoins(q.fee)}</span>
              <span class="visually-hidden">{t(`入镜 ${q.fee} 文`, `costs ${q.fee} coins`)}</span>
            </span>
          )}
        </button>
        <button type="button" class="btn" onClick={props.onLobby}>{t('回镜前', 'Back to the mirror')}</button>
        <button type="button" class="btn btn-ghost" onClick={() => void saveImage()}>{t('存画', 'Save the scroll')}</button>
      </div>
      <Sheet open={preview !== null} onClose={() => { if (preview) URL.revokeObjectURL(preview); setPreview(null); }} title={t('画卷', 'The scroll')}>
        {preview && <img class="mj-res-preview" src={preview} alt={t('画卷', 'The scroll')} />}
        {preview && <p class="muted mj-small">{t('长按（或右键）图片即可保存', 'Long-press (or right-click) the picture to save it')}</p>}
      </Sheet>
    </article>
  );
}

const coarse = () => { try { return matchMedia('(pointer: coarse)').matches; } catch { return false; } };
const embedded = () => { try { return window.self !== window.top; } catch { return true; } };

/**
 * Save the scroll the one way this place allows (as PhotoMode and 立轴 do): the host's own save; on a
 * phone the share sheet (its "Save Image"); a download only at the top level with a mouse (an
 * embedded page's downloads vanish silently); anything else, or a share that fails: 'preview', the
 * sheet where long-press or right-click saves. 'saved' only when a save path really ran.
 */
async function saveBlob(blob: Blob, name: string): Promise<'saved' | 'shared' | 'declined' | 'preview'> {
  const r = await hostSave(name, blob);
  if (r === 'saved') return 'saved';
  if (r === 'declined') return 'declined';
  if (coarse()) {
    try {
      const file = new File([blob], name, { type: 'image/png' });
      if (typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: '水月幻镜 · 半亩' });
        return 'shared';
      }
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') return 'declined';
    }
    return 'preview';
  }
  if (embedded()) return 'preview';
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return 'saved';
  } catch {
    return 'preview';
  }
}

/** 镜鉴 progress after the run: pages seen / known / mastered of 185. */
function CodexLine(props: { t: (zh: string, en: string) => string }) {
  const { t } = props;
  const c = mirror.value.codex;
  const vals = Object.values(c) as number[];
  const n = (s: number) => vals.filter((v) => v >= s).length;
  return <p class="mj-small">{t(`镜鉴 · 见 ${n(1)} · 识 ${n(2)} · 精 ${n(3)} / ${CODEX_TOTAL} 页`, `Codex · seen ${n(1)} · known ${n(2)} · mastered ${n(3)} of ${CODEX_TOTAL}`)}</p>;
}

function sealText(s: string): string {
  if (s.startsWith('vow|')) return `誓${s.slice(4)}`;
  if (s.startsWith('heart|')) return '心印';
  if (s.startsWith('moon|')) return '月印';
  const [, d] = s.split('|');
  return DIFF_REG[Number(d)]?.zh ?? '照破';
}

/** The 存画 PNG: paper, the ink of the run, the companion, the waves and the net. */
async function drawScroll(r: RunReport, snap: HTMLCanvasElement | null, lng: 'zh' | 'en'): Promise<Blob | null> {
  const W = 1080, H = 1440;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  if (!g) return null;
  g.fillStyle = '#efe6d2';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#2b251e';
  g.fillRect(0, 0, W, 36); g.fillRect(0, H - 36, W, 36);
  if (snap) {
    const s = Math.min(900 / snap.width, 900 / snap.height);
    g.globalAlpha = 0.95;
    g.drawImage(snap, (W - snap.width * s) / 2, 300, snap.width * s, snap.height * s);
    g.globalAlpha = 1;
  }
  const brush = "'Ma Shan Zheng','LXGW WenKai',serif";
  const text = "'LXGW WenKai','Kaiti SC',serif";
  const zh = lng === 'zh';
  g.fillStyle = '#1b1916';
  g.textAlign = 'center';
  g.font = `96px ${brush}`;
  g.fillText(zh ? `第 ${r.cause === 'death' ? r.W + 1 : r.W} 重` : `Wave ${r.cause === 'death' ? r.W + 1 : r.W}`, W / 2, 170);
  g.font = `40px ${text}`;
  const map = MAP_REG.find((x) => x.id === r.run.map)!;
  g.fillText(`${nameOf(r.run.char, (a, b) => (zh ? a : b))} · ${zh ? map.zh : map.en} · ${zh ? DIFF_REG[r.run.diff].zh : DIFF_REG[r.run.diff].en}`, W / 2, 240);
  g.font = `44px ${text}`;
  const net = r.pay.net;
  g.fillText(zh ? `已过 ${r.W} 重 · 返照 ${r.pay.income} 文 · 铜钱 ${r.pay.coins} 文 · 净 ${net >= 0 ? '+' : '−'}${Math.abs(net)}` : `${r.W} cleared · ${r.pay.income} + ${r.pay.coins} coins · net ${net >= 0 ? '+' : '−'}${Math.abs(net)}`, W / 2, 1270);
  g.font = `34px ${brush}`;
  g.fillStyle = '#b93a2b';
  g.fillText(zh ? '水月幻镜 · 半亩' : 'The Mirror of Water and Moon · Half-Acre', W / 2, 1350);
  return new Promise((k) => c.toBlob((b) => k(b), 'image/png'));
}
