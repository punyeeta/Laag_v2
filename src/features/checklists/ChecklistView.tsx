import { useState } from 'react';
import { newId, update, write } from '../../data/repo';
import type { ChecklistItem } from '../../data/types';
import { parseAmount } from '../../lib/calc';
import { pesoExact } from '../../lib/money';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { Field, Input, Select } from '../../ui/Field';
import { IconCheck, IconPlus } from '../../ui/icons';
import { OfflineBanner, ScreenTitle } from '../../ui/misc';
import { Segmented } from '../../ui/Segmented';
import { Sheet } from '../../ui/Sheet';
import { personName, useTripCtx } from '../tripContext';

type Group = ChecklistItem['group'];

export function ChecklistView() {
  const { t, people, me } = useTripCtx();
  const [group, setGroup] = useState<Group>('materials');
  const [editing, setEditing] = useState<{ item?: ChecklistItem } | null>(null);
  const names = people.map((p) => p.name);

  const all = Object.values(t.checklist).sort((a, b) => a.order - b.order);
  const count = (g: Group) => {
    const xs = all.filter((i) => i.group === g);
    return `${xs.filter((i) => i.done).length} of ${xs.length}`;
  };
  const done = all.filter((i) => i.done).length;
  const unassigned = all.filter((i) => !i.assignee).length;
  const items = all.filter((i) => i.group === group);

  function toggle(i: ChecklistItem) {
    update<ChecklistItem>(
      t.trip.id,
      'checklist',
      i.id,
      { done: !i.done, doneBy: !i.done ? me.uid : undefined },
      `${i.done ? 'unticked' : 'ticked'} ${i.label} on the ${i.group} list`,
    );
  }

  return (
    <div className="mx-auto max-w-[640px]">
      <OfflineBanner />
      <ScreenTitle
        title="Checklists"
        sub={`${done} of ${all.length} done${unassigned ? ` · ${unassigned} with no one assigned` : ''}`}
      />
      <div className="mb-3">
        <Segmented
          label="List"
          value={group}
          onChange={setGroup}
          options={[
            { value: 'food', label: `Food · ${count('food')}` },
            { value: 'materials', label: `Materials · ${count('materials')}` },
          ]}
        />
      </div>

      <ul className="divide-y divide-line border-b border-line">
        {items.map((i) => {
          const person = i.assignee && i.assignee !== 'byo' ? t.people[i.assignee] : undefined;
          const sub = [i.note, i.price ? `${pesoExact(i.price)}${i.whereToBuy ? ` at ${i.whereToBuy}` : ''}` : i.whereToBuy]
            .filter(Boolean)
            .join(' · ');
          return (
            <li key={i.id} className="flex min-h-16 items-center gap-3 py-2">
              <button
                type="button"
                role="checkbox"
                aria-checked={i.done}
                aria-label={i.label}
                onClick={() => toggle(i)}
                className="flex h-11 w-11 shrink-0 items-center justify-center"
              >
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-[6px] border-2 ${
                    i.done ? 'border-primary bg-primary text-white' : 'border-input-border'
                  }`}
                >
                  {i.done && <IconCheck width={16} height={16} strokeWidth={3} />}
                </span>
              </button>
              <button type="button" onClick={() => setEditing({ item: i })} className="min-w-0 flex-1 text-left">
                <span className={`block font-semibold ${i.done ? 'text-muted line-through' : ''}`}>{i.label}</span>
                {!i.assignee ? (
                  <span className="block text-xs font-semibold text-uncertain">No one assigned</span>
                ) : (
                  sub && <span className="block truncate text-xs text-muted">{sub}</span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setEditing({ item: i })}
                aria-label={`Assigned to ${personName(t, i.assignee, me.uid)}`}
                className="flex h-11 min-w-11 items-center justify-center"
              >
                {person ? (
                  <Avatar name={person.name} joinOrder={person.joinOrder} peers={names} />
                ) : i.assignee === 'byo' ? (
                  <span className="rounded-full bg-surface px-2.5 py-1 text-xs font-bold text-muted">BYO</span>
                ) : (
                  <span className="flex h-9 w-9 items-center justify-center rounded-full border border-dashed border-input-border text-primary">
                    <IconPlus width={18} height={18} />
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      <Button variant="secondary" size="lg" block className="mt-4" onClick={() => setEditing({})}>
        <IconPlus /> Add item
      </Button>

      <ItemEditor open={!!editing} item={editing?.item} group={group} onClose={() => setEditing(null)} />
    </div>
  );
}

function ItemEditor({ open, item, group, onClose }: { open: boolean; item?: ChecklistItem; group: Group; onClose: () => void }) {
  const { t, people } = useTripCtx();
  const [key, setKey] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [assignee, setAssignee] = useState('');
  const [price, setPrice] = useState('');
  const [where, setWhere] = useState('');
  const [note, setNote] = useState('');
  const [g, setG] = useState<Group>(group);
  const k = open ? item?.id ?? 'new' : null;
  if (k !== key) {
    setKey(k);
    setLabel(item?.label ?? '');
    setAssignee(item?.assignee ?? '');
    setPrice(item?.price ? String(item.price / 100) : '');
    setWhere(item?.whereToBuy ?? '');
    setNote(item?.note ?? '');
    setG(item?.group ?? group);
  }
  const p = price.trim() ? parseAmount(price) : null;
  const valid = label.trim() !== '' && (!p || p.ok);

  function save() {
    if (!valid) return;
    const orders = Object.values(t.checklist).map((i) => i.order);
    const next: ChecklistItem = {
      id: item?.id ?? newId(),
      group: g,
      label: label.trim(),
      assignee: assignee || null,
      price: p && p.ok ? p.value : undefined,
      whereToBuy: where.trim() || undefined,
      note: note.trim() || undefined,
      done: item?.done ?? false,
      doneBy: item?.doneBy,
      order: item?.order ?? Math.max(0, ...orders) + 1,
    };
    write(t.trip.id, 'checklist', next.id, next, item ? `edited ${next.label} on the ${g} list` : `added ${next.label} to the ${g} list`);
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={item ? 'Edit item' : 'Add item'}
      eyebrow={t.trip.name}
      footer={
        <div className="flex gap-2">
          {item && (
            <Button
              variant="danger"
              onClick={() => {
                write(t.trip.id, 'checklist', item.id, null, `removed ${item.label} from the ${item.group} list`);
                onClose();
              }}
            >
              Remove
            </Button>
          )}
          <Button size="lg" className="flex-1" onClick={save} disabled={!valid}>
            Save
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Segmented label="List" value={g} onChange={setG} options={[{ value: 'food', label: 'Food' }, { value: 'materials', label: 'Materials' }]} />
        <Field label="Item">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Tarpaulin" />
        </Field>
        <Field label="Who brings it">
          <Select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">No one yet</option>
            <option value="byo">Everyone brings their own (BYO)</option>
            {people
              .filter((x) => x.status !== 'out')
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Price (optional)" error={p && !p.ok ? p.error : undefined}>
            <Input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="180" />
          </Field>
          <Field label="Where to buy">
            <Input value={where} onChange={(e) => setWhere(e.target.value)} placeholder="Damilag" />
          </Field>
        </div>
        <Field label="Note">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="6 liters" />
        </Field>
      </div>
    </Sheet>
  );
}
