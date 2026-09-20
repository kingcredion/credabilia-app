import { Brand } from './Brand.jsx';
import { ListingDetailFields, ListingDetailSummary } from './ListingDetails.jsx';
import { listingMatches, DETAIL_FIELDS } from './listingDetails.js';
import { MediaPicker, PhotoGallery } from './ListingMedia.jsx';
import { certificateSuggestion } from './certificates.js';
import CredibilityDetails, { CredibilityMeter } from './CredibilityDetails.jsx';
import { TriviaPanel } from './Trivia.jsx';
import { ItemHistory } from './ItemHistory.jsx';
import CertificateDetails, { CertificateFields } from './CertificateDetails.jsx';
import React, { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, ArrowRight, Search, ShieldCheck, Plus, Store, Compass, ClipboardCheck, LogOut, X, Check, BookOpen, Sparkles, Layers, ArrowLeft, AlertCircle, Heart, Settings, RefreshCw, Package, Bell, MessageCircle } from 'lucide-react';
import { DEMO_ACCOUNTS } from './demo.js';
import { makeService } from './service.js';
import { Storefront } from './Storefront.jsx';
import { TermsPage, PrivacyPage } from './Legal.jsx';
import { ItemArt, money } from './ItemArt.jsx';
import { MessageThread } from './MessageThread.jsx';
import { SupportChat } from './SupportChat.jsx';
import { CATEGORIES, WORKSPACES, priceInCents } from './domain.js';

const service = makeService();
const LABELS = { authentic: 'Looks consistent', uncertain: 'Need more evidence', concerns: 'I see concerns' };

function Modal({ title, children, onClose }) {
  const dialog = useRef(null);
  useEffect(() => { const el = dialog.current; el.showModal(); return () => { if (el.open) el.close(); }; }, []);
  return <dialog ref={dialog} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === dialog.current) onClose(); }} aria-labelledby="modal-title">
    <header className="dialog-header"><h2 id="modal-title">{title}</h2><button className="icon-button" aria-label="Close" onClick={onClose}><X size={20}/></button></header>{children}
  </dialog>;
}

function NotificationBell({ notifications, onNavigate }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDocClick = event => { if (wrap.current && !wrap.current.contains(event.target)) setOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);
  return <div className="notif-wrap" ref={wrap}>
    <button className="icon-button" aria-label={`Notifications${notifications.length ? ` (${notifications.length} need attention)` : ''}`} title="Notifications" onClick={() => setOpen(o => !o)}>
      <Bell size={18}/>{notifications.length > 0 && <span className="notif-badge">{notifications.length}</span>}
    </button>
    {open && <div className="notif-panel" role="menu">
      {!notifications.length ? <p className="notif-empty field-note">Nothing needs your attention.</p>
        : notifications.map(n => <button key={`${n.purchase_id}-${n.kind}`} type="button" className="notif-row" role="menuitem" onClick={() => { onNavigate(n); setOpen(false); }}>
            {n.kind === 'message' ? <MessageCircle size={16}/> : <AlertCircle size={16}/>}<span>{n.message}</span>
          </button>)}
    </div>}
  </div>;
}

function CreateListing({ onClose, onCreated, relistFrom }) {
  const [listingCategory, setListingCategory] = useState(relistFrom?.category || CATEGORIES[0]);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [media,setMedia]=useState([]), [uploading,setUploading]=useState(false), [analyzing,setAnalyzing]=useState(false);
  const [certificate,setCertificate]=useState({}),[suggestion,setSuggestion]=useState(null),[confirmed,setConfirmed]=useState(false);
  const [notes,setNotes]=useState(''),[drafting,setDrafting]=useState(false),[draft,setDraft]=useState(null),[pendingDraft,setPendingDraft]=useState(null);
  const [copyingPhotos,setCopyingPhotos]=useState(false);
  const formRef=useRef(null);
  const working=busy||uploading||analyzing||drafting||copyingPhotos;
  const certificates=media.filter(asset=>asset.kind==='certificate');
  async function analyze() {
    setAnalyzing(true);setError('');setSuggestion(null);
    try {const result=await service.extractCertificate(certificates[0].path);setSuggestion(certificateSuggestion(result));}
    catch(err){setError(err.message);}finally{setAnalyzing(false);}
  }
  async function draftListing() {
    setDrafting(true);setError('');setDraft(null);
    try {const result=await service.draftListing({notes,photoPath:media.find(asset=>asset.kind==='item')?.path});setDraft(result);}
    catch(err){setError(err.message);}finally{setDrafting(false);}
  }
  function applyDraft() {
    const form=formRef.current;
    if(draft.title) form.elements.namedItem('title').value=draft.title;
    if(draft.description) form.elements.namedItem('description').value=draft.description;
    if(draft.category && CATEGORIES.includes(draft.category)) setListingCategory(draft.category);
    setPendingDraft({attributes:draft.attributes||{},tags:draft.tags||[]});
    setDraft(null);
  }
  useEffect(() => {
    if(!pendingDraft) return;
    const form=formRef.current;
    for(const [key,value] of Object.entries(pendingDraft.attributes)) { const field=form?.elements.namedItem('attribute:'+key); if(field) field.value=value; }
    const tagsField=form?.elements.namedItem('tags');
    if(tagsField && pendingDraft.tags.length) tagsField.value=pendingDraft.tags.join(', ');
    setPendingDraft(null);
  }, [pendingDraft]);
  useEffect(() => {
    if(!relistFrom) return;
    const form=formRef.current;
    if(relistFrom.title) form.elements.namedItem('title').value=relistFrom.title;
    if(relistFrom.description) form.elements.namedItem('description').value=relistFrom.description;
    if(relistFrom.evidence) form.elements.namedItem('evidence').value=relistFrom.evidence;
    if(relistFrom.certificate_issuer) setCertificate({certificate_issuer:relistFrom.certificate_issuer,certificate_number:relistFrom.certificate_number,certificate_company:relistFrom.certificate_company});
    setPendingDraft({attributes:relistFrom.attributes||{},tags:relistFrom.tags||[]});
    const photos=(relistFrom.media||[]).filter(asset=>asset.url);
    if(!photos.length) return;
    setCopyingPhotos(true);
    (async () => {
      try {
        const copied=[];
        for(const asset of photos) { const blob=await fetch(asset.url).then(r=>r.blob()); copied.push(await service.uploadImage(blob,asset.kind)); }
        setMedia(copied);
      } catch(err){ setError('Some photos could not be copied over. Add them manually if needed. '+err.message); }
      finally { setCopyingPhotos(false); }
    })();
  }, []);
  async function close() {
    if(working) return;
    setUploading(true);
    try {for(const asset of media) await service.removeImage(asset.path);onClose();}
    catch(err){setError('Could not discard all photos. '+err.message);setUploading(false);}
  }
  async function submit(event) {
    event.preventDefault(); if (working) return;
    setBusy(true); setError('');
    try {
      if(certificates.length && !certificate.certificate_issuer) throw new Error('Choose the issuer for your certificate photos.');
      if(certificate.certificate_issuer && !confirmed) throw new Error('Confirm the certificate details before publishing.');
      const form = Object.fromEntries(new FormData(event.currentTarget));
      const attributes = Object.fromEntries(Object.entries(form).filter(([key])=>key.startsWith('attribute:')).map(([key,value])=>[key.slice(10),value]));
      const id = await service.createListing({ ...form, attributes, ...certificate, media, price_cents: priceInCents(form.price) });
      // Best-effort: the listing is already published, so a failure here shouldn't block the seller — but it should be visible for debugging.
      if (relistFrom?.purchase_id) service.markListingRelisted(id, relistFrom.purchase_id).catch(err => console.warn('Could not record relist provenance:', err.message));
      onCreated(id);
    } catch (err) { setError(err.message); setBusy(false); }
  }
  return <Modal title={relistFrom ? 'Relist this item' : 'Create a listing'} onClose={close}>
    <p className="muted">{relistFrom ? 'Details, tags and certificate info carried over from your purchase. Review everything and set your own price.' : 'A good listing starts with a clear description and honest evidence.'}</p>
    {copyingPhotos && <p role="status" className="field-note">Copying photos to your own listing…</p>}
    <form ref={formRef} onSubmit={submit} className="form-stack">
      <label>Item title<input name="title" placeholder="What are you sharing?" minLength={4} maxLength={120} required autoFocus/></label>
      <div className="form-row"><label>Category<select name="category" value={listingCategory} onChange={event=>setListingCategory(event.target.value)}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></label><label>Price (USD)<input name="price" type="number" min="1" max="1000000" step="0.01" placeholder="125.00" required/></label></div>
      <label>Description<textarea name="description" minLength={20} maxLength={4000} rows={3} placeholder="Condition, history, and the details a collector should know…" required/></label>
      {service.detailsEnabled && <ListingDetailFields key={listingCategory} category={listingCategory}/>}
      <p className="field-note">Package weight and size, once packed — this lets buyers see a real shipping cost at checkout instead of guessing.</p>
      <div className="form-row">
        <label>Weight (oz)<input name="weight_oz" type="number" min="1" step="0.1" required/></label>
        <label>Length (in)<input name="length_in" type="number" min="1" step="0.1" required/></label>
      </div>
      <div className="form-row">
        <label>Width (in)<input name="width_in" type="number" min="1" step="0.1" required/></label>
        <label>Height (in)<input name="height_in" type="number" min="1" step="0.1" required/></label>
      </div>
      <label className="certificate-confirm"><input type="checkbox" name="free_shipping"/>Offer free shipping (you cover the cost)</label>
      <label>Evidence notes <span className="optional">optional</span><textarea name="evidence" rows={2} maxLength={2000} placeholder="Provenance, certificate details, or what is still unknown…"/></label>
      <MediaPicker service={service} media={media} onChange={next=>{setMedia(next);setSuggestion(null);setConfirmed(false);}} busy={working} onBusy={setUploading} onError={setError}/>
      <label>Notes for an AI draft <span className="optional">optional</span><textarea value={notes} onChange={event=>setNotes(event.target.value)} rows={3} maxLength={2000} placeholder="What is it, who made it, when, condition, anything you know…" disabled={working}/></label>
      <button type="button" className="text-button" onClick={draftListing} disabled={working || !notes.trim()}>{drafting ? 'Drafting…' : 'Draft with AI'}</button>
      <p className="field-note">Sends your notes{media.some(asset=>asset.kind==='item') ? ' and your first item photo' : ''} to our AI provider to suggest a title, description, category, item details and tags. Review everything below before publishing — nothing is filled in automatically.</p>
      {draft && <div className="evidence-box"><h3>Suggested draft</h3>
        {draft.title && <p><strong>Title:</strong> {draft.title}</p>}
        {draft.category && <p><strong>Category:</strong> {draft.category}</p>}
        {draft.description && <p><strong>Description:</strong> {draft.description}</p>}
        {!!Object.keys(draft.attributes || {}).length && <p><strong>Details:</strong> {Object.entries(draft.attributes).map(([key,value]) => `${DETAIL_FIELDS[key] || key}: ${value}`).join(' · ')}</p>}
        {!!draft.tags?.length && <p><strong>Tags:</strong> {draft.tags.join(', ')}</p>}
        {!draft.title && !draft.description && !draft.category && !Object.keys(draft.attributes || {}).length && !draft.tags?.length && <p>No usable details were returned. Try adding more notes.</p>}
        <button type="button" className="text-button" onClick={applyDraft}>Use this draft</button>
        <button type="button" className="text-button" onClick={()=>setDraft(null)}>Dismiss draft</button>
      </div>}
      {certificates.length>0 && <><button type="button" className="text-button" onClick={analyze} disabled={working}>{analyzing?'Reading certificate…':'Read certificate with AI'}</button><p className="field-note">Sends the first certificate photo to our AI provider to suggest the company and number. Review the suggestions before publishing.</p></>}
      {suggestion && <div className="evidence-box"><h3>Suggested certificate details</h3><p>Issuer: {suggestion.certificate_issuer} · Number: {suggestion.certificate_number || 'Not readable'}</p><button type="button" className="text-button" onClick={()=>{setCertificate(suggestion);setConfirmed(false);setSuggestion(null);}}>Use these details and review</button><button type="button" className="text-button" onClick={()=>setSuggestion(null)}>Dismiss suggestion</button></div>}
      <CertificateFields value={certificate} onChange={value=>{setCertificate(value);setConfirmed(false);}} disabled={working}/>
      {certificate.certificate_issuer && <label className="certificate-confirm"><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)} required disabled={working}/>I checked the company and number against my certificate.</label>}
      {error && <p role="alert" className="error">{error}</p>}
      <button className="primary" disabled={working}>{busy ? 'Publishing…' : relistFrom ? 'Publish relisted item' : 'Publish listing'}<ArrowRight size={17}/></button>
    </form>
  </Modal>;
}

