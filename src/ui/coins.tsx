// 铜钱 · the purse, shown wherever coins matter (the walk's HUD, the quest book, the homestead's
// shop). A round coin with a square hole, drawn in CSS, and the count.
import { coins } from '../app/play';
import { useT } from '../app/i18n';
import './coins.css';

/** Formats 12345 as 12,345. */
export const fmtCoins = (n: number) => Math.max(0, Math.floor(n)).toLocaleString('en-US');

/** A coin glyph (decorative). */
export function CoinIcon(props: { size?: number }) {
  const s = props.size ?? 16;
  return <i class="coin-icon" style={{ width: `${s}px`, height: `${s}px` }} aria-hidden="true" />;
}

/** The purse: a coin and the count (live). `value` shows a price instead of the purse. */
export function CoinBadge(props: { value?: number; class?: string; size?: number }) {
  const t = useT();
  const n = props.value ?? coins.value;
  return (
    <span class={'coin-badge num ' + (props.class ?? '')} aria-label={t(`铜钱 ${n}`, `${n} coins`)}>
      <CoinIcon size={props.size} />
      <span>{fmtCoins(n)}</span>
    </span>
  );
}
