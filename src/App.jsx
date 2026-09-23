import { Brand } from './Brand.jsx';
import { ListingDetailFields, ListingDetailSummary } from './ListingDetails.jsx';
import { listingMatches } from './listingDetails.js';
import { MediaPicker, PhotoGallery } from './ListingMedia.jsx';
import { mainPhotoBackgroundRemoved, prepareImage } from './media.js';
import { saveListingDraft, loadListingDraft, clearListingDraft, readFormValues } from './listingDraft.js';
import { certificateSuggestion } from './certificates.js';
import CredibilityDetails, { CredibilityMeter } from './CredibilityDetails.jsx';
import { TriviaPanel } from './Trivia.jsx';
import { ItemHistory } from './ItemHistory.jsx';
import CertificateDetails, { CertificateFields } from './CertificateDetails.jsx';
import React, { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, ArrowRight, Search, ShieldCheck, Plus, Store, Compass, ClipboardCheck, LogOut, X, Check, BookOpen, Sparkles, Layers, ArrowLeft, AlertCircle, Heart, Settings, RefreshCw, Package, Bell, MessageCircle, Sun, Moon, Monitor, Star, Flag } from 'lucide-react';
import { DEMO_ACCOUNTS } from './demo.js';
import { makeService } from './service.js';
import { Storefront } from './Storefront.jsx';
import { TermsPage, PrivacyPage } from './Legal.jsx';
import { HelpPage } from './Help.jsx';
import { ItemArt, money, RatingStars } from './ItemArt.jsx';
import { MessageThread } from './MessageThread.jsx';
import { SupportChat } from './SupportChat.jsx';
import { CATEGORIES, WORKSPACES, priceInCents } from './domain.js';

const service = makeService();
const LABELS = { authentic: 'Looks consistent', uncertain: 'Need more evidence', concerns: 'I see concerns' };
const HERO_IMAGES = {
  collector: { src: '/brand/king-credion-memorabilia-concept-v1.png', width: 1166, height: 1349, alt: 'King Credion holding a signed baseball beside a basketball and framed jersey' },
  seller: { src: '/brand/king-credion-sell-hero-v1.png', width: 1254, height: 1254, alt: 'King Credion as a vendor at a display booth with a signed jersey, basketball, and trading card' },
  auditor: { src: '/brand/king-credion-audit-hero-v1.png', width: 1254, height: 1254, alt: 'King Credion inspecting a certificate of authenticity with a magnifying glass beside a signed baseball' },
};

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
        : notifications.map(n => <button key={`${n.purchase_id}-${n.listing_id}-${n.kind}`} type="button" className="notif-row" role="menuitem" onClick={() => { onNavigate(n); setOpen(false); }}>
            {n.kind === 'message' ? <MessageCircle size={16}/> : <AlertCircle size={16}/>}<span>{n.message}</span>
          </button>)}
    </div>}
  </div>;
}

const THEME_KEY = 'credabilia-theme';
const THEME_OPTIONS = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
];

// The dark palette in theme.css already applies itself via `@media(prefers-color-scheme:dark)`
// for "System" -- this only needs to touch the DOM for an *explicit* light/dark override, and to
// keep the address-bar theme-color tag honest (which CSS alone can't drive).
function applyTheme(pref) {
  const root = document.documentElement;
  if (pref === 'system') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', pref);
  const isDark = pref === 'dark' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isDark ? '#12181b' : '#173f36');
}

function ThemeToggle() {
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem(THEME_KEY) || 'system'; } catch { return 'system'; } });
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDocClick = event => { if (wrap.current && !wrap.current.contains(event.target)) setOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);
  // Keep the theme-color tag honest if the OS preference flips while this tab is open and the
  // user hasn't overridden it -- the CSS itself already updates on its own via the media query.
  useEffect(() => {
    if (theme !== 'system') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [theme]);
  function choose(value) {
    setTheme(value); setOpen(false);
    try { localStorage.setItem(THEME_KEY, value); } catch {}
    applyTheme(value);
  }
  const Current = THEME_OPTIONS.find(o => o.value === theme)?.Icon || Monitor;
  return <div className="notif-wrap" ref={wrap}>
    <button className="icon-button" aria-label={`Theme: ${theme}`} title="Theme" onClick={() => setOpen(o => !o)}>
      <Current size={18}/>
    </button>
    {open && <div className="notif-panel theme-panel" role="menu">
      {THEME_OPTIONS.map(({ value, label, Icon }) => <button key={value} type="button" className="notif-row" role="menuitemradio" aria-checked={theme === value} onClick={() => choose(value)}>
        <Icon size={16}/><span>{label}</span>{theme === value && <Check size={14} className="theme-check"/>}
      </button>)}
    </div>}
  </div>;
}

