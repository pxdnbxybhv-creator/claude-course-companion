// 同伴 · Companions — choose who to walk the painting as. A turntable stage shows the focused
// companion in 3D (one small WebGL renderer, loaded lazily and freed on close); below, the roster
// of painted round-fan portraits. Locked companions are pale silhouettes with the quest that
// brings them, its hint and progress. Arrow keys move through the roster, Enter chooses.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useT } from '../../../app/i18n';
import { CHARACTERS, CHARACTER, type CharacterId } from '../../../data/characters';
import { QUEST } from '../../../data/quests';
import { play, questTarget, questValue, selectCharacter, unlocked } from '../../../app/play';
import { state as appState, today } from '../../../app/store';
import { Sheet, toast } from '../../../ui/kit';
import { paintPortrait } from './portrait';
import type { Stage } from './stage';
import './select.css';

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function Portrait(props: { id: CharacterId; locked: boolean; size: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const px = Math.round(props.size * dpr);
    c.width = px; c.height = px;
    // paint on the next frame so opening the sheet stays smooth
    const id = requestAnimationFrame(() => paintPortrait(c, props.id, props.locked));
    return () => cancelAnimationFrame(id);
  }, [props.id, props.locked, props.size]);
  return <canvas ref={ref} class="cs-portrait" style={{ width: props.size + 'px', height: props.size + 'px' }} aria-hidden="true" />;
}

export function CharacterSelect(props: { open: boolean; onClose: () => void }) {
  const t = useT();
  if (!props.open) return null;
  return (
    <Sheet open={props.open} onClose={props.onClose} title={t('同伴', 'Companions')} label={t('选择同伴', 'Choose a companion')}>
      <SelectBody onClose={props.onClose} />
    </Sheet>
  );
}