function EditListing({item:currentItem,onClose,onSaved}) {
  const item=useRef(currentItem).current;
  const [saving,setSaving]=useState(false),[error,setError]=useState(''),[uploading,setUploading]=useState(false);
  const [media,setMedia]=useState(item.media||[]),[mediaTouched,setMediaTouched]=useState(false);
  const [certificate,setCertificate]=useState({certificate_issuer:item.certificate_issuer||'',certificate_number:item.certificate_number||'',certificate_company:item.certificate_company||''});
  const [confirmed,setConfirmed]=useState(true);
  const reviewed=item.audit_count>0;
  const working=saving||uploading;
  const certificateChanged=certificate.certificate_issuer!==(item.certificate_issuer||'')||certificate.certificate_number!==(item.certificate_number||'')||certificate.certificate_company!==(item.certificate_company||'');
  async function submit(event) {
    event.preventDefault();if(working)return;
    const form=Object.fromEntries(new FormData(event.currentTarget));
    setSaving(true);setError('');
    try{
      if(certificate.certificate_issuer && certificateChanged && !confirmed) throw new Error('Confirm the certificate details before saving.');
      await service.editListing(item,{...form,...certificate,media,price_cents:priceInCents(form.price)},mediaTouched);
      onSaved();
    }
    catch(err){setError(err.message);setSaving(false);}
  }
  return <Modal title="Edit listing" onClose={()=>{if(!working)onClose();}}>
    <p className="muted">Update any detail — title, category, price, description, evidence, certificate or photos.</p>
    {reviewed && <p className="field-note">This listing has been audited. Changing anything other than price will archive the current reviews in the item's history and reset the score to neutral — nothing is deleted.</p>}
    <form className="form-stack" onSubmit={submit}>
      <label>Item title<input name="title" defaultValue={item.title} required minLength={4} maxLength={120}/></label>
      <label>Category<select name="category" defaultValue={item.category}>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></label>
      <label>Price (USD)<input name="price" type="number" min="1" max="1000000" step="0.01" defaultValue={(item.price_cents/100).toFixed(2)} required/></label>
      <label>Description<textarea name="description" defaultValue={item.description} required minLength={20} maxLength={4000}/></label>
      <label>Evidence notes<textarea name="evidence" defaultValue={item.evidence} maxLength={2000}/></label>
      <MediaPicker service={service} media={media} onChange={next=>{setMedia(next);setMediaTouched(true);}} busy={working} onBusy={setUploading} onError={setError}/>
      <CertificateFields value={certificate} onChange={value=>{setCertificate(value);setConfirmed(false);}} disabled={working}/>
      {certificate.certificate_issuer && certificateChanged && <label className="certificate-confirm"><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)} required disabled={working}/>I checked the company and number against my certificate.</label>}
      {error&&<p role="alert" className="error">{error}</p>}
      <button className="primary" disabled={working}>{saving?'Saving…':'Save changes'}</button>
    </form>
  </Modal>;
}

function DashboardStats() {
  const [stats, setStats] = useState(undefined), [error, setError] = useState('');
  const [credit, setCredit] = useState(null);
  const [openDisputes, setOpenDisputes] = useState(null);
  useEffect(() => { service.myDashboardStats().then(setStats).catch(err => setError(err.message)); service.myCreditBalance().then(setCredit).catch(() => {}); service.operatorOpenDisputeCount().then(setOpenDisputes).catch(() => {}); }, []);
  if (error) return <p role="alert" className="error">{error}</p>;
  if (!stats) return <p role="status">Loading your stats…</p>;
  const rows = [
    ['Items sold', stats.items_sold], ['Revenue earned', money(stats.revenue_cents)],
    ['Items bought', stats.items_bought], ['Items relisted', stats.items_relisted],
    ['Audits given', stats.audits_given], ['Audits received', stats.audits_received],
    ['Platform credit', money(credit || 0)],
  ];
  // Only ever non-null for the platform operator's own account -- operator_open_dispute_count()
  // self-gates server-side, so this tile is real access control, not just hidden in the UI.
  if (openDisputes !== null) rows.push(['Open disputes', openDisputes]);
  return <div className="stat-grid">{rows.map(([label, value]) => <div key={label} className="evidence-box"><span className="field-note">{label}</span><strong>{value}</strong></div>)}</div>;
}

