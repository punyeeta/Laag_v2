import { useEffect, useMemo, useRef, useState } from 'react';
import { todayISO } from '../../data/hooks';
import { newId, write } from '../../data/repo';
import { isOnline } from '../../data/store';
import type { Expense, Person, TripData, User } from '../../data/types';
import { parseAmount, POOL, resolveSplit, type SplitRule } from '../../lib/calc';
import { pesoExact, peso } from '../../lib/money';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Field';
import { OfflineBanner } from '../../ui/misc';
import { Sheet } from '../../ui/Sheet';

function Pill({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`min-h-11 rounded-full border px-4 text-sm font-semibold transition ${
        active ? 'border-ink bg-ink text-white' : 'border-line bg-paper text-ink hover:border-input-border'
      }`}
    >
      {children}
    </button>
  );
}

export function QuickAdd({
  open,
  onClose,
  t,
  me,
  people,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  t: TripData;
  me: User;
  people: Person[];
  initial?: Expense;
}) {
  const mine = people.find((p) => p.claimedBy === me.uid);
  const going = people.filter((p) => p.status === 'going');
  const stops = useMemo(
    () => Object.values(t.stops).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)),
    [t.stops],
  );

  const [text, setText] = useState('');
  const [label, setLabel] = useState('');
  const [paidBy, setPaidBy] = useState<string>(mine?.id ?? POOL);
  const [splitMode, setSplitMode] = useState<'all' | 'some'>('all');
  const [some, setSome] = useState<string[]>([]);
  const [stopId, setStopId] = useState<string | null>(null);
  const [showAllPayers, setShowAllPayers] = useState(false);
  const [touched, setTouched] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setText((initial.amount / 100).toString());
      setLabel(initial.label);
      setPaidBy(initial.paidBy);
      setStopId(initial.stopId);
      if (initial.split.kind === 'allGoing') {
        setSplitMode('all');
        setSome(going.map((p) => p.id));
      } else {
        setSplitMode('some');
        setSome(resolveSplit(initial.split, people).map((p) => p.id));
      }
    } else {
      setText('');
      setLabel('');
      setPaidBy(mine?.id ?? POOL);
      setSplitMode('all');
      setSome(going.map((p) => p.id));
      setStopId(null);
    }
    setTouched(false);
    setShowAllPayers(false);
    setTimeout(() => amountRef.current?.focus(), 150);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const parsed = parseAmount(text);
  const split: SplitRule = splitMode === 'all' ? { kind: 'allGoing' } : { kind: 'only', people: some };
  const splitCount = resolveSplit(split, people).length;
  const canSave = parsed.ok && splitCount > 0;

  // Paid by: Me, Pool, then a few others; "More" shows everyone.
  const others = people.filter((p) => p.id !== mine?.id && p.status !== 'out');
  const shownOthers = showAllPayers ? others : others.slice(0, 2);

  const todays = Object.values(t.expenses)
    .filter((e) => e.date === todayISO() && e.id !== initial?.id)
    .sort((a, b) => a.createdAt - b.createdAt);

  function save() {
    setTouched(true);
    if (!parsed.ok || splitCount === 0) return;
    const e: Expense = {
      id: initial?.id ?? newId(),
      amount: parsed.value,
      label: label.trim() || 'Expense',
      paidBy,
      split,
      stopId,
      date: initial?.date ?? todayISO(),
      createdBy: initial?.createdBy ?? me.uid,
      createdAt: initial?.createdAt ?? Date.now(),
      pending: !isOnline(),
    };
    write(t.trip.id, 'expenses', e.id, e, initial ? `edited ${e.label}, ${pesoExact(e.amount)}` : `logged ${e.label}, ${pesoExact(e.amount)}`);
    onClose();
  }

  const each = parsed.ok && splitCount > 0 ? Math.floor(parsed.value / splitCount) : 0;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      eyebrow={t.trip.name}
      title={initial ? 'Edit expense' : 'Add expense'}
      footer={
        <div>
          {todays.length > 0 && (
            <p className="mb-2 text-xs text-muted">
              Logged today:{' '}
              {todays
                .slice(-3)
                .map((e) => `${e.label} ${pesoExact(e.amount)} (${e.paidBy === mine?.id ? 'you' : e.paidBy === POOL ? 'pool' : t.people[e.paidBy]?.name ?? '?'})`)
                .join(' · ')}
            </p>
          )}
          <div className="flex gap-2">
            {initial && (
              <Button
                variant="danger"
                size="lg"
                onClick={() => {
                  write(t.trip.id, 'expenses', initial.id, null, `deleted ${initial.label}, ${pesoExact(initial.amount)}`);
                  onClose();
                }}
              >
                Delete
              </Button>
            )}
            <Button size="lg" className="flex-1" onClick={save} disabled={touched && !canSave}>
              {parsed.ok ? `Save ${peso(parsed.value)}` : 'Save'}
            </Button>
          </div>
        </div>
      }
    >
      <OfflineBanner />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="space-y-4"
      >
        <div>
          <label htmlFor="qa-amount" className="mb-1.5 block text-sm font-semibold">
            Amount (math works)
          </label>
          <div
            className={`flex min-h-15 items-center gap-2 rounded-[12px] border-2 px-4 ${
              touched && !parsed.ok ? 'border-uncertain' : 'border-primary'
            }`}
          >
            <input
              id="qa-amount"
              ref={amountRef}
              inputMode="decimal"
              autoComplete="off"
              placeholder="e.g. 50*5"
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="sign tnum min-w-0 flex-1 bg-transparent text-xl normal-case outline-none placeholder:text-base placeholder:font-sans placeholder:font-normal placeholder:text-muted"
              aria-invalid={touched && !parsed.ok}
              aria-describedby="qa-amount-msg"
            />
            {parsed.ok && /[+\-*/x×÷()]/.test(text.replace(/^-/, '')) && (
              <span className="sign tnum text-xl normal-case text-primary">= {pesoExact(parsed.value).replace(/\.00$/, '')}</span>
            )}
          </div>
          <p id="qa-amount-msg" className="mt-1 min-h-4 text-xs text-uncertain">
            {touched && !parsed.ok ? parsed.error : ''}
          </p>
        </div>

        <div>
          <label htmlFor="qa-label" className="mb-1.5 block text-sm font-semibold">
            What for
          </label>
          <Input id="qa-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Life vests" />
        </div>

        {stops.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted">At</span>
            <select
              aria-label="Stop"
              value={stopId ?? ''}
              onChange={(e) => setStopId(e.target.value || null)}
              className="min-h-9 rounded-full bg-primary-tint px-3 text-sm font-semibold text-primary"
            >
              <option value="">No stop</option>
              {stops.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.place}
                </option>
              ))}
            </select>
          </div>
        )}

        <fieldset>
          <legend className="mb-1.5 text-sm font-semibold">Paid by</legend>
          <div className="flex flex-wrap gap-2">
            {mine && (
              <Pill active={paidBy === mine.id} onClick={() => setPaidBy(mine.id)}>
                Me
              </Pill>
            )}
            <Pill active={paidBy === POOL} onClick={() => setPaidBy(POOL)}>
              Pool
            </Pill>
            {shownOthers.map((p) => (
              <Pill key={p.id} active={paidBy === p.id} onClick={() => setPaidBy(p.id)}>
                {p.name}
              </Pill>
            ))}
            {!showAllPayers && others.length > 2 && (
              <Pill active={others.slice(2).some((p) => p.id === paidBy)} onClick={() => setShowAllPayers(true)}>
                More
              </Pill>
            )}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-1.5 text-sm font-semibold">Split</legend>
          <div className="flex flex-wrap gap-2">
            <Pill active={splitMode === 'all'} onClick={() => setSplitMode('all')}>
              Everyone going ({going.length})
            </Pill>
            <Pill active={splitMode === 'some'} onClick={() => setSplitMode('some')}>
              Only some{splitMode === 'some' ? ` · ${splitCount} ${splitCount === 1 ? 'person' : 'people'}` : ''}
            </Pill>
          </div>
          {splitMode === 'some' && (
            <div className="mt-3 flex flex-wrap gap-2">
              {going.map((p) => {
                const on = some.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setSome(on ? some.filter((x) => x !== p.id) : [...some, p.id])}
                    className={`min-h-11 rounded-[10px] border px-3 text-sm font-semibold ${
                      on ? 'border-primary bg-primary-tint text-primary' : 'border-line text-muted line-through'
                    }`}
                  >
                    {p.name}
                  </button>
                );
              })}
            </div>
          )}
          {parsed.ok && splitCount > 0 && (
            <p className="mt-2 text-sm text-muted">
              {splitCount} {splitCount === 1 ? 'person' : 'people'}: about {pesoExact(each)} each.
            </p>
          )}
          {touched && splitCount === 0 && <p className="mt-2 text-xs text-uncertain">Pick at least one person.</p>}
        </fieldset>
        <button type="submit" hidden />
      </form>
    </Sheet>
  );
}
