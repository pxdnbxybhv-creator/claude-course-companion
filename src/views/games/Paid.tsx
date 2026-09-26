// 得钱: one line on a finished game's result card — the coins it paid and why.
import { useT } from '../../app/i18n';
import { CoinIcon, fmtCoins } from '../../ui/coins';
import type { Paid } from './purse';

export function PaidLine(props: { paid: Paid | null | undefined; class?: string }) {
  const t = useT();
  const p = props.paid;
  if (!p || p.coins <= 0) return null;
  return (
    <p class={'game-paid' + (props.class ? ' ' + props.class : '')}>
      <CoinIcon size={16} />
      <span>{t('得钱', 'Earned')} <b>{fmtCoins(p.coins)}</b> {t('文', p.coins === 1 ? 'coin' : 'coins')}</span>
      {p.note && <small>· {p.note}</small>}
    </p>
  );
}

/** What a game pays, in one quiet line beside its rules (「胜「棋友」得 25 文」). */
export function PayHint(props: { zh: string; en: string; class?: string }) {
  const t = useT();
  return (
    <p class={'game-payhint' + (props.class ? ' ' + props.class : '')}>
      <CoinIcon size={12} />
      <span>{t(props.zh, props.en)}</span>
    </p>
  );
}