function StorefrontSettings({ profile }) {
  const [slug, setSlug] = useState(profile?.slug || '');
  // Tracked locally (not just re-read from `profile`) so saving shows the new link immediately
  // without closing the surrounding modal — the parent's onSaved is for the display-name form only.
  const [savedSlug, setSavedSlug] = useState(profile?.slug || '');
  const [saving, setSaving] = useState(false), [error, setError] = useState(''), [copied, setCopied] = useState(false);
  async function submit(event) {
    event.preventDefault(); if (saving) return;
    setSaving(true); setError('');
    try { await service.updateStoreSlug(slug); setSavedSlug(slug.trim().toLowerCase()); }
    catch (err) { setError(err.message); } finally { setSaving(false); }
  }
  async function copyLink() {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch (err) { setError('Could not copy automatically. Copy the link above manually.'); }
  }
  const link = savedSlug ? `${window.location.origin}/${savedSlug}` : '';
  return <div className="evidence-box"><h3>Your storefront</h3>
    <p className="field-note">A public page anyone can visit and share — no sign-in required.</p>
    {link && <p><a href={link} target="_blank" rel="noreferrer">{link}</a> <button type="button" className="text-button" onClick={copyLink}>{copied ? 'Copied!' : 'Copy link'}</button></p>}
    <form className="form-row" onSubmit={submit}>
      <label>{profile?.slug ? 'Change store name' : 'Choose a store name'}<input value={slug} onChange={event=>setSlug(event.target.value)} minLength={3} maxLength={30} placeholder="mystore" required/></label>
      <button className="primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
    </form>
    {error && <p role="alert" className="error">{error}</p>}
  </div>;
}

function ShippingAddressFields({ value, onChange, disabled }) {
  const set = key => event => onChange({ ...value, [key]: event.target.value });
  return <>
    <label>Full name<input value={value.name || ''} onChange={set('name')} maxLength={100} required disabled={disabled}/></label>
    <div className="form-row">
      <label>Street address<input value={value.street1 || ''} onChange={set('street1')} maxLength={200} required disabled={disabled}/></label>
      <label>Apt/suite <span className="optional">optional</span><input value={value.street2 || ''} onChange={set('street2')} maxLength={200} disabled={disabled}/></label>
    </div>
    <div className="form-row">
      <label>City<input value={value.city || ''} onChange={set('city')} maxLength={100} required disabled={disabled}/></label>
      <label>State<input value={value.state || ''} onChange={set('state')} maxLength={100} required disabled={disabled}/></label>
      <label>ZIP<input value={value.zip || ''} onChange={set('zip')} maxLength={20} required disabled={disabled}/></label>
    </div>
    <div className="form-row">
      <label>Country<input value={value.country || ''} onChange={set('country')} maxLength={2} placeholder="US" required disabled={disabled}/></label>
      <label>Phone <span className="optional">optional</span><input value={value.phone || ''} onChange={set('phone')} maxLength={30} disabled={disabled}/></label>
    </div>
  </>;
}

function ShippingSettings({ profile }) {
  const [address, setAddress] = useState(profile?.shipping_address || {});
  const [saving, setSaving] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(false);
  async function submit(event) {
    event.preventDefault(); if (saving) return;
    setSaving(true); setError(''); setSaved(false);
    try { await service.saveShippingAddress(address); setSaved(true); }
    catch (err) { setError(err.message); } finally { setSaving(false); }
  }
  return <div className="evidence-box"><h3>Shipping address</h3>
    <p className="field-note">Used as your return address when you sell, and to pre-fill checkout when you buy. You can still edit it for any specific order.</p>
    <form className="form-stack" onSubmit={submit}>
      <ShippingAddressFields value={address} onChange={value => { setAddress(value); setSaved(false); }} disabled={saving}/>
      {error && <p role="alert" className="error">{error}</p>}
      <button className="primary" disabled={saving}>{saving ? 'Saving…' : saved ? 'Saved' : 'Save address'}</button>
    </form>
  </div>;
}

function CheckoutAddress({ item, profile, busy, onClose, onConfirm }) {
  const [address, setAddress] = useState(profile?.shipping_address || {});
  const [error, setError] = useState('');
  const [balance, setBalance] = useState(null);
  const [applyCredit, setApplyCredit] = useState(false);
  const [wantInsurance, setWantInsurance] = useState(true);
  useEffect(() => { service.myCreditBalance().then(setBalance).catch(() => {}); }, []);
  // Mirrors platform_fee_cents() -- the server re-validates and clamps this regardless, this is
  // just so the buyer sees an accurate number before submitting, not a real cap enforcement.
  const feeCap = Math.round(item.price_cents * 0.136) + (item.price_cents <= 1000 ? 30 : 40);
  const creditToApply = applyCredit && balance ? Math.min(balance, feeCap) : 0;
  function submit(event) {
    event.preventDefault();
    const required = ['name', 'street1', 'city', 'state', 'zip', 'country'];
    if (required.some(key => !address[key]?.trim())) { setError('Fill in all required address fields.'); return; }
    onConfirm(address, creditToApply, wantInsurance);
  }
  return <Modal title="Confirm shipping address" onClose={onClose}>
    <p className="muted">Where should "{item.title}" be shipped? This is for this order only — your saved default lives in Profile settings.</p>
    <form className="form-stack" onSubmit={submit}>
      <ShippingAddressFields value={address} onChange={setAddress} disabled={busy}/>
      {!!balance && <label className="certificate-confirm"><input type="checkbox" checked={applyCredit} onChange={event => setApplyCredit(event.target.checked)} disabled={busy}/>Apply {money(Math.min(balance, feeCap))} credit to this order (you have {money(balance)} available)</label>}
      <label className="certificate-confirm"><input type="checkbox" checked={wantInsurance} onChange={event => setWantInsurance(event.target.checked)} disabled={busy}/>Insure this item for shipping (covers loss or damage in transit — exact cost shown at payment)</label>
      {error && <p role="alert" className="error">{error}</p>}
      <button className="primary" disabled={busy}>{busy ? 'Processing…' : 'Continue to payment'}<ArrowRight size={16}/></button>
    </form>
  </Modal>;
}

function SellerRefundPanel({ sale, onResolved }) {
  const [choice, setChoice] = useState('full');
  const [contesting, setContesting] = useState(false);
  const [amount, setAmount] = useState('');
  const [response, setResponse] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!sale.refund_status) return null;
  if (sale.refund_status !== 'pending') {
    const labels = {
      contested: 'Refund request contested — awaiting review',
      partial_offered: `You offered a ${money(sale.offered_amount_cents)} refund — awaiting the buyer's response`,
      return_required: sale.return_shipped_at ? 'Return shipped — refund fires automatically once it arrives' : 'Awaiting the buyer to ship the item back',
      accepted: 'Refund accepted — processing…',
      refunded: sale.offered_amount_cents ? `Partially refunded — ${money(sale.offered_amount_cents)} returned to the buyer` : 'Refunded',
      denied: 'Refund request denied',
    };
    return <p className="field-note">{labels[sale.refund_status] || sale.refund_status}</p>;
  }
  async function confirm(event) {
    event.preventDefault(); if (busy) return;
    setError('');
    if (choice === 'partial') {
      const cents = Math.round(parseFloat(amount) * 100);
      if (!Number.isFinite(cents) || cents <= 0 || cents >= sale.price_cents) { setError('Enter an amount less than the item price.'); return; }
      setBusy(true);
      try { await service.offerPartialRefund(sale.refund_request_id, cents); onResolved(); }
      catch (err) { setError(err.message); setBusy(false); }
      return;
    }
    setBusy(true);
    try {
      if (choice === 'return') await service.requireReturn(sale.refund_request_id);
      else await service.acceptRefundRequest(sale.refund_request_id);
      onResolved();
    } catch (err) { setError(err.message); setBusy(false); }
  }
  async function contest(event) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError('');
    try { await service.contestRefundRequest(sale.refund_request_id, response); onResolved(); }
    catch (err) { setError(err.message); setBusy(false); }
  }
  return <div className="evidence-box">
    <h3><AlertCircle size={18}/>Refund requested</h3>
    <p>{sale.refund_reason}</p>
    {!contesting ? <form className="form-stack" onSubmit={confirm}>
        <fieldset><legend>How do you want to resolve this?</legend>
          <label><input type="radio" name={`refund-choice-${sale.id}`} checked={choice === 'full'} onChange={() => setChoice('full')} disabled={busy}/>Refund in full</label>
          <label><input type="radio" name={`refund-choice-${sale.id}`} checked={choice === 'partial'} onChange={() => setChoice('partial')} disabled={busy}/>Offer a partial refund</label>
          <label><input type="radio" name={`refund-choice-${sale.id}`} checked={choice === 'return'} onChange={() => setChoice('return')} disabled={busy}/>Require the item back first</label>
        </fieldset>
        {choice === 'partial' && <label>Refund amount (item is {money(sale.price_cents)})<input type="number" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} disabled={busy} required/></label>}
        <div className="form-row">
          <button className="primary" disabled={busy}>{busy ? 'Processing…' : 'Confirm'}</button>
          <button type="button" className="text-button" disabled={busy} onClick={() => setContesting(true)}>Contest</button>
        </div>
      </form>
      : <form className="form-stack" onSubmit={contest}>
          <label>Explain why you're contesting this<textarea value={response} onChange={e => setResponse(e.target.value)} rows={2} maxLength={2000} disabled={busy}/></label>
          <button className="primary" disabled={busy}>{busy ? 'Sending…' : 'Submit'}</button>
          <button type="button" className="text-button" onClick={() => setContesting(false)}>Cancel</button>
        </form>}
    {error && <p role="alert" className="error">{error}</p>}
  </div>;
}

