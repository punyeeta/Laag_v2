import { canUndo, undo } from '../../data/repo';
import { ago, agoBucket } from '../../lib/format';
import { Avatar } from '../../ui/Avatar';
import { IconUndo } from '../../ui/icons';
import { ScreenTitle } from '../../ui/misc';
import { actor, useTripCtx } from '../tripContext';

/** Every change, newest first. Members undo their own (US-18). */
export function ActivityLog() {
  const { t, me, people } = useTripCtx();
  const names = people.map((p) => p.name);
  const items = [...t.activity].sort((a, b) => b.at - a.at);
  let lastBucket = '';

  return (
    <div className="mx-auto max-w-[640px]">
      <ScreenTitle title="Activity" sub="Every change, newest first. You can undo your own." />
      {items.length === 0 && <p className="text-muted">No changes yet.</p>}
      <ul>
        {items.map((a) => {
          const who = actor(t, a.actorUid, me.uid);
          const bucket = agoBucket(a.at);
          const header = bucket !== lastBucket ? bucket : null;
          lastBucket = bucket;
          const undoable = canUndo(t, a, me.uid);
          return (
            <li key={a.id}>
              {header && <h2 className="mt-4 mb-1 text-sm font-semibold text-muted">{header}</h2>}
              <div className="flex items-start gap-3 border-b border-line py-3">
                <Avatar name={who.name === 'You' ? me.name : who.name} joinOrder={who.joinOrder} peers={names} />
                <div className="min-w-0 flex-1">
                  <p className={a.undoneAt ? 'text-muted line-through' : ''}>
                    {who.name} {a.summary}
                  </p>
                  <p className="text-xs text-muted">{ago(a.at)}</p>
                </div>
                {a.undoneAt ? (
                  <span className="rounded-full bg-surface px-3 py-1 text-xs font-semibold text-muted">Undone</span>
                ) : undoable ? (
                  <button
                    type="button"
                    onClick={() => undo(t.trip.id, a.id)}
                    className="flex min-h-11 items-center gap-1 px-1 font-semibold text-primary"
                  >
                    <IconUndo width={18} height={18} /> Undo
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
