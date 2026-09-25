// 设置 · Settings — seal, language, theme, sound, location, data, about.
import type { ComponentChildren } from 'preact';
import { hostSave } from '../app/hostSave';
import { useEffect, useRef, useState } from 'preact/hooks';
import { state, today, setSettings, exportJSON, importJSON, resetAll, replaceState } from '../app/store';
import { demoState } from '../app/demo';
import { useT } from '../app/i18n';
import { go } from '../app/router';
import { Segmented, Sheet, Toggle, toast } from '../ui/kit';
import { audio } from '../audio/engine';
import { music } from '../audio/music';
import { redeemCode } from '../app/play';
import { makeSeal } from '../ink/seal';
import type { Lang, Settings } from '../core/types';
import './settings/settings.css';

const VERSION = '1.0.0';

// ------------------------------------------------------------------ helpers

function stamp(): string {
  return today.value.replace(/-/g, '');
}

/** Inside a host page (an iframe): scripted downloads are blocked there, or dropped without a word. */
function isEmbedded(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

/** May this page write to the clipboard? A host page's permissions policy can forbid it. */
function clipboardAllowed(): boolean {
  type Policy = { allowsFeature(feature: string): boolean };
  const d = document as Document & { permissionsPolicy?: Policy; featurePolicy?: Policy };
  try {
    const policy = d.permissionsPolicy ?? d.featurePolicy;
    return !policy || policy.allowsFeature('clipboard-write');
  } catch {
    return true;
  }
}

/** Script-driven download; silently does nothing where downloads are blocked (the UI always offers another way). */
function download(blob: Blob, name: string): void {
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  } catch { /* embedded / blocked */ }
}

function cleanSeal(v: string): string {
  return Array.from(v.replace(/\s+/g, '')).slice(0, 4).join('');
}