function BuyerRefundPanel({ item, onRequested }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [gettingLabel, setGettingLabel] = useState(false);
  const [rates, setRates] = useState(null);
  async function submit(event) {
    event.preventDefault(); if (busy || !reason.trim()) return;
    setBusy(true); setError('');
    try { await service.requestRefund(item.purchase_id, reason); onRequested(); }
    catch (err) { setError(err.message); setBusy(false); }
  }
  async function respondToOffer(accept) {
    setBusy(true); setError('');
    try { await service.respondToPartialOffer(item.refund_request_id, accept); onRequested(); }
    catch (err) { setError(err.message); setBusy(false); }
  }
  async function startLabel() {
    setGettingLabel(true); setBusy(true); setError(''); setRates(null);
    try { setRates(await service.getReturnLabelRates(item.refund_request_id)); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  async function buyLabel(rateId) {
    setBusy(true); setError('');
    try { await service.buyReturnLabel(item.refund_request_id, rateId); onRequested(); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  if (item.refund_status === 'partial_offered') return <div className="evidence-box">
    <h3><AlertCircle size={18}/>Partial refund offered</h3>
    <p>The seller offered a {money(item.offered_amount_cents)} refund{item.refund_seller_response ? `: "${item.refund_seller_response}"` : '.'}</p>
    <div className="form-row">
      <button type="button" className="primary" disabled={busy} onClick={() => respondToOffer(true)}>{busy ? 'Processing…' : 'Accept'}</button>
      <button type="button" className="text-button" disabled={busy} onClick={() => respondToOffer(false)}>Decline</button>
    </div>
    {error && <p role="alert" className="error">{error}</p>}
  </div>;
  if (item.refund_status === 'return_required') return <div className="evidence-box">
    <h3><Package size={18}/>Return required</h3>
    {item.return_shipped_at
      ? <p className="field-note">Return shipped{item.return_tracking_number ? <> · <a href={item.return_tracking_url} target="_blank" rel="noreferrer">Track {item.return_tracking_number}</a></> : ''}{item.return_label_url && <> · <a href={item.return_label_url} target="_blank" rel="noreferrer">Print label</a></>}. Your refund is issued automatically once it arrives.</p>
      : <>
        <p>{item.refund_seller_response || 'Ship the item back to get your refund — a prepaid label is on us.'}</p>
        {!gettingLabel ? <button type="button" className="text-button" onClick={startLabel}><Package size={16}/>Get a return label</button>
          : rates ? <div className="form-stack">
              <p className="field-note">Choose a carrier to buy the label.</p>
              {rates.map(rate => <button key={rate.rate_id} type="button" className="text-button" disabled={busy} onClick={() => buyLabel(rate.rate_id)}>{rate.provider} {rate.servicelevel} — {money(rate.amount_cents)}{rate.estimated_days ? ` · ${rate.estimated_days}d` : ''}</button>)}
              <button type="button" className="text-button" onClick={() => setRates(null)}>Back</button>
            </div>
          : <p role="status" className="field-note">{busy ? 'Checking rates…' : error || 'Could not get rates.'}</p>}
      </>}
    {error && rates && <p role="alert" className="error">{error}</p>}
  </div>;
  if (item.refund_status) {
    const labels = {
      pending: 'Refund requested — awaiting the seller',
      contested: 'Seller contested your refund request — under review',
      accepted: 'Refund accepted — processing…',
      refunded: item.offered_amount_cents ? `Partially refunded — ${money(item.offered_amount_cents)} returned to you` : 'Refunded',
      denied: 'Refund request denied',
    };
    return <p className="field-note">{labels[item.refund_status] || item.refund_status}</p>;
  }
  if (!open) return <button type="button" className="text-button" onClick={() => setOpen(true)}><AlertCircle size={16}/>Request a refund</button>;
  return <form className="form-stack" onSubmit={submit}>
    <label>What went wrong?<textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} maxLength={2000} placeholder="Explain the issue…" disabled={busy}/></label>
    {error && <p role="alert" className="error">{error}</p>}
    <button className="primary" disabled={busy || !reason.trim()}>{busy ? 'Sending…' : 'Submit request'}</button>
    <button type="button" className="text-button" onClick={() => setOpen(false)}>Cancel</button>
  </form>;
}

function SoldItemCard({ sale, session, onShipped, onRefundChanged, focusPurchaseId, onFocused }) {
  const [shipping, setShipping] = useState(false);
  const [needsParcel, setNeedsParcel] = useState(false);
  const [parcel, setParcel] = useState({ weight_oz: '', length_in: '', width_in: '', height_in: '' });
  const [rates, setRates] = useState(null), [ratesError, setRatesError] = useState('');
  const [busy, setBusy] = useState(false);
  // The listing already has package dimensions from when it was created, so this usually skips
  // straight to real rates — the manual form only appears as a fallback for older listings that
  // predate that requirement.
  async function startShipping() {
    setShipping(true); setBusy(true); setRatesError(''); setRates(null); setNeedsParcel(false);
    try { setRates(await service.getShippingRates(sale.id)); }
    catch (err) { if (/weight and size/.test(err.message)) setNeedsParcel(true); else setRatesError(err.message); }
    finally { setBusy(false); }
  }
  async function getRatesWithParcel(event) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setRatesError(''); setRates(null);
    try { setRates(await service.getShippingRates(sale.id, parcel)); setNeedsParcel(false); }
    catch (err) { setRatesError(err.message); } finally { setBusy(false); }
  }
  async function buyLabel(rateId) {
    setBusy(true); setRatesError('');
    try { const shipped = await service.buyShippingLabel(sale.id, rateId); onShipped({ ...sale, ...shipped }); setShipping(false); }
    catch (err) { setRatesError(err.message); } finally { setBusy(false); }
  }
  return <div className="item-card static">
    <ItemArt category={sale.category} photo={sale.media?.[0]?.url}/>
    <div className="item-card-content">
      <div className="card-meta"><span>{sale.category}</span><span>SOLD {new Date(sale.created_at).toLocaleDateString()}</span></div>
      <h3>{sale.title}</h3>
      <div className="card-bottom"><strong>{money(sale.price_cents)}</strong></div>
      {sale.shipped_at && <p className="field-note">{sale.escrow_status === 'released' ? `Payment released ${new Date(sale.funds_released_at).toLocaleDateString()}` : 'Payment held until delivery is confirmed'}</p>}
      {sale.shipped_at ? <p className="field-note">Shipped · {sale.tracking_number ? <a href={sale.tracking_url} target="_blank" rel="noreferrer">Track {sale.tracking_number}</a> : 'Tracking pending'}{sale.label_url && <> · <a href={sale.label_url} target="_blank" rel="noreferrer">Print label</a></>}</p>
        : !shipping ? <button type="button" className="text-button" onClick={startShipping}><Package size={16}/>Ship now</button>
        : needsParcel ? <form className="form-stack" onSubmit={getRatesWithParcel}>
            <p className="field-note">This listing predates saved package sizes — enter it once here.</p>
            <div className="form-row">
              <label>Weight (oz)<input type="number" min="1" required value={parcel.weight_oz} onChange={e => setParcel({ ...parcel, weight_oz: e.target.value })}/></label>
              <label>Length (in)<input type="number" min="1" required value={parcel.length_in} onChange={e => setParcel({ ...parcel, length_in: e.target.value })}/></label>
            </div>
            <div className="form-row">
              <label>Width (in)<input type="number" min="1" required value={parcel.width_in} onChange={e => setParcel({ ...parcel, width_in: e.target.value })}/></label>
              <label>Height (in)<input type="number" min="1" required value={parcel.height_in} onChange={e => setParcel({ ...parcel, height_in: e.target.value })}/></label>
            </div>
            {ratesError && <p role="alert" className="error">{ratesError}</p>}
            <button className="primary" disabled={busy}>{busy ? 'Checking rates…' : 'Get shipping rates'}</button>
            <button type="button" className="text-button" onClick={() => setShipping(false)}>Cancel</button>
          </form>
        : rates ? <div className="form-stack">
            <p className="field-note">Choose a carrier to buy the label.</p>
            {rates.map(rate => <button key={rate.rate_id} type="button" className="text-button" disabled={busy} onClick={() => buyLabel(rate.rate_id)}>{rate.provider} {rate.servicelevel} — {money(rate.amount_cents)}{rate.estimated_days ? ` · ${rate.estimated_days}d` : ''}</button>)}
            {ratesError && <p role="alert" className="error">{ratesError}</p>}
            <button type="button" className="text-button" onClick={() => setRates(null)}>Back</button>
          </div>
        : <p role="status" className="field-note">{busy ? 'Checking rates…' : ratesError || 'Could not get rates.'}</p>}
      <SellerRefundPanel sale={sale} onResolved={onRefundChanged}/>
      <MessageThread purchaseId={sale.id} service={service} session={session} counterpartyLabel="buyer" messageCount={sale.message_count} autoOpen={focusPurchaseId === sale.id} onFocused={onFocused} onRead={onRefundChanged}/>
    </div>
  </div>;
}

function ProfileSettings({ profile, session, onSaved, onSignOut }) {
  // A seller who hasn't connected payouts yet needs to see that prompt first, not a wall of zeros.
  const needsPayoutSetup = service.mode === 'live' && !profile?.stripe_charges_enabled && !profile?.stripe_details_submitted;
  const [tab, setTab] = useState(needsPayoutSetup ? 'settings' : 'dashboard');
  const [name, setName] = useState(profile?.display_name || '');
  const [saving, setSaving] = useState(false), [error, setError] = useState('');
  const [stripeBusy, setStripeBusy] = useState(false), [stripeError, setStripeError] = useState('');
  async function submit(event) {
    event.preventDefault(); if (saving) return;
    setSaving(true); setError('');
    try { await service.updateProfile(name); onSaved(); }
    catch (err) { setError(err.message); } finally { setSaving(false); }
  }
  async function connectStripe() {
    setStripeBusy(true); setStripeError('');
    try { const { url } = await service.startStripeOnboarding(); window.location.href = url; }
    catch (err) { setStripeError(err.message); setStripeBusy(false); }
  }
  async function openDashboard() {
    setStripeBusy(true); setStripeError('');
    try { const { url } = await service.openStripeDashboard(); window.open(url, '_blank'); }
    catch (err) { setStripeError(err.message); } finally { setStripeBusy(false); }
  }
  return <div className="form-stack">
    <div className="categories" role="group" aria-label="Profile sections">
      <button aria-pressed={tab === 'dashboard'} className={tab === 'dashboard' ? 'active' : ''} onClick={() => setTab('dashboard')}>Dashboard</button>
      <button aria-pressed={tab === 'settings'} className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}>Settings</button>
    </div>
    {tab === 'dashboard' ? <DashboardStats/> : <>
      <form className="form-stack" onSubmit={submit}>
        <label>Display name<input value={name} onChange={event=>setName(event.target.value)} minLength={1} maxLength={100} required/></label>
        <label>Email<input value={session?.user?.email || ''} readOnly disabled/></label>
        {error && <p role="alert" className="error">{error}</p>}
        <button className="primary" disabled={saving}>{saving ? 'Saving…' : 'Save name'}</button>
      </form>
      <StorefrontSettings profile={profile}/>
      <ShippingSettings profile={profile}/>
      <div className="evidence-box"><h3>Payouts</h3>
        {service.mode !== 'live' ? <p className="field-note">Coming soon. You'll be able to add bank details here before real checkout launches — nothing is collected yet.</p>
          : profile?.stripe_charges_enabled ? <><p className="field-note">Payments are connected. Your sales pay out to your own Stripe account.</p><button type="button" className="text-button" onClick={openDashboard} disabled={stripeBusy}>{stripeBusy ? 'Opening…' : 'Open your Stripe dashboard'}</button></>
          : profile?.stripe_details_submitted ? <p className="field-note">Stripe is still reviewing your account. Check back soon.</p>
          : <><p className="field-note">Connect a Stripe account to receive payouts before buyers can purchase your listings.</p><button type="button" className="text-button" onClick={connectStripe} disabled={stripeBusy}>{stripeBusy ? 'Opening…' : 'Connect payouts with Stripe'}</button></>}
        {stripeError && <p role="alert" className="error">{stripeError}</p>}
      </div>
    </>}
    <button type="button" className="text-button" onClick={onSignOut}><LogOut size={16}/>Sign out</button>
  </div>;
}

function EmailLogin() {
  const [busy, setBusy] = useState(false), [sent, setSent] = useState(false), [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault(); if (busy) return;
    const email = new FormData(event.currentTarget).get('email');
    setBusy(true); setError('');
    try { await service.signInWithEmail(email); setSent(true); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return sent ? <div role="status" className="evidence-box"><h3>Check your inbox</h3><p>Open your sign-in link in this browser to continue. It also creates your account if you're new.</p><p>You can close this window while you check your email.</p></div> : <form className="form-stack" onSubmit={submit}>
    <label>Email address<input name="email" type="email" autoComplete="email" required placeholder="you@example.com" autoFocus /></label>
    <p className="field-note">We'll email you a secure sign-in link. No password to remember.</p>
    {error && <p className="error" role="alert">{error}</p>}
    <button className="primary full-width" disabled={busy}>{busy ? 'Sending link…' : 'Continue with email'}<ArrowRight size={18}/></button>
  </form>;
}

export default function App() {
  // Computed once per load (this app never navigates client-side between routes) so the
  // storefront route can skip the main app's data-fetch effects entirely below.
  const storefrontSlug = (() => { const segments = window.location.pathname.split('/').filter(Boolean); return segments.length === 1 && segments[0] !== 'auth' ? segments[0] : null; })();
  // /terms and /privacy are standalone, no-login-required pages -- checked before storefrontSlug
  // so they can never be shadowed by a seller's store name (also reserved server-side).
  const legalPage = window.location.pathname === '/terms' ? 'terms' : window.location.pathname === '/privacy' ? 'privacy' : null;
  const [session, setSession] = useState(null), [authReady, setAuthReady] = useState(false), [profile, setProfile] = useState(null);
  const [workspace, setWorkspace] = useState('collector'), [items, setItems] = useState([]), [audits, setAudits] = useState([]);
  const [category, setCategory] = useState('All items'), [query, setQuery] = useState(''), [selectedId, setSelectedId] = useState(null);
  const [modal, setModal] = useState(null), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [favoriteIds, setFavoriteIds] = useState([]), [purchases, setPurchases] = useState([]), [collectionFilter, setCollectionFilter] = useState('all');
  const [sales, setSales] = useState([]), [sellerTab, setSellerTab] = useState('active');
  const [notifications, setNotifications] = useState([]), [focusPurchaseId, setFocusPurchaseId] = useState(null);
  const [revision, setRevision] = useState(0);
  const refresh = () => setRevision(v => v + 1);
  useEffect(() => {
    if (service.mode === 'unconfigured' || storefrontSlug || legalPage) return;
    let alive = true, eventSeen = false;
    // Auth can emit again with the same session object when a tab regains focus.
    // Reload account data whenever it is cleared, even if session identity is unchanged.
    const unsubscribe = service.onAuthChange(next => { eventSeen = true; if (alive) { setSession(next); if (next) { setNotice(''); setError(''); setModal(current => current === 'login' ? null : current); } setAuthReady(true); setProfile(null); setAudits([]); refresh(); } });
    service.getSession().then(value => { if (alive && !eventSeen) setSession(value); }).catch(err => { if (alive) setError(err.message); }).finally(() => { if (alive) setAuthReady(true); });
    const params = new URLSearchParams(window.location.search);
    const authError = params.get('error_description');
    if (authError) { setError(authError); window.history.replaceState({}, '', '/'); }
    return () => { alive = false; unsubscribe(); };
  }, []);
  useEffect(() => {
    if (service.mode === 'unconfigured' || storefrontSlug || legalPage) return;
    let alive = true; setLoading(true);
    Promise.all([service.listings(), session ? service.profile(session.user.id) : null, session ? service.myAudits() : [], session ? service.myFavoriteIds() : [], session ? service.myPurchases() : [], session ? service.mySales() : [], session ? service.myNotifications() : []])
      .then(([listings, account, myAudits, favorites, myPurchases, mySales, myNotifications]) => { if (alive) { setItems(listings); setProfile(account); setAudits(myAudits); setFavoriteIds(favorites); setPurchases(myPurchases); setSales(mySales); setNotifications(myNotifications); } })
      .catch(err => { if (alive) setError(err.message); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [session, revision, authReady]);
  useEffect(() => {
    if (!authReady || service.mode !== 'live' || storefrontSlug || legalPage) return;
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get('checkout'), stripeSession = params.get('session');
    const onboarding = params.get('stripe_onboarding');
    if (checkout === 'success' && stripeSession) {
      window.history.replaceState({}, '', window.location.pathname);
      setNotice('Finalizing your purchase…');
      (async () => {
        for (let i = 0; i < 5; i++) {
          try {
            const result = await service.confirmCheckout(stripeSession);
            if (result.status === 'completed') { setNotice('Purchase complete — this item is now in your collection.'); refresh(); return; }
          } catch (err) { setError(err.message); return; }
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
        setNotice('Your payment is still processing. Check your collection shortly.');
      })();
    } else if (checkout === 'cancel' && stripeSession) {
      window.history.replaceState({}, '', window.location.pathname);
      service.cancelCheckout(stripeSession).catch(() => {});
      setNotice('Checkout canceled. The item is available again.');
      refresh();
    } else if (onboarding === 'return' || onboarding === 'refresh') {
      window.history.replaceState({}, '', window.location.pathname);
      service.refreshStripeOnboardingStatus()
        .then(result => { setNotice(result.charges_enabled ? 'Payout details saved.' : 'Stripe is reviewing your details.'); refresh(); })
        .catch(err => setError(err.message));
    }
  }, [authReady]);
  const appliedItemParam = useRef(false);
  useEffect(() => {
    if (appliedItemParam.current || !items.length) return;
    const params = new URLSearchParams(window.location.search);
    const itemId = params.get('item');
    if (itemId) {
      appliedItemParam.current = true;
      if (items.some(item => item.id === itemId)) { setSelectedId(itemId); window.history.replaceState({}, '', window.location.pathname); }
    }
  }, [items]);
  if (service.mode === 'unconfigured') return <main className="setup"><div className="brand"><Brand/></div><h1>The new foundation is ready to connect.</h1><p>Configure your Supabase project URL and public publishable key to enable email sign-in. Local development also includes a separate sample workspace.</p><p>See README.md for the Supabase setup steps. No real accounts are active in this build yet.</p></main>;
  if (legalPage === 'terms') return <TermsPage/>;
  if (legalPage === 'privacy') return <PrivacyPage/>;
  if (storefrontSlug) return <Storefront slug={storefrontSlug} service={service} onBack={() => { window.location.href = '/'; }}/>;

  const selected = items.find(item => item.id === selectedId);
  const ownedItem = !selected ? purchases.find(item => item.id === selectedId) : null;
  const own = selected?.seller_id === session?.user.id;
  const previousAudit = audits.find(a => a.listing_id === selectedId && a.listing_version === selected?.version);
  const eligible = workspace === 'seller' ? items.filter(item => item.seller_id === session?.user.id)
    : workspace === 'auditor' ? items.filter(item => item.seller_id !== session?.user.id && !audits.some(a => a.listing_id === item.id))
    : collectionFilter === 'saved' ? items.filter(item => favoriteIds.includes(item.id)) : items;
  const filtered = eligible.filter(item => (category === 'All items' || item.category === category) && listingMatches(item, query));
  const collectionItems = workspace === 'collector' && collectionFilter === 'owned' ? purchases : filtered;
  const switchWorkspace = value => { setWorkspace(value); setSelectedId(null); setCategory('All items'); setQuery(''); setError(''); setCollectionFilter('all'); setSellerTab('active'); };
  function focusNotification(n) {
    setModal(null);
    if (n.role === 'buyer') { setSelectedId(n.listing_id); }
    else { setWorkspace('seller'); setSellerTab('sold'); setSelectedId(null); }
    setFocusPurchaseId(n.kind === 'message' ? n.purchase_id : null);
  }
  async function signIn(userId) { setBusy(true); setError(''); try { await service.signIn(userId); setModal(null); } catch (err) { setError(err.message); } finally { setBusy(false); } }
  async function signOut() { try { await service.signOut(); switchWorkspace('collector'); setNotice('You’re signed out.'); } catch (err) { setError(err.message); } }
  function openCreate() { if (!session) setModal('login'); else if (profile?.can_sell) setModal('create'); else setError('Your account does not have selling permission.'); }
  async function toggleFavorite(listingId) {
    if (!session) { setModal('login'); return; }
    try { const now = await service.toggleFavorite(listingId); setFavoriteIds(ids => now ? [...ids, listingId] : ids.filter(id => id !== listingId)); }
    catch (err) { setError(err.message); }
  }
  async function buyNow(listingId, shippingAddress, applyCreditCents, wantInsurance) {
    if (!session) { setModal('login'); return; }
    setBusy(true); setError('');
    try {
      const result = await service.startCheckout(listingId, shippingAddress, applyCreditCents, wantInsurance);
      if (result?.url) { window.location.href = result.url; return; }
      setNotice('Purchase complete — this item is now in your collection.'); setSelectedId(null); refresh();
    } catch (err) { setError(err.message); }
    setBusy(false);
  }
  async function submitAudit(event) {
    event.preventDefault(); if (busy) return; setBusy(true); setError('');
    try {
      const form = Object.fromEntries(new FormData(event.currentTarget));
      const result = await service.submitAudit(selectedId, form);
      setNotice(result.xp_earned ? 'Audit recorded. +5 participation XP.' : 'Your audit is already recorded.'); refresh();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <div className="app">
    {service.mode === 'demo' && <div className="demo-banner"><span><span className="live-dot"/> LOCAL PREVIEW <span className="banner-detail">· Sample items and two practice accounts. No real login or purchases.</span></span><button onClick={async () => { await service.reset(); setSelectedId(null); setWorkspace('collector'); refresh(); }}>Reset demo</button></div>}
    <header className="topbar">
      <button className="brand" onClick={() => switchWorkspace('collector')} aria-label="Credabilia home"><Brand/></button>
      <nav aria-label="Main navigation"><button className={workspace === 'collector' ? 'nav-current' : ''} onClick={() => switchWorkspace('collector')}>Discover</button><button className={workspace === 'auditor' ? 'nav-current' : ''} onClick={() => switchWorkspace('auditor')}>Community audits</button></nav>
      <div className="account-actions"><button className="text-button sell-top" onClick={openCreate}><Plus size={16}/>List an item</button>{session && <button className="icon-button" aria-label="Ask King Credion" title="Ask King Credion" onClick={() => setModal('support')} style={{width:64,height:64}}><img src="/brand/king-credion-chat-icon-ai.png" alt="" width={54} height={54} style={{objectFit:'contain'}}/></button>}{session && <NotificationBell notifications={notifications} onNavigate={focusNotification}/>}{session ? <><button className="avatar" aria-label="Profile and settings" title={profile?.display_name} onClick={() => setModal('profile')}>{profile?.display_name?.slice(0,1) || 'C'}</button><button className="icon-button" aria-label="Sign out" title="Sign out" onClick={signOut}><LogOut size={18}/></button></> : <button className="primary compact" onClick={() => setModal('login')} disabled={!authReady}>Sign in <ArrowUpRight size={16}/></button>}</div>
    </header>
    <div className="page-layout">
      <aside className="sidebar">
        <p className="eyebrow">YOUR WORKSPACE</p>
        <div className="workspace-list" role="group" aria-label="Choose workspace">{WORKSPACES.map((value, index) => { const Icon = [Compass, Store, ClipboardCheck][index]; const label = { collector: 'Collect', seller: 'Sell', auditor: 'Audit' }[value]; return <button key={value} aria-pressed={workspace === value} onClick={() => switchWorkspace(value)} className={workspace === value ? 'workspace selected' : 'workspace'}><Icon size={19}/><span>{label}</span>{workspace === value && <span className="selected-dot"/>}</button>; })}</div>
        <p className="workspace-note">One account.<br/>Every side of collecting.</p>
        <div className="learning-card"><BookOpen size={23}/><h3>Build your eye.</h3><p>Look closely. Ask questions. Let the evidence guide you.</p><button onClick={() => setModal('learn')}>A guide to auditing <ArrowUpRight size={15}/></button></div>
        <div className="progress-card"><span>PARTICIPATION XP</span><strong>{profile?.xp ?? '—'} <Sparkles size={17}/></strong><p>Learning and participation.<br/>Not an expertise rating.</p></div>
        <div className="progress-card"><span>LEARNING XP</span><strong>{profile?.learning_xp ?? '—'} <BookOpen size={17}/></strong><p>Trivia and study.<br/>Separate from participation XP.</p></div>
        <div className="sidebar-bottom"><ShieldCheck size={16}/><span>Curiosity meets credibility.</span></div>
      </aside>
      <main>
        {error && <div className="message error" role="alert"><AlertCircle size={18}/><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss error"><X size={16}/></button></div>}
        {notice && <div className="message success" role="status"><Check size={18}/><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Dismiss notification"><X size={16}/></button></div>}
        {selected ? <>
          <button className="back-button" onClick={() => setSelectedId(null)}><ArrowLeft size={17}/>Back to {workspace === 'auditor' ? 'audit queue' : 'listings'}</button>
          {own && profile?.can_sell && <button className="text-button" onClick={()=>setModal('edit')}>Edit listing</button>}
          {session && !own && <button className="text-button" onClick={()=>toggleFavorite(selected.id)}><Heart size={16} fill={favoriteIds.includes(selected.id) ? 'currentColor' : 'none'}/>{favoriteIds.includes(selected.id) ? 'Saved' : 'Save to collection'}</button>}
          <div className="detail-grid"><div>{selected.media?.some(asset=>asset.kind==='item') ? <PhotoGallery key={selected.id} media={selected.media} title={selected.title}/> : <ItemArt kind={selected.artwork} category={selected.category} large/>}<PhotoGallery key={selected.id+'cert'} media={selected.media} kind="certificate" title={selected.title}/></div><section className="item-info"><span className="pill">{selected.category}</span><h1>{selected.title}</h1><p className="seller-name">Shared by {selected.seller_name}</p><p className="detail-price">{money(selected.price_cents)}</p>{session && !own && <>{service.mode==='live' && !selected.seller_charges_enabled && <p className="field-note">This seller hasn't finished payment setup yet.</p>}<button className="primary" disabled={busy || (service.mode==='live' && !selected.seller_charges_enabled)} onClick={()=>setModal('checkout-address')}>{busy ? 'Processing…' : 'Buy now'}<ArrowRight size={16}/></button></>}<p>{selected.description}</p><ListingDetailSummary item={selected}/><div className="evidence-box"><h3><ShieldCheck size={18}/>Evidence notes</h3><p>{selected.evidence || 'No evidence has been provided yet. Ask for more information before reaching a conclusion.'}</p></div><CertificateDetails key={selected.id} item={selected}/><CredibilityDetails item={selected}/><ItemHistory key={selected.id+selected.version} item={selected} service={service}/><TriviaPanel key={selected.id} item={selected} service={service} signedIn={!!session}/><p className="field-note">Community assessments are opinions, not professional authentication.</p></section></div>
          <section className="audit-panel"><div><p className="eyebrow">LOOK CLOSER</p><h2>What does the evidence tell you?</h2><p className="muted">Explain what you observed. “Need more evidence” is a useful answer.</p></div>
            {!session ? <button className="primary" onClick={() => setModal('login')}>Sign in to audit <ArrowRight size={16}/></button>
              : own ? <p className="empty-inline">This is your listing. Other members can submit assessments.</p>
              : previousAudit ? <div className="recorded"><Check size={20}/><div><strong>Your assessment is recorded</strong><p>{LABELS[previousAudit.verdict]} · {previousAudit.explanation}</p></div></div>
              : !profile ? <p role="status">{loading ? 'Loading your account…' : 'Account details could not be loaded. Refresh to try again.'}</p>
              : !profile.can_audit ? <p>Auditing isn’t enabled for your account.</p>
              : <form onSubmit={submitAudit} className="form-stack"><fieldset><legend>Your assessment</legend><div className="verdicts">{Object.entries(LABELS).map(([value, label]) => <label key={value}><input type="radio" name="verdict" value={value} required/>{label}</label>)}</div></fieldset><label>Explain your reasoning<textarea name="explanation" required minLength={20} maxLength={2000} rows={3} placeholder="Point to a specific detail, explain your concern, or describe what evidence is missing…"/></label><div className="submit-row"><span>One assessment per item · +5 participation XP</span><button className="primary" disabled={busy}>{busy ? 'Recording…' : 'Submit audit'}<ArrowRight size={17}/></button></div></form>}
          </section>
        </> : ownedItem ? <>
          <button className="back-button" onClick={() => setSelectedId(null)}><ArrowLeft size={17}/>Back to listings</button>
          <div className="detail-grid"><div>{ownedItem.media?.some(asset=>asset.kind==='item') ? <PhotoGallery key={ownedItem.id} media={ownedItem.media} title={ownedItem.title}/> : <ItemArt category={ownedItem.category} large/>}<PhotoGallery key={ownedItem.id+'cert'} media={ownedItem.media} kind="certificate" title={ownedItem.title}/></div><section className="item-info"><span className="pill">{ownedItem.category}</span><h1>{ownedItem.title}</h1><p className="seller-name">Purchased {new Date(ownedItem.purchased_at).toLocaleDateString()}</p><p className="detail-price">{money(ownedItem.price_cents)}</p><p>{ownedItem.description}</p><ListingDetailSummary item={ownedItem}/><div className="evidence-box"><h3><Package size={18}/>Shipping</h3>{ownedItem.shipped_at ? <><p>Shipped {new Date(ownedItem.shipped_at).toLocaleDateString()}</p>{ownedItem.tracking_number && <p><a href={ownedItem.tracking_url} target="_blank" rel="noreferrer">Track: {ownedItem.tracking_number}</a></p>}{ownedItem.tracking_status && ownedItem.tracking_status !== 'UNKNOWN' && <p className="field-note">Status: {ownedItem.tracking_status}</p>}</> : <p className="field-note">The seller hasn't shipped this yet.</p>}<p className="field-note">{ownedItem.escrow_status === 'released' ? 'Payment released to the seller' : 'We hold your payment until delivery is confirmed'}{ownedItem.insured ? ' · Insured' : ''}</p></div><BuyerRefundPanel item={ownedItem} onRequested={refresh}/><MessageThread purchaseId={ownedItem.purchase_id} service={service} session={session} counterpartyLabel="seller" messageCount={ownedItem.message_count} autoOpen={focusPurchaseId === ownedItem.purchase_id} onFocused={() => setFocusPurchaseId(null)} onRead={refresh}/><CertificateDetails item={ownedItem}/><button className="primary" onClick={()=>setModal('relist')}><RefreshCw size={16}/>Relist this item</button></section></div>
        </> : <>
          <section className="hero"><div className="hero-copy"><p className="eyebrow"><span className="small-line"/>{workspace === 'collector' ? 'FOR THE CURIOUS COLLECTOR' : workspace === 'seller' ? 'YOUR NEXT GREAT FIND STARTS HERE' : 'OBSERVATION OVER ASSUMPTION'}</p><h1>{workspace === 'collector' ? <>Good finds.<br/><em>Better informed.</em></> : workspace === 'seller' ? <>Your collection.<br/><em>A new chapter.</em></> : <>Look closer.<br/><em>Share what you see.</em></>}</h1><p>{workspace === 'collector' ? 'Discover pieces with a story. Explore the evidence. Collect with a community that cares about the details.' : workspace === 'seller' ? 'Give every piece the context it deserves. Share its story, its condition, and what you know.' : 'Help collectors make informed decisions. Review evidence, explain your reasoning, and keep learning.'}</p><button className="primary" onClick={workspace === 'seller' ? openCreate : () => document.getElementById('listings').scrollIntoView({ behavior: 'smooth' })}>{workspace === 'seller' ? 'Create a listing' : workspace === 'auditor' ? 'Explore the audit queue' : 'Explore the collection'}<ArrowUpRight size={18}/></button></div><div className="hero-mascot"><img src="/brand/king-credion-memorabilia-concept-v1.png" width="1166" height="1349" alt="King Credion holding a signed baseball beside a basketball and framed jersey" fetchPriority="high" /></div></section>
          <div className="values-strip"><span><Search size={16}/>Discover the details</span><span><ClipboardCheck size={16}/>Share your perspective</span><span><BookOpen size={16}/>Keep learning</span></div>
          <section id="listings" className="listings-section"><div className="section-heading"><div><p className="eyebrow">{workspace === 'auditor' ? 'A FRESH PERSPECTIVE' : 'THE COLLECTION'}</p><h2>{workspace === 'seller' ? (sellerTab === 'sold' ? 'Sold items' : 'Your listings') : workspace === 'auditor' ? 'Ready for a closer look' : collectionFilter === 'owned' ? 'Items you own' : collectionFilter === 'saved' ? 'Items you saved' : 'Discover something worth keeping'}</h2></div><span className="item-count">{workspace === 'seller' && sellerTab === 'sold' ? sales.length : collectionItems.length} {(workspace === 'seller' && sellerTab === 'sold' ? sales.length : collectionItems.length) === 1 ? 'item' : 'items'}</span></div>
            {workspace === 'seller' && session && <div className="categories" aria-label="Your listings"><button aria-pressed={sellerTab === 'active'} className={sellerTab === 'active' ? 'active' : ''} onClick={() => setSellerTab('active')}>Active</button><button aria-pressed={sellerTab === 'sold'} className={sellerTab === 'sold' ? 'active' : ''} onClick={() => setSellerTab('sold')}>Sold {sales.length ? `(${sales.length})` : ''}</button></div>}
            {workspace === 'collector' && session && <div className="categories" aria-label="My collection"><button aria-pressed={collectionFilter === 'all'} className={collectionFilter === 'all' ? 'active' : ''} onClick={() => setCollectionFilter('all')}>All items</button><button aria-pressed={collectionFilter === 'saved'} className={collectionFilter === 'saved' ? 'active' : ''} onClick={() => setCollectionFilter('saved')}><Heart size={14}/> Saved</button><button aria-pressed={collectionFilter === 'owned'} className={collectionFilter === 'owned' ? 'active' : ''} onClick={() => setCollectionFilter('owned')}>Owned</button></div>}
            {workspace === 'seller' && sellerTab === 'sold' ? (!sales.length ? <div className="empty-state"><Layers size={34}/><h3>Nothing sold yet.</h3><p>Sales will show up here, ready to ship.</p></div>
              : <div className="items-grid">{sales.map(sale => <SoldItemCard key={sale.id} sale={sale} session={session} onShipped={shipped => setSales(list => list.map(s => s.id === shipped.id ? shipped : s))} onRefundChanged={refresh} focusPurchaseId={focusPurchaseId} onFocused={() => setFocusPurchaseId(null)}/>)}</div>) : <>
            {collectionFilter !== 'owned' && <div className="filters"><div className="categories" aria-label="Filter by category">{['All items', ...CATEGORIES].map(c => <button key={c} aria-pressed={category === c} className={category === c ? 'active' : ''} onClick={() => setCategory(c)}>{c}</button>)}</div><label className="search"><Search size={17}/><input aria-label="Search listings" value={query} onChange={e => setQuery(e.target.value)} placeholder="Find your next discovery"/></label></div>}
            {loading ? <p role="status" className="empty-state">Loading the collection…</p> : !collectionItems.length ? <div className="empty-state"><Layers size={34}/><h3>{workspace === 'seller' ? 'Your first listing starts here.' : collectionFilter === 'owned' ? 'Nothing purchased yet.' : collectionFilter === 'saved' ? 'Nothing saved yet.' : 'No items here yet.'}</h3><p>{workspace === 'seller' ? 'Add a piece and tell its story.' : collectionFilter === 'owned' ? 'Items you buy will show up here.' : collectionFilter === 'saved' ? 'Tap the heart on an item to save it here.' : 'Try a different category or search.'}</p>{workspace === 'seller' && <button className="primary" onClick={openCreate}>Create a listing <Plus size={17}/></button>}</div>
              : <div className="items-grid">{collectionItems.map(item => <button className="item-card" key={item.id} onClick={() => { setSelectedId(item.id); window.scrollTo({ top: 0 }); }} aria-label={`View ${item.title}`}><ItemArt kind={item.artwork} category={item.category} photo={item.media?.find(asset=>asset.kind==='item')?.url}/><div className="item-card-content"><div className="card-meta"><span>{item.category}</span>{collectionFilter === 'owned' ? <span>OWNED</span> : <><span>{item.sample ? 'SAMPLE' : 'NEW LISTING'}</span>{session && item.seller_id !== session.user.id && <span role="button" tabIndex={0} className="icon-button" aria-label={favoriteIds.includes(item.id) ? 'Remove from saved' : 'Save to collection'} onClick={event => { event.stopPropagation(); toggleFavorite(item.id); }}><Heart size={14} fill={favoriteIds.includes(item.id) ? 'currentColor' : 'none'}/></span>}</>}</div><h3>{item.title}</h3><p>{collectionFilter === 'owned' ? `Purchased ${new Date(item.purchased_at).toLocaleDateString()}` : item.seller_name}</p>{collectionFilter !== 'owned' && <CredibilityMeter score={item.credibility_score} compact/>}<div className="card-bottom"><strong>{money(item.price_cents)}</strong>{collectionFilter !== 'owned' && <span><ClipboardCheck size={14}/>{item.audit_count || 0} audits</span>}</div></div></button>)}</div>}
            </>}
          </section><section className="community-note"><div className="note-icon"><ShieldCheck size={25}/></div><div><h3>Confidence grows with evidence.</h3><p>A community opinion is a starting point. For valuable purchases, seek qualified authentication.</p></div><button className="icon-button" aria-label="Read the auditing guide" onClick={() => setModal('learn')}><ArrowUpRight size={24}/></button></section>
        </>}
        <footer><span>© {new Date().getFullYear()} Credabilia</span><span>Made for the love of the find.</span><span className="footer-legal"><a href="/terms">Terms</a><a href="/privacy">Privacy</a></span></footer>
      </main>
    </div>
    {modal === 'login' && <Modal title="Welcome to Credabilia" onClose={() => setModal(null)}><p className="muted">One account to collect, sell, and share your perspective.</p>{service.mode === 'demo' ? <><div className="evidence-box"><h3>Try the local preview</h3><p>These two separate practice accounts stay in this browser. Each can switch between all three workspaces. Real sign-in is available when the Supabase project is connected.</p></div><div className="form-stack">{DEMO_ACCOUNTS.map(account => <button key={account.id} className="primary full-width" onClick={() => signIn(account.id)} disabled={busy}>{busy ? 'Opening…' : `Continue as ${account.display_name}`}<ArrowRight size={18}/></button>)}</div></> : <><button className="primary full-width" onClick={() => signIn()} disabled={busy}>{busy ? 'Opening…' : 'Continue with Google'}<ArrowRight size={18}/></button><p className="field-note">or</p><EmailLogin/><p className="field-note">By continuing, you agree to Credabilia's <a href="/terms" target="_blank" rel="noreferrer">Terms of Service</a> and <a href="/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>.</p></>}<p className="field-note">Your sign-in method does not determine your workspace. You can switch between all three after signing in.</p></Modal>}
    {modal === 'checkout-address' && selected && <CheckoutAddress item={selected} profile={profile} busy={busy} onClose={() => setModal(null)} onConfirm={(address, applyCreditCents, wantInsurance) => { setModal(null); buyNow(selected.id, address, applyCreditCents, wantInsurance); }}/>}
    {modal === 'create' && <CreateListing onClose={() => setModal(null)} onCreated={id => { setModal(null); setNotice('Your listing is published.'); setSelectedId(id); refresh(); }}/>}
    {modal === 'relist' && ownedItem && <CreateListing relistFrom={ownedItem} onClose={() => setModal(null)} onCreated={id => { setModal(null); setNotice('Your relisted item is published.'); switchWorkspace('seller'); setSelectedId(id); refresh(); }}/>}
    {modal === 'edit' && selected && own && <EditListing key={selected.id} item={selected} onClose={()=>setModal(null)} onSaved={()=>{setModal(null);setNotice('Your listing changes are saved.');refresh();}}/>}
    {modal === 'profile' && <Modal title="Profile and settings" onClose={() => setModal(null)}><ProfileSettings profile={profile} session={session} onSaved={() => { setModal(null); setNotice('Your profile is saved.'); refresh(); }} onSignOut={() => { setModal(null); signOut(); }}/></Modal>}
    {modal === 'support' && <Modal title="Ask King Credion" onClose={() => setModal(null)}><SupportChat service={service}/></Modal>}
    {modal === 'learn' && <Modal title="Start with the evidence" onClose={() => setModal(null)}><ol className="guide"><li><strong>Observe before deciding.</strong><p>Look at condition, markings, materials, and the description. Record what you can actually see.</p></li><li><strong>Check the story.</strong><p>Provenance and certificates need verification. A familiar name alone does not prove authenticity.</p></li><li><strong>Say what is missing.</strong><p>Ask for clearer photos or documentation. Uncertainty is more useful than unsupported confidence.</p></li></ol><p className="field-note">Educational trivia will build on these skills in a later phase. Participation XP does not certify expertise.</p></Modal>}
  </div>;
}
