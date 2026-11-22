import { useState } from 'react';
import { usePlan } from '../../data/hooks';
import { addPerson, approveMember, freeUpName, newInviteCode, removePerson, update, write } from '../../data/repo';
import type { Member, Person } from '../../data/types';
import { bringAmount } from '../../lib/calc';
import { ago } from '../../lib/format';
import { peso, pesoRange } from '../../lib/money';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { Field, Input } from '../../ui/Field';
import { IconLink, IconMore, IconPlus } from '../../ui/icons';
import { OfflineBanner, ScreenTitle } from '../../ui/misc';
import { Segmented } from '../../ui/Segmented';
import { Sheet } from '../../ui/Sheet';
import { dateRange } from '../../lib/format';
import { useTripCtx } from '../tripContext';
import { copyText, inviteUrl } from './invite';

const NEXT: Record<Person['status'], Person['status']> = { going: 'maybe', maybe: 'out', out: 'going' };
const LABEL: Record<Person['status'], string> = { going: 'Going', maybe: 'Maybe', out: 'Out' };

function StatusChip({ status, onClick, name }: { status: Person['status']; onClick: () => void; name: string }) {
  const tone =
    status === 'going'
      ? 'bg-primary-tint text-primary'
      : status === 'maybe'
        ? 'bg-uncertain-tint text-uncertain border border-uncertain'
        : 'bg-surface text-muted';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${name} is ${LABEL[status]}. Tap to change.`}
      className={`min-h-11 shrink-0 rounded-full px-3 text-sm font-semibold sm:min-w-[76px] ${tone}`}
    >
      {LABEL[status]}
    </button>
  );
}

export function PeopleList() {
  const { t, people, mine, isOrganizer, me } = useTripCtx();
  const plan = usePlan(t, false)!;
  const planMaybe = usePlan(t, true)!;
  const [adding, setAdding] = useState(false);
  const [menuFor, setMenuFor] = useState<Person | null>(null);
  const [copied, setCopied] = useState(false);

  const names = people.map((p) => p.name);
  const going = people.filter((p) => p.status === 'going').length;
  const maybe = people.filter((p) => p.status === 'maybe').length;
  const guests = people.filter((p) => !p.claimedBy).length;
  const requests = Object.values(t.members).filter((m) => !m.approved);

  const myShare = mine ? plan.perPerson[mine.id] : null;

  function setStatus(p: Person, s: Person['status']) {
    update<Person>(t.trip.id, 'people', p.id, { status: s }, `set ${p.claimedBy === me.uid ? 'yourself' : p.name} to ${LABEL[s]}`);
  }

  function approve(m: Member) {
    approveMember(t.trip.id, m.uid);
  }
  function decline(m: Member) {
    const p = m.personId ? t.people[m.personId] : undefined;
    write(t.trip.id, 'members', m.uid, null, `declined ${p?.name ?? 'a join request'}`);
  }

  return (
    <div className="mx-auto max-w-[640px]">
      <OfflineBanner />
      <ScreenTitle
        eyebrow={`${t.trip.name} · ${dateRange(t.trip.startDate, t.trip.endDate, { weekday: false, year: false })}`}
        title="People"
        sub={[`${going} going`, maybe ? `${maybe} maybe` : '', guests ? `${guests} guest${guests === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ')}
      />

      {/* US-12: what I should bring */}
      {mine && myShare && mine.status !== 'out' && (
        <div className="mb-4 rounded-[16px] bg-primary p-5 text-white">
          <div className="text-sm opacity-90">You should bring</div>
          <div className="sign tnum text-2xl normal-case">{peso(bringAmount(myShare.high))}</div>
          <div className="text-sm opacity-90">
            High end of {pesoRange(myShare.low, myShare.high)}, rounded up. Leftover comes back at settle up.
          </div>
        </div>
      )}

      {isOrganizer &&
        requests.map((m) => {
          const p = m.personId ? t.people[m.personId] : undefined;
          return (
            <div key={m.uid} className="mb-3 rounded-[16px] bg-primary-tint p-4">
              <div className="mb-3 flex items-center gap-3">
                {p && <Avatar name={p.name} joinOrder={p.joinOrder} peers={names} />}
                <div>
                  <div className="font-semibold text-primary">Someone wants to join as {p?.name ?? '?'}</div>
                  <div className="text-xs text-primary">{ago(m.joinedAt)} · approval is on</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={() => approve(m)}>Approve</Button>
                <Button variant="secondary" onClick={() => decline(m)}>
                  Decline
                </Button>
              </div>
            </div>
          );
        })}

      <div className="mb-3 flex items-center gap-3 rounded-[16px] border border-line p-3">
        <IconLink className="shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold">Invite link</div>
          <div className="truncate text-xs text-muted">{inviteUrl(t).replace(/^https?:\/\//, '')}</div>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={async () => {
            await copyText(inviteUrl(t));
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </Button>
        {isOrganizer && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => update(t.trip.id, 'trip', t.trip.id, { inviteCode: newInviteCode() }, 'reset the invite link')}
          >
            Reset
          </Button>
        )}
      </div>

      <ul className="divide-y divide-line">
        {people.map((p) => {
          const isMe = p.claimedBy === me.uid;
          const isOrg = isMe && isOrganizer;
          const share = p.status === 'maybe' ? planMaybe.perPerson[p.id] : plan.perPerson[p.id];
          const sub = [isOrg ? 'Organizer' : '', !p.claimedBy ? 'Guest · hasn’t opened the link' : '', p.note ?? '', p.status === 'maybe' ? 'not counted' : '']
            .filter(Boolean)
            .join(' · ');
          return (
            <li key={p.id} className="flex min-h-15 items-center gap-2 py-2 sm:gap-3">
              <Avatar name={p.name} joinOrder={p.joinOrder} peers={names} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">
                  {p.name}
                  {isMe ? ' (you)' : ''}
                </div>
                {sub && <div className="truncate text-xs text-muted">{sub}</div>}
              </div>
              <StatusChip status={p.status} name={p.name} onClick={() => setStatus(p, NEXT[p.status])} />
              <div
                className={`tnum w-[68px] shrink-0 text-right font-bold ${p.status === 'maybe' ? 'text-uncertain' : p.status === 'out' ? 'text-muted' : ''}`}
                title={p.status === 'maybe' ? 'What they’d bring if they join' : 'What to bring'}
              >
                {p.status === 'out' ? '—' : p.status === 'maybe' ? `(${peso(bringAmount(share.high))})` : peso(bringAmount(share.high))}
              </div>
              <button
                type="button"
                aria-label={`More for ${p.name}`}
                onClick={() => setMenuFor(p)}
                className="-mr-2 flex h-11 w-8 shrink-0 items-center justify-center rounded-[8px] text-muted hover:bg-surface"
              >
                <IconMore />
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-muted">Tap a status to change it. Everyone’s amount updates right away.</p>

      <Button variant="secondary" size="lg" block className="mt-4" onClick={() => setAdding(true)}>
        <IconPlus /> Add a person
      </Button>

      <AddPersonSheet open={adding} onClose={() => setAdding(false)} />
      <PersonMenu person={menuFor} onClose={() => setMenuFor(null)} />
    </div>
  );
}

function AddPersonSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, people } = useTripCtx();
  const [name, setName] = useState('');
  const [status, setStatus] = useState<Person['status']>('going');
  const [touched, setTouched] = useState(false);
  const taken = people.some((p) => p.name.trim().toLowerCase() === name.trim().toLowerCase());
  const error = !name.trim() ? 'Type a name' : taken ? 'Someone on this trip already has that name' : '';

  function save() {
    setTouched(true);
    if (error) return;
    addPerson(t.trip.id, name, status);
    setName('');
    setStatus('going');
    setTouched(false);
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Add a person"
      eyebrow={t.trip.name}
      footer={
        <Button size="lg" block onClick={save}>
          Add {name.trim() || 'person'}
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label="Name" error={touched ? error : undefined} hint="They count in every split like anyone else.">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Robert Pattinson" autoFocus onKeyDown={(e) => e.key === 'Enter' && save()} />
        </Field>
        <Segmented
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'going', label: 'Going' },
            { value: 'maybe', label: 'Maybe' },
            { value: 'out', label: 'Out' },
          ]}
        />
        <p className="text-sm text-muted">
          For friends who won’t open the link, like someone without a phone. Anyone can update their status, what they paid and their transfers.
          If they open the link later, they tap their name to claim it.
        </p>
      </div>
    </Sheet>
  );
}

