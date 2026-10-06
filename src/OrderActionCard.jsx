import React, { useState } from 'react';
import { Package } from 'lucide-react';

export const payoutDate = value => new Date(value).toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
const spacedCode = code => code ? code.replace(/(\d{3})(\d{3})/, '$1 $2') : '';
const stationLine = station => station ? `${station.jurisdiction}${station.city ? ` — ${station.city}` : ''}` : '';

// The buyer's "check it before you accept it" step: a short checklist drawn from what the listing promised, an Accept button that
// stays disabled until every box is ticked, and a way to say something is wrong instead. Used at a pickup meetup (accepting
// reveals the handoff code) and during the inspection window after a delivery.
function InspectionChecklist({ item, acceptLabel, onAccept, onProblem }) {
  const hasSignature = item.media?.some(asset => asset.kind === 'signature') || !!item.signature_ai_label;
  const checks = [
    item.certificate_number ? { key: 'certificate_matches', label: `The certificate number on the item matches the listing${item.certificate_issuer ? ` (${item.certificate_issuer} ` : ' ('}#${item.certificate_number})` } : null,
    { key: 'matches_photos', label: 'The item matches the listing photos and description' },
    hasSignature ? { key: 'signature_ok', label: 'The signature looks like the one in the listing photos' } : null,
  ].filter(Boolean);
  const [ticked, setTicked] = useState({}), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [reporting, setReporting] = useState(false), [reason, setReason] = useState('');
  const allTicked = checks.every(check => ticked[check.key]);
  async function accept() {
    setBusy(true); setError('');
    try { await onAccept(Object.fromEntries(checks.map(check => [check.key, true]))); }
    catch (err) { setError(err.message); setBusy(false); }
  }
  async function report(event) {
    event.preventDefault(); if (busy || !reason.trim()) return;
    setBusy(true); setError('');
    try { await onProblem(reason); }
    catch (err) { setError(err.message); setBusy(false); }
  }
  return <div className="inspection-box">
    <h4>Check the item before you accept</h4>
    <p className="field-note">Compare it with the listing photos and the signature opinion. Once you accept, we record it. If anything is wrong, tell us now instead.</p>
    {!reporting ? <>
      <div className="form-stack">{checks.map(check => <label key={check.key} className="check-row"><input type="checkbox" checked={!!ticked[check.key]} onChange={event => setTicked({ ...ticked, [check.key]: event.target.checked })}/><span>{check.label}</span></label>)}</div>
      {error && <p role="alert" className="error">{error}</p>}
      <div className="submit-row">
        <button type="button" className={`primary${allTicked && !busy ? ' attention-glow' : ''}`} disabled={busy || !allTicked} onClick={accept}>{busy ? 'Saving…' : acceptLabel}</button>
        <button type="button" className="text-button" disabled={busy} onClick={() => setReporting(true)}>Something's off</button>
      </div>
    </> : <form className="form-stack" onSubmit={report}>
      <label>What is wrong?<textarea value={reason} onChange={event => setReason(event.target.value)} rows={3} maxLength={1800} required placeholder="For example: the certificate number doesn't match, or the signature looks different."/></label>
      {error && <p role="alert" className="error">{error}</p>}
      <div className="submit-row"><button className="primary" disabled={busy || !reason.trim()}>{busy ? 'Sending…' : 'Report a problem'}</button><button type="button" className="text-button" disabled={busy} onClick={() => setReporting(false)}>Back</button></div>
    </form>}
  </div>;
}

// The seller types in the code the buyer reads out once they have accepted the item.
function HandoffCodeForm({ saleId, attemptsLeft, service, onChanged }) {
  const [code, setCode] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError('');
    try {
      const result = await service.completePickup(saleId, code);
      if (result?.ok) { setCode(''); onChanged(); }
      else setError(`That code doesn't match. ${result?.attempts_left ?? attemptsLeft ?? 0} tries left.`);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <form className="form-stack" onSubmit={submit}>
    <label>Buyer's 6-digit handoff code<input inputMode="numeric" autoComplete="off" maxLength={7} value={code} onChange={event => setCode(event.target.value)} placeholder="123 456" required/></label>
    <button className="primary" disabled={busy || !code.trim()}>{busy ? 'Checking…' : 'Complete handoff'}</button>
    <small className="field-note">The buyer has inspected and accepted the item. Ask them for the code now.</small>
    {error && <p role="alert" className="error">{error}</p>}
  </form>;
}

// Pinned at the top of an order's conversation, because that is where buyer and seller already are when they meet. It shows each
// side only what they need next: the buyer's checklist and code, the seller's code box, and the payout date once it is known.
// role 'buyer': order is the entry from my_purchases. role 'seller': order is the entry from my_sales.
export function OrderActionCard({ role, order, payout, service, onChanged }) {
  if (!order) return null;
  const pickup = order.fulfillment_method === 'pickup';
  const purchaseId = role === 'buyer' ? order.purchase_id : order.id;
  const released = order.escrow_status === 'released' || payout?.escrow_status === 'released';
  const accepted = payout?.inspection_accepted_at;
  const open = payout?.has_open_dispute;
  const payoutLineBuyer = released || !payout ? null
    : open ? 'Your refund request is open, so the seller is not paid until it is resolved.'
    : payout.release_after ? `The seller is paid on ${payoutDate(payout.release_after)} unless you report a problem before then.` : null;
  const payoutLineSeller = released ? 'Payment released.'
    : open ? 'Payout paused while a refund request is open.'
    : payout?.under_review ? 'Your payout is being reviewed by our team.'
    : payout?.release_after ? `Payout available ${payoutDate(payout.release_after)}.` : null;

  if (!pickup) {
    const shipped = !!order.shipped_at;
    const delivered = !!payout?.delivered_at;
    const inspecting = role === 'buyer' && payout?.escrow_status === 'held' && delivered && !accepted && !open;
    if (role === 'seller' && !shipped) return <div className="evidence-box order-card"><h3><Package size={18}/>This order</h3><p className="field-note">Ship it from Your listings → Sold. Payment is held until delivery is confirmed.</p></div>;
    if (role === 'buyer' && !delivered && !accepted) return null;
    return <div className="evidence-box order-card"><h3><Package size={18}/>This order</h3>
      {role === 'buyer' && accepted && <p className="field-note">You inspected and accepted this item on {new Date(accepted).toLocaleDateString()}.</p>}
      {inspecting && <InspectionChecklist item={order} acceptLabel="Looks good — accept"
        onAccept={async checks => { await service.acceptDelivery(purchaseId, checks); onChanged(); }}
        onProblem={async reason => { await service.requestRefund(purchaseId, reason); onChanged(); }}/>}
      {role === 'seller' && <p className="field-note">{delivered ? 'Delivered.' : 'Shipped — waiting for delivery.'}{accepted ? ' The buyer inspected and accepted it.' : ''}</p>}
      {(role === 'buyer' ? payoutLineBuyer : payoutLineSeller) && <p className="field-note">{role === 'buyer' ? payoutLineBuyer : payoutLineSeller}</p>}
    </div>;
  }

  const handoffDone = payout?.handoff_verified_at;
  return <div className="evidence-box order-card"><h3><Package size={18}/>Pickup handoff</h3>
    <p className="field-note">Meet at {stationLine(order.pickup_station)}. Meet only at the safe-exchange spot.</p>
    {handoffDone ? <p className="field-note">Handoff completed {new Date(handoffDone).toLocaleDateString()}.{role === 'buyer' && accepted ? ` You accepted the item on ${new Date(accepted).toLocaleDateString()}.` : ''}</p>
      : role === 'buyer' ? (
          payout?.pickup_code ? <div className="handoff-code"><span>Your handoff code</span><strong>{spacedCode(payout.pickup_code)}</strong><small>Read this to the seller now. They enter it to complete the handoff and release payment.</small></div>
          : open ? <p className="field-note">You reported a problem, so no handoff code is available. Our team and the seller will follow up on your refund request.</p>
          : payout?.escrow_status === 'held' ? <InspectionChecklist item={order} acceptLabel="I've inspected it and I accept"
              onAccept={async checks => { await service.acceptPickupInspection(purchaseId, checks); onChanged(); }}
              onProblem={async reason => { await service.rejectPickupInspection(purchaseId, reason); onChanged(); }}/>
          : null)
      : (
          open ? <p className="field-note">The buyer reported a problem, so this handoff is paused.</p>
          : !accepted ? <p className="field-note">Waiting for the buyer to inspect the item. Once they accept, they will give you a code to enter here.</p>
          : released ? null
          : <HandoffCodeForm saleId={purchaseId} attemptsLeft={payout?.pickup_attempts_left} service={service} onChanged={onChanged}/>)}
    {(role === 'buyer' ? payoutLineBuyer : payoutLineSeller) && <p className="field-note">{role === 'buyer' ? payoutLineBuyer : payoutLineSeller}</p>}
    {role === 'buyer' && !handoffDone && !open && payout?.pickup_code == null && accepted && <p className="field-note">Waiting on the handoff to complete.</p>}
  </div>;
}