function SelectBody(props: { onClose: () => void }) {
  const t = useT();
  const p = play.value;
  const open = unlocked.value;
  const current = p.character;
  const [focus, setFocus] = useState<CharacterId>(current);
  const [stageState, setStageState] = useState<'loading' | 'ready' | 'none'>('loading');
  const stageRef = useRef<HTMLCanvasElement>(null);
  const stage = useRef<Stage | null>(null);
  const rosterRef = useRef<HTMLDivElement>(null);
  const def = CHARACTER[focus];
  const isOpen = open.includes(focus);
  const quest = def.unlock !== 'default' ? QUEST[def.unlock] : undefined;
  const progress = useMemo(() => {
    if (!quest) return null;
    const target = questTarget(quest);
    return { value: Math.min(target, questValue(quest, p, appState.value, today.value)), target };
  }, [quest, p]);

  // the 3D stage: loaded lazily, one renderer for the whole sheet
  useEffect(() => {
    let dead = false;
    const canvas = stageRef.current;
    if (!canvas) return;
    import('./stage')
      .then(({ createStage }) => {
        if (dead) return;
        try {
          stage.current = createStage(canvas, { reduced: reducedMotion() });
          setStageState('ready');
        } catch {
          setStageState('none');
        }
      })
      .catch(() => !dead && setStageState('none'));
    const onResize = () => stage.current?.resize();
    window.addEventListener('resize', onResize);
    return () => {
      dead = true;
      window.removeEventListener('resize', onResize);
      stage.current?.dispose();
      stage.current = null;
    };
  }, []);

  useEffect(() => {
    if (stageState !== 'ready') return;
    stage.current?.setVisible(isOpen);
    if (isOpen) stage.current?.show(focus);
  }, [focus, stageState, isOpen]);

  const choose = (id: CharacterId) => {
    if (!open.includes(id)) { setFocus(id); return; }
    if (id === play.value.character) return;
    if (selectCharacter(id)) {
      const c = CHARACTER[id];
      stage.current?.emote(id === 'cat' || id === 'rabbit' ? 'wave' : 'bow');
      toast(t(`${c.zh}与你同行`, `Walking as the ${c.en}`));
    }
  };

  const onKey = (e: KeyboardEvent) => {
    const tiles = Array.from(rosterRef.current?.querySelectorAll<HTMLButtonElement>('.cs-tile') ?? []);
    const i = tiles.findIndex((el) => el === document.activeElement);
    if (i < 0) return;
    const cols = Math.max(1, tiles.filter((el) => el.offsetTop === tiles[0].offsetTop).length);
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key];
    if (step) {
      e.preventDefault();
      const j = Math.max(0, Math.min(tiles.length - 1, i + step));
      tiles[j].focus();
      setFocus(CHARACTERS[j].id);
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      const j = e.key === 'Home' ? 0 : tiles.length - 1;
      tiles[j].focus();
      setFocus(CHARACTERS[j].id);
    }
  };

  const count = open.length;
  return (
    <div class="cs">
      <div class={'cs-stage' + (isOpen ? '' : ' is-locked')}>
        <canvas ref={stageRef} class="cs-canvas" style={{ visibility: isOpen && stageState === 'ready' ? 'visible' : 'hidden' }} aria-label={t(`${def.zh}的立像，可拖动旋转`, `${def.en}, drag to turn`)} role="img" />
        {(!isOpen || stageState !== 'ready') && (
          <div class="cs-still">
            <Portrait id={focus} locked={!isOpen} size={188} />
          </div>
        )}
        <div class="cs-count num" aria-label={t(`已结伴 ${count} / ${CHARACTERS.length}`, `${count} of ${CHARACTERS.length} companions`)}>
          {count}<span>/{CHARACTERS.length}</span>
        </div>
      </div>

      <div class="cs-info" aria-live="polite">
        <div class="cs-name">
          <span class="cs-zh">{isOpen ? def.zh : '？？'}</span>
          <span class="cs-en">{isOpen ? def.en : t('尚未结伴', 'Not yet met')}</span>
        </div>
        {isOpen ? (
          <>
            <p class="cs-title">「{t(def.titleZh, def.titleEn)}」</p>
            <p class="cs-desc">{t(def.descZh, def.descEn)}</p>
            <p class="cs-ability"><span class="cs-tag">{t('身手', 'Knack')}</span>{t(def.abilityZh, def.abilityEn)}</p>
            <button type="button" class={'btn cs-go' + (focus === current ? '' : ' btn-primary')} disabled={focus === current} onClick={() => choose(focus)}>
              {focus === current ? t('正与你同行', 'Walking together') : t(`与${def.zh}同行`, `Walk as the ${def.en}`)}
            </button>
          </>
        ) : quest && progress ? (
          <div class="cs-quest">
            <p class="cs-qtitle"><span class="cs-tag">{t('任务', 'Quest')}</span>{t(quest.zh, quest.en)}</p>
            <p class="cs-desc">{t(quest.descZh, quest.descEn)}</p>
            <p class="cs-hint">{t(quest.hintZh, quest.hintEn)}</p>
            <div class="cs-bar" role="progressbar" aria-valuemin={0} aria-valuemax={progress.target} aria-valuenow={progress.value} aria-label={t('进度', 'Progress')}>
              <i style={{ width: `${(progress.value / progress.target) * 100}%` }} />
            </div>
            <p class="cs-prog num">{progress.value} / {progress.target}</p>
          </div>
        ) : null}
      </div>

      <div class="cs-roster" ref={rosterRef} role="listbox" aria-label={t('同伴', 'Companions')} onKeyDown={onKey}>
        {CHARACTERS.map((c) => {
          const has = open.includes(c.id);
          const q = c.unlock !== 'default' ? QUEST[c.unlock] : undefined;
          return (
            <button
              type="button"
              key={c.id}
              class={'cs-tile' + (c.id === focus ? ' is-focus' : '') + (has ? '' : ' is-locked') + (c.id === current ? ' is-current' : '')}
              role="option"
              aria-selected={c.id === focus}
              tabIndex={c.id === focus ? 0 : -1}
              aria-label={has ? t(`${c.zh}，${c.titleZh}`, `${c.en}, ${c.titleEn}`) : t(`未结伴，任务：${q?.zh ?? ''}`, `Locked — quest: ${q?.en ?? ''}`)}
              onClick={() => setFocus(c.id)}
              onDblClick={() => choose(c.id)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (c.id === focus) choose(c.id); else setFocus(c.id); } }}
            >
              <Portrait id={c.id} locked={!has} size={64} />
              <span class="cs-tname">{has ? t(c.zh, c.en) : '？'}</span>
              {c.id === current && <span class="cs-dot" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
