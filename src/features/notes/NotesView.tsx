import { useEffect, useRef, useState } from 'react';
import { write } from '../../data/repo';
import type { Note } from '../../data/types';
import { ago } from '../../lib/format';
import { OfflineBanner, ScreenTitle } from '../../ui/misc';
import { actor, useTripCtx } from '../tripContext';

/** One notes page per trip. It saves as you type (US-17). */
export function NotesView() {
  const { t, me } = useTripCtx();
  const [text, setText] = useState(t.note.text);
  const [saving, setSaving] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const lastSaved = useRef(t.note.text);

  // Take in edits from others unless I'm mid-edit.
  useEffect(() => {
    if (!saving && t.note.text !== lastSaved.current) {
      setText(t.note.text);
      lastSaved.current = t.note.text;
    }
  }, [t.note.text, saving]);

  function onChange(v: string) {
    setText(v);
    setSaving(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const n: Note = { text: v, updatedAt: Date.now(), updatedBy: me.uid };
      lastSaved.current = v;
      write(t.trip.id, 'note', 'main', n, 'edited the notes');
      setSaving(false);
    }, 500);
  }

  const by = t.note.updatedBy ? actor(t, t.note.updatedBy, me.uid).name : null;

  return (
    <div className="mx-auto max-w-[720px]">
      <OfflineBanner />
      <ScreenTitle
        title="Notes"
        sub={saving ? 'Saving…' : by ? `Saved · ${by} edited ${ago(t.note.updatedAt)}` : 'Meeting point, what to bring, contacts.'}
      />
      <label htmlFor="trip-notes" className="sr-only">
        Trip notes
      </label>
      <textarea
        id="trip-notes"
        value={text}
        onChange={(e) => onChange(e.target.value)}
        placeholder={'Meeting point\nWhat to bring\nContacts'}
        className="min-h-[60dvh] w-full resize-y rounded-[14px] border border-line bg-paper p-4 text-base leading-relaxed focus:border-primary focus:outline-none"
      />
    </div>
  );
}