function PersonMenu({ person, onClose }: { person: Person | null; onClose: () => void }) {
  const { t, isOrganizer, me } = useTripCtx();
  const [note, setNote] = useState('');
  const [confirm, setConfirm] = useState(false);
  const p = person;
  const lastId = p?.id;
  const [seen, setSeen] = useState<string | undefined>();
  if (p && seen !== lastId) {
    setSeen(lastId);
    setNote(p.note ?? '');
    setConfirm(false);
  }
  if (!p) return <Sheet open={false} onClose={onClose} title="" children={null} />;
  const isMe = p.claimedBy === me.uid;
  const canRemove = isOrganizer && !isMe;

  return (
    <Sheet
      open={!!person}
      onClose={onClose}
      title={p.name}
      eyebrow={t.trip.name}
      footer={
        <Button
          size="lg"
          block
          onClick={() => {
            if ((p.note ?? '') !== note.trim())
              update<Person>(t.trip.id, 'people', p.id, { note: note.trim() || undefined }, `changed the note on ${p.name}`);
            onClose();
          }}
        >
          Done
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label="Note" hint="Shown under their name, like “Covers the car”.">
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {isOrganizer && p.claimedBy && !isMe && (
          <div className="rounded-[12px] border border-line p-3">
            <p className="mb-2 text-sm text-muted">
              {p.name} joined from one browser. On a new phone they can’t tap their name until you free it up.
            </p>
            <Button
              variant="secondary"
              block
              onClick={() => {
                freeUpName(t.trip.id, p.id);
                onClose();
              }}
            >
              Free up this name
            </Button>
          </div>
        )}
        {canRemove && !confirm && (
          <Button variant="danger" block onClick={() => setConfirm(true)}>
            Remove {p.name}
          </Button>
        )}
        {canRemove && confirm && (
          <div className="rounded-[12px] bg-uncertain-tint p-4 text-uncertain-dark">
            <p className="mb-3 text-sm">
              {p.claimedBy
                ? `This removes ${p.name}, frees their name and undoes every change made from their phone.`
                : `This removes ${p.name} from every split.`}{' '}
              Use it if a stranger joined from a leaked link, then reset the link.
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setConfirm(false)}>
                Keep
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                onClick={() => {
                  removePerson(t.trip.id, p.id);
                  onClose();
                }}
              >
                Remove {p.name}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}
