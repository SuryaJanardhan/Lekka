import { Delete, Fingerprint, LockKeyhole, Wallet } from 'lucide-react';
import './lock-screen.css';

type LockScreenProps = {
  pin: string;
  mood: 'idle' | 'success' | 'error';
  toast: string;
  onDigit: (digit: string) => void;
  onDelete: () => void;
  onBiometric: () => void;
};

export function LockScreen({ pin, mood, toast, onDigit, onDelete, onBiometric }: LockScreenProps) {
  const busy = mood !== 'idle';
  return (
    <main className={`unlock-screen unlock-${mood}`}>
      <header className="unlock-brand">
        <Wallet size={22} aria-hidden="true" />
        <span>Lekka</span>
        <LockKeyhole size={16} aria-hidden="true" />
      </header>

      <section className="unlock-body" aria-labelledby="unlock-title">
        <div className="unlock-heading">
          <div className="unlock-expression" aria-hidden="true">
            {mood === 'success' ? '\u2728' : mood === 'error' ? '\ud83e\udee3' : '\ud83d\udd10'}
          </div>
          <h1 id="unlock-title">{mood === 'success' ? 'You\u2019re in.' : mood === 'error' ? 'Try again.' : 'Hey, welcome back.'}</h1>
          <p aria-live="polite">{mood === 'success' ? 'Opening your ledger' : mood === 'error' ? 'That PIN didn\u2019t match' : 'Your ledger, just for you.'}</p>
        </div>

        <div className="unlock-pin" role="status" aria-label={`${pin.length} of 4 PIN digits entered`}>
          {[0, 1, 2, 3].map((digit) => (
            <span key={digit} className={pin.length > digit ? 'is-filled' : ''} aria-hidden="true" />
          ))}
        </div>

        <div className="unlock-keypad" aria-label="PIN keypad">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button type="button" key={digit} disabled={busy} onClick={() => onDigit(digit)}>{digit}</button>
          ))}
          <button type="button" className="unlock-biometric" disabled={busy} onClick={onBiometric} aria-label="Unlock with biometrics" title="Unlock with biometrics"><Fingerprint size={26} /></button>
          <button type="button" disabled={busy} onClick={() => onDigit('0')}>0</button>
          <button type="button" disabled={busy || !pin.length} onClick={onDelete} aria-label="Delete last digit" title="Delete last digit"><Delete size={24} /></button>
        </div>
        <div className="unlock-message" role="status">{mood === 'idle' ? toast : ''}</div>
      </section>
      <footer className="unlock-footer"><LockKeyhole size={12} aria-hidden="true" /> Private expense ledger</footer>
    </main>
  );
}