function CreateListing({ onClose, onCreated, relistFrom }) {
  const [step,setStep]=useState(relistFrom ? 'form' : 'photo');
  const [processingPhoto,setProcessingPhoto]=useState(false);
  const [draftPrompt,setDraftPrompt]=useState(() => relistFrom ? null : loadListingDraft());
  const [resuming,setResuming]=useState(false);
  const [pendingResume,setPendingResume]=useState(null);
  const [listingCategory, setListingCategory] = useState(relistFrom?.category || CATEGORIES[0]);
  const [listingType, setListingType] = useState('fixed');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [media,setMedia]=useState([]), [uploading,setUploading]=useState(false), [analyzing,setAnalyzing]=useState(false);
  const [certificate,setCertificate]=useState({}),[suggestion,setSuggestion]=useState(null),[confirmed,setConfirmed]=useState(false);
  const [notes,setNotes]=useState(''),[drafting,setDrafting]=useState(false),[pendingDraft,setPendingDraft]=useState(null);
  const [draftApplied,setDraftApplied]=useState(false),[draftNote,setDraftNote]=useState('');
  const [signatureSuggestion,setSignatureSuggestion]=useState(null),[applyingSuggestion,setApplyingSuggestion]=useState(false);
  const [copyingPhotos,setCopyingPhotos]=useState(false);
  const [signatureAi,setSignatureAi]=useState(null),[reviewingSignature,setReviewingSignature]=useState(false);
  const formRef=useRef(null);
  const working=busy||uploading||analyzing||drafting||copyingPhotos||reviewingSignature||applyingSuggestion||processingPhoto||resuming;
  const certificates=media.filter(asset=>asset.kind==='certificate');
  const signaturePhoto=media.find(asset=>asset.kind==='signature');
  async function analyze() {
    setAnalyzing(true);setError('');setSuggestion(null);
    try {const result=await service.extractCertificate(certificates[0].path);setSuggestion(certificateSuggestion(result));}
    catch(err){setError(err.message);}finally{setAnalyzing(false);}
  }
  async function reviewSignature() {
    setReviewingSignature(true);setError('');
    try {const result=await service.analyzeSignature(signaturePhoto.path);setSignatureAi(result);}
    catch(err){setError(err.message);}finally{setReviewingSignature(false);}
  }
  // Stages an AI draft result for the form: title/description/attributes/tags go through the
  // pendingDraft effect below (deferred, since the form may not be mounted yet -- the photo step
  // has no text fields at all), category is applied directly since it drives which category-specific
  // attribute inputs even exist to fill in.
  function applyDraftResult(result) {
    if(result.category && CATEGORIES.includes(result.category)) setListingCategory(result.category);
    setPendingDraft({title:result.title||'',description:result.description||'',attributes:result.attributes||{},tags:result.tags||[]});
    const hasContent=result.title||result.description||result.category||Object.keys(result.attributes||{}).length||result.tags?.length||result.signature?.found;
    setDraftApplied(!!(result.title||result.description||result.category||Object.keys(result.attributes||{}).length||result.tags?.length));
    setDraftNote(hasContent ? '' : "Our analysis didn't bring back much from this photo — fill in the details below.");
  }
  // Step 1: a single main photo. AI drafting and background removal run in parallel right after
  // upload so both are done (or have visibly failed) by the time the seller reaches the full form --
  // Photoroom availability still isn't required to publish (see submit()'s own fallback below), this
  // is just the first, best-effort attempt, done up front instead of silently mid-form.
  async function uploadMainPhoto(event) {
    const file=event.target.files?.[0]; event.target.value='';
    if(!file || processingPhoto) return;
    setProcessingPhoto(true);setError('');
    try {
      const asset=await service.uploadImage(await prepareImage(file),'item');
      setMedia([asset]);
      const [draftResult,bgResult]=await Promise.allSettled([
        service.draftListing({notes:'',photoPath:asset.path}),
        service.removeBackground(asset.path),
      ]);
      if(bgResult.status==='fulfilled') setMedia([bgResult.value]);
      if(draftResult.status==='fulfilled') {
        const result=draftResult.value;
        applyDraftResult(result);
        setSignatureSuggestion(result.signature?.found && result.signature.box
          ? {photoPath:asset.path,photoUrl:asset.url,box:result.signature.box} : null);
      } else {
        setDraftNote("Our analysis didn't bring back much from this photo — fill in the details below.");
      }
    } catch(err) { setError(err.message); }
    finally { setProcessingPhoto(false); setStep('form'); }
  }
  // Manual re-run from inside the full form (after adding notes, or swapping the main photo) --
  // failures surface like any other action here, unlike the quiet step-1 attempt above.
  async function draftListing() {
    const photo=media.find(asset=>asset.kind==='item');
    if(!photo) return;
    setDrafting(true);setError('');
    try {
      const result=await service.draftListing({notes,photoPath:photo.path});
      applyDraftResult(result);
      setSignatureSuggestion(result.signature?.found && result.signature.box && !media.some(asset=>asset.kind==='signature')
        ? {photoPath:photo.path,photoUrl:photo.url,box:result.signature.box} : null);
    }
    catch(err){ setError(err.message); }
    finally{ setDrafting(false); }
  }
  async function acceptSignatureSuggestion() {
    if(!signatureSuggestion) return;
    setApplyingSuggestion(true);setError('');
    try {
      const bitmap=await createImageBitmap(await (await fetch(signatureSuggestion.photoUrl)).blob());
      const {x0,y0,x1,y1}=signatureSuggestion.box;
      const sx=Math.round(x0*bitmap.width), sy=Math.round(y0*bitmap.height);
      const sw=Math.max(1,Math.round((x1-x0)*bitmap.width)), sh=Math.max(1,Math.round((y1-y0)*bitmap.height));
      const canvas=document.createElement('canvas'); canvas.width=sw; canvas.height=sh;
      canvas.getContext('2d').drawImage(bitmap,sx,sy,sw,sh,0,0,sw,sh);
      bitmap.close();
      const cropped=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.9));
      if(!cropped) throw new Error('Could not crop the signature close-up.');
      const asset=await service.uploadImage(cropped,'signature');
      setMedia(prev=>[...prev.filter(x=>x.kind!=='signature'),asset]);
      setSignatureSuggestion(null);
    } catch(err){ setError(err.message); } finally { setApplyingSuggestion(false); }
  }
  // Resuming re-signs the saved paths (a stored signed URL could easily be past its 1-hour expiry
  // by the time someone comes back) rather than trusting whatever was saved alongside them.
  async function resumeDraft() {
    if(!draftPrompt) return;
    setResuming(true);setError('');
    try {
      const signed=await service.signMediaUrls(draftPrompt.media);
      setMedia(signed);
      if(draftPrompt.listingCategory && CATEGORIES.includes(draftPrompt.listingCategory)) setListingCategory(draftPrompt.listingCategory);
      setListingType(draftPrompt.listingType==='auction' ? 'auction' : 'fixed');
      setNotes(draftPrompt.notes || '');
      setCertificate(draftPrompt.certificate || {});
      setSignatureAi(draftPrompt.signatureAi || null);
      setPendingResume(draftPrompt.form || {});
      setDraftPrompt(null);
      setStep('form');
    } catch(err){ setError(err.message); } finally { setResuming(false); }
  }
  async function discardDraft() {
    if(!draftPrompt) return;
    setResuming(true);
    await Promise.all(draftPrompt.media.map(asset=>service.removeImage(asset.path).catch(()=>{})));
    clearListingDraft();
    setDraftPrompt(null);setResuming(false);
  }
  // Only fires once the form (title/description/attribute inputs) actually exists -- during the
  // photo step there is nothing to write into yet, so a pendingDraft set there waits here until
  // step flips to 'form' (bundled into the same batched update as setStep, so this re-fires right
  // after that render commits).
  useEffect(() => {
    if(!pendingDraft || step!=='form') return;
    const form=formRef.current;
    if(pendingDraft.title) form.elements.namedItem('title').value=pendingDraft.title;
    if(pendingDraft.description) form.elements.namedItem('description').value=pendingDraft.description;
    for(const [key,value] of Object.entries(pendingDraft.attributes)) { const field=form?.elements.namedItem('attribute:'+key); if(field) field.value=value; }
    const tagsField=form?.elements.namedItem('tags');
    if(tagsField && pendingDraft.tags.length) tagsField.value=pendingDraft.tags.join(', ');
    setPendingDraft(null);
  }, [pendingDraft, step]);
  useEffect(() => {
    if(!pendingResume || step!=='form') return;
    const form=formRef.current;
    const set=(name,value)=>{ const el=form?.elements.namedItem(name); if(el && value) el.value=value; };
    set('title',pendingResume.title); set('description',pendingResume.description); set('price',pendingResume.price);
    set('evidence',pendingResume.evidence); set('tags',pendingResume.tags);
    set('weight_oz',pendingResume.weight_oz); set('length_in',pendingResume.length_in);
    set('width_in',pendingResume.width_in); set('height_in',pendingResume.height_in);
    const shippingEl=form?.elements.namedItem('free_shipping'); if(shippingEl) shippingEl.checked=!!pendingResume.free_shipping;
    for(const [key,value] of Object.entries(pendingResume.attributes||{})) { const field=form?.elements.namedItem('attribute:'+key); if(field && value) field.value=value; }
    setPendingResume(null);
  }, [pendingResume, step]);
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
    // Unlike before, closing no longer deletes the uploaded photos -- it saves them as a resumable
    // draft instead, so an accidental exit doesn't cost a re-upload and a re-paid AI draft/
    // background-removal call. Relist is excluded: it re-copies a fresh set of photos every time
    // it's opened (its own useEffect above) and never gets a resume prompt, so its copies would
    // just orphan silently in storage instead -- keep the original delete-on-close for that path.
    if(!relistFrom && media.length) saveListingDraft({media,listingCategory,listingType,notes,certificate,signatureAi,form:readFormValues(formRef.current)});
    else if(relistFrom) for(const asset of media) await service.removeImage(asset.path).catch(()=>{});
    onClose();
  }
  async function submit(event) {
    event.preventDefault(); if (working) return;
    setBusy(true); setError('');
    try {
      if(certificates.length && !certificate.certificate_issuer) throw new Error('Choose the issuer for your certificate photos.');
      if(certificate.certificate_issuer && !confirmed) throw new Error('Confirm the certificate details before publishing.');
      let finalMedia=media;
      const mainPhoto=finalMedia.find(asset=>asset.kind==='item');
      if(!mainPhoto) throw new Error('Add at least one item photo.');
      if(!mainPhotoBackgroundRemoved(finalMedia)) {
        try {
          const replaced=await service.removeBackground(mainPhoto.path);
          finalMedia=finalMedia.map(asset=>asset.path===mainPhoto.path?replaced:asset);
          setMedia(finalMedia);
        } catch { /* Photoroom unavailable right now -- publish with the original photo; the retry-background-removal job picks it up automatically. */ }
      }
      const form = Object.fromEntries(new FormData(event.currentTarget));
      const attributes = Object.fromEntries(Object.entries(form).filter(([key])=>key.startsWith('attribute:')).map(([key,value])=>[key.slice(10),value]));
      const id = await service.createListing({ ...form, attributes, ...certificate, media: finalMedia, price_cents: priceInCents(form.price), listing_type: listingType, auction_days: form.auction_days, signature_ai_label: signatureAi?.label, signature_ai_note: signatureAi?.note });
      clearListingDraft();
      // Best-effort: the listing is already published, so a failure here shouldn't block the seller — but it should be visible for debugging.
      if (relistFrom?.purchase_id) service.markListingRelisted(id, relistFrom.purchase_id).catch(err => console.warn('Could not record relist provenance:', err.message));
      onCreated(id);
    } catch (err) { setError(err.message); setBusy(false); }
  }
  if (!relistFrom && draftPrompt) return <Modal title="Resume your listing?" onClose={close}>
    <div className="ai-photo-step">
      <p className="muted">You have an unfinished listing from earlier, with its photo and any AI-drafted details already saved. Pick up where you left off, or discard it and start fresh.</p>
      <div className="submit-row">
        <button type="button" className="primary" onClick={resumeDraft} disabled={resuming}>{resuming ? 'Resuming…' : 'Resume draft'}</button>
        <button type="button" className="text-button" onClick={discardDraft} disabled={resuming}>Discard and start over</button>
      </div>
      {error && <p role="alert" className="error">{error}</p>}
    </div>
  </Modal>;
  if (!relistFrom && step==='photo') return <Modal title="Create a listing" onClose={close}>
    <div className="ai-photo-step">
      <img src="/brand/king-credion-scan-baseball-v1.png" alt="" className="ai-photo-step-hero"/>
      <p className="muted">AI reads your photo and drafts the listing for you — title, description, category, even a signature close-up if it spots one. Add a photo to get started; you can always fill in details yourself.</p>
      <label>Add your main photo<input type="file" accept="image/jpeg,image/png,image/webp" disabled={processingPhoto} onChange={uploadMainPhoto}/></label>
      {processingPhoto && <p role="status" className="field-note">Analyzing your photo…</p>}
      {error && <p role="alert" className="error">{error}</p>}
    </div>
  </Modal>;
  return <Modal title={relistFrom ? 'Relist this item' : 'Create a listing'} onClose={close}>
    <p className="muted">{relistFrom ? 'Details, tags and certificate info carried over from your purchase. Review everything and set your own price.' : 'Review what AI filled in and add anything it missed.'}</p>
    {copyingPhotos && <p role="status" className="field-note">Copying photos to your own listing…</p>}
    {draftApplied && <p className="field-note bg-removed-ok">AI filled in the details from your photo — review everything before publishing. <button type="button" className="text-button" onClick={()=>setDraftApplied(false)}>Dismiss</button></p>}
    {draftNote && <p className="field-note">{draftNote} <button type="button" className="text-button" onClick={()=>setDraftNote('')}>Dismiss</button></p>}
    <form ref={formRef} onSubmit={submit} className="form-stack">
      <label>Item title<input name="title" placeholder="What are you sharing?" minLength={4} maxLength={120} required autoFocus/></label>
      <MediaPicker service={service} media={media} onChange={next=>{setMedia(next);setSuggestion(null);setConfirmed(false);setSignatureAi(null);}} busy={working} onBusy={setUploading} onError={setError}/>
      {signatureSuggestion && <div className="evidence-box"><h3>Signature detected</h3>
        <p className="field-note">Your item photo appears to show a signature. Use this cropped close-up instead of uploading a separate photo?</p>
        <button type="button" className="text-button" onClick={acceptSignatureSuggestion} disabled={working}>{applyingSuggestion ? 'Cropping…' : 'Use this as my signature close-up'}</button>
        <button type="button" className="text-button" onClick={()=>setSignatureSuggestion(null)} disabled={working}>Not a signature</button>
      </div>}
      {signaturePhoto && <div className="evidence-box"><h3>Signature AI opinion</h3>
        {signatureAi ? <p className="field-note">{LABELS_AI[signatureAi.label]} — {signatureAi.note}</p> : <p className="field-note">Get a plain-language opinion on this signature — not a forensic authentication, and it improves as our signature library grows.</p>}
        <button type="button" className="text-button" onClick={reviewSignature} disabled={working}>{reviewingSignature ? 'Reviewing…' : signatureAi ? 'Review again' : 'Get AI opinion'}</button>
      </div>}
      <label>Notes for AI <span className="optional">optional</span><textarea value={notes} onChange={event=>setNotes(event.target.value)} rows={3} maxLength={2000} placeholder="Add anything the photo won't show — who made it, when, condition, provenance…" disabled={working}/></label>
      <button type="button" className="text-button" onClick={draftListing} disabled={working || !media.some(asset=>asset.kind==='item')}>{drafting ? 'Drafting…' : 'Regenerate with AI'}</button>
      {!relistFrom && <div className="categories" aria-label="Listing type"><button type="button" aria-pressed={listingType==='fixed'} className={listingType==='fixed' ? 'active' : ''} onClick={()=>setListingType('fixed')}>Fixed price</button><button type="button" aria-pressed={listingType==='auction'} className={listingType==='auction' ? 'active' : ''} onClick={()=>setListingType('auction')}>Auction</button></div>}
      <div className="form-row">
        <label>Category<select name="category" value={listingCategory} onChange={event=>setListingCategory(event.target.value)}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></label>
        <label>{listingType==='auction' ? 'Starting bid (USD)' : 'Price (USD)'}<input name="price" type="number" min="1" max="1000000" step="0.01" placeholder="125.00" required/></label>
      </div>
      {listingType==='auction' && <label>Auction length<select name="auction_days" defaultValue="5"><option value="3">3 days</option><option value="5">5 days</option><option value="7">7 days</option></select></label>}
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
  const [signatureAi,setSignatureAi]=useState(item.signature_ai_label?{label:item.signature_ai_label,note:item.signature_ai_note}:null),[reviewingSignature,setReviewingSignature]=useState(false);
  const reviewed=item.audit_count>0;
  const working=saving||uploading||reviewingSignature;
  const signaturePhoto=media.find(asset=>asset.kind==='signature');
  async function reviewSignature() {
    setReviewingSignature(true);setError('');
    try {const result=await service.analyzeSignature(signaturePhoto.path);setSignatureAi(result);}
    catch(err){setError(err.message);}finally{setReviewingSignature(false);}
  }
  const certificateChanged=certificate.certificate_issuer!==(item.certificate_issuer||'')||certificate.certificate_number!==(item.certificate_number||'')||certificate.certificate_company!==(item.certificate_company||'');
  async function submit(event) {
    event.preventDefault();if(working)return;
    const form=Object.fromEntries(new FormData(event.currentTarget));
    setSaving(true);setError('');
    try{
      if(certificate.certificate_issuer && certificateChanged && !confirmed) throw new Error('Confirm the certificate details before saving.');
      let finalMedia=media;
      if(mediaTouched) {
        const mainPhoto=finalMedia.find(asset=>asset.kind==='item');
        if(!mainPhoto) throw new Error('Add at least one item photo.');
        if(!mainPhotoBackgroundRemoved(finalMedia)) {
          try {
            const replaced=await service.removeBackground(mainPhoto.path);
            finalMedia=finalMedia.map(asset=>asset.path===mainPhoto.path?replaced:asset);
            setMedia(finalMedia);
          } catch { /* Photoroom unavailable right now -- save with the original photo; the retry-background-removal job picks it up automatically. */ }
        }
      }
      await service.editListing(item,{...form,...certificate,media:finalMedia,price_cents:priceInCents(form.price),signature_ai_label:signatureAi?.label,signature_ai_note:signatureAi?.note},mediaTouched);
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
      <MediaPicker service={service} media={media} onChange={next=>{setMedia(next);setMediaTouched(true);setSignatureAi(null);}} busy={working} onBusy={setUploading} onError={setError}/>
      {signaturePhoto && <div className="evidence-box"><h3>Signature AI opinion</h3>
        {signatureAi ? <p className="field-note">{LABELS_AI[signatureAi.label]} — {signatureAi.note}</p> : <p className="field-note">Get a plain-language opinion on this signature — not a forensic authentication, and it improves as our signature library grows.</p>}
        <button type="button" className="text-button" onClick={reviewSignature} disabled={working}>{reviewingSignature ? 'Reviewing…' : signatureAi ? 'Review again' : 'Get AI opinion'}</button>
      </div>}
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
    ['Credion Coins', money(credit || 0)],
  ];
  // Only ever non-null for the platform operator's own account -- operator_open_dispute_count()
  // self-gates server-side, so this tile is real access control, not just hidden in the UI.
  if (openDisputes !== null) rows.push(['Open disputes', openDisputes]);
  return <div className="stat-grid">{rows.map(([label, value]) => <div key={label} className={label === 'Credion Coins' ? 'evidence-box coin-tile' : 'evidence-box'}><span className="field-note">{label}</span><strong>{value}</strong></div>)}</div>;
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

const REQUIRED_ADDRESS_FIELDS = ['street1', 'city', 'state', 'zip', 'country'];

function ShippingAddressFields({ value, onChange, disabled, onVerifiedChange }) {
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState('');
  const [verification, setVerification] = useState(null);
  const [resolved, setResolved] = useState(false);
  useEffect(() => { onVerifiedChange?.(resolved); }, [resolved]);
  const set = key => event => { onChange({ ...value, [key]: event.target.value }); setVerification(null); setResolved(false); };
  const canVerify = REQUIRED_ADDRESS_FIELDS.every(key => value[key]?.trim());
  const differs = verification && REQUIRED_ADDRESS_FIELDS.concat('street2').some(key => (verification.suggested[key] || '').trim().toLowerCase() !== (value[key] || '').trim().toLowerCase());
  async function verify() {
    setVerifying(true); setVerifyError(''); setVerification(null); setResolved(false);
    try {
      const result = await service.validateAddress(value);
      setVerification(result);
      const stillDiffers = REQUIRED_ADDRESS_FIELDS.concat('street2').some(key => (result.suggested[key] || '').trim().toLowerCase() !== (value[key] || '').trim().toLowerCase());
      if (!stillDiffers) setResolved(true);
    }
    catch (err) { setVerifyError(err.message); }
    finally { setVerifying(false); }
  }
  function useSuggested() { onChange({ ...value, ...verification.suggested }); setVerification(null); setResolved(true); }
  function keepAsEntered() { setVerification(null); setResolved(true); }
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
    <button type="button" className="text-button" onClick={verify} disabled={disabled || verifying || !canVerify}><ShieldCheck size={16}/>{verifying ? 'Checking…' : 'Verify address'}</button>
    {verifyError && <p role="alert" className="error">{verifyError}</p>}
    {verification && !differs && <p className="field-note bg-removed-ok">{verification.is_valid ? '✓ Address verified.' : 'Checked — no standardized match found. Double-check for typos, or continue if you\'re sure it\'s correct.'}</p>}
    {resolved && !verification && <p className="field-note bg-removed-ok">✓ Ready to continue.</p>}
    {verification && differs && <div className="evidence-box">
      <p className="field-note">{verification.is_valid ? 'We found a standardized match:' : 'Closest match found (unconfirmed) — double-check before using it:'}</p>
      <p>{verification.suggested.street1}{verification.suggested.street2 ? `, ${verification.suggested.street2}` : ''}<br/>{verification.suggested.city}, {verification.suggested.state} {verification.suggested.zip}</p>
      <div className="form-row">
        <button type="button" className="primary" disabled={disabled} onClick={useSuggested}>Use this address</button>
        <button type="button" className="text-button" disabled={disabled} onClick={keepAsEntered}>Keep as entered</button>
      </div>
    </div>}
    {!resolved && !verifying && <p className="field-note">Verify your address above before continuing.</p>}
  </>;
}

function ShippingSettings({ profile }) {
  const [address, setAddress] = useState(profile?.shipping_address || {});
  const [saving, setSaving] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(false);
  const [verified, setVerified] = useState(false);
  async function submit(event) {
    event.preventDefault(); if (saving || !verified) return;
    setSaving(true); setError(''); setSaved(false);
    try { await service.saveShippingAddress(address); setSaved(true); }
    catch (err) { setError(err.message); } finally { setSaving(false); }
  }
  return <div className="evidence-box"><h3>Shipping address</h3>
    <p className="field-note">Used as your return address when you sell, and to pre-fill checkout when you buy. You can still edit it for any specific order.</p>
    <form className="form-stack" onSubmit={submit}>
      <ShippingAddressFields value={address} onChange={value => { setAddress(value); setSaved(false); }} disabled={saving} onVerifiedChange={setVerified}/>
      {error && <p role="alert" className="error">{error}</p>}
      <button className="primary" disabled={saving || !verified}>{saving ? 'Saving…' : saved ? 'Saved' : 'Save address'}</button>
    </form>
  </div>;
}

function CheckoutAddress({ item, profile, busy, onClose, onConfirm }) {
  const [address, setAddress] = useState(profile?.shipping_address || {});
  const [error, setError] = useState('');
  const [balance, setBalance] = useState(null);
  const [applyCredit, setApplyCredit] = useState(false);
  const [wantInsurance, setWantInsurance] = useState(true);
  const [verified, setVerified] = useState(false);
  useEffect(() => { service.myCreditBalance().then(setBalance).catch(() => {}); }, []);
  // Mirrors reserve_listing_checkout()'s own cap -- the server re-validates and clamps this
  // regardless, this is just so the buyer sees an accurate number before submitting.
  const coinCap = Math.round(item.price_cents * 0.5);
  const creditToApply = applyCredit && balance ? Math.min(balance, coinCap) : 0;
  function submit(event) {
    event.preventDefault();
    const required = ['name', 'street1', 'city', 'state', 'zip', 'country'];
    if (required.some(key => !address[key]?.trim())) { setError('Fill in all required address fields.'); return; }
    if (!verified) { setError('Verify your address before continuing.'); return; }
    onConfirm(address, creditToApply, wantInsurance);
  }
  return <Modal title="Confirm shipping address" onClose={onClose}>
    <p className="muted">Where should "{item.title}" be shipped? This is for this order only — your saved default lives in Profile settings.</p>
    <form className="form-stack" onSubmit={submit}>
      <ShippingAddressFields value={address} onChange={setAddress} disabled={busy} onVerifiedChange={setVerified}/>
      {!!balance && <label className="certificate-confirm"><input type="checkbox" checked={applyCredit} onChange={event => setApplyCredit(event.target.checked)} disabled={busy}/><img src="/brand/credion-coin-simple-v1.png" alt="" className="coin-icon"/>Apply {money(Math.min(balance, coinCap))} in Credion Coins to this order (you have {money(balance)} available)</label>}
      <label className="certificate-confirm"><input type="checkbox" checked={wantInsurance} onChange={event => setWantInsurance(event.target.checked)} disabled={busy}/>Insure this item for shipping (covers loss or damage in transit — exact cost shown at payment)</label>
      {error && <p role="alert" className="error">{error}</p>}
      <button className="primary" disabled={busy || !verified}>{busy ? 'Processing…' : 'Continue to payment'}<ArrowRight size={16}/></button>
    </form>
  </Modal>;
}

function ReportModal({ targetType, targetId, onClose }) {
  const [reason, setReason] = useState('Prohibited or misleading item');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [done, setDone] = useState(false);
  async function submit(event) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError('');
    try { await service.reportContent(targetType, targetId, reason, details); setDone(true); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <Modal title={targetType === 'listing' ? 'Report this listing' : 'Report this user'} onClose={onClose}>
    {done ? <p role="status">Thanks — our team will review this.</p> : <form className="form-stack" onSubmit={submit}>
      <label>Reason<select value={reason} onChange={event => setReason(event.target.value)} disabled={busy}>
        <option>Prohibited or misleading item</option><option>Suspected counterfeit</option><option>Harassment or abuse</option><option>Spam</option><option>Something else</option>
      </select></label>
      <label>Details (optional)<textarea value={details} onChange={event => setDetails(event.target.value)} rows={3} maxLength={2000} disabled={busy}/></label>
      {error && <p role="alert" className="error">{error}</p>}
      <button className="primary" disabled={busy}>{busy ? 'Sending…' : 'Submit report'}</button>
    </form>}
  </Modal>;
}

function ReportButton({ targetType, targetId, label }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className="text-button" onClick={() => setOpen(true)}><Flag size={16}/>{label}</button>
    {open && <ReportModal targetType={targetType} targetId={targetId} onClose={() => setOpen(false)}/>}
  </>;
}

function BlockSellerButton({ sellerId }) {
  const [blocked, setBlocked] = useState(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { let alive = true; service.myBlockedUsers().then(list => { if (alive) setBlocked(list.some(b => b.user_id === sellerId)); }).catch(() => { if (alive) setBlocked(false); }); return () => { alive = false; }; }, [sellerId]);
  async function toggle() {
    setBusy(true); setError('');
    try { if (blocked) { await service.unblockUser(sellerId); setBlocked(false); } else { await service.blockUser(sellerId); setBlocked(true); } }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <span>
    <button type="button" className="text-button" onClick={toggle} disabled={busy || blocked === null}>{blocked ? 'Unblock seller' : 'Block seller'}</button>
    {error && <span role="alert" className="error">{error}</span>}
  </span>;
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

function auctionTimeLeft(endsAt) {
  const ms = new Date(endsAt) - new Date();
  if (ms <= 0) return 'Auction ended';
  const days = Math.floor(ms / 86400000), hours = Math.floor((ms % 86400000) / 3600000);
  if (days > 0) return `${days}d ${hours}h left`;
  const minutes = Math.floor((ms % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${minutes}m left`;
  return `${minutes}m left`;
}

function AuctionBidBox({ item, onBid }) {
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ended = new Date(item.auction_ends_at) <= new Date();
  const minimum = item.bid_count === 0 ? item.price_cents : item.price_cents + 100;
  async function submit(event) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError('');
    try { await service.placeBid(item.id, priceInCents(amount)); setAmount(''); onBid(); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  if (ended) return <p role="status" className="field-note">This auction has ended and is being settled — check back shortly.</p>;
  return <form className="form-stack" onSubmit={submit}>
    <div className="form-row">
      <label>Your bid <span className="optional">min {money(minimum)}</span><input type="number" min={(minimum/100).toFixed(2)} step="0.01" value={amount} onChange={event=>setAmount(event.target.value)} required disabled={busy}/></label>
      <button className="primary" disabled={busy}>{busy ? 'Placing…' : 'Place bid'}<ArrowRight size={16}/></button>
    </div>
    {error && <p role="alert" className="error">{error}</p>}
  </form>;
}

function SellerRatingForm({ item, onRated }) {
  const [rating, setRating] = useState(item.my_rating || 0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState(item.my_rating_comment || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(!item.my_rating);
  async function submit(event) {
    event.preventDefault(); if (busy || !rating) return;
    setBusy(true); setError('');
    try { await service.rateSeller(item.purchase_id, rating, comment); setEditing(false); onRated(); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  if (!editing) return <div className="evidence-box">
    <h3><Star size={18}/>Your rating</h3>
    <RatingStars value={item.my_rating} size={18}/>
    {item.my_rating_comment && <p>{item.my_rating_comment}</p>}
    <button type="button" className="text-button" onClick={() => setEditing(true)}>Edit your rating</button>
  </div>;
  return <form className="form-stack evidence-box" onSubmit={submit}>
    <h3><Star size={18}/>Rate this seller</h3>
    <div className="star-picker" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map(n => <button type="button" key={n} aria-label={`${n} star${n > 1 ? 's' : ''}`} aria-pressed={rating === n}
        onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)} onClick={() => setRating(n)}>
        <Star size={22} fill={n <= (hover || rating) ? 'currentColor' : 'none'}/>
      </button>)}
    </div>
    <label>Comment (optional)<textarea value={comment} onChange={e => setComment(e.target.value)} rows={2} maxLength={500} placeholder="How was your experience with this seller?" disabled={busy}/></label>
    {error && <p role="alert" className="error">{error}</p>}
    <div className="form-row">
      <button className="primary" disabled={busy || !rating}>{busy ? 'Saving…' : 'Submit rating'}</button>
      {item.my_rating ? <button type="button" className="text-button" onClick={() => setEditing(false)}>Cancel</button> : null}
    </div>
  </form>;
}

function BuyRequestCard({ request, onResolved }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function respond(available) {
    setBusy(true); setError('');
    try { await service.respondToBuyRequest(request.id, available); onResolved(request.id); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <div className="item-card"><ItemArt photo={request.media?.find(asset => asset.kind === 'item')?.url}/><div className="item-card-content">
    <div className="card-meta"><span>{request.buyer_name} wants to buy this</span></div>
    <h3>{request.title}</h3>
    <div className="card-bottom"><strong>{money(request.price_cents)}</strong></div>
    {error && <p role="alert" className="error">{error}</p>}
    <div className="submit-row">
      <button type="button" className="primary" disabled={busy} onClick={() => respond(true)}>{busy ? 'Working…' : 'Still available'}</button>
      <button type="button" className="text-button" disabled={busy} onClick={() => respond(false)}>No longer available</button>
    </div>
  </div></div>;
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

function NotificationSettings() {
  const [status, setStatus] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { service.pushSubscriptionStatus().then(setStatus).catch(() => setStatus({ supported: false, subscribed: false })); }, []);
  async function toggle() {
    setBusy(true); setError('');
    try {
      if (status.subscribed) { await service.disableNotifications(); setStatus({ ...status, subscribed: false }); }
      else { await service.enableNotifications(); setStatus({ ...status, subscribed: true }); }
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  if (!status || !status.supported) return null;
  return <div className="evidence-box"><h3>Notifications</h3>
    <p className="field-note">{status.subscribed ? 'You’ll get a push notification here for new messages and refund updates.' : 'Turn on push notifications for new messages and refund updates on this device.'}</p>
    {error && <p role="alert" className="error">{error}</p>}
    <button type="button" className="text-button" onClick={toggle} disabled={busy}>{busy ? 'Working…' : status.subscribed ? 'Turn off notifications' : 'Enable notifications'}</button>
  </div>;
}

function AdminDisputeRow({ request, onResolve }) {
  const [amount, setAmount] = useState(''), [note, setNote] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function act(action) {
    setBusy(true); setError('');
    const cents = action === 'partial' ? Math.round(parseFloat(amount) * 100) : undefined;
    try { await onResolve(request.id, action === 'partial' ? 'approve' : action, cents, note); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <div className="evidence-box">
    <div className="admin-row-head"><span>{request.title} · {money(request.price_cents)}</span><span>{request.status}</span></div>
    <p><strong>{request.buyer_name}</strong> (buyer) vs <strong>{request.seller_name}</strong> (seller)</p>
    <p>{request.reason}</p>
    {request.seller_response && <p className="field-note">Seller said: {request.seller_response}</p>}
    <label>Refund amount — leave blank for the full {money(request.price_cents)}<input type="number" min="0.01" step="0.01" value={amount} onChange={event => setAmount(event.target.value)} disabled={busy} placeholder="Full amount"/></label>
    <label>Note (optional, kept on the record)<textarea value={note} onChange={event => setNote(event.target.value)} rows={2} maxLength={2000} disabled={busy}/></label>
    {error && <p role="alert" className="error">{error}</p>}
    <div className="form-row">
      <button type="button" className="primary" disabled={busy} onClick={() => act(amount ? 'partial' : 'approve')}>{busy ? 'Working…' : 'Approve refund'}</button>
      <button type="button" className="text-button danger-button" disabled={busy} onClick={() => act('deny')}>Deny</button>
    </div>
  </div>;
}

function AdminDisputes() {
  const [list, setList] = useState(undefined), [error, setError] = useState('');
  function load() { service.adminListRefundRequests().then(setList).catch(err => setError(err.message)); }
  useEffect(() => { load(); }, []);
  async function resolve(id, action, amountCents, note) { await service.adminResolveRefundRequest(id, action, amountCents, note); load(); }
  if (error) return <p role="alert" className="error">{error}</p>;
  if (list === undefined) return <p role="status">Loading disputes…</p>;
  const open = list.filter(r => !['refunded', 'denied'].includes(r.status));
  if (!open.length) return <p className="field-note">No open disputes.</p>;
  return <div className="admin-list">{open.map(r => <AdminDisputeRow key={r.id} request={r} onResolve={resolve}/>)}</div>;
}

function AdminReportRow({ report, onResolve }) {
  const [note, setNote] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function act(status, removeListing) {
    setBusy(true); setError('');
    try { await onResolve(report.id, status, note, removeListing); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <div className="evidence-box">
    <div className="admin-row-head"><span>{report.target_type} · reported by {report.reporter_name}</span><span>{report.status}</span></div>
    <p><strong>{report.reason}</strong></p>
    {report.details && <p className="field-note">{report.details}</p>}
    <label>Note (optional)<textarea value={note} onChange={event => setNote(event.target.value)} rows={2} maxLength={2000} disabled={busy}/></label>
    {error && <p role="alert" className="error">{error}</p>}
    <div className="form-row">
      <button type="button" className="text-button danger-button" disabled={busy} onClick={() => act('resolved', report.target_type === 'listing')}>{report.target_type === 'listing' ? 'Remove listing' : 'Resolve'}</button>
      <button type="button" className="text-button" disabled={busy} onClick={() => act('dismissed', false)}>Dismiss</button>
    </div>
  </div>;
}

function AdminReports() {
  const [list, setList] = useState(undefined), [error, setError] = useState('');
  function load() { service.adminListReports('open').then(setList).catch(err => setError(err.message)); }
  useEffect(() => { load(); }, []);
  async function resolve(id, status, note, removeListing) { await service.adminResolveReport(id, status, note, removeListing); load(); }
  if (error) return <p role="alert" className="error">{error}</p>;
  if (list === undefined) return <p role="status">Loading reports…</p>;
  if (!list.length) return <p className="field-note">No open reports.</p>;
  return <div className="admin-list">{list.map(r => <AdminReportRow key={r.id} report={r} onResolve={resolve}/>)}</div>;
}

function AdminSupportThread({ userId, onClosed }) {
  const [messages, setMessages] = useState(undefined), [body, setBody] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  function load() { service.adminGetSupportThread(userId).then(setMessages).catch(err => setError(err.message)); }
  useEffect(() => { load(); }, [userId]);
  async function submit(event) {
    event.preventDefault(); if (busy || !body.trim()) return;
    setBusy(true); setError('');
    try { await service.adminReplyToSupport(userId, body); setBody(''); load(); onClosed(); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <div className="evidence-box">
    <div className="support-thread">
      {messages === undefined ? <p role="status" className="field-note">Loading…</p>
        : messages.map(message => <div key={message.id} className="support-message"><div className="recorded"><div><strong>{message.role === 'user' ? 'Member' : message.role === 'operator' ? 'Credabilia Team' : 'King Credion'}</strong><p>{message.body}</p></div></div></div>)}
    </div>
    {error && <p role="alert" className="error">{error}</p>}
    <form className="form-row" onSubmit={submit}>
      <label>Reply<textarea value={body} onChange={event => setBody(event.target.value)} rows={2} maxLength={4000} disabled={busy}/></label>
      <button className="primary" disabled={busy || !body.trim()}>{busy ? 'Sending…' : 'Reply'}</button>
    </form>
  </div>;
}

function AdminSupport() {
  const [list, setList] = useState(undefined), [error, setError] = useState(''), [openUserId, setOpenUserId] = useState(null);
  function load() { service.adminListSupportConversations().then(setList).catch(err => setError(err.message)); }
  useEffect(() => { load(); }, []);
  if (error) return <p role="alert" className="error">{error}</p>;
  if (list === undefined) return <p role="status">Loading conversations…</p>;
  if (!list.length) return <p className="field-note">No support conversations yet.</p>;
  return <div className="admin-list">{list.map(c => <div key={c.user_id} className="evidence-box">
    <div className="admin-row-head"><span>{c.display_name}</span><span>{new Date(c.last_created_at).toLocaleString()}</span></div>
    <p className="field-note">{c.last_body}</p>
    <button type="button" className="text-button" onClick={() => setOpenUserId(openUserId === c.user_id ? null : c.user_id)}>{openUserId === c.user_id ? 'Hide thread' : 'Open thread'}</button>
    {openUserId === c.user_id && <AdminSupportThread userId={c.user_id} onClosed={load}/>}
  </div>)}</div>;
}

function AdminUsers() {
  const [search, setSearch] = useState(''), [list, setList] = useState(undefined), [error, setError] = useState('');
  useEffect(() => { const timer = setTimeout(() => { service.adminListUsers(search || null).then(setList).catch(err => setError(err.message)); }, 250); return () => clearTimeout(timer); }, [search]);
  return <div className="form-stack">
    <label>Search by name or email<input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search members…"/></label>
    {error && <p role="alert" className="error">{error}</p>}
    {list === undefined ? <p role="status">Loading members…</p> : <div className="admin-list">{list.map(u => <div key={u.id} className="evidence-box">
      <div className="admin-row-head"><span>{u.display_name}</span><span>Joined {new Date(u.created_at).toLocaleDateString()}</span></div>
      <p className="field-note">{u.email}</p>
      <p className="field-note">{u.listing_count} listings · {u.sales_count} sales · {u.purchase_count} purchases</p>
    </div>)}</div>}
  </div>;
}

function AdminDashboard() {
  const [tab, setTab] = useState('disputes');
  return <div className="form-stack">
    <div className="categories" role="group" aria-label="Admin sections">
      <button aria-pressed={tab === 'disputes'} className={tab === 'disputes' ? 'active' : ''} onClick={() => setTab('disputes')}>Disputes</button>
      <button aria-pressed={tab === 'reports'} className={tab === 'reports' ? 'active' : ''} onClick={() => setTab('reports')}>Reports</button>
      <button aria-pressed={tab === 'support'} className={tab === 'support' ? 'active' : ''} onClick={() => setTab('support')}>Support</button>
      <button aria-pressed={tab === 'users'} className={tab === 'users' ? 'active' : ''} onClick={() => setTab('users')}>Users</button>
    </div>
    {tab === 'disputes' && <AdminDisputes/>}
    {tab === 'reports' && <AdminReports/>}
    {tab === 'support' && <AdminSupport/>}
    {tab === 'users' && <AdminUsers/>}
  </div>;
}

function DeleteAccount({ onDeleted }) {
  const [confirming, setConfirming] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function confirmDelete() {
    setBusy(true); setError('');
    try { await service.deleteMyAccount(); onDeleted(); }
    catch (err) { setError(err.message); setBusy(false); }
  }
  return <div className="evidence-box">
    <h3>Delete account</h3>
    <p className="field-note">Permanently removes your profile and login. Purchase and sale records are kept for legal and tax purposes but are no longer linked to your name.</p>
    {error && <p role="alert" className="error">{error}</p>}
    {!confirming
      ? <button type="button" className="text-button danger-button" onClick={() => setConfirming(true)}>Delete my account</button>
      : <div className="form-row"><button type="button" className="primary danger" disabled={busy} onClick={confirmDelete}>{busy ? 'Deleting…' : 'Yes, delete my account'}</button><button type="button" className="text-button" disabled={busy} onClick={() => setConfirming(false)}>Cancel</button></div>}
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
  const isAdmin = session?.user?.email === 'kingcredion@credabilia.com';
  return <div className="form-stack">
    <div className="categories" role="group" aria-label="Profile sections">
      <button aria-pressed={tab === 'dashboard'} className={tab === 'dashboard' ? 'active' : ''} onClick={() => setTab('dashboard')}>Dashboard</button>
      <button aria-pressed={tab === 'settings'} className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}>Settings</button>
      {isAdmin && <button aria-pressed={tab === 'admin'} className={tab === 'admin' ? 'active' : ''} onClick={() => setTab('admin')}>Admin</button>}
    </div>
    {tab === 'dashboard' ? <DashboardStats/> : tab === 'admin' ? <AdminDashboard/> : <>
      <form className="form-stack" onSubmit={submit}>
        <label>Display name<input value={name} onChange={event=>setName(event.target.value)} minLength={1} maxLength={100} required/></label>
        <label>Email<input value={session?.user?.email || ''} readOnly disabled/></label>
        {error && <p role="alert" className="error">{error}</p>}
        <button className="primary" disabled={saving}>{saving ? 'Saving…' : 'Save name'}</button>
      </form>
      <StorefrontSettings profile={profile}/>
      <ShippingSettings profile={profile}/>
      <NotificationSettings/>
      <div className="evidence-box"><h3>Payouts</h3>
        {service.mode !== 'live' ? <p className="field-note">Coming soon. You'll be able to add bank details here before real checkout launches — nothing is collected yet.</p>
          : profile?.stripe_charges_enabled ? <><p className="field-note">Payments are connected. Your sales pay out to your own Stripe account.</p><button type="button" className="text-button" onClick={openDashboard} disabled={stripeBusy}>{stripeBusy ? 'Opening…' : 'Open your Stripe dashboard'}</button></>
          : profile?.stripe_details_submitted ? <p className="field-note">Stripe is still reviewing your account. Check back soon.</p>
          : <><p className="field-note">Connect a Stripe account to receive payouts before buyers can purchase your listings.</p><button type="button" className="text-button" onClick={connectStripe} disabled={stripeBusy}>{stripeBusy ? 'Opening…' : 'Connect payouts with Stripe'}</button></>}
        {stripeError && <p role="alert" className="error">{stripeError}</p>}
      </div>
      <DeleteAccount onDeleted={onSignOut}/>
    </>}
    <button type="button" className="text-button" onClick={onSignOut}><LogOut size={16}/>Sign out</button>
  </div>;
}

const VERDICT_NOTES = {
  authentic: 'Looks consistent with the description and evidence provided.',
  uncertain: "There isn't enough evidence here to reach a confident conclusion.",
  concerns: "Something here doesn't look right — see below.",
};
const LABELS_AI = { consistent: 'looks consistent', inconclusive: 'inconclusive', concerns: 'flagged a concern' };

function AuditQueue({ items, session, profile, onNeedLogin, onAudited }) {
  const [queue, setQueue] = useState(items);
  const [total] = useState(items.length);
  const [verdict, setVerdict] = useState(null);
  const [explanation, setExplanation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const current = queue[0];

  function advance() { setQueue(list => list.slice(1)); setVerdict(null); setExplanation(''); setError(''); }
  function pickChip(value) { setVerdict(value); setExplanation(VERDICT_NOTES[value]); setError(''); }

  async function submit(event) {
    event.preventDefault(); if (busy) return;
    if (!session) { onNeedLogin(); return; }
    if (!profile?.can_audit) { setError("Auditing isn't enabled for your account."); return; }
    if (!verdict) { setError('Choose a quick take below.'); return; }
    const clean = explanation.trim();
    if (clean.length < 20 || clean.length > 2000) { setError('Explain your reasoning in 20–2,000 characters.'); return; }
    setBusy(true); setError('');
    try { const result = await service.submitAudit(current.id, { verdict, explanation: clean }); onAudited(result); advance(); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  if (!current) return <div className="empty-state"><Layers size={34}/><h3>You're all caught up.</h3><p>New items will show up here as sellers publish them.</p></div>;

  const signaturePhoto = current.media?.find(asset => asset.kind === 'signature');
  return <div className="form-stack audit-queue">
    <div className="queue-progress"><span>Item {total - queue.length + 1} of {total}</span><div className="queue-progress-bar"><div style={{ width: `${((total - queue.length) / total) * 100}%` }}/></div></div>
    <div className="evidence-box">
      {current.media?.some(asset => asset.kind === 'item') ? <PhotoGallery key={current.id} media={current.media} title={current.title}/> : <ItemArt kind={current.artwork} category={current.category} large/>}
      <span className="pill">{current.category}</span>
      <h3>{current.title}</h3>
      <p className="detail-price">{money(current.price_cents)}</p>
      <p>{current.description}</p>
      <p className="field-note">{current.evidence || 'No evidence notes provided.'}</p>
    </div>
    <div className="form-row">
      <div className="evidence-box">
        <p className="field-note">Signature close-up</p>
        {signaturePhoto ? <>
          <PhotoGallery media={current.media} kind="signature" title={current.title}/>
          {current.signature_ai_label ? <p className="field-note">AI opinion: {LABELS_AI[current.signature_ai_label]} — not verified. {current.signature_ai_note} Gets better as Credabilia's signature library grows.</p> : <p className="field-note">No AI opinion recorded yet.</p>}
        </> : <p className="field-note">No signature photo provided.</p>}
      </div>
      <CertificateDetails item={current}/>
    </div>
    {!session ? <button type="button" className="primary" onClick={onNeedLogin}>Sign in to audit <ArrowRight size={16}/></button>
      : !profile ? <p role="status">Loading your account…</p>
      : !profile.can_audit ? <p className="field-note">Auditing isn't enabled for your account.</p>
      : <form onSubmit={submit} className="form-stack">
          <fieldset><legend>Quick take</legend>
            <div className="verdicts">{Object.entries(LABELS).map(([value, label]) => <label key={value}><input type="radio" name="verdict" checked={verdict === value} onChange={() => pickChip(value)} disabled={busy}/>{label}</label>)}</div>
          </fieldset>
          <label>Explain your reasoning<textarea value={explanation} onChange={event => setExplanation(event.target.value)} rows={3} maxLength={2000} placeholder="Point to a specific detail, explain your concern, or describe what evidence is missing…" disabled={busy}/></label>
          {error && <p role="alert" className="error">{error}</p>}
          <div className="submit-row">
            <button type="button" className="text-button" disabled={busy} onClick={advance}>Pass</button>
            <button className="primary" disabled={busy}>{busy ? 'Recording…' : 'Submit and next'}<ArrowRight size={16}/></button>
          </div>
        </form>}
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
  // /terms, /privacy, and /help are standalone, no-login-required pages -- checked before
  // storefrontSlug so they can never be shadowed by a seller's store name (also reserved server-side).
  const legalPage = window.location.pathname === '/terms' ? 'terms' : window.location.pathname === '/privacy' ? 'privacy' : window.location.pathname === '/help' ? 'help' : null;
  const [session, setSession] = useState(null), [authReady, setAuthReady] = useState(false), [profile, setProfile] = useState(null);
  const [workspace, setWorkspace] = useState('collector'), [items, setItems] = useState([]), [audits, setAudits] = useState([]);
  const [category, setCategory] = useState('All items'), [query, setQuery] = useState(''), [selectedId, setSelectedId] = useState(null);
  const [modal, setModal] = useState(null), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [favoriteIds, setFavoriteIds] = useState([]), [purchases, setPurchases] = useState([]), [collectionFilter, setCollectionFilter] = useState('all');
  const [sales, setSales] = useState([]), [sellerTab, setSellerTab] = useState('active');
  const [buyRequests, setBuyRequests] = useState([]), [sellerBuyRequests, setSellerBuyRequests] = useState([]);
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
  // Warm the browser cache for the two hero images the visitor hasn't seen yet, so switching
  // workspaces swaps instantly instead of popping in after a network fetch the first time.
  useEffect(() => {
    if (storefrontSlug || legalPage) return;
    for (const key of Object.keys(HERO_IMAGES)) { if (key !== 'collector') { const img = new Image(); img.src = HERO_IMAGES[key].src; } }
  }, []);
  useEffect(() => {
    if (service.mode === 'unconfigured' || storefrontSlug || legalPage) return;
    let alive = true; setLoading(true);
    Promise.all([service.listings(), session ? service.profile(session.user.id) : null, session ? service.myAudits() : [], session ? service.myFavoriteIds() : [], session ? service.myPurchases() : [], session ? service.mySales() : [], session ? service.myNotifications() : [], session ? service.myOpenBuyRequests() : [], session ? service.myBuyRequests() : []])
      .then(([listings, account, myAudits, favorites, myPurchases, mySales, myNotifications, myOpenBuyRequests, myBuyRequests]) => { if (alive) { setItems(listings); setProfile(account); setAudits(myAudits); setFavoriteIds(favorites); setPurchases(myPurchases); setSales(mySales); setNotifications(myNotifications); setBuyRequests(myOpenBuyRequests); setSellerBuyRequests(myBuyRequests); } })
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
      // A listing under an open buy request is 'pending', not 'active', so it won't be in items --
      // check buyRequests too so a push notification's deep link still resolves after a fresh load.
      if (items.some(item => item.id === itemId) || buyRequests.some(r => r.listing_id === itemId)) { setSelectedId(itemId); window.history.replaceState({}, '', window.location.pathname); }
    }
  }, [items]);
  if (service.mode === 'unconfigured') return <main className="setup"><div className="brand"><Brand/></div><h1>The new foundation is ready to connect.</h1><p>Configure your Supabase project URL and public publishable key to enable email sign-in. Local development also includes a separate sample workspace.</p><p>See README.md for the Supabase setup steps. No real accounts are active in this build yet.</p></main>;
  if (legalPage === 'terms') return <TermsPage/>;
  if (legalPage === 'privacy') return <PrivacyPage/>;
  if (legalPage === 'help') return <HelpPage/>;
  if (storefrontSlug) return <Storefront slug={storefrontSlug} service={service} onBack={() => { window.location.href = '/'; }}/>;

  const selected = items.find(item => item.id === selectedId);
  const ownedItem = !selected ? purchases.find(item => item.id === selectedId) : null;
  const pendingBuy = !selected && !ownedItem ? buyRequests.find(r => r.listing_id === selectedId) : null;
  const myRequest = buyRequests.find(r => r.listing_id === selected?.id);
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
    else if (n.kind === 'buy_request_pending') { setWorkspace('seller'); setSellerTab('requests'); setSelectedId(null); }
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
  async function requestToBuy(listingId) {
    if (!session) { setModal('login'); return; }
    setBusy(true); setError('');
    try {
      const r = await service.requestToBuy(listingId);
      setBuyRequests(list => [...list.filter(x => x.listing_id !== listingId), { ...r, title: selected?.title, category: selected?.category, price_cents: selected?.price_cents, media: selected?.media }]);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  async function respondToBuyRequestAction(requestId, available) {
    setBusy(true); setError('');
    try {
      await service.respondToBuyRequest(requestId, available);
      setSellerBuyRequests(list => list.filter(r => r.id !== requestId));
      setNotice(available ? 'The buyer has been notified — they can now complete checkout.' : 'The buyer has been notified this item is no longer available.');
    } catch (err) { setError(err.message); } finally { setBusy(false); }
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
      <div className="account-actions"><button className="text-button sell-top" onClick={openCreate}><Plus size={16}/>List an item</button><ThemeToggle/>{session && <button className="icon-button king-credion-button" aria-label="Ask King Credion" title="Ask King Credion" onClick={() => setModal('support')}><img src="/brand/king-credion-chat-icon-ai.png" alt="" style={{objectFit:'contain'}}/></button>}{session && <NotificationBell notifications={notifications} onNavigate={focusNotification}/>}{session ? <><button className="avatar" aria-label="Profile and settings" title={profile?.display_name} onClick={() => setModal('profile')}>{profile?.display_name?.slice(0,1) || 'C'}</button><button className="icon-button" aria-label="Sign out" title="Sign out" onClick={signOut}><LogOut size={18}/></button></> : <button className="primary compact" onClick={() => setModal('login')} disabled={!authReady}>Sign in <ArrowUpRight size={16}/></button>}</div>
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
        {workspace === 'auditor' ? <>
          <section className="hero"><div className="hero-copy"><p className="eyebrow"><span className="small-line"/>OBSERVATION OVER ASSUMPTION</p><h1>Look closer.<br/><em>Share what you see.</em></h1><p>Help collectors make informed decisions. Review evidence, explain your reasoning, and keep learning.</p></div><div className="hero-mascot"><img src={HERO_IMAGES.auditor.src} width={HERO_IMAGES.auditor.width} height={HERO_IMAGES.auditor.height} alt={HERO_IMAGES.auditor.alt}/></div></section>
          <AuditQueue key={session?.user?.id || 'anon'} items={filtered} session={session} profile={profile} onNeedLogin={() => setModal('login')} onAudited={result => { setNotice(result.xp_earned ? 'Audit recorded. +5 participation XP.' : 'Your audit is already recorded.'); refresh(); }}/>
        </> : selected ? <>
          <button className="back-button" onClick={() => setSelectedId(null)}><ArrowLeft size={17}/>Back to listings</button>
          {own && profile?.can_sell && <button className="text-button" onClick={()=>setModal('edit')}>Edit listing</button>}
          {session && !own && <button className="text-button" onClick={()=>toggleFavorite(selected.id)}><Heart size={16} fill={favoriteIds.includes(selected.id) ? 'currentColor' : 'none'}/>{favoriteIds.includes(selected.id) ? 'Saved' : 'Save to collection'}</button>}
          {session && !own && <ReportButton targetType="listing" targetId={selected.id} label="Report listing"/>}
          {session && !own && <BlockSellerButton sellerId={selected.seller_id}/>}
          <div className="detail-grid"><div>{selected.media?.some(asset=>asset.kind==='item') ? <PhotoGallery key={selected.id} media={selected.media} title={selected.title}/> : <ItemArt kind={selected.artwork} category={selected.category} large/>}<PhotoGallery key={selected.id+'cert'} media={selected.media} kind="certificate" title={selected.title}/></div><section className="item-info"><span className="pill">{selected.category}</span><h1>{selected.title}</h1><p className="seller-name">Shared by {selected.seller_name}{selected.seller_rating_count > 0 && <> · <RatingStars value={selected.seller_rating_avg} count={selected.seller_rating_count}/></>} · Member since {new Date(selected.seller_member_since).getFullYear()}{selected.seller_sales_count > 0 && <> · {selected.seller_sales_count} {selected.seller_sales_count === 1 ? 'sale' : 'sales'}</>}</p><p className="detail-price">{money(selected.price_cents)}</p>{selected.listing_type==='auction' && <p className="field-note">{selected.bid_count} {selected.bid_count===1?'bid':'bids'} · {auctionTimeLeft(selected.auction_ends_at)}</p>}{session && !own && <>{service.mode==='live' && !selected.seller_charges_enabled && <p className="field-note">This seller hasn't finished payment setup yet.</p>}{myRequest?.status==='confirmed' ? <><p className="field-note">{selected.listing_type==='auction' ? 'You won this auction!' : 'The seller confirmed this is still available.'}</p><button className="primary" disabled={busy} onClick={()=>setModal('checkout-address')}>Continue to checkout<ArrowRight size={16}/></button></> : myRequest?.status==='pending' ? <p role="status" className="field-note">Waiting for the seller to confirm this item is still available…</p> : selected.listing_type==='auction' ? <AuctionBidBox item={selected} onBid={refresh}/> : <button className="primary" disabled={busy || (service.mode==='live' && !selected.seller_charges_enabled)} onClick={()=>requestToBuy(selected.id)}>{busy ? 'Processing…' : 'Ask to buy'}<ArrowRight size={16}/></button>}</>}<p>{selected.description}</p><ListingDetailSummary item={selected}/><div className="evidence-box"><h3><ShieldCheck size={18}/>Evidence notes</h3><p>{selected.evidence || 'No evidence has been provided yet. Ask for more information before reaching a conclusion.'}</p></div><CertificateDetails key={selected.id} item={selected}/><CredibilityDetails item={selected}/><ItemHistory key={selected.id+selected.version} item={selected} service={service}/><TriviaPanel key={selected.id} item={selected} service={service} signedIn={!!session}/><p className="field-note">Community assessments are opinions, not professional authentication.</p></section></div>
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
          <div className="detail-grid"><div>{ownedItem.media?.some(asset=>asset.kind==='item') ? <PhotoGallery key={ownedItem.id} media={ownedItem.media} title={ownedItem.title}/> : <ItemArt category={ownedItem.category} large/>}<PhotoGallery key={ownedItem.id+'cert'} media={ownedItem.media} kind="certificate" title={ownedItem.title}/></div><section className="item-info"><span className="pill">{ownedItem.category}</span><h1>{ownedItem.title}</h1><p className="seller-name">Purchased {new Date(ownedItem.purchased_at).toLocaleDateString()}</p><p className="detail-price">{money(ownedItem.price_cents)}</p><p>{ownedItem.description}</p><ListingDetailSummary item={ownedItem}/><div className="evidence-box"><h3><Package size={18}/>Shipping</h3>{ownedItem.shipped_at ? <><p>Shipped {new Date(ownedItem.shipped_at).toLocaleDateString()}</p>{ownedItem.tracking_number && <p><a href={ownedItem.tracking_url} target="_blank" rel="noreferrer">Track: {ownedItem.tracking_number}</a></p>}{ownedItem.tracking_status && ownedItem.tracking_status !== 'UNKNOWN' && <p className="field-note">Status: {ownedItem.tracking_status}</p>}</> : <p className="field-note">The seller hasn't shipped this yet.</p>}<p className="field-note">{ownedItem.escrow_status === 'released' ? 'Payment released to the seller' : 'We hold your payment until delivery is confirmed'}{ownedItem.insured ? ' · Insured' : ''}</p></div><BuyerRefundPanel item={ownedItem} onRequested={refresh}/><SellerRatingForm item={ownedItem} onRated={refresh}/><MessageThread purchaseId={ownedItem.purchase_id} service={service} session={session} counterpartyLabel="seller" messageCount={ownedItem.message_count} autoOpen={focusPurchaseId === ownedItem.purchase_id} onFocused={() => setFocusPurchaseId(null)} onRead={refresh}/><CertificateDetails item={ownedItem}/><button className="primary" onClick={()=>setModal('relist')}><RefreshCw size={16}/>Relist this item</button></section></div>
        </> : pendingBuy ? <>
          <button className="back-button" onClick={() => setSelectedId(null)}><ArrowLeft size={17}/>Back to listings</button>
          <div className="detail-grid"><div>{pendingBuy.media?.some(asset=>asset.kind==='item') ? <PhotoGallery key={pendingBuy.listing_id} media={pendingBuy.media} title={pendingBuy.title}/> : <ItemArt category={pendingBuy.category} large/>}</div><section className="item-info"><span className="pill">{pendingBuy.category}</span><h1>{pendingBuy.title}</h1><p className="detail-price">{money(pendingBuy.price_cents)}</p>{pendingBuy.status === 'confirmed' ? <><p className="field-note">The seller confirmed this is still available.</p><button className="primary" disabled={busy} onClick={()=>setModal('checkout-address')}>Continue to checkout<ArrowRight size={16}/></button></> : <p role="status" className="field-note">Waiting for the seller to confirm this item is still available…</p>}</section></div>
        </> : <>
          <section className="hero"><div className="hero-copy"><p className="eyebrow"><span className="small-line"/>{workspace === 'collector' ? 'FOR THE CURIOUS COLLECTOR' : workspace === 'seller' ? 'YOUR NEXT GREAT FIND STARTS HERE' : 'OBSERVATION OVER ASSUMPTION'}</p><h1>{workspace === 'collector' ? <>Good finds.<br/><em>Better informed.</em></> : workspace === 'seller' ? <>Your collection.<br/><em>A new chapter.</em></> : <>Look closer.<br/><em>Share what you see.</em></>}</h1><p>{workspace === 'collector' ? 'Discover pieces with a story. Explore the evidence. Collect with a community that cares about the details.' : workspace === 'seller' ? 'Give every piece the context it deserves. Share its story, its condition, and what you know.' : 'Help collectors make informed decisions. Review evidence, explain your reasoning, and keep learning.'}</p><button className="primary" onClick={workspace === 'seller' ? openCreate : () => document.getElementById('listings').scrollIntoView({ behavior: 'smooth' })}>{workspace === 'seller' ? 'Create a listing' : workspace === 'auditor' ? 'Explore the audit queue' : 'Explore the collection'}<ArrowUpRight size={18}/></button></div><div className="hero-mascot"><img key={workspace} src={HERO_IMAGES[workspace].src} width={HERO_IMAGES[workspace].width} height={HERO_IMAGES[workspace].height} alt={HERO_IMAGES[workspace].alt} fetchPriority={workspace === 'collector' ? 'high' : 'auto'} /></div></section>
          <div className="values-strip"><span><Search size={16}/>Discover the details</span><span><ClipboardCheck size={16}/>Share your perspective</span><span><BookOpen size={16}/>Keep learning</span></div>
          <section id="listings" className="listings-section"><div className="section-heading"><div><p className="eyebrow">{workspace === 'auditor' ? 'A FRESH PERSPECTIVE' : 'THE COLLECTION'}</p><h2>{workspace === 'seller' ? (sellerTab === 'sold' ? 'Sold items' : sellerTab === 'requests' ? 'Buy requests' : 'Your listings') : workspace === 'auditor' ? 'Ready for a closer look' : collectionFilter === 'owned' ? 'Items you own' : collectionFilter === 'saved' ? 'Items you saved' : 'Discover something worth keeping'}</h2></div><span className="item-count">{workspace === 'seller' && sellerTab === 'sold' ? sales.length : workspace === 'seller' && sellerTab === 'requests' ? sellerBuyRequests.length : collectionItems.length} {(workspace === 'seller' && sellerTab === 'sold' ? sales.length : workspace === 'seller' && sellerTab === 'requests' ? sellerBuyRequests.length : collectionItems.length) === 1 ? 'item' : 'items'}</span></div>
            {workspace === 'seller' && session && <div className="categories" aria-label="Your listings"><button aria-pressed={sellerTab === 'active'} className={sellerTab === 'active' ? 'active' : ''} onClick={() => setSellerTab('active')}>Active</button><button aria-pressed={sellerTab === 'requests'} className={sellerTab === 'requests' ? 'active' : ''} onClick={() => setSellerTab('requests')}>Requests {sellerBuyRequests.length ? `(${sellerBuyRequests.length})` : ''}</button><button aria-pressed={sellerTab === 'sold'} className={sellerTab === 'sold' ? 'active' : ''} onClick={() => setSellerTab('sold')}>Sold {sales.length ? `(${sales.length})` : ''}</button></div>}
            {workspace === 'collector' && session && <div className="categories" aria-label="My collection"><button aria-pressed={collectionFilter === 'all'} className={collectionFilter === 'all' ? 'active' : ''} onClick={() => setCollectionFilter('all')}>All items</button><button aria-pressed={collectionFilter === 'saved'} className={collectionFilter === 'saved' ? 'active' : ''} onClick={() => setCollectionFilter('saved')}><Heart size={14}/> Saved</button><button aria-pressed={collectionFilter === 'owned'} className={collectionFilter === 'owned' ? 'active' : ''} onClick={() => setCollectionFilter('owned')}>Owned</button></div>}
            {workspace === 'seller' && sellerTab === 'sold' ? (!sales.length ? <div className="empty-state"><Layers size={34}/><h3>Nothing sold yet.</h3><p>Sales will show up here, ready to ship.</p></div>
              : <div className="items-grid">{sales.map(sale => <SoldItemCard key={sale.id} sale={sale} session={session} onShipped={shipped => setSales(list => list.map(s => s.id === shipped.id ? shipped : s))} onRefundChanged={refresh} focusPurchaseId={focusPurchaseId} onFocused={() => setFocusPurchaseId(null)}/>)}</div>)
              : workspace === 'seller' && sellerTab === 'requests' ? (!sellerBuyRequests.length ? <div className="empty-state"><Layers size={34}/><h3>No buy requests right now.</h3><p>When a buyer wants to purchase one of your active listings, it'll show up here for you to confirm.</p></div>
              : <div className="items-grid">{sellerBuyRequests.map(request => <BuyRequestCard key={request.id} request={request} onResolved={id => setSellerBuyRequests(list => list.filter(r => r.id !== id))}/>)}</div>) : <>
            {collectionFilter !== 'owned' && <div className="filters"><div className="categories" aria-label="Filter by category">{['All items', ...CATEGORIES].map(c => <button key={c} aria-pressed={category === c} className={category === c ? 'active' : ''} onClick={() => setCategory(c)}>{c}</button>)}</div><label className="search"><Search size={17}/><input aria-label="Search listings" value={query} onChange={e => setQuery(e.target.value)} placeholder="Find your next discovery"/></label></div>}
            {loading ? <p role="status" className="empty-state">Loading the collection…</p> : !collectionItems.length ? <div className="empty-state"><Layers size={34}/><h3>{workspace === 'seller' ? 'Your first listing starts here.' : collectionFilter === 'owned' ? 'Nothing purchased yet.' : collectionFilter === 'saved' ? 'Nothing saved yet.' : 'No items here yet.'}</h3><p>{workspace === 'seller' ? 'Add a piece and tell its story.' : collectionFilter === 'owned' ? 'Items you buy will show up here.' : collectionFilter === 'saved' ? 'Tap the heart on an item to save it here.' : 'Try a different category or search.'}</p>{workspace === 'seller' && <button className="primary" onClick={openCreate}>Create a listing <Plus size={17}/></button>}</div>
              : <div className="items-grid">{collectionItems.map(item => <button className="item-card" key={item.id} onClick={() => { setSelectedId(item.id); window.scrollTo({ top: 0 }); }} aria-label={`View ${item.title}`}><ItemArt kind={item.artwork} category={item.category} photo={item.media?.find(asset=>asset.kind==='item')?.url}/><div className="item-card-content"><div className="card-meta"><span>{item.category}</span>{collectionFilter === 'owned' ? <span>OWNED</span> : <><span>{item.listing_type==='auction' ? 'AUCTION' : item.sample ? 'SAMPLE' : 'NEW LISTING'}</span>{session && item.seller_id !== session.user.id && <span role="button" tabIndex={0} className="icon-button" aria-label={favoriteIds.includes(item.id) ? 'Remove from saved' : 'Save to collection'} onClick={event => { event.stopPropagation(); toggleFavorite(item.id); }}><Heart size={14} fill={favoriteIds.includes(item.id) ? 'currentColor' : 'none'}/></span>}</>}</div><h3>{item.title}</h3><p>{collectionFilter === 'owned' ? `Purchased ${new Date(item.purchased_at).toLocaleDateString()}` : item.seller_name}</p>{collectionFilter !== 'owned' && <CredibilityMeter score={item.credibility_score} compact/>}<div className="card-bottom"><strong>{money(item.price_cents)}</strong>{collectionFilter !== 'owned' && (item.listing_type==='auction' ? <span>{item.bid_count} {item.bid_count===1?'bid':'bids'} · {auctionTimeLeft(item.auction_ends_at)}</span> : <span><ClipboardCheck size={14}/>{item.audit_count || 0} audits</span>)}</div></div></button>)}</div>}
            </>}
          </section><section className="community-note"><div className="note-icon"><ShieldCheck size={25}/></div><div><h3>Confidence grows with evidence.</h3><p>A community opinion is a starting point. For valuable purchases, seek qualified authentication.</p></div><button className="icon-button" aria-label="Read the auditing guide" onClick={() => setModal('learn')}><ArrowUpRight size={24}/></button></section>
        </>}
        <footer><span>© {new Date().getFullYear()} Credabilia LLC · 732 S 6th St, Ste 7531, Las Vegas, NV 89101</span><span>Made for the love of the find.</span><span className="footer-legal"><a href="tel:+18667500255">1 (866) 750-0255</a><a href="/help">Help</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a></span></footer>
      </main>
    </div>
    {modal === 'login' && <Modal title="Welcome to Credabilia" onClose={() => setModal(null)}><p className="muted">One account to collect, sell, and share your perspective.</p>{service.mode === 'demo' ? <><div className="evidence-box"><h3>Try the local preview</h3><p>These two separate practice accounts stay in this browser. Each can switch between all three workspaces. Real sign-in is available when the Supabase project is connected.</p></div><div className="form-stack">{DEMO_ACCOUNTS.map(account => <button key={account.id} className="primary full-width" onClick={() => signIn(account.id)} disabled={busy}>{busy ? 'Opening…' : `Continue as ${account.display_name}`}<ArrowRight size={18}/></button>)}</div></> : <><button className="primary full-width" onClick={() => signIn()} disabled={busy}>{busy ? 'Opening…' : 'Continue with Google'}<ArrowRight size={18}/></button><p className="field-note">or</p><EmailLogin/><p className="field-note">By continuing, you agree to Credabilia's <a href="/terms" target="_blank" rel="noreferrer">Terms of Service</a> and <a href="/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>.</p></>}<p className="field-note">Your sign-in method does not determine your workspace. You can switch between all three after signing in.</p></Modal>}
    {modal === 'checkout-address' && (selected || pendingBuy) && <CheckoutAddress item={selected || pendingBuy} profile={profile} busy={busy} onClose={() => setModal(null)} onConfirm={(address, applyCreditCents, wantInsurance) => { const id = selected?.id || pendingBuy?.listing_id; setModal(null); buyNow(id, address, applyCreditCents, wantInsurance); }}/>}
    {modal === 'create' && <CreateListing onClose={() => setModal(null)} onCreated={id => { setModal(null); setNotice('Your listing is published.'); setSelectedId(id); refresh(); }}/>}
    {modal === 'relist' && ownedItem && <CreateListing relistFrom={ownedItem} onClose={() => setModal(null)} onCreated={id => { setModal(null); setNotice('Your relisted item is published.'); switchWorkspace('seller'); setSelectedId(id); refresh(); }}/>}
    {modal === 'edit' && selected && own && <EditListing key={selected.id} item={selected} onClose={()=>setModal(null)} onSaved={()=>{setModal(null);setNotice('Your listing changes are saved.');refresh();}}/>}
    {modal === 'profile' && <Modal title="Profile and settings" onClose={() => setModal(null)}><ProfileSettings profile={profile} session={session} onSaved={() => { setModal(null); setNotice('Your profile is saved.'); refresh(); }} onSignOut={() => { setModal(null); signOut(); }}/></Modal>}
    {modal === 'support' && <Modal title="Ask King Credion" onClose={() => setModal(null)}><SupportChat service={service}/></Modal>}
    {modal === 'learn' && <Modal title="Start with the evidence" onClose={() => setModal(null)}><ol className="guide"><li><strong>Observe before deciding.</strong><p>Look at condition, markings, materials, and the description. Record what you can actually see.</p></li><li><strong>Check the story.</strong><p>Provenance and certificates need verification. A familiar name alone does not prove authenticity.</p></li><li><strong>Say what is missing.</strong><p>Ask for clearer photos or documentation. Uncertainty is more useful than unsupported confidence.</p></li></ol><p className="field-note">Educational trivia will build on these skills in a later phase. Participation XP does not certify expertise.</p></Modal>}
  </div>;
}