function fmtCoord(v: number, pos: string, neg: string): string {
  return `${Math.abs(v).toFixed(2)}°${v >= 0 ? pos : neg}`;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

interface BackupInfo {
  text: string;
  habits: number;
  checkins: number;
  exportedAt?: string;
}

function inspectBackup(text: string): BackupInfo | null {
  try {
    const raw = JSON.parse(text);
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.habits)) return null;
    const checkins = raw.checkins && typeof raw.checkins === 'object'
      ? Object.values(raw.checkins as Record<string, unknown>).reduce<number>((a, v) => a + (Array.isArray(v) ? v.length : 0), 0)
      : 0;
    return { text, habits: raw.habits.length, checkins, exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : undefined };
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ pieces

function Section(props: { id: string; zh: string; en: string; children: ComponentChildren }) {
  const t = useT();
  return (
    <section class="set-section" aria-labelledby={`set-${props.id}`}>
      <h2 class="section-title" id={`set-${props.id}`}>
        <span class="set-glyph brush" aria-hidden="true">{props.zh.slice(0, 1)}</span>
        {t(props.zh, props.en)}
      </h2>
      <div class="card set-card">{props.children}</div>
    </section>
  );
}

/** A seal pressed onto a small square of paper. */
function SealStamp(props: { text: string; style: 'bai' | 'zhu'; size?: number; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const size = props.size ?? 64;
  useEffect(() => {
    let live = true;
    const draw = () => {
      if (!live || !ref.current) return;
      try {
        const c = makeSeal(props.text, { size, dpr: Math.min(3, window.devicePixelRatio || 1), style: props.style, seed: 11 });
        c.style.width = c.style.height = `${size}px`;
        ref.current.replaceChildren(c);
      } catch { /* seal engine unavailable */ }
    };
    draw();
    // the seal is carved with web fonts: carve again once they have arrived
    const fonts = document.fonts;
    if (fonts?.load) {
      Promise.all(["'Ma Shan Zheng'", "'LXGW WenKai'"].map((f) => fonts.load(`64px ${f}`, props.text).catch(() => [])))
        .then(draw)
        .catch(() => {});
    }
    return () => { live = false; };
  }, [props.text, props.style, size]);
  return <div class="seal-stamp" ref={ref} role="img" aria-label={props.label} style={{ width: size, height: size }} />;
}

function SealSection() {
  const t = useT();
  const saved = state.value.settings.sealName;
  const [draft, setDraft] = useState(saved);
  const composing = useRef(false);
  useEffect(() => { if (!composing.current) setDraft(saved); }, [saved]);
  const commit = (v: string) => {
    const clean = cleanSeal(v);
    setDraft(clean);
    if (clean !== state.value.settings.sealName) setSettings({ sealName: clean });
  };
  const preview = cleanSeal(draft) || '半亩';
  return (
    <Section id="seal" zh="印章" en="Seal">
      <div class="set-seal">
        <label class="field set-seal-field">
          <span>{t('印文（一至四字）', 'Seal characters (1–4)')}</span>
          <input
            type="text"
            value={draft}
            placeholder="半亩"
            autocomplete="off"
            spellcheck={false}
            enterKeyHint="done"
            aria-describedby="set-seal-hint"
            onInput={(e) => {
              const v = e.currentTarget.value;
              setDraft(v);
              if (!composing.current) commit(v);
            }}
            onCompositionStart={() => (composing.current = true)}
            onCompositionEnd={(e) => {
              composing.current = false;
              commit(e.currentTarget.value);
            }}
            onBlur={(e) => commit(e.currentTarget.value)}
          />
          <small id="set-seal-hint" class="set-hint">
            {t('钤于长卷落款之下。留空则用「半亩」。', 'Pressed under the signature on your scrolls. Leave empty for 半亩.')}
          </small>
        </label>
        <div class="set-seal-previews" aria-live="polite">
          <figure>
            <div class="set-paper"><SealStamp text={preview} style="bai" label={t(`白文印：${preview}`, `Intaglio seal: ${preview}`)} /></div>
            <figcaption>{t('白文', 'Intaglio')}</figcaption>
          </figure>
          <figure>
            <div class="set-paper"><SealStamp text={preview} style="zhu" label={t(`朱文印：${preview}`, `Relief seal: ${preview}`)} /></div>
            <figcaption>{t('朱文', 'Relief')}</figcaption>
          </figure>
        </div>
      </div>
    </Section>
  );
}

function Row(props: { title: ComponentChildren; sub?: ComponentChildren; children?: ComponentChildren; wrap?: boolean; id?: string }) {
  return (
    <div class={'row set-row' + (props.wrap ? ' set-row-wrap' : '')}>
      <div class="row-main">
        <div class="row-title" id={props.id}>{props.title}</div>
        {props.sub && <div class="row-sub">{props.sub}</div>}
      </div>
      {props.children}
    </div>
  );
}

function AppearanceSections() {
  const t = useT();
  const s = state.value.settings;
  return (
    <>
      <Section id="lang" zh="语言" en="Language">
        <Row title={t('界面语言', 'Interface')} sub={t('画中题字始终为中文', 'Inscriptions in paintings stay in Chinese')} wrap>
          <Segmented<Lang>
            label={t('语言', 'Language')}
            value={s.lang}
            onChange={(lang) => setSettings({ lang })}
            options={[{ value: 'zh', label: '中文' }, { value: 'en', label: 'English' }]}
          />
        </Row>
      </Section>
      <Section id="theme" zh="外观" en="Theme">
        <Row title={t('明暗', 'Appearance')} sub={t('深色时，画仍在纸上，四周换作深色绫绢', 'In dark mode the paintings stay on paper, mounted on dark silk')} wrap>
          <Segmented<Settings['theme']>
            label={t('外观', 'Theme')}
            value={s.theme}
            onChange={(theme) => setSettings({ theme })}
            options={[
              { value: 'auto', label: t('跟随系统', 'Auto') },
              { value: 'light', label: t('浅色', 'Light') },
              { value: 'dark', label: t('深色', 'Dark') },
            ]}
          />
        </Row>
      </Section>
    </>
  );
}

function SoundSection() {
  const t = useT();
  const s = state.value.settings;
  const vol = Math.round(s.volume * 100);
  const mvol = Math.round(s.musicVolume * 100);
  const preview = async () => {
    try {
      await audio.unlock();
      audio.setEnabled(true);
      audio.setVolume(s.volume);
      audio.chime();
    } catch {
      toast(t('此处无法播放声音', 'Sound can’t play here'));
    }
  };
  return (
    <Section id="sound" zh="声音" en="Sound">
      <Row title={t('音效', 'Sound effects')} sub={t('古琴、钟磬，皆为即时合成', 'Guqin and bells, synthesised live')}>
        <Toggle
          checked={s.sound}
          label={t('音效', 'Sound effects')}
          onChange={(on) => {
            setSettings({ sound: on });
            audio.setEnabled(on);
          }}
        />
      </Row>
      <div class={'row set-row set-volume' + (s.sound ? '' : ' is-off')}>
        <label class="row-main set-volume-label" for="set-volume">
          <span class="row-title">{t('音量', 'Volume')}</span>
          <span class="row-sub num">{vol}%</span>
        </label>
        <input
          id="set-volume"
          class="set-range"
          type="range"
          min={0}
          max={100}
          step={1}
          value={vol}
          disabled={!s.sound}
          style={{ '--fill': `${vol}%` }}
          aria-valuetext={`${vol}%`}
          onInput={(e) => {
            const v = Number(e.currentTarget.value) / 100;
            setSettings({ volume: v });
            audio.setVolume(v);
          }}
          onChange={() => { if (s.sound) void preview(); }}
        />
        <button class="btn btn-small set-preview" onClick={preview} disabled={!s.sound}>
          {t('试听', 'Preview')}
        </button>
      </div>
      <Row title={t('背景乐', 'Music')} sub={t('筝、箫、琵琶随处即兴，每日一曲不同', 'Zheng, xiao and pipa improvise for each place; a new tune every day')}>
        <Toggle
          checked={s.music}
          label={t('背景乐', 'Music')}
          onChange={(on) => {
            setSettings({ music: on });
            music.setEnabled(on);
          }}
        />
      </Row>
      <div class={'row set-row set-volume' + (s.music ? '' : ' is-off')}>
        <label class="row-main set-volume-label" for="set-music-volume">
          <span class="row-title">{t('乐声', 'Music volume')}</span>
          <span class="row-sub num">{mvol}%</span>
        </label>
        <input
          id="set-music-volume"
          class="set-range"
          type="range"
          min={0}
          max={100}
          step={1}
          value={mvol}
          disabled={!s.music}
          style={{ '--fill': `${mvol}%` }}
          aria-valuetext={`${mvol}%`}
          onInput={(e) => {
            const v = Number(e.currentTarget.value) / 100;
            setSettings({ musicVolume: v });
            music.setVolume(v);
          }}
        />
      </div>
    </Section>
  );
}

function LocationSection() {
  const t = useT();
  const loc = state.value.settings.location;
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState(false);
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const geoOk = typeof navigator !== 'undefined' && 'geolocation' in navigator;

  const locate = () => {
    if (!geoOk) {
      setManual(true);
      return;
    }
    setBusy(true);
    try {
      navigator.geolocation.getCurrentPosition(
        (p) => {
          setBusy(false);
          setSettings({ location: { lat: round2(p.coords.latitude), lon: round2(p.coords.longitude) } });
          toast(t('已记下位置', 'Location saved'));
        },
        (err) => {
          setBusy(false);
          setManual(true);
          toast(err.code === 1 ? t('未获准使用位置，可手动输入', 'Location permission denied — enter it by hand') : t('暂时无法定位，可手动输入', 'Couldn’t get a location — enter it by hand'));
        },
        { enableHighAccuracy: false, timeout: 12_000, maximumAge: 3_600_000 },
      );
    } catch {
      setBusy(false);
      setManual(true);
    }
  };

  const latN = Number(lat), lonN = Number(lon);
  const valid = lat.trim() !== '' && lon.trim() !== '' && Number.isFinite(latN) && Number.isFinite(lonN) && Math.abs(latN) <= 90 && Math.abs(lonN) <= 180;
  const saveManual = (e: Event) => {
    e.preventDefault();
    if (!valid) return;
    setSettings({ location: { lat: round2(latN), lon: round2(lonN) } });
    setManual(false);
    toast(t('已记下位置', 'Location saved'));
  };

  return (
    <Section id="loc" zh="位置" en="Location">
      <Row
        title={t('日出日落', 'Sunrise & sunset')}
        sub={
          loc
            ? <span class="num">{fmtCoord(loc.lat, t('北', 'N'), t('南', 'S'))} · {fmtCoord(loc.lon, t('东', 'E'), t('西', 'W'))}</span>
            : t('未设置 · 仅存于本机，只用于推算时刻', 'Not set · stays on this device, used only for the times')
        }
        wrap
      >
        <div class="set-btns">
          <button class="btn btn-small" onClick={locate} disabled={busy} aria-busy={busy}>
            {busy ? t('定位中…', 'Locating…') : t('使用当前位置', 'Use my location')}
          </button>
          <button class="btn btn-small btn-ghost" onClick={() => setManual((m) => !m)} aria-expanded={manual}>
            {t('手动输入', 'Enter')}
          </button>
          {loc && (
            <button class="btn btn-small btn-ghost" onClick={() => setSettings({ location: undefined })}>
              {t('清除', 'Clear')}
            </button>
          )}
        </div>
      </Row>
      {manual && (
        <form class="set-manual" onSubmit={saveManual}>
          <label class="field">
            <span>{t('纬度', 'Latitude')}</span>
            <input inputMode="decimal" placeholder="31.23" value={lat} onInput={(e) => setLat(e.currentTarget.value)} aria-invalid={lat !== '' && !(Math.abs(latN) <= 90)} />
          </label>
          <label class="field">
            <span>{t('经度', 'Longitude')}</span>
            <input inputMode="decimal" placeholder="121.47" value={lon} onInput={(e) => setLon(e.currentTarget.value)} aria-invalid={lon !== '' && !(Math.abs(lonN) <= 180)} />
          </label>
          <button class="btn btn-small" type="submit" disabled={!valid}>{t('保存', 'Save')}</button>
          <small class="set-hint">{t('北纬、东经为正，南纬、西经为负', 'North and east positive; south and west negative')}</small>
        </form>
      )}
    </Section>
  );
}

type Confirm =
  | { kind: 'import'; info: BackupInfo }
  | { kind: 'demo' }
  | { kind: 'reset'; step: 1 | 2 }
  | { kind: 'copy'; json: string; why?: 'download' }
  | { kind: 'paste' };

function DataSection() {
  const t = useT();
  const st = state.value;
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [paste, setPaste] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const copyRef = useRef<HTMLTextAreaElement>(null);
  const checkins = Object.values(st.checkins).reduce((a, d) => a + d.length, 0);
  const incense = st.focus.filter((f) => f.completed).length;
  const plants = st.habits.filter((h) => !h.archived).length;

  const exportFile = async () => {
    const name = `banmu-backup-${stamp()}.json`;
    const json = exportJSON();
    const r = await hostSave(name, json);
    if (r === 'saved') return void toast(t(`已保存 ${name}`, `Saved ${name}`));
    if (r === 'declined') return;
    // embedded, a scripted download is refused: hand over the text instead
    if (isEmbedded()) return setConfirm({ kind: 'copy', json, why: 'download' });
    download(new Blob([json], { type: 'application/json' }), name);
    toast(t('备份已开始下载；若无反应，请改用「复制」', 'Backup download started — if nothing happens, use Copy'), 3600);
  };
  const copy = () => {
    const json = exportJSON();
    const fail = () => setConfirm({ kind: 'copy', json });
    try {
      if (!navigator.clipboard?.writeText || !clipboardAllowed()) return fail();
      navigator.clipboard.writeText(json).then(() => toast(t('备份已复制到剪贴板', 'Backup copied to the clipboard')), fail);
    } catch {
      fail();
    }
  };
  useEffect(() => {
    if (confirm?.kind === 'copy') setTimeout(() => copyRef.current?.select(), 60);
  }, [confirm]);

  const onFile = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    try {
      const info = inspectBackup(await f.text());
      if (!info) return toast(t('这不是半亩的备份文件', 'That isn’t a Half-Acre backup'));
      setConfirm({ kind: 'import', info });
    } catch {
      toast(t('读取文件失败', 'Couldn’t read the file'));
    }
  };
  const doImport = (info: BackupInfo) => {
    const ok = importJSON(info.text);
    setConfirm(null);
    setPaste('');
    toast(ok ? t(`已导入：${info.habits} 株，${info.checkins} 次打卡`, `Imported ${info.habits} plants and ${info.checkins} check-ins`) : t('导入失败，数据未改动', 'Import failed — nothing was changed'));
  };
  const doDemo = () => {
    const settings = state.value.settings;
    replaceState({ ...demoState(today.value, settings.lang), settings });
    setConfirm(null);
    toast(t('示例园已载入', 'Demo garden planted'));
  };
  const doReset = () => {
    resetAll();
    setConfirm(null);
    toast(t('园子已清空，设置保留', 'Garden cleared — settings kept'));
  };
  const pasted = paste.trim() ? inspectBackup(paste.trim()) : null;
  const close = () => setConfirm(null);

  return (
    <Section id="data" zh="数据" en="Data">
      <p class="set-summary">
        {t(`园中 ${plants} 株 · 打卡 ${checkins} 次 · 焚香 ${incense} 炷`, `${plants} plants · ${checkins} check-ins · ${incense} incense sticks`)}
      </p>
      <Row title={t('导出备份', 'Export backup')} sub={t('存为 JSON 文件，或复制文本', 'Save a JSON file, or copy the text')} wrap>
        <div class="set-btns">
          <button class="btn btn-small" onClick={exportFile}>{t('导出', 'Export')}</button>
          <button class="btn btn-small btn-ghost" onClick={copy}>{t('复制', 'Copy')}</button>
        </div>
      </Row>
      <Row title={t('导入备份', 'Import backup')} sub={t('以备份替换当前全部数据', 'Replace everything with a backup')} wrap>
        <div class="set-btns">
          <button class="btn btn-small" onClick={() => fileRef.current?.click()}>{t('选择文件', 'Choose file')}</button>
          <button class="btn btn-small btn-ghost" onClick={() => setConfirm({ kind: 'paste' })}>{t('粘贴', 'Paste')}</button>
        </div>
        <input ref={fileRef} type="file" accept="application/json,.json,text/plain" class="visually-hidden" tabIndex={-1} aria-hidden="true" onChange={onFile} />
      </Row>
      <Row title={t('载入示例园', 'Load demo garden')} sub={t('六株花木与数月记录，便于一试', 'Six plants with a few months of history')} wrap>
        <button class="btn btn-small" onClick={() => setConfirm({ kind: 'demo' })}>{t('载入', 'Load')}</button>
      </Row>
      <CodeRow />
      <Row title={<span class="set-danger-text">{t('清空一切', 'Erase everything')}</span>} sub={t('删除所有习惯与记录，连同入画中的同伴、任务、铜钱与家园；设置保留', 'Deletes all habits and records, and the walk’s companions, quests, coins and homestead; settings are kept')} wrap>
        <button class="btn btn-small set-danger" onClick={() => setConfirm({ kind: 'reset', step: 1 })}>{t('清空', 'Erase')}</button>
      </Row>

      <Sheet open={confirm?.kind === 'import'} onClose={close} title={t('导入备份', 'Import backup')} label={t('确认导入', 'Confirm import')}>
        {confirm?.kind === 'import' && (
          <div class="set-sheet">
            <p>{t(`备份含 ${confirm.info.habits} 株、${confirm.info.checkins} 次打卡。`, `This backup holds ${confirm.info.habits} plants and ${confirm.info.checkins} check-ins.`)}
              {confirm.info.exportedAt && <span class="muted num"> {t('导出于', 'Exported')} {confirm.info.exportedAt.slice(0, 10)}</span>}</p>
            <p class="set-warn">{t('当前园中的一切将被替换。', 'Everything in your current garden will be replaced.')}</p>
            <div class="set-sheet-btns">
              <button class="btn" onClick={close}>{t('取消', 'Cancel')}</button>
              <button class="btn btn-primary" onClick={() => doImport(confirm.info)}>{t('替换并导入', 'Replace and import')}</button>
            </div>
          </div>
        )}
      </Sheet>

      <Sheet open={confirm?.kind === 'paste'} onClose={close} title={t('粘贴备份', 'Paste backup')} label={t('粘贴备份', 'Paste backup')}>
        <div class="set-sheet">
          <label class="field">
            <span>{t('把备份文本粘贴在此', 'Paste the backup text here')}</span>
            <textarea class="set-json" value={paste} onInput={(e) => setPaste(e.currentTarget.value)} spellcheck={false} rows={6} />
          </label>
          {paste.trim() && !pasted && <p class="set-warn">{t('这不是半亩的备份', 'That isn’t a Half-Acre backup')}</p>}
          {pasted && <p>{t(`备份含 ${pasted.habits} 株、${pasted.checkins} 次打卡；将替换当前全部数据。`, `${pasted.habits} plants, ${pasted.checkins} check-ins — this replaces all current data.`)}</p>}
          <div class="set-sheet-btns">
            <button class="btn" onClick={close}>{t('取消', 'Cancel')}</button>
            <button class="btn btn-primary" disabled={!pasted} onClick={() => pasted && doImport(pasted)}>{t('替换并导入', 'Replace and import')}</button>
          </div>
        </div>
      </Sheet>

      <Sheet open={confirm?.kind === 'copy'} onClose={close} title={t('复制备份', 'Copy backup')} label={t('复制备份', 'Copy backup')}>
        {confirm?.kind === 'copy' && (
          <div class="set-sheet">
            <p>
              {confirm.why === 'download'
                ? t('此处无法下载文件。文本已选中，请手动复制并妥善保存。', 'Files can’t be downloaded here. The text is selected — copy it by hand and keep it somewhere safe.')
                : t('无法自动复制。文本已选中，请手动复制并妥善保存。', 'Couldn’t copy automatically. The text is selected — copy it by hand and keep it somewhere safe.')}
            </p>
            <textarea ref={copyRef} class="set-json" readOnly value={confirm.json} rows={8} onFocus={(e) => e.currentTarget.select()} />
            <div class="set-sheet-btns">
              <button class="btn btn-primary" onClick={close}>{t('好', 'Done')}</button>
            </div>
          </div>
        )}
      </Sheet>

      <Sheet open={confirm?.kind === 'demo'} onClose={close} title={t('载入示例园', 'Load demo garden')} label={t('确认载入示例园', 'Confirm demo garden')}>
        <div class="set-sheet">
          <p>{t('将种下六株花木，并附数月的打卡、日记与焚香记录。', 'Plants six habits with a few months of check-ins, notes and incense.')}</p>
          <p class="set-warn">{t('当前园中的一切将被替换（设置保留）。', 'Everything in your current garden will be replaced (settings are kept).')}</p>
          <div class="set-sheet-btns">
            <button class="btn" onClick={close}>{t('取消', 'Cancel')}</button>
            <button class="btn btn-primary" onClick={doDemo}>{t('载入示例', 'Load demo')}</button>
          </div>
        </div>
      </Sheet>

      <Sheet open={confirm?.kind === 'reset'} onClose={close} title={t('清空一切', 'Erase everything')} label={t('确认清空', 'Confirm erase')}>
        {confirm?.kind === 'reset' && confirm.step === 1 && (
          <div class="set-sheet">
            <p>{t(`园中 ${plants} 株、${checkins} 次打卡、所有日记与焚香记录，以及入画中的同伴、任务、铜钱与家园，都将删除。设置会保留。`, `All ${plants} plants, ${checkins} check-ins, notes and incense records, and the walk’s companions, quests, coins and homestead, will be deleted. Settings are kept.`)}</p>
            <p class="muted">{t('建议先导出一份备份。', 'Consider exporting a backup first.')}</p>
            <div class="set-sheet-btns">
              <button class="btn" onClick={exportFile}>{t('先导出备份', 'Export backup first')}</button>
              <button class="btn set-danger" onClick={() => setConfirm({ kind: 'reset', step: 2 })}>{t('继续', 'Continue')}</button>
            </div>
          </div>
        )}
        {confirm?.kind === 'reset' && confirm.step === 2 && (
          <div class="set-sheet">
            <p class="set-warn set-warn-big">{t('此举不可撤销。确定清空吗？', 'This can’t be undone. Erase everything?')}</p>
            <div class="set-sheet-btns">
              <button class="btn" onClick={close}>{t('不，保留', 'No, keep it')}</button>
              <button class="btn btn-primary set-danger-solid" onClick={doReset}>{t('确定清空', 'Yes, erase')}</button>
            </div>
          </div>
        )}
      </Sheet>
    </Section>
  );
}

/** 兑换码: one small row with a field. */
function CodeRow() {
  const t = useT();
  const [code, setCode] = useState('');
  const submit = (e: Event) => {
    e.preventDefault();
    const r = redeemCode(code);
    if (r === 'invalid') return void toast(t('兑换码无效', 'That code doesn’t work'));
    setCode('');
    toast(r === 'ok' ? t('兑换成功', 'Redeemed') : t('此码已兑换', 'Already redeemed'));
  };
  return (
    <form class="row set-row set-row-wrap set-code" onSubmit={submit}>
      <label class="row-main" for="set-code">
        <span class="row-title">{t('兑换码', 'Code')}</span>
      </label>
      <div class="set-code-field">
        <input
          id="set-code"
          class="input"
          value={code}
          onInput={(e) => setCode(e.currentTarget.value)}
          maxLength={16}
          autoComplete="off"
          autoCapitalize="characters"
          spellcheck={false}
          enterKeyHint="done"
          placeholder={t('输入', 'Code')}
        />
        <button class="btn btn-small" type="submit" disabled={!code.trim()}>{t('兑换', 'Redeem')}</button>
      </div>
    </form>
  );
}

const POEM = ['半亩方塘一鉴开', '天光云影共徘徊', '问渠那得清如许', '为有源头活水来'];

function AboutSection() {
  const t = useT();
  const l = state.value.settings.lang;
  const seal = cleanSeal(state.value.settings.sealName) || '半亩';
  return (
    <Section id="about" zh="关于" en="About">
      <figure class="set-poem" lang="zh-CN">
        <div class="set-poem-cols">
          {POEM.map((line) => <p class="brush">{line}</p>)}
          <p class="set-poem-by">宋　朱熹《观书有感》</p>
        </div>
        <SealStamp text={seal} style="bai" size={34} label={t(`印：${seal}`, `Seal: ${seal}`)} />
      </figure>
      {l === 'en' ? (
        <p class="set-poem-en latin">
          “A half-acre pond opens like a mirror; sky-light and cloud-shadow linger on it together. How can it stay so clear?
          Because fresh water keeps flowing in from the source.” — Zhu Xi, <i>Thoughts on Reading</i>
        </p>
      ) : (
        <p class="set-about-line">「半亩」之名，取自此诗：方塘所以清澈，是因源头活水不断。</p>
      )}
      <p class="set-about-line">
        {t('半亩是一座以习惯浇灌的水墨小园：每守一日，园中便添一笔。', 'Half-Acre is a small ink garden watered by your habits: every day you keep adds a brushstroke.')}
      </p>
      <p class="set-about-line set-privacy">
        {t('一切只存于此设备——无账号，无追踪。', 'Everything stays on this device — no accounts, no tracking.')}
      </p>
      <div class="set-about-foot">
        <span class="muted num">{t('版本', 'Version')} {VERSION}</span>
        <button class="btn btn-small btn-ghost" onClick={() => go('garden')}>← {t('回到园圃', 'Back to the garden')}</button>
      </div>
    </Section>
  );
}

// ------------------------------------------------------------------ view

export function SettingsView() {
  const t = useT();
  return (
    <div class="settings-view">
      <header class="topbar">
        <div class="topbar-title">
          <button class="btn btn-ghost btn-icon set-back" onClick={() => go('garden')} aria-label={t('回到园圃', 'Back to the garden')}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
          </button>
          <h1 class="brush">{t('设置', 'Settings')}</h1>
          <span class="topbar-sub">{t('印章 · 语言 · 声乐 · 数据', 'Seal · language · sound · data')}</span>
        </div>
      </header>
      <div class="page set-page">
        <SealSection />
        <AppearanceSections />
        <SoundSection />
        <LocationSection />
        <DataSection />
        <AboutSection />
      </div>
    </div>
  );
}
