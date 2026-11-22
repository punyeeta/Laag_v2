import { useEffect, useState } from 'react';
import { newId, write } from '../../data/repo';
import type { Cost, Person, TripData } from '../../data/types';
import { DEFAULT_ESTIMATE_MARGIN, parseAmount, type Certainty, type CostType, type SplitRule } from '../../lib/calc';
import { Button } from '../../ui/Button';
import { Field, Input, Select } from '../../ui/Field';
import { Segmented } from '../../ui/Segmented';
import { Sheet } from '../../ui/Sheet';
import { priceText } from './describe';

const toText = (c?: number | null) => (c == null ? '' : String(c / 100));

/** Optional money field: '' is allowed, anything else must parse. */
function money(text: string): { ok: true; value: number | null } | { ok: false; error: string } {
  if (text.trim() === '') return { ok: true, value: null };
  const r = parseAmount(text);
  return r.ok ? { ok: true, value: r.value } : r;
}

export function CostEditor({
  open,
  onClose,
  t,
  people,
  cost,
  defaultStopId,
}: {
  open: boolean;
  onClose: () => void;
  t: TripData;
  people: Person[];
  cost?: Cost;
  defaultStopId?: string | null;
}) {
  const isGas = cost?.kind === 'gas';
  const [label, setLabel] = useState('');
  const [stopId, setStopId] = useState<string | null>(null);
  const [category, setCategory] = useState('');
  const [costType, setCostType] = useState<CostType>('shared');
  const [optionalBasis, setOptionalBasis] = useState<'shared' | 'perPerson'>('perPerson');
  const [groupSize, setGroupSize] = useState('5');
  const [kind, setKind] = useState<Certainty['kind']>('exact');
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [margin, setMargin] = useState(String(DEFAULT_ESTIMATE_MARGIN));
  const [splitKind, setSplitKind] = useState<SplitRule['kind']>('allGoing');
  const [named, setNamed] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [source, setSource] = useState('');
  const [checkedAt, setCheckedAt] = useState('');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    const c = cost;
    setLabel(c?.label ?? '');
    setStopId(c ? c.stopId : defaultStopId ?? null);
    setCategory(c?.category ?? '');
    setCostType(c?.costType ?? 'shared');
    setOptionalBasis(c?.optionalBasis ?? 'perPerson');
    setGroupSize(String(c?.groupSize ?? 5));
    const cert = c?.certainty;
    setKind(cert?.kind ?? 'exact');
    setA(
      cert?.kind === 'exact' || cert?.kind === 'estimate'
        ? toText(cert.value)
        : cert?.kind === 'range'
          ? toText(cert.low)
          : cert?.kind === 'unknown'
            ? toText(cert.max)
            : '',
    );
    setB(cert?.kind === 'range' ? toText(cert.high) : '');
    setMargin(String(cert?.kind === 'estimate' ? cert.marginPct ?? DEFAULT_ESTIMATE_MARGIN : DEFAULT_ESTIMATE_MARGIN));
    setSplitKind(c?.split.kind ?? 'allGoing');
    setNamed(c && c.split.kind !== 'allGoing' ? c.split.people : []);
    setNote(c?.note ?? '');
    setSource(c?.source ?? '');
    setCheckedAt(c?.checkedAt ?? '');
    setTouched(false);
  }, [open, cost, defaultStopId]);

  const pa = money(a);
  const pb = money(b);
  let certainty: Certainty | null = null;
  let error = '';
  if (kind === 'exact') {
    if (pa.ok && pa.value != null) certainty = { kind: 'exact', value: pa.value };
    else error = pa.ok ? 'Type the price' : pa.error;
  } else if (kind === 'range') {
    if (pa.ok && pb.ok && pa.value != null && pb.value != null) certainty = { kind: 'range', low: pa.value, high: pb.value };
    else error = 'Type the lowest and highest price';
  } else if (kind === 'estimate') {
    const m = Number(margin);
    if (pa.ok && pa.value != null && Number.isFinite(m) && m >= 0) certainty = { kind: 'estimate', value: pa.value, marginPct: m };
    else error = 'Type your best guess';
  } else {
    if (pa.ok) certainty = { kind: 'unknown', max: pa.value };
    else error = pa.error;
  }
  if (isGas) {
    certainty = cost!.certainty;
    error = '';
  }
  if (!label.trim() && !isGas) error = error || 'Give it a name';

  const split: SplitRule = splitKind === 'allGoing' ? { kind: 'allGoing' } : { kind: splitKind, people: named };
  const stops = Object.values(t.stops).sort((x, y) => (x.date + x.time).localeCompare(y.date + y.time));
  const active = people.filter((p) => p.status !== 'out');

  function save() {
    setTouched(true);
    if (error || !certainty) return;
    const next: Cost = {
      id: cost?.id ?? newId(),
      kind: cost?.kind ?? 'normal',
      label: label.trim() || cost?.label || 'Cost',
      stopId,
      category: category.trim() || undefined,
      certainty,
      costType,
      optionalBasis: costType === 'optional' ? optionalBasis : undefined,
      groupSize: costType === 'perGroup' ? Math.max(1, parseInt(groupSize, 10) || 1) : undefined,
      split,
      note: note.trim() || undefined,
      source: source.trim() || undefined,
      checkedAt: checkedAt || undefined,
    };
    let summary: string;
    if (!cost) summary = `added ${next.label}, ${priceText(next, t)}`;
    else {
      const before = priceText(cost, t);
      const after = priceText(next, t);
      summary = before !== after ? `changed ${next.label} from ${before} to ${after}` : `edited ${next.label}`;
    }
    write(t.trip.id, 'costs', next.id, next, summary);
    onClose();
  }

  function remove() {
    if (!cost) return;
    write(t.trip.id, 'costs', cost.id, null, `removed ${cost.label}`);
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      eyebrow={t.trip.name}
      title={cost ? (isGas ? 'Gas split' : 'Edit cost') : 'Add cost'}
      footer={
        <div className="flex gap-2">
          {cost && !isGas && (
            <Button variant="danger" onClick={remove}>
              Remove
            </Button>
          )}
          <Button size="lg" className="flex-1" onClick={save}>
            Save
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {isGas ? (
          <p className="rounded-[12px] bg-surface p-3 text-sm text-muted">
            The gas amount comes from the distance, car and fuel price in trip settings. Here you choose who shares it.
          </p>
        ) : (
          <>
            <Field label="What">
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Falls entrance" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Stop">
                <Select value={stopId ?? ''} onChange={(e) => setStopId(e.target.value || null)}>
                  <option value="">Whole trip</option>
                  {stops.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.place}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Group" hint="For “where each share goes”">
                <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Food" list="cost-categories" />
                <datalist id="cost-categories">
                  {['Gas', 'Food', 'Camping', 'Stay', 'Travel', 'Tours', 'Other'].map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </Field>
            </div>

            <div>
              <div className="mb-1.5 text-sm font-semibold">How sure is the price?</div>
              <Segmented
                label="Certainty"
                value={kind}
                onChange={setKind}
                options={[
                  { value: 'exact', label: 'Exact' },
                  { value: 'range', label: 'Range' },
                  { value: 'estimate', label: 'Estimate' },
                  { value: 'unknown', label: 'Unknown' },
                ]}
              />
            </div>
            {kind === 'exact' && (
              <Field label="Price (₱)">
                <Input inputMode="decimal" value={a} onChange={(e) => setA(e.target.value)} placeholder="300" />
              </Field>
            )}
            {kind === 'range' && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Lowest (₱)">
                  <Input inputMode="decimal" value={a} onChange={(e) => setA(e.target.value)} />
                </Field>
                <Field label="Highest (₱)">
                  <Input inputMode="decimal" value={b} onChange={(e) => setB(e.target.value)} />
                </Field>
              </div>
            )}
            {kind === 'estimate' && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Best guess (₱)">
                  <Input inputMode="decimal" value={a} onChange={(e) => setA(e.target.value)} />
                </Field>
                <Field label="Could go up by (%)" hint="Counted as the high end">
                  <Input inputMode="numeric" value={margin} onChange={(e) => setMargin(e.target.value)} />
                </Field>
              </div>
            )}
            {kind === 'unknown' && (
              <Field label="At most (₱, optional)" hint="Without a maximum it’s left out of totals and flagged.">
                <Input inputMode="decimal" value={a} onChange={(e) => setA(e.target.value)} />
              </Field>
            )}

            <Field label="Cost type">
              <Select value={costType} onChange={(e) => setCostType(e.target.value as CostType)}>
                <option value="shared">Shared: total split evenly</option>
                <option value="perPerson">Per person: each pays this price</option>
                <option value="perGroup">Per group of N, like a guide per 5 visitors</option>
                <option value="optional">Optional: only people who opt in</option>
              </Select>
            </Field>
            {costType === 'perGroup' && (
              <Field label="People per group">
                <Input inputMode="numeric" value={groupSize} onChange={(e) => setGroupSize(e.target.value)} />
              </Field>
            )}
            {costType === 'optional' && (
              <Segmented
                label="Optional works like"
                value={optionalBasis}
                onChange={setOptionalBasis}
                options={[
                  { value: 'perPerson', label: 'Per person' },
                  { value: 'shared', label: 'Shared' },
                ]}
              />
            )}
          </>
        )}

        <div>
          <div className="mb-1.5 text-sm font-semibold">Who’s in the split</div>
          <Segmented
            label="Split rule"
            value={splitKind}
            onChange={setSplitKind}
            options={[
              { value: 'allGoing', label: 'Everyone going' },
              { value: 'allGoingExcept', label: 'All except' },
              { value: 'only', label: 'Only' },
            ]}
          />
          {splitKind !== 'allGoing' && (
            <div className="mt-3 flex flex-wrap gap-2">
              {active.map((p) => {
                const on = named.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setNamed(on ? named.filter((x) => x !== p.id) : [...named, p.id])}
                    className={`min-h-11 rounded-[10px] border px-3 text-sm font-semibold ${
                      on ? 'border-primary bg-primary-tint text-primary' : 'border-line text-ink'
                    }`}
                  >
                    {p.name}
                  </button>
                );
              })}
            </div>
          )}
          <p className="mt-2 text-xs text-muted">
            {splitKind === 'allGoingExcept'
              ? 'Tap who is left out. Covering for someone is a split that leaves them out.'
              : splitKind === 'only'
                ? 'Tap who pays for this.'
                : 'Follows status changes: Maybes join the split once they’re Going.'}
          </p>
        </div>

        <Field label="Note (optional)">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="or bring our own" />
        </Field>
        {!isGas && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Price from (optional)">
              <Input value={source} onChange={(e) => setSource(e.target.value)} placeholder="FB page, Nov 2026" />
            </Field>
            <Field label="Checked on">
              <Input type="date" value={checkedAt} onChange={(e) => setCheckedAt(e.target.value)} />
            </Field>
          </div>
        )}
        {touched && error && <p className="text-sm text-uncertain">{error}</p>}
      </div>
    </Sheet>
  );
}
