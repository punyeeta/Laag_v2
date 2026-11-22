import { useState } from 'react';
import type { TripData } from '../../data/types';
import { Button } from '../../ui/Button';

export function inviteUrl(t: TripData) {
  return `${window.location.origin}/join/${t.trip.id}?code=${encodeURIComponent(t.trip.inviteCode)}`;
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function CopyInviteButton({ t, compact, block }: { t: TripData; compact?: boolean; block?: boolean }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      variant="secondary"
      size={compact ? 'sm' : 'lg'}
      block={block}
      onClick={async () => {
        await copyText(inviteUrl(t));
        setDone(true);
        setTimeout(() => setDone(false), 1800);
      }}
    >
      {done ? 'Link copied' : 'Copy invite link'}
    </Button>
  );
}
