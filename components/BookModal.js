'use client';
import { useState } from 'react';
import { api, credits, ErrorBox, Modal } from './ui';
import { useApp } from './AppShell';
import { DURATIONS, priceFor, CREDITS_PER_HOUR } from '@/lib/constants';

function defaultSlot() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(16, 0, 0, 0);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T16:00`;
}

export default function BookModal({ listing, onClose, onBooked }) {
  const { me, refreshMe, toast } = useApp();
  const [when, setWhen] = useState(defaultSlot());
  const [duration, setDuration] = useState(60);
  const [location, setLocation] = useState('Library Study Room');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const price = priceFor(duration);

  async function book() {
    setBusy(true); setError(null);
    try {
      const r = await api('/api/sessions', {
        method: 'POST',
        body: { offering_user_id: listing.user_id, skill_id: listing.skill_id, scheduled_time: when, duration_minutes: duration, location },
      });
      toast(`Session #${r.session_id} requested — ${listing.full_name} has been notified.`);
      refreshMe();
      onBooked?.();
      onClose();
    } catch (err) { setError(err); setBusy(false); }
  }

  return (
    <Modal
      title={`Book ${listing.skill_name} with ${listing.full_name}`}
      subtitle={`${CREDITS_PER_HOUR} credits per hour. Credits move only when you mark the session completed.`}
      onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={book} disabled={busy}>{busy ? 'Booking…' : `Request session · ${price} credits`}</button>
      </>}
    >
      <div className="form-grid">
        <div className="field full">
          <label>Date & time</label>
          <input type="datetime-local" className="input" value={when} onChange={(e) => setWhen(e.target.value)} />
        </div>
        <div className="field">
          <label>Duration</label>
          <select className="select" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
            {DURATIONS.map((d) => <option key={d} value={d}>{d} minutes · {priceFor(d)} credits</option>)}
          </select>
        </div>
        <div className="field">
          <label>Location</label>
          <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} />
        </div>
      </div>
      {me && (
        <p className="small muted mt-16">
          You have <b>{credits(me.available_credits)}</b> credits free (balance {credits(me.credits_balance)} minus open bookings).
        </p>
      )}
      <div className="mt-16"><ErrorBox error={error} /></div>
    </Modal>
  );
}
