import type { ReactNode } from 'react';
import type { Certainty } from '../lib/calc';

type Tone = 'primary' | 'uncertain' | 'neutral' | 'success' | 'outline' | 'dashed';

const tones: Record<Tone, string> = {
  primary: 'bg-primary-tint text-primary',
  uncertain: 'bg-uncertain-tint text-uncertain',
  neutral: 'bg-surface text-muted',
  success: 'bg-success-tint text-success',
  outline: 'border border-ink text-ink',
  dashed: 'border border-dashed border-uncertain text-uncertain',
};

export function Chip({ tone = 'neutral', children, className = '' }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${tones[tone]} ${className}`}>
      {children}
    </span>
  );
}

/** Blue for confirmed prices, red for uncertain ones. */
export function CertaintyChip({ certainty, gas }: { certainty: Certainty; gas?: boolean }) {
  if (gas) return <Chip tone="uncertain">~ Estimate</Chip>;
  switch (certainty.kind) {
    case 'exact':
      return <Chip tone="primary">Exact</Chip>;
    case 'estimate':
      return <Chip tone="uncertain">~ Estimate</Chip>;
    case 'range':
      return <Chip tone="outline">Range</Chip>;
    case 'unknown':
      return <Chip tone="dashed">Unknown</Chip>;
  }
}
