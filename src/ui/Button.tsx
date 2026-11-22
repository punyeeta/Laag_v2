import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dark';
type Size = 'sm' | 'md' | 'lg';

const variants: Record<Variant, string> = {
  primary: 'bg-primary text-white hover:brightness-110 active:brightness-95',
  secondary: 'bg-paper text-ink border border-input-border hover:bg-surface',
  ghost: 'text-primary hover:bg-primary-tint',
  danger: 'bg-paper text-uncertain border border-uncertain hover:bg-uncertain-tint',
  dark: 'bg-ink text-white hover:brightness-125',
};
// On touch screens every control is at least 44px tall (NFR-03). With a
// mouse, buttons can be desktop-sized.
const sizes: Record<Size, string> = {
  sm: 'min-h-11 px-3 text-sm pointer-fine:min-h-9',
  md: 'min-h-11 px-4 text-sm pointer-fine:min-h-10',
  lg: 'min-h-12.5 px-5 text-base pointer-fine:min-h-11',
};

export function Button({
  variant = 'primary',
  size = 'md',
  block,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; block?: boolean }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 rounded-[10px] font-semibold transition disabled:pointer-events-none disabled:opacity-50 ${variants[variant]} ${sizes[size]} ${block ? 'w-full' : ''} ${className}`}
      {...rest}
    />
  );
}
