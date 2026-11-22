// Money is always whole centavos (NFR-05). ₱95.22 is stored as 9522.
export type Centavos = number;

export const pesos = (p: number): Centavos => Math.round(p * 100);

const groupFmt = new Intl.NumberFormat('en-PH', { maximumFractionDigits: 0 });
const exactFmt = new Intl.NumberFormat('en-PH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** ₱1,186 — summaries round to the peso (BR-08). */
export function peso(c: Centavos): string {
  const sign = c < 0 ? '−' : '';
  return `${sign}₱${groupFmt.format(Math.round(Math.abs(c) / 100))}`;
}

/** ₱1,185.61 — exact to the centavo. */
export function pesoExact(c: Centavos): string {
  const sign = c < 0 ? '−' : '';
  return `${sign}₱${exactFmt.format(Math.abs(c) / 100)}`;
}

/** ₱1,186–₱1,247, or a single amount when low and high round the same. */
export function pesoRange(low: Centavos, high: Centavos): string {
  const a = peso(low);
  const b = peso(high);
  return a === b ? a : `${a}–${b}`;
}

/** ₱10k style for tight tiles. */
export function pesoShort(c: Centavos): string {
  const p = c / 100;
  if (p >= 1000) return `₱${Math.round(p / 1000)}k`;
  return peso(c);
}
