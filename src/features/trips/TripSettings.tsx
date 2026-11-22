import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { effectiveStatus } from '../../data/hooks';
import { deleteTrip, newId, newInviteCode, update, write } from '../../data/repo';
import type { Cost, Trip, TripGas, TripStatus } from '../../data/types';
import { shortDate } from '../../lib/format';
import { pesoExact } from '../../lib/money';
import { Button } from '../../ui/Button';
import { Field, Input } from '../../ui/Field';
import { ScreenTitle } from '../../ui/misc';
import { Segmented } from '../../ui/Segmented';
import { ToggleRow } from '../../ui/Toggle';
import { useTripCtx } from '../tripContext';
import { GasFields } from './GasFields';

export function TripSettings() {
  const { t, isOrganizer } = useTripCtx();
  const nav = useNavigate();
  const trip = t.trip;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const status = effectiveStatus(trip);

  const set = (patch: Partial<Trip>, summary: string) => update<Trip>(trip.id, 'trip', trip.id, patch, summary);

  function setGas(g: TripGas | null) {
    const before = trip.gas;
    let summary = 'changed the gas settings';
    if (before && g && before.fuelPrice !== g.fuelPrice)
      summary = `changed the fuel price from ${pesoExact(before.fuelPrice)} to ${pesoExact(g.fuelPrice)}`;
    else if (before && g && before.distanceKm !== g.distanceKm) summary = `changed the distance from ${before.distanceKm} km to ${g.distanceKm} km`;
    set({ gas: g }, summary);
    // Gas is one Cost with kind gas; create it the first time a car is set.
    if (g && !Object.values(t.costs).some((c) => c.kind === 'gas')) {
      const c: Cost = {
        id: newId(),
        kind: 'gas',
        label: 'Gas',
        stopId: null,
        category: 'Gas',
        certainty: { kind: 'estimate', value: 0, marginPct: 0 },
        costType: 'shared',
        split: { kind: 'allGoing' },
      };
      write(trip.id, 'costs', c.id, c, 'added gas to the plan');
    }
  }

  return (
    <div className="mx-auto max-w-[560px] pb-10">
      <ScreenTitle title="Trip settings" sub={`${trip.name} · changes save as you type`} />

      <section className="mb-8 space-y-4">
        <h2 className="text-lg font-semibold">Details</h2>
        <Field label="Trip name">
          <Input value={trip.name} onChange={(e) => set({ name: e.target.value }, 'renamed the trip')} />
        </Field>
        <Field label="Destination">
          <Input value={trip.destination} onChange={(e) => set({ destination: e.target.value }, 'changed the destination')} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Starts">
            <Input type="date" value={trip.startDate} onChange={(e) => set({ startDate: e.target.value }, 'changed the start date')} />
          </Field>
          <Field label="Ends">
            <Input type="date" value={trip.endDate} min={trip.startDate} onChange={(e) => set({ endDate: e.target.value }, 'changed the end date')} />
          </Field>
        </div>
      </section>

      <section className="mb-8 space-y-3">
        <h2 className="text-lg font-semibold">Status</h2>
        <Segmented<TripStatus>
          label="Trip status"
          value={status}
          onChange={(s) => set({ status: s, statusMode: s === 'planning' ? trip.statusMode : 'manual' }, `moved the trip to ${s[0].toUpperCase()}${s.slice(1)}`)}
          options={[
            { value: 'planning', label: 'Planning' },
            { value: 'ongoing', label: 'Ongoing' },
            { value: 'settled', label: 'Settled' },
          ]}
        />
        {status === 'planning' && (
          <ToggleRow
            title="Start the trip automatically"
            hint={`Moves to Ongoing on ${shortDate(trip.startDate)}`}
            checked={trip.statusMode === 'auto'}
            onChange={(v) => set({ statusMode: v ? 'auto' : 'manual' }, v ? 'turned on automatic start' : 'turned off automatic start')}
          />
        )}
      </section>

      <section className="mb-8 space-y-3">
        <h2 className="text-lg font-semibold">Gas</h2>
        <GasFields value={trip.gas} onChange={setGas} />
      </section>

      <section className="mb-8 space-y-3">
        <h2 className="text-lg font-semibold">People and invite link</h2>
        {isOrganizer ? (
          <>
            <ToggleRow
              title="Require approval to join"
              hint="Turn on if you post the link publicly."
              checked={trip.requireApproval}
              onChange={(v) => set({ requireApproval: v }, v ? 'turned on approval to join' : 'turned off approval to join')}
            />
            <Button variant="secondary" block onClick={() => set({ inviteCode: newInviteCode() }, 'reset the invite link')}>
              Reset invite link
            </Button>
            <p className="text-xs text-muted">The old link stops working for new people. Everyone already in the trip stays.</p>
          </>
        ) : (
          <p className="text-sm text-muted">Only the organizer can change who can join.</p>
        )}
      </section>

      {isOrganizer && (
        <section className="border-t border-line pt-4">
          {!confirmDelete ? (
            <Button variant="danger" onClick={() => setConfirmDelete(true)}>
              Delete trip
            </Button>
          ) : (
            <div className="rounded-[12px] bg-uncertain-tint p-4 text-uncertain-dark">
              <p className="mb-3 text-sm">Delete {trip.name} for everyone? This can’t be undone.</p>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
                  Keep it
                </Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    deleteTrip(trip.id);
                    nav('/');
                  }}
                >
                  Delete trip
                </Button>
              </div>
            </div>
          )}
          <p className="mt-2 text-xs text-muted">Only you, the organizer, can delete it. This can’t be undone.</p>
        </section>
      )}
    </div>
  );
}
