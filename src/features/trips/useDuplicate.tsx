import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { duplicateTrip, existingCopies, type Created } from '../../data/repo';
import { getState, isOnline } from '../../data/store';
import type { TripData } from '../../data/types';
import { Button } from '../../ui/Button';
import { Sheet } from '../../ui/Sheet';
import { LoadingScreen } from '../auth/AuthScreens';

/**
 * Waits until a new trip is saved on the server, then opens it. Offline,
 * Firestore keeps it on the phone and sends it later, so we open it right away.
 * Gives up waiting after 20 seconds; the trip still finishes saving.
 */
export async function waitForSave(c: Created): Promise<boolean> {
  if (!isOnline()) return true;
  const timeout = new Promise<boolean>((r) => setTimeout(() => r(true), 20_000));
  return Promise.race([c.done, timeout]);
}

/**
 * US-02 with a guard: if you already duplicated this trip, ask before making
 * another copy, and show "Duplicating…" while it saves so a second tap can't
 * make a second copy.
 */
export function useDuplicate() {
  const nav = useNavigate();
  const [asking, setAsking] = useState<{ source: TripData; copies: TripData[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const running = useRef(false);

  async function run(sourceId: string) {
    if (running.current) return;
    running.current = true;
    setAsking(null);
    setBusy(true);
    try {
      const c = duplicateTrip(sourceId);
      if (c && (await waitForSave(c))) nav(`/t/${c.id}`);
      // On failure the error toast explains; we stay on this screen.
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  function start(sourceId: string) {
    if (running.current) return;
    const source = getState().trips[sourceId];
    if (!source) return;
    const copies = existingCopies(sourceId);
    if (copies.length) setAsking({ source, copies });
    else void run(sourceId);
  }

  const ui = (
    <>
      {busy && <LoadingScreen overlay message="Duplicating, please wait…" />}
      <Sheet open={!!asking} onClose={() => setAsking(null)} title="Already duplicated">
        {asking && (
          <div className="space-y-4">
            <p>
              You already duplicated {asking.source.trip.name}
              {asking.copies.length === 1 ? ` as ${asking.copies[0].trip.name}` : ` ${asking.copies.length} times`}. Open{' '}
              {asking.copies.length === 1 ? 'it' : 'one'} instead, or make another copy?
            </p>
            <ul className="space-y-2">
              {asking.copies.map((c) => (
                <li key={c.trip.id}>
                  <Button variant="secondary" block onClick={() => nav(`/t/${c.trip.id}`)}>
                    Open {c.trip.name}
                  </Button>
                </li>
              ))}
            </ul>
            <div className="flex gap-2 border-t border-line pt-4">
              <Button variant="ghost" onClick={() => setAsking(null)}>
                Cancel
              </Button>
              <Button className="flex-1" onClick={() => run(asking.source.trip.id)}>
                Make another copy
              </Button>
            </div>
          </div>
        )}
      </Sheet>
    </>
  );

  return { start, busy, ui };
}
