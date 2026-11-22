import { useEffect, useState } from 'react';
import { newId, write } from '../../data/repo';
import type { Stop, TripData } from '../../data/types';
import { Button } from '../../ui/Button';
import { Field, Input } from '../../ui/Field';
import { Sheet } from '../../ui/Sheet';

export function StopEditor({ open, onClose, t, stop }: { open: boolean; onClose: () => void; t: TripData; stop?: Stop }) {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [place, setPlace] = useState('');
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDate(stop?.date ?? t.trip.startDate);
    setTime(stop?.time ?? '');
    setPlace(stop?.place ?? '');
    setNote(stop?.note ?? '');
    setTouched(false);
  }, [open, stop, t.trip.startDate]);

  const valid = place.trim() !== '' && date !== '';

  function save() {
    setTouched(true);
    if (!valid) return;
    const s: Stop = { id: stop?.id ?? newId(), date, time, place: place.trim(), note: note.trim() || undefined };
    write(t.trip.id, 'stops', s.id, s, stop ? `edited the stop ${s.place}` : `added the stop ${s.place}`);
    onClose();
  }

  function remove() {
    if (!stop) return;
    write(t.trip.id, 'stops', stop.id, null, `removed the stop ${stop.place}`);
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      eyebrow={t.trip.name}
      title={stop ? 'Edit stop' : 'Add stop'}
      footer={
        <div className="flex gap-2">
          {stop && (
            <Button variant="danger" onClick={remove}>
              Remove
            </Button>
          )}
          <Button size="lg" className="flex-1" onClick={save}>
            Save stop
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Place" error={touched && !place.trim() ? 'Name the place' : undefined}>
          <Input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="CEDAR, Impasug-ong" autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Day">
            <Input type="date" value={date} min={t.trip.startDate} max={t.trip.endDate} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Time">
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
        </div>
        <Field label="Note (optional)">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Overnight camping" />
        </Field>
        {stop && <p className="text-xs text-muted">Removing a stop keeps its costs; they move to the whole trip.</p>}
      </div>
    </Sheet>
  );
}
