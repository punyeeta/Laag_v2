import { useEffect, useState } from 'react';
import { signInWithGoogle } from '../../data/firebase';
import { clearError, refreshUser, useStore } from '../../data/store';
import { Button } from '../../ui/Button';
import { Logo } from '../../ui/misc';

/** Shown while Firebase restores the session and the first trips load. */
export function LoadingScreen({ message = 'Getting your trips ready…', overlay }: { message?: string; overlay?: boolean }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex min-h-dvh flex-col items-center justify-center gap-5 bg-paper ${overlay ? 'fixed inset-0 z-[70]' : ''}`}
    >
      <div className="animate-pulse">
        <Logo size={96} />
      </div>
      <p className="text-sm text-muted">{message}</p>
    </div>
  );
}

export function SignInScreen() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  return (
    <div className="min-h-dvh bg-surface">
      <div className="flex justify-center bg-primary pt-10 pb-20">
        <Logo variant="white" size={96} />
      </div>
      <div className="mx-auto -mt-12 max-w-[440px] px-4">
        <div className="rounded-[20px] bg-paper p-6 shadow-sm sm:p-8">
          <h1 className="sign text-3xl">Plan the laag</h1>
          <p className="mt-2 text-muted">
            The itinerary, live cost splitting, checklists and notes for your group trips, in one place.
          </p>
          <Button
            size="lg"
            block
            className="mt-6"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setErr('');
              try {
                await signInWithGoogle();
                refreshUser();
              } catch (e) {
                const code = (e as { code?: string }).code;
                if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request')
                  setErr('Couldn’t sign in. Check your connection and try again.');
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? 'Signing in…' : 'Continue with Google'}
          </Button>
          {err && <p className="mt-3 text-sm text-uncertain">{err}</p>}
          <p className="mt-6 text-sm text-muted">Joining a friend’s trip? Open the invite link they sent you. No account needed.</p>
        </div>
      </div>
    </div>
  );
}

/** A write the server refused (for example, by the security rules). */
export function ErrorToast() {
  const error = useStore((s) => s.error);
  useEffect(() => {
    if (!error) return;
    const id = setTimeout(clearError, 6000);
    return () => clearTimeout(id);
  }, [error]);
  if (!error) return null;
  return (
    <div role="alert" className="fixed inset-x-4 top-4 z-[60] mx-auto max-w-[480px] rounded-[14px] bg-ink p-4 text-sm text-white shadow-lg">
      <div className="flex items-start gap-3">
        <p className="flex-1">{error}</p>
        <button type="button" onClick={clearError} className="font-semibold underline">
          OK
        </button>
      </div>
    </div>
  );
}
