import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { auth, signInWithGoogle, signOutUser } from '../../data/firebase';
import { useCars, useMe, useTrips } from '../../data/hooks';
import { deleteAccount, deleteCar, leaveTrip, organizedTrips, saveCar, saveProfile, updateCar } from '../../data/repo';
import { refreshUser, useStore } from '../../data/store';
import type { SavedCar, TripData } from '../../data/types';
import { dateRange } from '../../lib/format';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { Field, Input, Select } from '../../ui/Field';
import { IconCar, IconPlus, IconX } from '../../ui/icons';
import { Card, Logo } from '../../ui/misc';
import { Sheet } from '../../ui/Sheet';
import { ToggleRow } from '../../ui/Toggle';
import { NewTrip } from '../trips/NewTrip';

/** "First Last" → "First L." */
const shortName = (full: string) => {
  const parts = full.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : full;
};

/**
 * Settings about you across trips. Your name in a trip, Going/Maybe and
 * approval all belong to the trip, so they aren't here.
 */
export function ProfilePage() {
  const me = useMe();
  const peers = usePeerNames();
  const nav = useNavigate();
  const [newOpen, setNewOpen] = useState(false);
  return (
    <div className="min-h-dvh bg-surface">
      <header className="border-b border-line bg-paper">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between px-4 py-2.5 sm:px-6">
          <Link to="/" aria-label="All trips">
            <Logo size={48} />
          </Link>
          <div className="flex items-center gap-3">
            {!me.isAnonymous && <Button onClick={() => setNewOpen(true)}>New trip</Button>}
            <Avatar name={me.name} joinOrder={0} peers={peers} />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[760px] space-y-5 px-4 py-6 pb-16">
        <div>
          <Link to="/" className="text-sm font-semibold text-primary">
            Back to Home
          </Link>
          <span className="ml-2 text-sm text-muted">/</span>
          <h1 className="sign mt-2 text-3xl">Profile</h1>
        </div>
        {me.isAnonymous ? <GuestProfile /> : <GoogleProfile />}
      </main>
      <NewTrip open={newOpen} onClose={() => setNewOpen(false)} onCreated={(id) => nav(`/t/${id}`)} />
    </div>
  );
}

