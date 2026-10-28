import { useState, type FormEvent, type ReactNode } from 'react';

import { getSupabase } from '@/shared/backend';
import { APP_NAME } from '@/shared/config';
import { StarMark } from '@/shared/ui';

import {
  AuthFailure,
  confirmSignUp,
  requestPasswordReset,
  resendSignUpCode,
  resetPassword,
  signIn,
  signUp,
  type SignedInAccount,
} from '../data/authRepository';
import {
  AUTH_MESSAGES,
  CODE_LENGTH,
  isCompleteCode,
  isLongEnoughPassword,
  isPlausibleEmail,
  MIN_PASSWORD_LENGTH,
  normalizeCode,
} from '../domain/auth';

type Step = 'signIn' | 'signUp' | 'confirm' | 'forgot' | 'reset';

interface Props {
  onSignedIn: (account: SignedInAccount) => void;
}

/**
 * Everything before the app: sign in, create an account (invite-only),
 * confirm the email with a code, and reset a forgotten password with a code.
 *
 * Checks that need no server (email shape, password length, code length) run
 * before submitting, so the button explains itself instead of round-tripping.
 */
export const AuthScreens = ({ onSignedIn }: Props) => {
  const [step, setStep] = useState<Step>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const go = (next: Step) => {
    setStep(next);
    setError(null);
    setNotice(null);
    setCode('');
    if (next !== 'confirm') setPassword('');
  };

  const run = async (action: () => Promise<void>) => {
    const client = getSupabase();
    if (client === null) return;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      if (e instanceof AuthFailure) {
        setError(AUTH_MESSAGES[e.kind]);
        if (e.kind === 'emailNotConfirmed') {
          // Signing in before confirming: send a fresh code and ask for it.
          await resendSignUpCode(client, email).catch(() => undefined);
          setStep('confirm');
          setNotice(`We sent a new code to ${email.trim()}.`);
          setError(null);
        }
      } else {
        console.error('Account action failed', e);
        setError(AUTH_MESSAGES.unknown);
      }
    } finally {
      setBusy(false);
    }
  };

  const client = () => getSupabase()!;
  const emailOk = isPlausibleEmail(email);
  const passwordOk = isLongEnoughPassword(password);
  const codeOk = isCompleteCode(code);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    switch (step) {
      case 'signIn':
        if (emailOk && password.length > 0) {
          void run(async () => onSignedIn(await signIn(client(), email, password)));
        }
        return;
      case 'signUp':
        if (emailOk && passwordOk) {
          void run(async () => {
            await signUp(client(), email, password);
            setStep('confirm');
            setNotice(
              `We sent a ${CODE_LENGTH}-digit code to ${email.trim()}. If this email already has an account, sign in instead.`,
            );
          });
        }
        return;
      case 'confirm':
        if (codeOk) void run(async () => onSignedIn(await confirmSignUp(client(), email, code)));
        return;
      case 'forgot':
        if (emailOk) {
          void run(async () => {
            await requestPasswordReset(client(), email);
            setStep('reset');
            setNotice(
              `If ${email.trim()} has an account, a ${CODE_LENGTH}-digit code is on its way.`,
            );
          });
        }
        return;
      case 'reset':
        if (codeOk && passwordOk) {
          void run(async () => onSignedIn(await resetPassword(client(), email, code, password)));
        }
        return;
    }
  };

  const titles: Record<Step, string> = {
    signIn: 'Sign in',
    signUp: 'Create your account',
    confirm: 'Check your email',
    forgot: 'Reset your password',
    reset: 'Choose a new password',
  };

  const canSubmit =
    !busy &&
    (step === 'signIn'
      ? emailOk && password.length > 0
      : step === 'signUp'
        ? emailOk && passwordOk
        : step === 'confirm'
          ? codeOk
          : step === 'forgot'
            ? emailOk
            : codeOk && passwordOk);

  const submitLabel: Record<Step, string> = {
    signIn: 'Sign in',
    signUp: 'Create account',
    confirm: 'Confirm',
    forgot: 'Send code',
    reset: 'Save password',
  };

  return (
    <main className="relative z-10 flex min-h-dvh flex-col items-center justify-center px-6 py-10">
      <form
        onSubmit={submit}
        noValidate
        className="bg-night-800/80 border-night-600 rounded-soft flex w-full max-w-sm flex-col gap-4 border p-6 backdrop-blur"
      >
        <header className="flex flex-col items-center gap-2 pb-2">
          <StarMark size={28} />
          <p className="text-ink-secondary text-xs tracking-widest uppercase">{APP_NAME}</p>
          <h1 className="text-ink-primary text-lg">{titles[step]}</h1>
        </header>

        {notice !== null && (
          <p className="text-ink-secondary text-center text-sm" role="status">
            {notice}
          </p>
        )}

        {(step === 'signIn' || step === 'signUp' || step === 'forgot') && (
          <Field label="Email">
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={INPUT}
              autoFocus
            />
          </Field>
        )}

        {(step === 'confirm' || step === 'reset') && (
          <Field label={`${CODE_LENGTH}-digit code`}>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(normalizeCode(e.target.value))}
              className={`${INPUT} text-center text-lg tracking-[0.4em]`}
              autoFocus
            />
          </Field>
        )}

        {(step === 'signIn' || step === 'signUp' || step === 'reset') && (
          <Field
            label={step === 'reset' ? 'New password' : 'Password'}
            hint={
              step === 'signIn'
                ? undefined
                : password.length > 0 && !passwordOk
                  ? `At least ${MIN_PASSWORD_LENGTH} characters (${password.length} so far).`
                  : `At least ${MIN_PASSWORD_LENGTH} characters.`
            }
          >
            <input
              type="password"
              autoComplete={step === 'signIn' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={INPUT}
            />
          </Field>
        )}

        {error !== null && (
          <p className="text-faded text-sm" role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-pill bg-lavender-400 text-night-900 hover:bg-lavender-300 mt-1 py-2.5 text-sm transition-colors disabled:opacity-50"
        >
          {busy ? 'One moment…' : submitLabel[step]}
        </button>

        {/* Each link pads out to a 44×44 target; the negative margins (here and on a
            leading link) keep the block where it was, so only the space between
            links grows. */}
        <nav className="-mb-3.5 flex flex-col items-center pt-1 text-xs">
          {step === 'signIn' && (
            <>
              <Link onClick={() => go('signUp')}>New here? Create an account</Link>
              <Link onClick={() => go('forgot')}>Forgot your password?</Link>
            </>
          )}
          {step === 'signUp' && (
            <>
              <p className="text-ink-muted text-center">
                Accounts are by invitation: use the email address you were invited with.
              </p>
              <Link onClick={() => go('signIn')}>Already have an account? Sign in</Link>
            </>
          )}
          {step === 'confirm' && (
            <>
              <Link
                onClick={() =>
                  void run(async () => {
                    await resendSignUpCode(client(), email);
                    setNotice(`We sent a new code to ${email.trim()}.`);
                  })
                }
              >
                Send a new code
              </Link>
              <Link onClick={() => go('signIn')}>Back to sign in</Link>
            </>
          )}
          {(step === 'forgot' || step === 'reset') && (
            <Link onClick={() => go('signIn')}>Back to sign in</Link>
          )}
        </nav>
      </form>
    </main>
  );
};

const INPUT =
  'bg-night-900 border-night-600 text-ink-primary w-full rounded-soft border px-3 py-2 text-sm';

const Field = ({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string | undefined;
  children: ReactNode;
}) => (
  <label className="flex flex-col gap-1.5">
    <span className="text-ink-secondary text-xs">{label}</span>
    {children}
    {hint !== undefined && <span className="text-ink-muted text-xs">{hint}</span>}
  </label>
);

const Link = ({ onClick, children }: { onClick: () => void; children: ReactNode }) => (
  <button
    type="button"
    onClick={onClick}
    className="text-ink-muted hover:text-ink-primary min-w-11 px-2 py-3.5 transition-colors first:-mt-3.5"
  >
    {children}
  </button>
);
