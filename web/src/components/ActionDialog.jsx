import { useEffect, useState } from 'react';

export function ActionDialog({ open, title, description, confirmLabel = 'Confirm', variant = 'normal', requiresNote = false, noteLabel = 'Reason / reviewer note', loading, error, onCancel, onConfirm }) {
  const [note, setNote] = useState('');
  useEffect(() => { if (open) setNote(''); }, [open]);
  if (!open) return null;
  return <div className="dialog-backdrop" role="presentation"><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><h3 id="dialog-title">{title}</h3><p>{description}</p>{requiresNote && <label>{noteLabel}<textarea value={note} onChange={event => setNote(event.target.value)} maxLength="2000" placeholder="Optional reviewer note" /></label>}{error && <p className="form-error">{error}</p>}<div className="dialog-actions"><button className="button button--secondary" disabled={loading} onClick={onCancel}>Cancel</button><button className={`button ${variant === 'danger' ? 'button--danger' : variant === 'warning' ? 'button--secondary' : 'button--gold'}`} disabled={loading} onClick={() => onConfirm(note)}>{loading ? 'Working…' : confirmLabel}</button></div></section></div>;
}