function Section({ title, hint, action, children }: { title?: string; hint?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <Card className="p-5 sm:p-6">
      {(title || action) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            {title && <h2 className="sign text-xl">{title}</h2>}
            {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Signed in with Google (organizers)

function GoogleProfile() {
  const me = useMe();
  const peers = usePeerNames();
  const profile = useStore((s) => s.profile);
  const nav = useNavigate();
  const fullName = auth.currentUser?.displayName ?? me.name;
  const [defaultName, setDefaultName] = useState(profile.defaultName ?? me.name);
  const defaults = profile.tripDefaults ?? { statusMode: 'manual' as const, requireApproval: false };

  return (
    <>
      <Section>
        <div className="flex flex-wrap items-center gap-4">
          {me.photoURL ? (
            <img src={me.photoURL} alt="" width={64} height={64} className="h-16 w-16 rounded-full" referrerPolicy="no-referrer" />
          ) : (
            <Avatar name={me.name} joinOrder={0} size={64} peers={peers} />
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-lg font-semibold">{shortName(fullName)}</div>
            <div className="truncate text-sm text-muted">
              {me.email} · Signed in with Google
            </div>
          </div>
          <Button variant="secondary" size="lg" onClick={() => signOutUser().then(() => nav('/'))}>
            Sign out
          </Button>
        </div>
      </Section>

      <Section title="Your name" hint="Filled in as “Your name in this trip” when you create one. You can still change it in each trip.">
        <Input
          className="sm:max-w-[360px]"
          value={defaultName}
          onChange={(e) => setDefaultName(e.target.value)}
          onBlur={() => {
            if (defaultName.trim() && defaultName.trim() !== (profile.defaultName ?? '')) saveProfile({ defaultName: defaultName.trim() });
          }}
          placeholder="Organizer"
          aria-label="Your name"
        />
      </Section>

      <SavedCars />

      <Section title="New trip defaults">
        <ToggleRow
          title="Start trips automatically"
          hint="Moves a trip to Ongoing on its start date"
          checked={defaults.statusMode === 'auto'}
          onChange={(v) => saveProfile({ tripDefaults: { ...defaults, statusMode: v ? 'auto' : 'manual' } })}
        />
        <ToggleRow
          title="Require approval to join"
          hint="Leave off for links you only send to friends"
          checked={defaults.requireApproval}
          onChange={(v) => saveProfile({ tripDefaults: { ...defaults, requireApproval: v } })}
        />
      </Section>

      <DeleteAccount />
    </>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function SavedCars() {
  const cars = useCars();
  const [editing, setEditing] = useState<{ car?: SavedCar } | null>(null);
  const list = Object.values(cars).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <Section
      title="Saved cars"
      hint="Gas costs copy these. Editing a car won’t change past trips."
      action={
        <Button onClick={() => setEditing({})} className="shrink-0">
          <IconPlus width={18} height={18} /> Add a car
        </Button>
      }
    >
      {list.length === 0 ? (
        <p className="border-t border-line pt-4 text-sm text-muted">No cars yet. Add one to estimate gas for your trips.</p>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {list.map((c) => (
            <li key={c.id} className="grid min-h-16 grid-cols-[36px_1fr_auto] items-center gap-3 py-2 sm:grid-cols-[36px_1.5fr_1fr_1fr_auto]">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-primary">
                <IconCar width={18} height={18} />
              </span>
              <span className="truncate font-semibold">
                {c.name}
                <span className="block text-xs font-normal text-muted sm:hidden">
                  {c.kmPerL} km/L · {cap(c.fuelType)}
                </span>
              </span>
              <span className="tnum hidden sm:block">{c.kmPerL} km/L</span>
              <span className="hidden text-muted sm:block">{cap(c.fuelType)}</span>
              <span className="flex items-center">
                <button type="button" onClick={() => setEditing({ car: c })} className="min-h-11 px-2 text-sm font-semibold text-primary">
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => deleteCar(c.id)}
                  aria-label={`Delete ${c.name}`}
                  className="flex h-11 w-9 items-center justify-center text-muted hover:text-uncertain"
                >
                  <IconX width={18} height={18} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <CarSheet open={!!editing} car={editing?.car} onClose={() => setEditing(null)} />
    </Section>
  );
}

function CarSheet({ open, car, onClose }: { open: boolean; car?: SavedCar; onClose: () => void }) {
  const [key, setKey] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [kmPerL, setKmPerL] = useState('');
  const [fuelType, setFuelType] = useState('gasoline');
  const k = open ? car?.id ?? 'new' : null;
  if (k !== key) {
    setKey(k);
    setName(car?.name ?? '');
    setKmPerL(car ? String(car.kmPerL) : '');
    setFuelType(car?.fuelType ?? 'gasoline');
  }
  const km = Number(kmPerL);
  const valid = name.trim() !== '' && km > 0;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={car ? 'Edit car' : 'Add a car'}
      footer={
        <Button
          size="lg"
          block
          disabled={!valid}
          onClick={() => {
            const data = { name: name.trim(), kmPerL: km, fuelType };
            if (car) updateCar({ ...car, ...data });
            else saveCar(data);
            onClose();
          }}
        >
          Save car
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label="Car name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Vios" />
        </Field>
        <Field label="km per liter" hint="From the car’s manual, or your own fill-up math.">
          <Input inputMode="decimal" value={kmPerL} onChange={(e) => setKmPerL(e.target.value)} placeholder="14" />
        </Field>
        <Field label="Fuel">
          <Select value={fuelType} onChange={(e) => setFuelType(e.target.value)}>
            <option value="gasoline">Gasoline</option>
            <option value="diesel">Diesel</option>
          </Select>
        </Field>
      </div>
    </Sheet>
  );
}

function DeleteAccount() {
  useTrips(); // re-render when trips change
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const organized = organizedTrips();

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-uncertain">Delete account</h2>
          <p className="mt-1 text-xs text-muted">
            Delete or hand over the trips you organize first. Trips you only joined keep your name as a guest.
          </p>
        </div>
        {!open && (
          <Button variant="danger" size="lg" onClick={() => setOpen(true)}>
            Delete account
          </Button>
        )}
      </div>

      {open && organized.length > 0 && (
        <div className="mt-4 rounded-[12px] bg-uncertain-tint p-4 text-sm text-uncertain-dark">
          <p>
            You organize {organized.length === 1 ? 'this trip' : 'these trips'}. Delete {organized.length === 1 ? 'it' : 'them'} in Trip settings
            first; handing a trip over comes later.
          </p>
          <ul className="mt-2 space-y-1">
            {organized.map((t) => (
              <li key={t.trip.id}>
                <Link to={`/t/${t.trip.id}/settings`} className="font-semibold underline">
                  {t.trip.name}
                </Link>
              </li>
            ))}
          </ul>
          <Button variant="secondary" className="mt-3" onClick={() => setOpen(false)}>
            OK
          </Button>
        </div>
      )}

      {open && organized.length === 0 && (
        <div className="mt-4 rounded-[12px] bg-uncertain-tint p-4 text-sm text-uncertain-dark">
          <p className="mb-3">Delete your Laag account? This can’t be undone. Google may ask you to sign in again first.</p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setErr('');
                try {
                  await deleteAccount();
                  nav('/');
                } catch {
                  setErr('Couldn’t delete the account. Check your connection and try again.');
                  setBusy(false);
                }
              }}
            >
              {busy ? 'Deleting…' : 'Delete my account'}
            </Button>
          </div>
          {err && <p className="mt-2">{err}</p>}
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Joined by link (anonymous)

function GuestProfile() {
  const trips = useTrips();
  const me = useMe();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const list = Object.values(trips).sort((a, b) => a.trip.startDate.localeCompare(b.trip.startDate));

  return (
    <>
      <Section title="This device">
        <p className="text-sm text-muted">You’re using Laag without an account. Your trips are saved on this browser.</p>
        <Button
          size="lg"
          block
          className="mt-4"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setErr('');
            try {
              await signInWithGoogle();
              refreshUser();
            } catch {
              setErr('Couldn’t sign in. Try again.');
            } finally {
              setBusy(false);
            }
          }}
        >
          Sign in with Google
        </Button>
        <p className="mt-2 text-center text-sm text-muted">Keep your trips if you switch phones or clear your browser.</p>
        {err && <p className="mt-2 text-sm text-uncertain">{err}</p>}
      </Section>

      <Section title="My trips on this device">
        {list.length === 0 && <p className="text-sm text-muted">None yet. Open an invite link to join a trip.</p>}
        <ul className="divide-y divide-line">
          {list.map((t) => (
            <GuestTripRow key={t.trip.id} t={t} uid={me.uid} />
          ))}
        </ul>
      </Section>
    </>
  );
}

function GuestTripRow({ t, uid }: { t: TripData; uid: string }) {
  const [confirm, setConfirm] = useState(false);
  const m = t.members[uid];
  const mine = Object.values(t.people).find((p) => p.claimedBy === uid);
  const waiting = m && !m.approved;
  const tapped = m?.personId ? t.people[m.personId]?.name : undefined;
  return (
    <li className="py-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <Link to={waiting ? `/join/${t.trip.id}?code=${t.trip.inviteCode}` : `/t/${t.trip.id}`} className="font-semibold hover:underline">
            {t.trip.name}
          </Link>
          <div className="text-xs text-muted">
            {dateRange(t.trip.startDate, t.trip.endDate, { weekday: false })} ·{' '}
            {mine ? `You’re ${mine.name}` : waiting ? `Waiting for approval${tapped ? ` as ${tapped}` : ''}` : 'No name picked yet'}
          </div>
        </div>
        {!confirm && (
          <Button variant="secondary" size="sm" onClick={() => setConfirm(true)}>
            Leave trip
          </Button>
        )}
      </div>
      {confirm && (
        <div className="mt-2 rounded-[12px] bg-uncertain-tint p-3 text-sm text-uncertain-dark">
          <p className="mb-2">
            Leave {t.trip.name}? {mine ? `${mine.name} stays in the splits as a guest. ` : ''}You can rejoin with the invite link.
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setConfirm(false)}>
              Stay
            </Button>
            <Button variant="danger" size="sm" onClick={() => leaveTrip(t.trip.id)}>
              Leave trip
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

/** Names from my trips, so my initials match what the trips show (Ro vs Rh). */
function usePeerNames() {
  const trips = useTrips();
  return Object.values(trips).flatMap((t) => Object.values(t.people).map((p) => p.name));
}
