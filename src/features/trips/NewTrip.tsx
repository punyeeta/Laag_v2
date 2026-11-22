import { useState } from 'react';
import { todayISO, useTrips } from '../../data/hooks';
import { createTrip, newId } from '../../data/repo';
import { useStore } from '../../data/store';
import type { Cost, TripGas } from '../../data/types';
import { Button } from '../../ui/Button';
import { Field, Input, Select } from '../../ui/Field';
import { Segmented } from '../../ui/Segmented';
import { Sheet } from '../../ui/Sheet';
import { LoadingScreen } from '../auth/AuthScreens';
import { GasFields } from './GasFields';
import { useDuplicate, waitForSave } from './useDuplicate';

/** US-01 and US-02. */
export function NewTrip({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const trips = useTrips();
  const [mode, setMode] = useState<'blank' | 'copy'>('blank');
  const [name, setName] = useState('');
  const profile = useStore((s) => s.profile);
  const me = useStore((s) => s.me);
  const [myName, setMyName] = useState<string | null>(null);
  const shownMyName = myName ?? profile.defaultName ?? me.name;
  const [destination, setDestination] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [gas, setGas] = useState<TripGas | null>(null);
  const [source, setSource] = useState('');
  const [touched, setTouched] = useState(false);

  const past = Object.values(trips).sort((a, b) => b.trip.startDate.localeCompare(a.trip.startDate));
  const error =
    mode === 'copy'
      ? !source
        ? 'Pick a trip to copy'
        : ''
      : !name.trim()
        ? 'Name the trip'
        : !start
          ? 'Pick the start date'
          : end && end < start
            ? 'The trip ends before it starts'
            : '';

  const dup = useDuplicate();
  const [creating, setCreating] = useState(false);

  async function create() {
    setTouched(true);
    if (error || creating) return;
    if (mode === 'copy') {
      onClose();
      dup.start(source);
      return;
    }
    // Gas is one Cost with kind gas; it's saved with the trip.
    const gasCost: Cost[] = gas
      ? [
          {
            id: newId(),
            kind: 'gas',
            label: 'Gas',
            stopId: null,
            category: 'Gas',
            certainty: { kind: 'estimate', value: 0, marginPct: 0 },
            costType: 'shared',
            split: { kind: 'allGoing' },
          },
        ]
      : [];
    setCreating(true);
    const c = createTrip(
      { myName: shownMyName, name: name.trim(), destination: destination.trim(), startDate: start, endDate: end || start, gas },
      { costs: gasCost },
    );
    const ok = await waitForSave(c);
    setCreating(false);
    if (!ok) return;
    setMyName(null);
    setName('');
    setDestination('');
    setStart('');
    setEnd('');
    setGas(null);
    setTouched(false);
    onClose();
    onCreated(c.id);
  }

  return (
    <>
    {dup.ui}
    {creating && <LoadingScreen overlay message="Creating your trip, please wait…" />}
    <Sheet
      open={open}
      onClose={onClose}
      title="New trip"
      footer={
        <div>
          <p className="mb-3 text-sm text-muted">
            Next, you add stops, costs and people. Your friends join with the invite link.
          </p>
          <Button size="lg" block onClick={create} disabled={creating}>
            {mode === 'copy' ? 'Duplicate trip' : 'Create trip'}
          </Button>
          {touched && error && <p className="mt-2 text-sm text-uncertain">{error}</p>}
        </div>
      }
    >
      <div className="space-y-4">
        <Segmented
          label="Start from"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'blank', label: 'Blank' },
            { value: 'copy', label: 'Copy a past trip' },
          ]}
        />
        {mode === 'copy' ? (
          <>
            <Field label="Trip to copy" hint="Copies the stops, costs, checklists and gas settings. People, expenses and activity start fresh.">
              <Select value={source} onChange={(e) => setSource(e.target.value)}>
                <option value="">Pick a trip</option>
                {past.map((t) => (
                  <option key={t.trip.id} value={t.trip.id}>
                    {t.trip.name}
                  </option>
                ))}
              </Select>
            </Field>
          </>
        ) : (
          <>
            <Field label="Trip name">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Bukidnon Round 2" />
            </Field>
            <Field label="Destination">
              <Input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Bukidnon" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Starts">
                <Input type="date" value={start} min={todayISO()} onChange={(e) => setStart(e.target.value)} />
              </Field>
              <Field label="Ends">
                <Input type="date" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} />
              </Field>
            </div>
            <GasFields value={gas} onChange={setGas} key={open ? 'open' : 'closed'} />
            <Field label="Your name in this trip" hint="You’re added as Going. Change the default in your profile.">
              <Input value={shownMyName} onChange={(e) => setMyName(e.target.value)} />
            </Field>
          </>
        )}
      </div>
    </Sheet>
    </>
  );
}
