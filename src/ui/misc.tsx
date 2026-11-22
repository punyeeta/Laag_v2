import type { HTMLAttributes, ReactNode } from 'react';
import { useOnline, usePendingWrites } from '../data/hooks';
import { IconWifiOff } from './icons';

export function Logo({ variant = 'blue', size = 44 }: { variant?: 'blue' | 'white'; size?: number }) {
  return <img src={`/logo-${variant}.svg`} alt="Laag" width={Math.round(size * (58.15 / 54.7))} height={size} />;
}

export function Card({ className = '', ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`rounded-[16px] border border-line bg-paper ${className}`} {...rest} />;
}

/** Screen heading: small context line, big sign-style title, optional sub line. */
export function ScreenTitle({ eyebrow, title, sub, right }: { eyebrow?: ReactNode; title: string; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && <div className="text-sm text-muted">{eyebrow}</div>}
        <h1 className="sign text-xl sm:text-3xl">{title}</h1>
        {sub && <div className="mt-1 text-sm text-muted">{sub}</div>}
      </div>
      {right}
    </div>
  );
}

/** US-14: shows when there's no signal, with the count of unsynced writes. */
export function OfflineBanner() {
  const online = useOnline();
  const pending = usePendingWrites();
  if (online) return null;
  return (
    <div role="status" className="mb-3 flex items-center gap-2 rounded-[12px] bg-uncertain-tint px-3 py-2.5 text-sm font-semibold text-uncertain-dark">
      <IconWifiOff width={18} height={18} />
      <span>
        No signal.{' '}
        {pending > 0
          ? `${pending} ${pending === 1 ? 'change' : 'changes'} will sync when you’re back online.`
          : 'Changes save on this phone and sync when you’re back.'}
      </span>
    </div>
  );
}

export function Stat({ label, value, children }: { label: string; value: ReactNode; children?: ReactNode }) {
  return (
    <div className="rounded-[14px] bg-surface p-3.5">
      <div className="text-sm text-muted">{label}</div>
      <div className="sign tnum mt-1 text-xl normal-case">{value}</div>
      {children}
    </div>
  );
}
