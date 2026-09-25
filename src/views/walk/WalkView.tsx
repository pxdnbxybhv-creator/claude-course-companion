// STUB — 入画 · Into the Painting: a 3D garden you can walk around in.
import { go } from '../../app/router';
import { useT } from '../../app/i18n';

export function WalkView() {
  const t = useT();
  return (
    <section style={{ padding: 24 }}>
      <button type="button" class="btn" onClick={(e) => go('garden', e)}>{t('出画', 'Leave')}</button>
    </section>
  );
}
