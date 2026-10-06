import { Brand } from './Brand.jsx';
import { ListingDetailFields, ListingDetailSummary } from './ListingDetails.jsx';
import { listingMatches } from './listingDetails.js';
import { MediaPicker, PhotoGallery } from './ListingMedia.jsx';
import { mainPhotoBackgroundRemoved, prepareImage } from './media.js';
import { saveListingDraft, loadListingDraft, clearListingDraft, readFormValues, saveBulkDraft, loadBulkDraft, clearBulkDraft } from './listingDraft.js';
import { certificateSuggestion } from './certificates.js';
import CredibilityDetails, { CredibilityMeter } from './CredibilityDetails.jsx';
import { TriviaPanel } from './Trivia.jsx';
import { ItemHistory } from './ItemHistory.jsx';
import CertificateDetails, { CertificateFields } from './CertificateDetails.jsx';
import React, { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, ArrowRight, Search, ShieldCheck, Plus, Store, Compass, ClipboardCheck, LogOut, X, Check, BookOpen, Sparkles, Layers, ArrowLeft, AlertCircle, Heart, Settings, RefreshCw, Package, Bell, MessageCircle, Sun, Moon, Monitor, Star, Flag, User, Crown, Share2, Copy, Lock } from 'lucide-react';
import { DEMO_ACCOUNTS } from './demo.js';
import { makeService } from './service.js';
import { isNativeApp, EMAIL_CODE_LENGTH } from './nativeAuth.js';
const Storefront = React.lazy(() => import('./Storefront.jsx').then(module => ({ default: module.Storefront })));
const TermsPage = React.lazy(() => import('./Legal.jsx').then(module => ({ default: module.TermsPage })));
const PrivacyPage = React.lazy(() => import('./Legal.jsx').then(module => ({ default: module.PrivacyPage })));
const HelpPage = React.lazy(() => import('./Help.jsx').then(module => ({ default: module.HelpPage })));
import { ItemArt, money, RatingStars } from './ItemArt.jsx';
import { MessageThread } from './MessageThread.jsx';
import { SoldItemPage } from './SoldItemPage.jsx';
import { trackItemListed } from './analytics.js';
import { SellPage } from './SellPage.jsx';
import { LIST_INTENT_KEY, captureListIntent, isSellHost } from './listIntent.js';
const SupportChat = React.lazy(() => import('./SupportChat.jsx').then(module => ({ default: module.SupportChat })));
import { CATEGORIES, WORKSPACES, priceInCents } from './domain.js';
import { formatWeight, formatLength } from './weight.js';
import { OrderActionCard, payoutDate } from './OrderActionCard.jsx';
import { auctionIncrement, minimumNextBid } from './auction.js';

const service = makeService();
const REQUESTS_INTENT_KEY = 'credabilia-view-requests';
// Matches browse_listings()'s own per-call ceiling (supabase/migrations/202609300063_browse_pagination.sql) --
// a page this size back means there may be more past it, worth offering "Load more" for.
const LISTINGS_PAGE_SIZE = 300;
const LABELS = { authentic: 'Looks consistent', uncertain: 'Need more evidence', concerns: 'I see concerns' };
const HERO_IMAGES = {
  collector: { src: '/brand/mobile-launch-hero.webp', width: 1200, height: 600, alt: 'King Credion presenting the upcoming iOS and Android apps surrounded by memorabilia' },
  seller: { src: '/brand/screen-face-v1/sell.webp', width: 800, height: 800, alt: 'King Credion welcoming shoppers to a royal market stall with a signed baseball, trading card, and framed jersey' },
  auditor: { src: '/brand/screen-face-v1/audit.webp', width: 800, height: 800, alt: 'King Credion inspecting a certificate of authenticity with a magnifying glass beside a signed baseball' },
};

function Modal({ title, children, onClose }) {
  const dialog = useRef(null);
  useEffect(() => { const el = dialog.current; el.showModal(); return () => { if (el.open) el.close(); }; }, []);
  return <dialog ref={dialog} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === dialog.current) onClose(); }} aria-labelledby="modal-title">
    <header className="dialog-header"><h2 id="modal-title">{title}</h2><button className="icon-button" aria-label="Close" onClick={onClose}><X size={20}/></button></header>{children}
  </dialog>;
}

function NotificationBell({ notifications, onNavigate, variant, glow }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDocClick = event => { if (wrap.current && !wrap.current.contains(event.target)) setOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);
  const bottomBar = variant === 'bottombar';
  const label = `Notifications${notifications.length ? ` (${notifications.length} need attention)` : ''}`;
  return <div className={bottomBar ? 'bottom-nav-item-wrap' : 'notif-wrap header-bell'} ref={wrap}>
    <button className={`${bottomBar ? 'bottom-nav-item' : 'icon-button'}${glow ? ' attention-glow' : ''}`} aria-label={label} title="Notifications" onClick={() => setOpen(o => !o)}>
      {bottomBar
        ? <><span className="bottom-nav-indicator"><Bell size={22}/>{notifications.length > 0 && <span className="notif-badge">{notifications.length}</span>}</span><span>Alerts</span></>
        : <>{<Bell size={18}/>}{notifications.length > 0 && <span className="notif-badge">{notifications.length}</span>}</>}
    </button>
    {open && <div className={bottomBar ? 'notif-panel bottom-nav-panel' : 'notif-panel'} role="menu">
      {!notifications.length ? <p className="notif-empty field-note">Nothing needs your attention.</p>
        : notifications.map(n => <button key={`${n.purchase_id}-${n.conversation_id}-${n.listing_id}-${n.kind}`} type="button" className={n.kind === 'ship_pending' ? 'notif-row notif-row-urgent' : 'notif-row'} role="menuitem" onClick={() => { onNavigate(n); setOpen(false); }}>
            {n.kind === 'message' ? <MessageCircle size={16}/> : n.kind === 'ship_pending' ? <Package size={16}/> : <AlertCircle size={16}/>}<span>{n.message}</span>
          </button>)}
    </div>}
  </div>;
}

function BottomNav({ session, workspace, onSwitchWorkspace, profile, onProfile, onSignIn, authReady, sellGlow, messagesGlow }) {
  const tabs = [
    { key: 'collector', label: 'Discover', Icon: Compass },
    { key: 'seller', label: 'Sell', Icon: Store },
    { key: 'auditor', label: 'Audit', Icon: ClipboardCheck },
    { key: 'messages', label: 'Messages', Icon: MessageCircle },
  ];
  return <nav className="bottom-nav" aria-label="Main navigation">
    {tabs.map(tab => { const active = workspace === tab.key; return (
      <button key={tab.key} type="button" className={`${active ? 'bottom-nav-item active' : 'bottom-nav-item'}${(sellGlow && tab.key === 'seller' && !active) || (messagesGlow && tab.key === 'messages' && !active) ? ' attention-glow' : ''}`} aria-current={active ? 'page' : undefined} onClick={() => onSwitchWorkspace(tab.key)}>
        <span className="bottom-nav-indicator"><tab.Icon size={22}/></span><span>{tab.label}</span>
      </button>
    ); })}
    {session ? <>
      <button type="button" className="bottom-nav-item" onClick={onProfile}>
        <span className="bottom-nav-indicator"><span className="avatar bottom-nav-avatar">{profile?.display_name?.slice(0,1) || 'C'}</span></span><span>Profile</span>
      </button>
    </> : <button type="button" className="bottom-nav-item" disabled={!authReady} onClick={onSignIn}>
      <span className="bottom-nav-indicator"><User size={22}/></span><span>Sign in</span>
    </button>}
  </nav>;
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

// Cascading state/region -> station select rather than one 498-row dropdown. `value`/`onSelect`
// are controlled from the parent so a saved draft's chosen station can be restored (the region
// auto-derives from it once the station list loads).
function PickupStationPicker({ value, onSelect, disabled }) {
  const [stations, setStations] = useState([]);
  const [region, setRegion] = useState('');
  useEffect(() => { service.pickupStations().then(setStations).catch(() => {}); }, []);
  useEffect(() => {
    if (!value || !stations.length || region) return;
    const match = stations.find(s => s.id === value);
    if (match) setRegion(`${match.country}|${match.state || ''}`);
  }, [value, stations]);
  const regions = [...new Set(stations.map(s => `${s.country}|${s.state || ''}`))].sort();
  const regionLabel = key => { const [country, state] = key.split('|'); return state ? `${state}, ${country}` : country; };
  const stationsInRegion = stations.filter(s => `${s.country}|${s.state || ''}` === region);
  return <div className="form-row">
    <label>State / region<select value={region} onChange={event => { setRegion(event.target.value); onSelect(''); }} disabled={disabled}>
      <option value="">Choose a state or region</option>
      {regions.map(key => <option key={key} value={key}>{regionLabel(key)}</option>)}
    </select></label>
    <label>Pickup location<select name="pickup_station_id" value={value || ''} onChange={event => onSelect(event.target.value)} disabled={disabled || !region} required>
      <option value="">Choose a station</option>
      {stationsInRegion.map(s => <option key={s.id} value={s.id}>{s.jurisdiction}{s.city ? ` — ${s.city}` : ''}</option>)}
    </select></label>
  </div>;
}

function CreateListing({ onClose, onCreated, relistFrom, bulkPhoto, bulkProgress, onPause, previousItems, onEditPrevious }) {
  const [step,setStep]=useState(relistFrom || bulkPhoto ? 'form' : 'photo');
  const [processingPhoto,setProcessingPhoto]=useState(false);
  const [draftPrompt,setDraftPrompt]=useState(() => relistFrom || bulkPhoto ? null : loadListingDraft());
  const [resuming,setResuming]=useState(false);
  const [discarding,setDiscarding]=useState(false);
  const [pendingResume,setPendingResume]=useState(null);
  const [listingCategory, setListingCategory] = useState(relistFrom?.category || CATEGORIES[0]);
  const [listingType, setListingType] = useState('fixed');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [media,setMedia]=useState([]), [uploading,setUploading]=useState(false), [analyzing,setAnalyzing]=useState(false);
  const [certificate,setCertificate]=useState({}),[suggestion,setSuggestion]=useState(null),[confirmed,setConfirmed]=useState(false);
  const [notes,setNotes]=useState(''),[drafting,setDrafting]=useState(false),[pendingDraft,setPendingDraft]=useState(null);
  const [draftApplied,setDraftApplied]=useState(false),[draftNote,setDraftNote]=useState('');
  const [copyingPhotos,setCopyingPhotos]=useState(false);
  const [signatureAi,setSignatureAi]=useState(null),[reviewingSignature,setReviewingSignature]=useState(false);
  const [pickupEnabled,setPickupEnabled]=useState(false),[pickupStationId,setPickupStationId]=useState('');
  const [weightOz,setWeightOz]=useState('');
  const [dims,setDims]=useState({length_in:'',width_in:'',height_in:''});
  const sizeHint=value=>formatLength(value) && <small className="weight-readout">= {formatLength(value)}</small>;
  const [fit,setFit]=useState(null); // {fit:'clear'|'unsure'|'unrelated', reason} from the last AI draft, or null if never drafted
  const formRef=useRef(null);
  const working=busy||uploading||analyzing||drafting||copyingPhotos||reviewingSignature||processingPhoto||resuming||discarding;
  const certificates=media.filter(asset=>asset.kind==='certificate');
  const signaturePhoto=media.find(asset=>asset.kind==='signature');
  async function analyze() {
    setAnalyzing(true);setError('');setSuggestion(null);
    try {const result=await service.extractCertificate(certificates[0].path);setSuggestion(certificateSuggestion(result));}
    catch(err){setError(err.message);}finally{setAnalyzing(false);}
  }
  async function reviewSignature() {
    setReviewingSignature(true);setError('');
    try {const result=await service.analyzeSignature(signaturePhoto.path,formRef.current?.elements.namedItem('attribute:subject')?.value);setSignatureAi(result);}
    catch(err){setError(err.message);}finally{setReviewingSignature(false);}
  }
  // Vision models are consistently better at pointing at roughly *where* something is than at
  // drawing a tight, correctly-centered box around it -- so instead of trusting the box's own
  // (often lopsided) edges, take its center and build a fixed, padded window symmetrically
  // around that point ourselves. That guarantees a centered crop by construction regardless of
  // how imprecise the model's edges were, padded 35% so a slightly loose crop (a much smaller
  // problem than a cut-off signature) covers for underestimated size too.
  async function cropSignatureFromPhoto(photoUrl, box) {
    const response=await fetch(photoUrl);
    if(!response.ok) throw new Error('The item photo could not be read.');
    const bitmap=await createImageBitmap(await response.blob());
    const {x0,y0,x1,y1}=box;
    const cx=(x0+x1)/2, cy=(y0+y1)/2;
    const halfW=Math.max((x1-x0)/2,0.02)*1.35, halfH=Math.max((y1-y0)/2,0.02)*1.35;
    const clamp=(c,half)=>{let lo=c-half,hi=c+half; if(lo<0){hi-=lo;lo=0;} if(hi>1){lo-=(hi-1);hi=1;} return [Math.max(0,lo),Math.min(1,hi)];};
    const [px0,px1]=clamp(cx,halfW), [py0,py1]=clamp(cy,halfH);
    const sx=Math.round(px0*bitmap.width), sy=Math.round(py0*bitmap.height);
    const sw=Math.max(1,Math.round((px1-px0)*bitmap.width)), sh=Math.max(1,Math.round((py1-py0)*bitmap.height));
    const canvas=document.createElement('canvas'); canvas.width=sw; canvas.height=sh;
    canvas.getContext('2d').drawImage(bitmap,sx,sy,sw,sh,0,0,sw,sh);
    bitmap.close();
    const cropped=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.9));
    if(!cropped) throw new Error('Could not crop the signature close-up.');
    return cropped;
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
    setFit(result.fit && result.fit!=='clear' ? {fit:result.fit,reason:result.fit_reason} : null);
  }
  // AI drafting and background removal run in parallel right after a main photo lands (whether from
  // the manual single-item upload below, or a bulk-queued photo already uploaded by BulkListing) --
  // Photoroom availability still isn't required to publish (see submit()'s own fallback below), this
  // is just the first, best-effort attempt, done up front instead of silently mid-form.
  async function processMainPhoto(asset) {
    setMedia([asset]);
    const [draftResult,bgResult]=await Promise.allSettled([
      service.draftListing({notes:'',photoPath:asset.path}),
      service.removeBackground(asset.path),
    ]);
    let currentPhoto=asset;
    if(bgResult.status==='fulfilled') { currentPhoto=bgResult.value; setMedia([currentPhoto]); }
    if(draftResult.status==='fulfilled') {
      const result=draftResult.value;
      applyDraftResult(result);
      if(result.signature?.found && result.signature.box) {
        // Best-effort and silent -- a failed auto-crop just means no signature photo got added,
        // same as if none was detected; the seller can still add one manually.
        try {
          const cropped=await cropSignatureFromPhoto(currentPhoto.url,result.signature.box);
          const sigAsset=await service.uploadImage(cropped,'signature');
          setMedia(prev=>[...prev.filter(x=>x.kind!=='signature'),sigAsset]);
        } catch {}
      }
    } else {
      setDraftNote("Our analysis didn't bring back much from this photo — fill in the details below.");
    }
  }
  // Step 1 of the single-item flow: pick a main photo, then run the shared pipeline above.
  async function uploadMainPhoto(event) {
    const file=event.target.files?.[0]; event.target.value='';
    if(!file || processingPhoto) return;
    setProcessingPhoto(true);setError('');
    try {
      const asset=await service.uploadImage(await prepareImage(file),'item');
      await processMainPhoto(asset);
    } catch(err) { setError(err.message); }
    finally { setProcessingPhoto(false); setStep('form'); }
  }
  // Bulk mode: BulkListing already uploaded this photo and hands it straight in -- run the same
  // drafting/background-removal pipeline once, on mount, instead of waiting for a file input.
  useEffect(() => {
    if(!bulkPhoto) return;
    setProcessingPhoto(true); setError('');
    processMainPhoto(bulkPhoto).catch(err=>setError(err.message)).finally(()=>setProcessingPhoto(false));
  }, []);
  // Manual re-run from inside the full form (after adding notes, or swapping the main photo) --
  // failures surface like any other action here, unlike the quiet step-1 attempt above.
  async function draftListing() {
    const photo=media.find(asset=>asset.kind==='item');
    if(!photo) return;
    setDrafting(true);setError('');
    try {
      const result=await service.draftListing({notes,photoPath:photo.path});
      applyDraftResult(result);
      if(result.signature?.found && result.signature.box && !media.some(asset=>asset.kind==='signature')) {
        try {
          const cropped=await cropSignatureFromPhoto(photo.url,result.signature.box);
          const sigAsset=await service.uploadImage(cropped,'signature');
          setMedia(prev=>[...prev.filter(x=>x.kind!=='signature'),sigAsset]);
        } catch {}
      }
    }
    catch(err){ setError(err.message); }
    finally{ setDrafting(false); }
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
    setDiscarding(true);
    await Promise.all(draftPrompt.media.map(asset=>service.removeImage(asset.path).catch(()=>{})));
    clearListingDraft();
    setDraftPrompt(null);setDiscarding(false);
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
  // Fires automatically the moment a signature photo exists with no opinion yet -- no seller click
  // required. Declared after the pendingDraft-apply effect above so, within the same render commit
  // (auto-crop sets both media and step together), the AI-drafted subject field is already written
  // into the DOM before this reads it. Re-fires whenever signatureAi is cleared (MediaPicker's
  // onChange resets it on any media change), so swapping in a new signature photo tries again too.
  useEffect(() => {
    if(!signaturePhoto || signatureAi || reviewingSignature) return;
    reviewSignature();
  }, [signaturePhoto?.path, signatureAi, reviewingSignature]);
  useEffect(() => {
    if(!pendingResume || step!=='form') return;
    const form=formRef.current;
    const set=(name,value)=>{ const el=form?.elements.namedItem(name); if(el && value) el.value=value; };
    set('title',pendingResume.title); set('description',pendingResume.description); set('price',pendingResume.price);
    set('evidence',pendingResume.evidence); set('tags',pendingResume.tags);
    set('weight_oz',pendingResume.weight_oz); setWeightOz(pendingResume.weight_oz||''); set('length_in',pendingResume.length_in);
    set('width_in',pendingResume.width_in); set('height_in',pendingResume.height_in);
    setDims({length_in:pendingResume.length_in||'',width_in:pendingResume.width_in||'',height_in:pendingResume.height_in||''});
    const shippingEl=form?.elements.namedItem('free_shipping'); if(shippingEl) shippingEl.checked=!!pendingResume.free_shipping;
    setPickupEnabled(!!pendingResume.pickup_enabled); setPickupStationId(pendingResume.pickup_station_id || '');
    for(const [key,value] of Object.entries(pendingResume.attributes||{})) { const field=form?.elements.namedItem('attribute:'+key); if(field && value) field.value=value; }
    setPendingResume(null);
  }, [pendingResume, step]);
  useEffect(() => {
    if(!relistFrom) return;
    const form=formRef.current;
    if(relistFrom.title) form.elements.namedItem('title').value=relistFrom.title;
    if(relistFrom.description) form.elements.namedItem('description').value=relistFrom.description;
    if(relistFrom.evidence) form.elements.namedItem('evidence').value=relistFrom.evidence;
    // Prefill the previous package measurements for review; repackaging may change them.
    // Start at the recorded item price, with optional markup shortcuts below.
    if(relistFrom.weight_oz) { form.elements.namedItem('weight_oz').value=relistFrom.weight_oz; setWeightOz(String(relistFrom.weight_oz)); }
    if(relistFrom.length_in) form.elements.namedItem('length_in').value=relistFrom.length_in;
    if(relistFrom.width_in) form.elements.namedItem('width_in').value=relistFrom.width_in;
    if(relistFrom.height_in) form.elements.namedItem('height_in').value=relistFrom.height_in;
    setDims({length_in:String(relistFrom.length_in||''),width_in:String(relistFrom.width_in||''),height_in:String(relistFrom.height_in||'')});
    if(relistFrom.price_cents) form.elements.namedItem('price').value=(relistFrom.price_cents/100).toFixed(2);
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
    if(!relistFrom && !bulkPhoto && media.length) saveListingDraft({media,listingCategory,listingType,notes,certificate,signatureAi,form:readFormValues(formRef.current)});
    else if(relistFrom || bulkPhoto) for(const asset of media) await service.removeImage(asset.path).catch(()=>{});
    onClose();
  }
  async function submit(event) {
    event.preventDefault(); if (working) return;
    // The browser resets event.currentTarget to null once the handler yields past its synchronous
    // dispatch (e.g. at the first await below), so the form element must be captured here, up front,
    // rather than read off the event later -- reading it after an await throws "parameter 1 is not
    // of type 'HTMLFormElement'" on almost every publish, since background removal always awaits.
    const formEl = event.currentTarget;
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
      const form = Object.fromEntries(new FormData(formEl));
      const attributes = Object.fromEntries(Object.entries(form).filter(([key])=>key.startsWith('attribute:')).map(([key,value])=>[key.slice(10),value]));
      const id = await service.createListing({ ...form, attributes, ...certificate, media: finalMedia, price_cents: priceInCents(form.price), listing_type: listingType, auction_days: form.auction_days, signature_ai_label: signatureAi?.label, signature_ai_note: signatureAi?.note, needs_review: fit?.fit==='unrelated' || fit?.fit==='unsure', needs_review_reason: fit?.reason||null });
      clearListingDraft();
      // Tell Google Ads a seller listed something -- but not listings held for review, so junk can't teach it the wrong audience.
      if (!(fit?.fit==='unrelated' || fit?.fit==='unsure')) trackItemListed(id);
      // Best-effort: the listing is already published, so a failure here shouldn't block the seller — but it should be visible for debugging.
      if (relistFrom?.purchase_id) service.markListingRelisted(id, relistFrom.purchase_id).catch(err => console.warn('Could not record relist provenance:', err.message));
      onCreated(id, fit);
    } catch (err) { setError(err.message); setBusy(false); }
  }
  if (!relistFrom && !bulkPhoto && draftPrompt) return <Modal title="Resume your listing?" onClose={close}>
    <div className="ai-photo-step">
      <p className="muted">You have an unfinished listing from earlier, with its photo and any AI-drafted details already saved. Pick up where you left off, or discard it and start fresh.</p>
      <div className="submit-row">
        <button type="button" className="primary" onClick={resumeDraft} disabled={working}>{resuming ? 'Resuming…' : 'Resume draft'}</button>
        <button type="button" className="text-button" onClick={discardDraft} disabled={working}>{discarding ? 'Discarding…' : 'Discard and start over'}</button>
      </div>
      {error && <p role="alert" className="error">{error}</p>}
    </div>
  </Modal>;
  if (!relistFrom && !bulkPhoto && step==='photo') return <Modal title="Create a listing" onClose={close}>
    <div className="ai-photo-step">
      <img src="/brand/screen-face-v1/scan.webp" alt="" className="ai-photo-step-hero"/>
      <p className="muted">AI reads your photo and drafts the listing for you — title, description, category, even a signature close-up if it spots one. Add a photo to get started; you can always fill in details yourself. Signed and unsigned collectibles are both welcome.</p>
      <img src="/brand/credabilia-jersey-photo-guide-v1-optimized.webp" alt="Example: a photo cropped too close to the item versus one showing the full item with space around it" className="ai-photo-guide"/>
      <label>Add your main photo<input type="file" accept="image/jpeg,image/png,image/webp" disabled={processingPhoto} onChange={uploadMainPhoto}/></label>
      {processingPhoto && <p role="status" className="field-note">Analyzing your photo…</p>}
      {error && <p role="alert" className="error">{error}</p>}
    </div>
  </Modal>;
  // Bulk mode no longer blocks the form behind a separate "scanning" screen -- the form is always
  // present and fully visible underneath; just the King Credion PNG (its own transparent
  // background, no card/backdrop behind it) floats centered over the card while AI drafts this
  // item, clearing on its own once processMainPhoto's effect finishes. Deliberately still blocks
  // interaction while it's up (not pointer-events:none) so a seller can't type into a field the
  // instant before the AI draft overwrites it.
  return <Modal title={relistFrom ? 'Relist this item' : bulkPhoto ? `Create a listing (${bulkProgress.index+1} of ${bulkProgress.total})` : 'Create a listing'} onClose={close}>
    {bulkPhoto && <div className="bulk-progress-bar" aria-hidden="true"><div className="bulk-progress-fill" style={{width:`${(bulkProgress.index/bulkProgress.total)*100}%`}}/></div>}
    {bulkPhoto && previousItems?.length>0 && <div className="bulk-back-nav"><span className="field-note">Already published in this session: </span>{previousItems.map(p => <button key={p.id} type="button" className="text-button" onClick={()=>onEditPrevious(p.id)}>Edit item {p.n}{p.fit ? ' (needs review)' : ''}</button>)}</div>}
    <p className="muted">{relistFrom ? 'Details, tags and certificate info carried over from your purchase. Review everything and set your own price.' : bulkPhoto ? "King Credion is reading this photo in the background — fields fill in as they're ready. Set a price and package size, then publish and move to the next item. Closing this (X) skips just this item — its photo won't be published. To stop here and come back later, use \"Save and exit\" below instead." : 'Review what AI filled in and add anything it missed.'}</p>
    {copyingPhotos && <p role="status" className="field-note">Copying photos to your own listing…</p>}
    {draftApplied && <p className="field-note bg-removed-ok">AI filled in the details from your photo — review everything before publishing. <button type="button" className="text-button" onClick={()=>setDraftApplied(false)}>Dismiss</button></p>}
    {draftNote && <p className="field-note">{draftNote} <button type="button" className="text-button" onClick={()=>setDraftNote('')}>Dismiss</button></p>}
    <form ref={formRef} onSubmit={submit} className="form-stack">
      <div className="bulk-form-wrap">
      {bulkPhoto && processingPhoto && <div className="bulk-scan-overlay" role="status" aria-label="King Credion is drafting this listing"><img src="/brand/screen-face-v1/scan.webp" alt=""/><p>Reading this photo…</p></div>}
      <label>Item title<input name="title" placeholder="What are you sharing?" minLength={4} maxLength={120} required autoFocus/></label>
      <label>Signed by <span className="optional">optional</span><input name="attribute:subject" placeholder="e.g. Mike Tyson" maxLength={120}/></label>
      <MediaPicker service={service} media={media} onChange={next=>{setMedia(next);setSuggestion(null);setConfirmed(false);setSignatureAi(null);}} busy={working} onBusy={setUploading} onError={setError}/>
      {signaturePhoto ? <div className="evidence-box"><h3 className="king-heading"><img className="king-icon" src="/brand/king-credion-signature-icon-v2.png" alt="" width="32" height="30"/>King Credion's signature opinion</h3>
        <p className="field-note-caution">If AI spotted this automatically and it isn't actually a signature, remove the photo above in the Signature close-up section.</p>
        {reviewingSignature && <p role="status" className="field-note">Reviewing signature…</p>}
        {signatureAi && <p className="field-note">{LABELS_AI[signatureAi.label]} — {signatureAi.note}</p>}
      </div> : <p className="field-note">Signed and unsigned collectibles are both welcome — leave the signature close-up blank if this item isn't signed.</p>}
      {fit && <p className="field-note">This may need a quick review before it's visible to buyers — {fit.reason || "it didn't clearly look like a collectible."} You can still publish; add more detail above first if that would help.</p>}
      </div>
      <label>Notes for AI <span className="optional">optional</span><textarea value={notes} onChange={event=>setNotes(event.target.value)} rows={3} maxLength={2000} placeholder="Add anything the photo won't show — who made it, when, condition, provenance…" disabled={working}/></label>
      <button type="button" className="text-button" onClick={draftListing} disabled={working || !media.some(asset=>asset.kind==='item')}>{drafting ? 'Drafting…' : 'Regenerate with AI'}</button>
      {!relistFrom && <div className="categories" aria-label="Listing type"><button type="button" aria-pressed={listingType==='fixed'} className={listingType==='fixed' ? 'active' : ''} onClick={()=>setListingType('fixed')}>Fixed price</button><button type="button" aria-pressed={listingType==='auction'} className={listingType==='auction' ? 'active' : ''} onClick={()=>setListingType('auction')}>Auction</button></div>}
      <div className="form-row">
        <label>Category<select name="category" value={listingCategory} onChange={event=>setListingCategory(event.target.value)}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></label>
        <label>{listingType==='auction' ? 'Starting bid (USD)' : 'Price (USD)'}<input name="price" type="number" min="1" max="1000000" step="0.01" placeholder="125.00" required/></label>
      </div>
      {relistFrom && Number.isFinite(relistFrom.price_cents) && <div className="categories" aria-label="Add a markup">
        <span className="field-note">Original item price: {money(relistFrom.price_cents)} · Add a markup: </span>
        {[0,10,25,50].map(pct => <button key={pct} type="button" onClick={()=>{const field=formRef.current.elements.namedItem('price'); field.value=(Math.round(relistFrom.price_cents*(100+pct)/100)/100).toFixed(2);}}>{pct===0 ? 'Same price' : `+${pct}%`}</button>)}
      </div>}
      {relistFrom && <p className="field-note">Markup is based on the original item price, before selling fees, shipping, and other costs. You can enter any price above.</p>}
      {listingType==='auction' && <label>Auction length<select name="auction_days" defaultValue="5"><option value="3">3 days</option><option value="5">5 days</option><option value="7">7 days</option></select></label>}
      <label>Description<textarea name="description" minLength={20} maxLength={4000} rows={3} placeholder="Condition, history, and the details a collector should know…" required/></label>
      {service.detailsEnabled && <ListingDetailFields key={listingCategory} category={listingCategory} exclude={['subject']}/>}
      <p className="field-note">Package weight and size, once packed — this lets buyers see a real shipping cost at checkout instead of guessing. Carriers need a package at least 6 × 3 inches and ¼ inch thick, so measure the box you'll actually ship in.</p>
      <div className="form-row">
        <label>Weight (oz)<input name="weight_oz" type="number" min="1" step="0.1" required onChange={e => setWeightOz(e.target.value)}/>{formatWeight(weightOz) && <small className="weight-readout">= {formatWeight(weightOz)}</small>}</label>
        <label>Length (in)<input name="length_in" type="number" min="1" step="0.1" required onChange={e => setDims({ ...dims, length_in: e.target.value })}/>{sizeHint(dims.length_in)}</label>
      </div>
      <div className="form-row">
        <label>Width (in)<input name="width_in" type="number" min="1" step="0.1" required onChange={e => setDims({ ...dims, width_in: e.target.value })}/>{sizeHint(dims.width_in)}</label>
        <label>Height (in)<input name="height_in" type="number" min="1" step="0.1" required onChange={e => setDims({ ...dims, height_in: e.target.value })}/>{sizeHint(dims.height_in)}</label>
      </div>
      {relistFrom && <label className="certificate-confirm"><input type="checkbox" required disabled={working}/>I checked the weight and dimensions for my current packaging.</label>}
      <label className="certificate-confirm"><input type="checkbox" name="free_shipping"/>Offer free shipping (you cover the cost)</label>
      {service.detailsEnabled && <label className="certificate-confirm"><input type="checkbox" name="pickup_enabled" checked={pickupEnabled} onChange={event=>setPickupEnabled(event.target.checked)} disabled={working}/>Offer local pickup at a safe-trade station</label>}
      {service.detailsEnabled && pickupEnabled && <PickupStationPicker value={pickupStationId} onSelect={setPickupStationId} disabled={working}/>}
      <label>Evidence notes <span className="optional">optional</span><textarea name="evidence" rows={2} maxLength={2000} placeholder="Provenance, certificate details, or what is still unknown…"/></label>
      {certificates.length>0 && <><button type="button" className="text-button" onClick={analyze} disabled={working}>{analyzing?'Reading certificate…':'Read certificate with AI'}</button><p className="field-note">Sends the first certificate photo to our AI provider to suggest the company and number. Review the suggestions before publishing.</p></>}
      {suggestion && <div className="evidence-box"><h3>Suggested certificate details</h3><p>Issuer: {suggestion.certificate_issuer} · Number: {suggestion.certificate_number || 'Not readable'}</p><button type="button" className="text-button" onClick={()=>{setCertificate(suggestion);setConfirmed(false);setSuggestion(null);}}>Use these details and review</button><button type="button" className="text-button" onClick={()=>setSuggestion(null)}>Dismiss suggestion</button></div>}
      <CertificateFields value={certificate} onChange={value=>{setCertificate(value);setConfirmed(false);}} disabled={working}/>
      {certificate.certificate_issuer && <label className="certificate-confirm"><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)} required disabled={working}/>I checked the company and number against my certificate.</label>}
      {error && <p role="alert" className="error">{error}</p>}
      <div className="submit-row">
        <button className="primary" disabled={working}>{busy ? 'Publishing…' : relistFrom ? 'Publish relisted item' : bulkPhoto ? 'Publish and next' : 'Publish listing'}<ArrowRight size={17}/></button>
        {bulkPhoto && onPause && <button type="button" className="text-button" disabled={working} onClick={()=>onPause(bulkPhoto)}>Save and exit</button>}
      </div>
    </form>
  </Modal>;
}

// Bulk listing: upload one photo per item up front, then step through the exact same CreateListing
// form once per photo (full reuse -- AI drafting, background removal, validation, publish -- nothing
// duplicated), advancing to the next item on publish instead of closing. Closing an individual item's
// card mid-review skips just that one photo; the queue and progress live here, one level up.
function BulkListing({ onClose, onAllDone }) {
  const [phase,setPhase]=useState(() => loadBulkDraft() ? 'resume-prompt' : 'pick');
  const [resuming,setResuming]=useState(false), [discarding,setDiscarding]=useState(false);
  const [queue,setQueue]=useState([]);
  const [index,setIndex]=useState(0);
  const [uploadProgress,setUploadProgress]=useState({done:0,total:0});
  const [published,setPublished]=useState(0), [skipped,setSkipped]=useState(0);
  const [error,setError]=useState('');
  // Lets a seller jump back mid-session to fix an already-published item without losing their place
  // in the queue -- tracks just {id,n} per publish (n = 1-based position) since that's all the nav
  // needs; the full listing is only fetched on demand when "Edit item N" is actually clicked.
  const [publishedItems,setPublishedItems]=useState([]);
  const [editingId,setEditingId]=useState(null), [editItem,setEditItem]=useState(null), [editError,setEditError]=useState('');
  async function editPrevious(id) {
    setEditingId(id); setEditItem(null); setEditError('');
    try {
      const list=await service.listings();
      const found=list.find(item=>item.id===id);
      if(!found) throw new Error('Could not load that listing right now -- try again in a moment.');
      setEditItem(found);
    } catch(err) { setEditError(err.message); }
  }
  async function pickFiles(event) {
    const files=Array.from(event.target.files||[]); event.target.value='';
    if(!files.length) return;
    setPhase('uploading'); setError(''); setUploadProgress({done:0,total:files.length});
    const uploaded=[];
    for(const file of files) {
      try { uploaded.push(await service.uploadImage(await prepareImage(file),'item')); }
      catch(err) { setError(`Could not upload ${file.name}: ${err.message}`); }
      setUploadProgress(p=>({...p,done:p.done+1}));
    }
    if(!uploaded.length) { setPhase('pick'); return; }
    setQueue(uploaded); setIndex(0); setPublished(0); setSkipped(0); setPhase('review');
  }
  // Reads `index` from this render's closure rather than a functional setIndex updater -- advance()
  // only ever runs from a click-driven callback (onCreated/onClose below), never rapid-fire, so
  // there's no stale-closure risk, and this avoids calling setPhase as a side effect *inside*
  // another setter's updater function (an impure updater that could let `index` reach queue.length
  // in a render where `phase` hasn't flipped to 'done' yet, crashing the final `queue[index].path`
  // read below with exactly the "Cannot read properties of undefined" bug this replaces).
  function advance() {
    const next = index + 1;
    if (next >= queue.length) { clearBulkDraft(); setPhase('done'); }
    else setIndex(next);
  }
  // "Save and exit" (vs. the X on an item card, which skips+deletes just that one photo): persists
  // the current item plus everything still queued behind it -- their photos stay in storage
  // untouched, ready to re-sign and re-draft (same cost model as a fresh upload) on resume.
  function pause(currentAsset) {
    const remaining=[currentAsset, ...queue.slice(index+1)];
    saveBulkDraft({items:remaining,published,skipped});
    onClose();
  }
  async function resumeBulkDraft() {
    const draft=loadBulkDraft();
    if(!draft) return;
    setResuming(true); setError('');
    try {
      const signed=await service.signMediaUrls(draft.items);
      setQueue(signed); setIndex(0); setPublished(draft.published||0); setSkipped(draft.skipped||0); setPhase('review');
    } catch(err) { setError(err.message); } finally { setResuming(false); }
  }
  async function discardBulkDraft() {
    const draft=loadBulkDraft();
    if(!draft) return;
    setDiscarding(true);
    await Promise.all(draft.items.map(asset=>service.removeImage(asset.path).catch(()=>{})));
    clearBulkDraft();
    setDiscarding(false); setPhase('pick');
  }
  if(phase==='resume-prompt') return <Modal title="Resume bulk listing?" onClose={onClose}>
    <div className="ai-photo-step">
      <p className="muted">You have an unfinished bulk listing session from earlier, with its photos already uploaded. Pick up where you left off, or discard it and start fresh.</p>
      <div className="submit-row">
        <button type="button" className="primary" onClick={resumeBulkDraft} disabled={resuming||discarding}>{resuming ? 'Resuming…' : 'Resume'}</button>
        <button type="button" className="text-button" onClick={discardBulkDraft} disabled={resuming||discarding}>{discarding ? 'Discarding…' : 'Discard and start over'}</button>
      </div>
      {error && <p role="alert" className="error">{error}</p>}
    </div>
  </Modal>;
  if(phase==='pick') return <Modal title="Bulk list items" onClose={onClose}>
    <div className="ai-photo-step">
      <img src="/brand/screen-face-v1/scan.webp" alt="" className="ai-photo-step-hero"/>
      <p className="muted">AI reads each photo and drafts the listing for you — title, description, category, even a signature close-up if it spots one. Each photo becomes its own listing, and you can review and edit anything before publishing it. Signed and unsigned collectibles are both welcome.</p>
      <img src="/brand/credabilia-jersey-photo-guide-v1-optimized.webp" alt="Example: a photo cropped too close to the item versus one showing the full item with space around it" className="ai-photo-guide"/>
      <label>Add photos<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={pickFiles}/></label>
      {error && <p role="alert" className="error">{error}</p>}
    </div>
  </Modal>;
  if(phase==='uploading') return <Modal title="Bulk list items" onClose={()=>{}}>
    <div className="ai-photo-step"><p role="status" className="field-note">Uploading photo {uploadProgress.done} of {uploadProgress.total}…</p>{error && <p role="alert" className="error">{error}</p>}</div>
  </Modal>;
  if(phase==='done') return <Modal title="Bulk listing complete" onClose={onAllDone}>
    <div className="ai-photo-step">
      <p className="muted">{published} {published===1 ? 'item' : 'items'} published{skipped ? `, ${skipped} skipped` : ''}.</p>
      <button className="primary" onClick={onAllDone}>Done<ArrowRight size={16}/></button>
    </div>
  </Modal>;
  // Defensive: index should never reach here out of range (advance() checks before setting it),
  // but rendering nothing for one frame beats a hard crash if some future change reintroduces the gap.
  if (!queue[index]) return null;
  return <>
    <CreateListing key={queue[index].path} bulkPhoto={queue[index]} bulkProgress={{index,total:queue.length}}
      onClose={()=>{setSkipped(n=>n+1);advance();}}
      onCreated={(id,itemFit)=>{setPublishedItems(list=>[...list,{id,n:index+1,fit:itemFit}]);setPublished(n=>n+1);advance();}}
      onPause={pause} previousItems={publishedItems} onEditPrevious={editPrevious}/>
    {editingId && !editItem && <Modal title="Loading listing…" onClose={()=>{setEditingId(null);setEditError('');}}>
      <div className="ai-photo-step">
        {!editError && <p role="status" className="field-note">Loading…</p>}
        {editError && <p role="alert" className="error">{editError}</p>}
      </div>
    </Modal>}
    {editItem && <EditListing key={editItem.id} item={editItem} onClose={()=>{setEditingId(null);setEditItem(null);}} onSaved={()=>{setEditingId(null);setEditItem(null);}}/>}
  </>;
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
    // item.id makes this a post-publish call -- the edge function validates the path against the
    // listing's own signature media row (not the caller's uid) and writes the result itself via a
    // service-role, write-once RPC, so re-triggering here can never overwrite an already-set opinion.
    try {const result=await service.analyzeSignature(signaturePhoto.path,item.attributes?.subject,item.id);setSignatureAi(result);}
    catch(err){setError(err.message);}finally{setReviewingSignature(false);}
  }
  // Auto-fires when a signature photo exists but item.signature_ai_label was never set (automatic
  // trigger failed at creation, or the photo is newly added during this edit) -- no manual retry.
  // If item.signature_ai_label was already set, signatureAi starts non-null (see useState above)
  // and this never fires, matching "no one else can trigger" once an opinion is permanent.
  useEffect(() => {
    if(!signaturePhoto || signatureAi || reviewingSignature) return;
    reviewSignature();
  }, [signaturePhoto?.path, signatureAi, reviewingSignature]);
  const certificateChanged=certificate.certificate_issuer!==(item.certificate_issuer||'')||certificate.certificate_number!==(item.certificate_number||'')||certificate.certificate_company!==(item.certificate_company||'');
  async function submit(event) {
    event.preventDefault();if(working)return;
    const form=Object.fromEntries(new FormData(event.currentTarget));
    const attributes = Object.fromEntries(Object.entries(form).filter(([key])=>key.startsWith('attribute:')).map(([key,value])=>[key.slice(10),value]));
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
      // Only re-run the suitability check for a listing that's actually held on it -- a normal edit
      // (price, typo fix) on an already-active listing shouldn't pay for an extra AI call. Text-only
      // (no photoPath): the main photo may already be background-removed (.png) by now, which
      // draft-listing's photo path can't read (it only accepts the original .jpg at create time) --
      // the seller's own title/description/evidence is exactly the clarifying context this recheck
      // needs anyway, matching "ask what makes it collectible" rather than re-reading the image.
      let fit=null;
      if(item.status==='needs_review') {
        try {
          const result=await service.draftListing({notes:[form.title,form.description,form.evidence].filter(Boolean).join('\n')});
          fit={needs_review:result.fit==='unrelated'||result.fit==='unsure',needs_review_reason:result.fit_reason||null};
        } catch { /* AI unavailable -- leave it exactly as held as it already was rather than guessing. */ }
      }
      await service.editListing(item,{...form,attributes,...certificate,media:finalMedia,price_cents:priceInCents(form.price)},mediaTouched,fit);
      onSaved();
    }
    catch(err){setError(err.message);setSaving(false);}
  }
  return <Modal title="Edit listing" onClose={()=>{if(!working)onClose();}}>
    <p className="muted">Update any detail — title, category, price, description, evidence, certificate or photos.</p>
    {item.status==='needs_review' && <p className="field-note">This listing is held from public view pending review — {item.needs_review_reason || "it didn't clearly look like a collectible."} Saving will re-check it automatically.</p>}
    {reviewed && <p className="field-note">This listing has been audited. Changing anything other than price will archive the current reviews in the item's history and reset the score to neutral — nothing is deleted.</p>}
    <form className="form-stack" onSubmit={submit}>
      <label>Item title<input name="title" defaultValue={item.title} required minLength={4} maxLength={120}/></label>
      <label>Signed by <span className="optional">optional</span><input name="attribute:subject" defaultValue={item.attributes?.subject||''} placeholder="e.g. Mike Tyson" maxLength={120}/></label>
      <label>Category<select name="category" defaultValue={item.category}>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></label>
      {(() => { const locked = item.listing_type === 'auction' && (item.bid_count > 0 || new Date(item.auction_ends_at) <= new Date());
        return <label>{item.listing_type === 'auction' ? 'Starting bid (USD)' : 'Price (USD)'}<input name="price" type="number" min="1" max="1000000" step="0.01" defaultValue={(item.price_cents/100).toFixed(2)} required readOnly={locked}/>{locked && <small className="field-note">This auction has bids, so its price and end time can no longer be changed.</small>}</label>; })()}
      <SaleFormatSwitch item={item} onChanged={onSaved}/>
      <label>Description<textarea name="description" defaultValue={item.description} required minLength={20} maxLength={4000}/></label>
      <label>Evidence notes<textarea name="evidence" defaultValue={item.evidence} maxLength={2000}/></label>
      <MediaPicker service={service} media={media} onChange={next=>{setMedia(next);setMediaTouched(true);if(!item.signature_ai_label)setSignatureAi(null);}} busy={working} onBusy={setUploading} onError={setError}/>
      {signaturePhoto && <div className="evidence-box"><h3 className="king-heading"><img className="king-icon" src="/brand/king-credion-signature-icon-v2.png" alt="" width="32" height="30"/>King Credion's signature opinion</h3>
        {reviewingSignature && <p role="status" className="field-note">Reviewing signature…</p>}
        {signatureAi && <p className="field-note">{LABELS_AI[signatureAi.label]} — {signatureAi.note}</p>}
        {!reviewingSignature && !signatureAi && <p className="field-note">King Credion has not given an opinion on this signature yet.</p>}
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

// Persistent nudge on the seller's Active-listings tab (not just buried in account settings) --
// shown right where a seller checks on their inventory, since that's when they're most likely to
// want to share it. navigator.share opens the phone/browser's own share sheet (Messages,
// Instagram, WhatsApp, X, whatever's installed) pre-filled with the link -- no per-platform API
// integration, and it degrades to just the copy button wherever Web Share isn't supported (most
// desktop browsers besides Chrome/Edge/Safari).
function SellerStorefrontBanner({ slug, onSetup }) {
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== 'undefined' && !!navigator.share;
  if (!slug) return <div className="community-note storefront-note"><div className="note-icon"><Store size={20}/></div><div><h3>Set up your storefront link</h3><p>Get a public link to your whole collection you can share anywhere.</p></div><button type="button" className="text-button" onClick={onSetup}>Set up<ArrowUpRight size={14}/></button></div>;
  const link = `${window.location.origin}/${slug}`;
  async function copyLink() { try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {} }
  async function share() { try { await navigator.share({ title: 'My Credabilia storefront', url: link }); } catch {} /* includes the user simply cancelling the share sheet -- nothing to show for that */ }
  return <div className="community-note storefront-note"><div className="note-icon"><Store size={20}/></div><div><h3>Your storefront is live</h3><p>{link}</p></div>
    {canShare && <button type="button" className="text-button" onClick={share}><Share2 size={16}/>Share</button>}
    <button type="button" className="text-button" onClick={copyLink}><Copy size={16}/>{copied ? 'Copied!' : 'Copy link'}</button>
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
  const needsVerify = canVerify && !resolved && !verifying && !verification;
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
  return <div className="clarity-contents" data-clarity-mask="True">
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
    {/* The step buyers missed in testing: shipping options and the Continue button stay locked until the address is verified, so once the
        form is complete this button glows and says so. */}
    <button type="button" className={`verify-address-button${needsVerify ? ' needs-attention' : ''}${resolved ? ' done' : ''}`} onClick={verify} disabled={disabled || verifying || !canVerify}><ShieldCheck size={18}/>{verifying ? 'Checking…' : resolved ? 'Address verified' : 'Verify address'}</button>
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
    {!resolved && !verifying && !verification && <p className={`verify-callout${needsVerify ? ' ready' : ''}`} role="status">{needsVerify ? 'Next step: tap Verify address. We check it with the carrier, then show your shipping options and prices.' : 'Fill in your address, then tap Verify address to see shipping options and prices.'}</p>}
  </div>;
}

function ShippingSettings({ profile }) {
  // Country has no real default -- its input only shows "US" as a placeholder, which looks filled
  // but leaves value.country empty until typed, silently disabling "Verify address" (canVerify
  // requires every REQUIRED_ADDRESS_FIELDS entry, country included). Defaulting it here means a
  // first-time saver never hits that trap; Credabilia is US-only today anyway (see Terms).
  const [address, setAddress] = useState({ country: 'US', ...(profile?.shipping_address || {}) });
  const [saving, setSaving] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(false);
  const [verified, setVerified] = useState(false);
  async function submit(event) {
    event.preventDefault(); if (saving || !verified) return;
    setSaving(true); setError(''); setSaved(false);
    try { await service.saveShippingAddress(address); setSaved(true); }
    catch (err) { setError(err.message); } finally { setSaving(false); }
  }
  return <div className="evidence-box" data-clarity-mask="True"><h3>Shipping address</h3>
    <p className="field-note">Used as your return address when you sell, and to pre-fill checkout when you buy. You can still edit it for any specific order.</p>
    <form className="form-stack" onSubmit={submit}>
      <ShippingAddressFields value={address} onChange={value => { setAddress(value); setSaved(false); }} disabled={saving} onVerifiedChange={setVerified}/>
      {error && <p role="alert" className="error">{error}</p>}
      <button className="primary" disabled={saving || !verified}>{saving ? 'Saving…' : saved ? 'Saved' : 'Save address'}</button>
    </form>
  </div>;
}

// The buyer's shipping choice at checkout: the real services for this package and address, what each costs, and a pick. The price
// shown is what create-checkout-session charges (it asks the carrier again and charges the service picked here).
function ShippingChoice({ itemId, address, wantInsurance, verified, onChoice }) {
  const [state, setState] = useState({ status: 'idle', options: [], locked: false, free: false });
  const [picked, setPicked] = useState(null);
  useEffect(() => {
    if (!verified) { setState({ status: 'idle', options: [], locked: false, free: false }); onChoice(null, false); return undefined; }
    let alive = true;
    setState(current => ({ ...current, status: 'loading' }));
    service.shippingOptions(itemId, address, wantInsurance)
      .then(result => {
        if (!alive) return;
        const options = result?.options || [];
        setState({ status: 'ready', options, locked: !!result?.locked, free: !!result?.free_shipping });
        const first = options[0] ? { provider: options[0].provider, service: options[0].service } : null;
        setPicked(first); onChoice(first, !!first);
      })
      .catch(() => { if (alive) { setState({ status: 'error', options: [], locked: false, free: false }); setPicked(null); onChoice(null, false); } });
    return () => { alive = false; };
  }, [verified, itemId, wantInsurance, address.street1, address.city, address.state, address.zip, address.country]);
  if (!verified) return <p className="field-note">Verify your address to see shipping options and prices.</p>;
  if (state.status === 'loading') return <p role="status" className="field-note">Finding shipping options…</p>;
  if (state.status === 'error') return <p role="alert" className="error">We couldn't load shipping options just now. Please try again in a moment.</p>;
  if (!state.options.length) return <p role="alert" className="error">No shipping service is available for this item to that address. Check the address, or message the seller.</p>;
  const isPicked = option => picked && picked.provider === option.provider && picked.service === option.service;
  return <fieldset className="shipping-choice">
    <legend>{state.locked ? 'Shipping' : 'Choose how it ships'}</legend>
    {state.options.map(option => <label key={`${option.provider}-${option.service}`} className={`shipping-option${isPicked(option) ? ' picked' : ''}`}>
      <input type="radio" name="shipping-option" disabled={state.locked} checked={!!isPicked(option)} onChange={() => { const next = { provider: option.provider, service: option.service }; setPicked(next); onChoice(next, true); }}/>
      <span className="shipping-option-text"><strong>{option.provider} {option.name}</strong><small>{option.estimated_days ? `About ${option.estimated_days} day${option.estimated_days === 1 ? '' : 's'}` : 'Delivery time varies'}</small></span>
      <span className="shipping-option-price">{state.free ? 'Free' : money(option.shipping_cents)}</span>
    </label>)}
    {state.options[0]?.insurance_cents > 0 && <p className="field-note">Insurance: {money(state.options.find(isPicked)?.insurance_cents ?? state.options[0].insurance_cents)} (added at payment)</p>}
    {state.locked && <p className="field-note">The seller is covering shipping on this item.</p>}
  </fieldset>;
}

function CheckoutAddress({ item, profile, busy, onClose, onConfirm }) {
  const [fulfillmentMethod, setFulfillmentMethod] = useState('ship');
  // Same country-placeholder trap as ShippingSettings -- default it so a buyer typing a fresh
  // address for the first time doesn't hit a silently-disabled "Verify address" button.
  const [address, setAddress] = useState({ country: 'US', ...(profile?.shipping_address || {}) });
  const [error, setError] = useState('');
  const [balance, setBalance] = useState(null);
  const [applyCredit, setApplyCredit] = useState(false);
  const [wantInsurance, setWantInsurance] = useState(true);
  const [verified, setVerified] = useState(false);
  const [shippingChoice, setShippingChoice] = useState(null);
  const [shippingReady, setShippingReady] = useState(false);
  useEffect(() => { service.myCreditBalance().then(setBalance).catch(() => {}); }, []);
  const isPickup = fulfillmentMethod === 'pickup';
  // Mirrors reserve_listing_checkout()'s own cap -- the server re-validates and clamps this
  // regardless, this is just so the buyer sees an accurate number before submitting.
  const coinCap = Math.round(item.price_cents * 0.5);
  const creditToApply = applyCredit && balance ? Math.min(balance, coinCap) : 0;
  function submit(event) {
    event.preventDefault();
    if (!isPickup) {
      const required = ['name', 'street1', 'city', 'state', 'zip', 'country'];
      if (required.some(key => !address[key]?.trim())) { setError('Fill in all required address fields.'); return; }
      if (!verified) { setError('Verify your address before continuing.'); return; }
    }
    onConfirm(isPickup ? null : address, creditToApply, wantInsurance, fulfillmentMethod, isPickup ? null : shippingChoice);
  }
  return <Modal title={isPickup ? 'Confirm pickup' : 'Confirm shipping address'} onClose={onClose}>
    {item.pickup_enabled && <div className="categories" aria-label="How you'll get this item">
      <button type="button" aria-pressed={fulfillmentMethod === 'ship'} className={fulfillmentMethod === 'ship' ? 'active' : ''} onClick={() => setFulfillmentMethod('ship')}>Ship to me</button>
      <button type="button" aria-pressed={isPickup} className={isPickup ? 'active' : ''} onClick={() => setFulfillmentMethod('pickup')}>Local pickup</button>
    </div>}
    {isPickup
      ? <div className="muted pickup-safety-copy"><p>Meet the seller in person to pick up "{item.title}" — no shipping needed.</p><p><strong>Recommended:</strong> use the designated safe-exchange location below. You may arrange another public meeting place with the seller through Credabilia messages, but Credabilia does not verify or supervise alternate locations.</p><p>Payment stays online through Credabilia so the transaction record and buyer protections remain in place. Never send payment outside Credabilia.</p></div>
      : <p className="muted">Where should "{item.title}" be shipped? This is for this order only — your saved default lives in Profile settings.</p>}
    <form className="form-stack" onSubmit={submit}>
      {isPickup
        ? <div className="evidence-box"><h3>Recommended safe-exchange location</h3><p>{item.pickup_station?.jurisdiction}</p><p>{[item.pickup_station?.city, item.pickup_station?.state, item.pickup_station?.country].filter(Boolean).join(', ')}</p>{item.pickup_station?.notes && <p className="field-note">{item.pickup_station.notes}</p>}<p className="field-note">This is a recommended public meeting location. Confirm the details with the seller in Credabilia messages before meeting.</p></div>
        : <ShippingAddressFields value={address} onChange={setAddress} disabled={busy} onVerifiedChange={setVerified}/>}
      {!!balance && <label className="certificate-confirm"><input type="checkbox" checked={applyCredit} onChange={event => setApplyCredit(event.target.checked)} disabled={busy}/><img src="/brand/screen-face-v1/coin-simple.webp" alt="" className="coin-icon"/>Apply {money(Math.min(balance, coinCap))} in Credion Coins to this order (you have {money(balance)} available)</label>}
      {!isPickup && <label className="certificate-confirm"><input type="checkbox" checked={wantInsurance} onChange={event => setWantInsurance(event.target.checked)} disabled={busy}/>Insure this item for shipping (covers loss or damage in transit — exact cost shown at payment)</label>}
      {!isPickup && <ShippingChoice itemId={item.listing_id || item.id} address={address} wantInsurance={wantInsurance} verified={verified} onChoice={(choice, ready) => { setShippingChoice(choice); setShippingReady(!!ready); }}/>}
      {error && <p role="alert" className="error">{error}</p>}
      <button className="primary" disabled={busy || (!isPickup && (!verified || !shippingReady))}>{busy ? 'Processing…' : 'Continue to payment'}<ArrowRight size={16}/></button>
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

// A seller who has not finished Stripe payout setup cannot be paid, so their listings stay visible but locked: nobody can buy or bid until it
// opens, which happens automatically when Stripe confirms the account.
const listingLocked = item => service.mode === 'live' && item.seller_charges_enabled === false;

function auctionTimeLeft(endsAt) {
  const ms = new Date(endsAt) - new Date();
  if (ms <= 0) return 'Auction ended';
  const days = Math.floor(ms / 86400000), hours = Math.floor((ms % 86400000) / 3600000);
  if (days > 0) return `${days}d ${hours}h left`;
  const minutes = Math.floor((ms % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${minutes}m left`;
  return `${minutes}m left`;
}

// The purchase actions on an item page: the main buy/bid step with "Message seller" right beside it, so a buyer with a
// question doesn't have to hunt for it. Signed-out visitors see the same buttons; each one opens sign-in.
function ItemActions({ item, session, service, busy, request, onCheckout, onRequestToBuy, onMessage, onSignIn, onBid }) {
  const payReady = service.mode !== 'live' || item.seller_charges_enabled;
  const auction = item.listing_type === 'auction';
  let note = null, bidBox = null, primary = null;
  if (item.king_collection) {
    primary = <button className="primary" disabled={busy || !payReady} onClick={session ? onCheckout : onSignIn}>{busy ? 'Processing…' : 'Buy now'}<ArrowRight size={16}/></button>;
  } else if (request?.status === 'confirmed') {
    note = <p className="field-note">{auction ? 'You won this auction!' : 'The seller confirmed this is still available.'}</p>;
    primary = <button className="primary" disabled={busy} onClick={onCheckout}>Continue to checkout<ArrowRight size={16}/></button>;
  } else if (request?.status === 'pending') {
    note = <p role="status" className="field-note">Waiting for the seller to confirm this item is still available…</p>;
  } else if (auction) {
    if (!payReady) bidBox = null;
    else if (session) bidBox = <AuctionBidBox item={item} onBid={onBid}/>;
    else primary = <button className="primary" onClick={onSignIn}>Sign in to bid<ArrowRight size={16}/></button>;
  } else {
    primary = <button className="primary" disabled={busy || !payReady} onClick={() => onRequestToBuy(item.id)}>{busy ? 'Processing…' : 'Ask to buy'}<ArrowRight size={16}/></button>;
  }
  return <>
    {!payReady && <p role="status" className="field-note lock-note"><Lock size={14}/> Locked: the seller is finishing payment setup. It opens for {auction ? 'bidding' : 'sale'} automatically as soon as they're done{auction ? ', and the auction clock starts then' : ''}. Save it to your collection to find it again.</p>}
    {note}{bidBox}
    <div className="item-actions">{primary}<button type="button" className="secondary-action" aria-label="Message seller" disabled={busy} onClick={() => onMessage(item.id)}><MessageCircle size={16}/><span>Message<span className="msg-suffix"> seller</span></span></button></div>
  </>;
}

// Maximum-bid (proxy) bidding: the member enters the most they will pay and the system bids for them, only as high as needed. A bid is
// a binding commitment to buy, and a bidder needs a card on file (not charged) -- both are said plainly here.
function AuctionBidBox({ item, onBid }) {
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState(null);
  const [agree, setAgree] = useState(false);
  const [result, setResult] = useState(null);
  const [cardBusy, setCardBusy] = useState(false);
  const ended = new Date(item.auction_ends_at) <= new Date();
  const minimum = minimumNextBid(item);
  const returnedFromCard = new URLSearchParams(window.location.search).get('bidcard') === 'success';
  function loadStatus() { return service.myBidStatus(item.id).then(setStatus).catch(() => setStatus(null)); }
  useEffect(() => { loadStatus(); }, [item.id, item.price_cents, item.bid_count]);
  // Stripe confirms a saved card to us a few seconds after the member returns, so check again for a short while.
  useEffect(() => {
    if (!returnedFromCard || !status || status.can_bid) return undefined;
    const timer = setTimeout(loadStatus, 3000);
    return () => clearTimeout(timer);
  }, [returnedFromCard, status]);
  async function submit(event) {
    event.preventDefault(); if (busy || !agree) return;
    setBusy(true); setError(''); setResult(null);
    try { const placed = await service.placeBid(item.id, priceInCents(amount)); setResult(placed); setAmount(''); setAgree(false); onBid(); loadStatus(); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  async function addCard() {
    setCardBusy(true); setError('');
    try { const { url } = await service.setupBiddingCard(); window.location.href = url; }
    catch (err) { setError(err.message); setCardBusy(false); }
  }
  if (ended) return <p role="status" className="field-note">This auction has ended and is being settled. If you won, we will let you know shortly.</p>;
  if (status && !status.can_bid) {
    const needsCard = /^Add a card/.test(status.reason || '');
    return <div className="form-stack">
      <p className="field-note">{returnedFromCard && needsCard ? 'Saving your card… this takes a few seconds.' : status.reason}</p>
      {needsCard && !returnedFromCard && <button type="button" className="primary" disabled={cardBusy} onClick={addCard}>{cardBusy ? 'Opening…' : 'Add a card to bid'}<ArrowRight size={16}/></button>}
      {error && <p role="alert" className="error">{error}</p>}
    </div>;
  }
  const step = auctionIncrement(item.price_cents);
  return <form className="form-stack" onSubmit={submit}>
    {status?.is_high_bidder && <p role="status" className="field-note">You are the highest bidder. Your maximum is {money(status.my_max_cents)}.</p>}
    {status && !status.is_high_bidder && status.my_max_cents && <p role="status" className="field-note">You have been outbid. Your maximum was {money(status.my_max_cents)}.</p>}
    <div className="form-row">
      <label>Your maximum bid <span className="optional">{status?.is_high_bidder ? 'raise it' : `at least ${money(minimum)}`}</span><input type="number" min={status?.is_high_bidder ? undefined : (minimum/100).toFixed(2)} step="0.01" value={amount} onChange={event=>setAmount(event.target.value)} required disabled={busy}/></label>
      <button className="primary" disabled={busy || !agree}>{busy ? 'Placing…' : 'Place bid'}<ArrowRight size={16}/></button>
    </div>
    <p className="field-note">We bid for you, only as much as needed to keep you in the lead, up to your maximum. Bids go up in steps of {money(step)} at this price. A bid in the last 5 minutes extends the auction by 5 minutes.</p>
    <label className="certificate-confirm"><input type="checkbox" checked={agree} onChange={event => setAgree(event.target.checked)} disabled={busy}/>I understand a bid is a binding commitment to buy this item if I win. If I win and do not pay within 48 hours, I may lose the ability to bid.</label>
    {result && <p role="status" className="field-note">{result.outbid_by_existing_maximum ? `Another bidder's maximum is higher, so you were outbid. The current bid is ${money(result.amount_cents)}.` : `You are the highest bidder at ${money(result.amount_cents)}, with a maximum of ${money(result.my_max_cents)}.`}{result.extended ? ' The auction was extended by 5 minutes.' : ''}</p>}
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

// The order itself (inspection checklist, handoff code) lives in the order's conversation, where buyer and seller already are; this
// is the item page's short status with a way into it.
function PurchasedItemFulfillment({ item, payout, onOpenMessages }) {
  const pickup = item.fulfillment_method === 'pickup';
  const released = item.escrow_status === 'released' || payout?.escrow_status === 'released';
  const status = payout?.handoff_verified_at ? 'Handoff completed.'
    : payout?.has_open_dispute ? 'You reported a problem. Our team and the seller will follow up.'
    : pickup && payout?.pickup_code ? 'You accepted the item. Your handoff code is waiting in messages.'
    : pickup && payout?.escrow_status === 'held' ? 'Inspect the item at the meetup, then accept it to get your handoff code.'
    : !pickup && payout?.escrow_status === 'held' && payout.delivered_at && !payout.inspection_accepted_at ? 'Delivered. Check the item and accept it, or report a problem.'
    : null;
  const payoutLine = released ? null : payout?.release_after && !payout.has_open_dispute ? `The seller is paid on ${payoutDate(payout.release_after)} unless you report a problem before then.` : null;
  const canOpen = !!item.conversation_id && onOpenMessages;
  return <div className="evidence-box"><h3><Package size={18}/>{pickup ? 'Pickup' : 'Shipping'}</h3>
    {pickup ? <><p>Meet at {item.pickup_station?.jurisdiction}{item.pickup_station?.city ? ` — ${item.pickup_station.city}` : ''}</p>{item.pickup_station?.notes && <p className="field-note">{item.pickup_station.notes}</p>}</>
      : item.shipped_at ? <><p>Shipped {new Date(item.shipped_at).toLocaleDateString()}</p>{item.tracking_number && <p><a href={item.tracking_url} target="_blank" rel="noreferrer">Track: {item.tracking_number}</a></p>}{item.tracking_status && item.tracking_status !== 'UNKNOWN' && <p className="field-note">Status: {item.tracking_status}</p>}</>
      : <p className="field-note">The seller hasn't shipped this yet.</p>}
    {status && <p>{status}</p>}
    {payoutLine && <p className="field-note">{payoutLine}</p>}
    {canOpen && status && <button type="button" className="text-button" onClick={() => onOpenMessages(item.conversation_id)}><MessageCircle size={16}/>Open in messages</button>}
    <p className="field-note">{released ? 'Payment released to the seller' : pickup ? 'We hold your payment until the handoff is complete' : 'We hold your payment until you have had time to check the item'}{item.insured ? ' · Insured' : ''}</p></div>;
}

function SoldItemCard({ sale, payout, session, onShipped, onRefundChanged, focusConversationId, onFocused, onOpenMessages }) {
  const [shipping, setShipping] = useState(false);
  const [needsParcel, setNeedsParcel] = useState(false);
  const [parcel, setParcel] = useState({ weight_oz: '', length_in: '', width_in: '', height_in: '' });
  const [rates, setRates] = useState(null), [ratesError, setRatesError] = useState('');
  const [busy, setBusy] = useState(false);
  const sellerPayoutLine = payout?.escrow_status === 'released' || sale.escrow_status === 'released' ? `Payment released${sale.funds_released_at ? ' ' + new Date(sale.funds_released_at).toLocaleDateString() : ''}`
    : payout?.has_open_dispute ? 'Payout paused while a refund request is open'
    : payout?.under_review ? 'Your payout is being reviewed by our team'
    : payout?.release_after ? `Payout available ${payoutDate(payout.release_after)}`
    : sale.fulfillment_method === 'pickup' ? 'Payment is held until you complete the handoff'
    : sale.shipped_at ? 'Payment is held until delivery is confirmed, then released after a short inspection period' : null;
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
      {sellerPayoutLine && <p className="field-note">{sellerPayoutLine}</p>}
      {sale.fulfillment_method === 'pickup' ? <>
          <p className="field-note">Meet at {sale.pickup_station?.jurisdiction}{sale.pickup_station?.city ? ` — ${sale.pickup_station.city}` : ''}</p>
          <p className="field-note">{payout?.handoff_verified_at ? `Handoff completed ${new Date(payout.handoff_verified_at).toLocaleDateString()}.` : payout?.has_open_dispute ? 'The buyer reported a problem, so this handoff is paused.' : payout?.inspection_accepted_at ? 'The buyer accepted the item. Enter their handoff code in messages.' : 'Waiting for the buyer to inspect the item. They will give you a code to enter in messages.'}</p>
          {sale.conversation_id && !payout?.handoff_verified_at && <button type="button" className="text-button" onClick={() => onOpenMessages(sale.conversation_id)}><MessageCircle size={16}/>Open in messages</button>}
        </>
      : sale.shipped_at ? <p className="field-note">Shipped · {sale.tracking_number ? <a href={sale.tracking_url} target="_blank" rel="noreferrer">Track {sale.tracking_number}</a> : 'Tracking pending'}{sale.label_url && <> · <a href={sale.label_url} target="_blank" rel="noreferrer">Print label</a></>}</p>
        : !shipping ? <button type="button" className="text-button attention-glow" onClick={startShipping}><Package size={16}/>Ship now</button>
        : needsParcel ? <form className="form-stack" onSubmit={getRatesWithParcel}>
            <p className="field-note">This listing predates saved package sizes — enter it once here.</p>
            <div className="form-row">
              <label>Weight (oz)<input type="number" min="1" required value={parcel.weight_oz} onChange={e => setParcel({ ...parcel, weight_oz: e.target.value })}/>{formatWeight(parcel.weight_oz) && <small className="weight-readout">= {formatWeight(parcel.weight_oz)}</small>}</label>
              <label>Length (in)<input type="number" min="1" required value={parcel.length_in} onChange={e => setParcel({ ...parcel, length_in: e.target.value })}/>{formatLength(parcel.length_in) && <small className="weight-readout">= {formatLength(parcel.length_in)}</small>}</label>
            </div>
            <div className="form-row">
              <label>Width (in)<input type="number" min="1" required value={parcel.width_in} onChange={e => setParcel({ ...parcel, width_in: e.target.value })}/>{formatLength(parcel.width_in) && <small className="weight-readout">= {formatLength(parcel.width_in)}</small>}</label>
              <label>Height (in)<input type="number" min="1" required value={parcel.height_in} onChange={e => setParcel({ ...parcel, height_in: e.target.value })}/>{formatLength(parcel.height_in) && <small className="weight-readout">= {formatLength(parcel.height_in)}</small>}</label>
            </div>
            {ratesError && <p role="alert" className="error">{ratesError}</p>}
            <button className="primary" disabled={busy}>{busy ? 'Checking rates…' : 'Get shipping rates'}</button>
            <button type="button" className="text-button" onClick={() => setShipping(false)}>Cancel</button>
          </form>
        : rates ? <div className="form-stack">
            {rates.some(rate => rate.affordable !== undefined) ? <>
              <p className="field-note">You offered free shipping, so you choose the service and the label cost comes out of your payout. Buy the label, then print it and attach it to the package.</p>
              {rates.map(rate => <button key={rate.rate_id} type="button" className="primary" disabled={busy || !rate.affordable} onClick={() => buyLabel(rate.rate_id)}>{busy ? 'Buying label…' : `${rate.provider} ${rate.servicelevel} — ${money(rate.amount_cents)} from your payout${rate.estimated_days ? ` · about ${rate.estimated_days}d` : ''}${rate.affordable ? '' : ' (more than this sale pays out)'}`}</button>)}
            </> : <>
              <p className="field-note">{rates.length === 1 ? 'Your buyer chose this shipping service and paid for it. Buy the label, then print it and attach it to the package.' : 'Buy the label for this order.'}</p>
              {rates.map(rate => <button key={rate.rate_id} type="button" className="primary" disabled={busy} onClick={() => buyLabel(rate.rate_id)}>{busy ? 'Buying label…' : `Buy label — ${rate.provider} ${rate.servicelevel}`}</button>)}
              {rates.length === 1 && <p className="field-note">{rates[0].estimated_days ? `About ${rates[0].estimated_days} day${rates[0].estimated_days === 1 ? '' : 's'} in transit. ` : ''}The label cost comes out of the shipping your buyer paid.</p>}
            </>}
            {ratesError && <p role="alert" className="error">{ratesError}</p>}
            <button type="button" className="text-button" onClick={() => setRates(null)}>Back</button>
          </div>
        : <p role="status" className="field-note">{busy ? 'Checking rates…' : ratesError || 'Could not get rates.'}</p>}
      <SellerRefundPanel sale={sale} onResolved={onRefundChanged}/>
      <MessageThread conversationId={sale.conversation_id} service={service} session={session} counterpartyLabel="buyer" messageCount={sale.message_count} autoOpen={focusConversationId === sale.conversation_id} onFocused={onFocused} onRead={onRefundChanged} pickupStation={sale.fulfillment_method === 'pickup' ? sale.pickup_station : null}/>
    </div>
  </div>;
}

function MessagesInbox({ conversations, session, service, focusConversationId, onFocused, selectedConversationId, onSelect, onOpenListing, onRead, onClear, purchases = [], sales = [], payoutByPurchase = {}, actionConversationIds = new Set(), onOrderChanged }) {
  useEffect(() => { if (focusConversationId) { onSelect(focusConversationId); onFocused?.(); } }, [focusConversationId]);
  if (!session) return <div className="empty-state"><MessageCircle size={34}/><h3>Sign in to see your messages.</h3><p>Conversations with buyers and sellers live here.</p></div>;
  const selected = conversations.find(c => c.id === selectedConversationId);
  if (selected) return <>
    <div className="thread-header-row"><button className="back-button" onClick={() => onSelect(null)}><ArrowLeft size={17}/>Back to messages</button><button type="button" className="text-button" onClick={() => onClear(selected.id)}><X size={16}/>Clear</button></div>
    {(() => {
      const bought = purchases.find(p => p.conversation_id === selected.id), sold = sales.find(x => x.conversation_id === selected.id);
      const order = bought || sold;
      return order ? <OrderActionCard role={bought ? 'buyer' : 'seller'} order={order} payout={payoutByPurchase[bought ? bought.purchase_id : sold.id]} service={service} onChanged={onOrderChanged}/> : null;
    })()}
    <MessageThread key={selected.id} conversationId={selected.id} service={service} session={session} counterpartyLabel={selected.role === 'buyer' ? 'seller' : 'buyer'} forceOpen pinnedListing={selected} onOpenListing={onOpenListing} onRead={onRead} pickupStation={selected.pickup_enabled ? selected.pickup_station : null}/>
  </>;
  if (!conversations.length) return <div className="empty-state"><MessageCircle size={34}/><h3>No conversations yet.</h3><p>Message a seller from any listing to start one.</p></div>;
  return <div className="items-grid">{conversations.map(c => <button key={c.id} className={`item-card conversation-row${actionConversationIds.has(c.id) ? ' needs-action attention-glow' : ''}`} onClick={() => onSelect(c.id)}>{actionConversationIds.has(c.id) && <span className="action-badge">Action needed: open this order</span>}
    <span role="button" tabIndex={0} className="icon-button conversation-clear" aria-label="Clear conversation" onClick={event => { event.stopPropagation(); onClear(c.id); }}><X size={14}/></span>
    <ItemArt photo={c.media?.[0]?.url}/>
    <div className="item-card-content">
      <div className="card-meta"><span>{c.role === 'buyer' ? 'Seller' : 'Buyer'}: {c.counterparty_name}</span>{c.unread && <span className="unread-dot" aria-label="Unread"/>}</div>
      <h3>{c.listing_status === 'sold' ? c.listing_title : c.listing_status && c.listing_status !== 'active' ? 'No longer available' : c.listing_title}{c.listing_status === 'sold' && <span className="sold-tag"> · Sold</span>}</h3>
      <p>{c.last_message_body || 'No messages yet — say hello.'}</p>
    </div>
  </button>)}</div>;
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

// Opt-in only (checkbox defaults unchecked) -- carrier/TCPA compliance requires explicit consent,
// not a pre-checked box. The consent copy here is also what gets screenshotted/linked for
// Twilio's toll-free verification as "documentation of how users opt in to messaging".
function SmsNotificationSettings({ profile }) {
  const [phone, setPhone] = useState(profile?.phone_number || '');
  const [optIn, setOptIn] = useState(!!profile?.sms_opt_in);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(false);
  async function submit(event) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError(''); setSaved(false);
    try { await service.updateSmsPreferences(phone, optIn); setSaved(true); setTimeout(() => setSaved(false), 2000); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <div className="evidence-box"><h3>Text message alerts</h3>
    <p className="field-note">Get a text when a buyer wants to purchase your item, when you win or get outbid on an auction, or when a seller confirms your order.</p>
    <form className="form-stack" onSubmit={submit}>
      <label>Phone number<input type="tel" value={phone} onChange={event => setPhone(event.target.value)} placeholder="+1 555 555 5555" disabled={busy} required={optIn}/></label>
      <label className="certificate-confirm"><input type="checkbox" checked={optIn} onChange={event => setOptIn(event.target.checked)} disabled={busy}/>Text me about my orders and bids. Message frequency varies. Msg &amp; data rates may apply. Reply STOP to opt out, HELP for help.</label>
      {error && <p role="alert" className="error">{error}</p>}
      <button className="primary" disabled={busy}>{busy ? 'Saving…' : saved ? 'Saved!' : 'Save'}</button>
    </form>
  </div>;
}

function AdminDisputeRow({ request, onResolve }) {
  const [amount, setAmount] = useState(''), [note, setNote] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [evidence, setEvidence] = useState(null);
  useEffect(() => { service.adminPurchaseEvidence(request.purchase_id).then(setEvidence).catch(() => {}); }, [request.purchase_id]);
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
    {evidence?.inspection_accepted_at && <p className="field-note">Buyer inspected and accepted on {new Date(evidence.inspection_accepted_at).toLocaleString()} (confirmed: {Object.keys(evidence.inspection_checks || {}).map(key => ({ certificate_matches: 'certificate number', matches_photos: 'matches photos', signature_ok: 'signature' }[key] || key)).join(', ')}).</p>}
    {evidence?.inspection_issue && <p className="field-note">Problem reported at the pickup inspection: {evidence.inspection_issue}</p>}
    {evidence && <p className="field-note">{evidence.fulfillment_method === 'pickup'
      ? (evidence.handoff_verified_at ? `Pickup handoff code was verified ${new Date(evidence.handoff_verified_at).toLocaleString()}.` : 'Pickup handoff code was never entered.')
      : [evidence.shipped_at ? `Shipped ${new Date(evidence.shipped_at).toLocaleDateString()}` : 'Not shipped', evidence.tracking_status ? `tracking ${evidence.tracking_status}` : null, evidence.delivered_at ? `delivered ${new Date(evidence.delivered_at).toLocaleDateString()}` : null].filter(Boolean).join(' · ')}</p>}
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
        : messages.map(message => <div key={message.id} className="support-message"><div className="recorded"><div><strong>{message.role === 'user' ? 'Member' : message.role === 'operator' ? 'Credabilia Team' : 'King Credion'}{message.kind === 'bug' && message.role === 'user' ? ' · BUG REPORT' : ''}</strong><p>{message.body}</p>{message.page_url && <p className="field-note">Page: {message.page_url}</p>}{message.user_agent && <p className="field-note">Browser: {message.user_agent}</p>}</div></div></div>)}
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
    <div className="admin-row-head"><span>{c.display_name}{c.has_bug ? ' · BUG REPORT' : ''}</span><span>{new Date(c.last_created_at).toLocaleString()}</span></div>
    <p className="field-note">{c.last_body}</p>
    <button type="button" className="text-button" onClick={() => setOpenUserId(openUserId === c.user_id ? null : c.user_id)}>{openUserId === c.user_id ? 'Hide thread' : 'Open thread'}</button>
    {openUserId === c.user_id && <AdminSupportThread userId={c.user_id} onClosed={load}/>}
  </div>)}</div>;
}

function AdminMemberActions({ member, flag, onChanged }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [banning, setBanning] = useState(false), [reason, setReason] = useState('');
  async function run(action) {
    setBusy(true); setError('');
    try { await action(); setBanning(false); setReason(''); onChanged(); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <div className="form-stack">
    {flag?.banned_at && <p className="error">Banned {new Date(flag.banned_at).toLocaleDateString()}{flag.ban_reason ? ` — ${flag.ban_reason}` : ''}</p>}
    {flag?.payout_review && !flag?.banned_at && <p className="field-note">Payouts are on hold for review.</p>}
    {error && <p role="alert" className="error">{error}</p>}
    {banning && <form className="form-stack" onSubmit={event => { event.preventDefault(); if (!busy && reason.trim()) run(() => service.adminBanUser(member.id, reason)); }}>
      <label>Reason for the ban<textarea value={reason} onChange={event => setReason(event.target.value)} rows={2} maxLength={500} required/></label>
      <p className="field-note">This signs them out, takes their listings down, freezes their payouts and blocks the cards and bank accounts they used.</p>
      <div className="submit-row"><button className="primary" disabled={busy || !reason.trim()}>{busy ? 'Banning…' : 'Ban this member'}</button><button type="button" className="text-button" onClick={() => setBanning(false)}>Cancel</button></div>
    </form>}
    {!banning && <div className="submit-row">
      {flag?.banned_at
        ? <button type="button" className="text-button" disabled={busy} onClick={() => run(() => service.adminUnbanUser(member.id))}>Lift ban</button>
        : <>
            <button type="button" className="text-button" disabled={busy} onClick={() => run(() => service.adminSetPayoutReview(member.id, !flag?.payout_review))}>{flag?.payout_review ? 'Clear payout hold' : 'Hold payouts for review'}</button>
            <button type="button" className="text-button" disabled={busy} onClick={() => setBanning(true)}>Ban…</button>
          </>}
    </div>}
  </div>;
}

function AdminUsers() {
  const [search, setSearch] = useState(''), [list, setList] = useState(undefined), [error, setError] = useState(''), [flags, setFlags] = useState([]);
  const loadFlags = () => service.adminMemberFlags().then(setFlags).catch(() => {});
  useEffect(() => { const timer = setTimeout(() => { service.adminListUsers(search || null).then(setList).catch(err => setError(err.message)); }, 250); return () => clearTimeout(timer); }, [search]);
  useEffect(() => { loadFlags(); }, []);
  const flagFor = id => flags.find(f => f.user_id === id);
  return <div className="form-stack">
    <label>Search by name or email<input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search members…"/></label>
    {error && <p role="alert" className="error">{error}</p>}
    {list === undefined ? <p role="status">Loading members…</p> : <div className="admin-list">{list.map(u => <div key={u.id} className="evidence-box">
      <div className="admin-row-head"><span>{u.display_name}</span><span>Joined {new Date(u.created_at).toLocaleDateString()}</span></div>
      <p className="field-note">{u.email}</p>
      <p className="field-note">{u.listing_count} listings · {u.sales_count} sales · {u.purchase_count} purchases</p>
      <AdminMemberActions member={u} flag={flagFor(u.id)} onChanged={loadFlags}/>
    </div>)}</div>}
  </div>;
}

function AdminSignatureLibrary() {
  const [provenance, setProvenance] = useState('self_reported');
  const [list, setList] = useState(undefined), [error, setError] = useState(''), [busyId, setBusyId] = useState(null);
  function load() { service.adminListSignatureReferences(provenance).then(setList).catch(err => setError(err.message)); }
  useEffect(() => { load(); }, [provenance]);
  async function promote(id) { setBusyId(id); setError(''); try { await service.adminPromoteSignatureReference(id); load(); } catch (err) { setError(err.message); } finally { setBusyId(null); } }
  async function discard(id) { setBusyId(id); setError(''); try { await service.adminDiscardSignatureReference(id); load(); } catch (err) { setError(err.message); } finally { setBusyId(null); } }
  return <div className="form-stack">
    <p className="field-note">Every signature with a subject filled in is auto-captured here for review. Only promoted references are usable for future comparisons.</p>
    <div className="categories" role="group" aria-label="Signature library view">
      <button aria-pressed={provenance === 'self_reported'} className={provenance === 'self_reported' ? 'active' : ''} onClick={() => setProvenance('self_reported')}>Awaiting review</button>
      <button aria-pressed={provenance === 'operator_curated'} className={provenance === 'operator_curated' ? 'active' : ''} onClick={() => setProvenance('operator_curated')}>Curated library</button>
    </div>
    {error && <p role="alert" className="error">{error}</p>}
    {list === undefined ? <p role="status">Loading…</p>
      : !list.length ? <p className="field-note">{provenance === 'self_reported' ? 'No signatures awaiting review.' : 'No curated references yet.'}</p>
      : <div className="items-grid">{list.map(ref => <div key={ref.id} className="item-card evidence-box">
          {ref.url ? <img src={ref.url} alt={`Signature for ${ref.subject_name}`} className="admin-signature-photo"/> : <p className="field-note">Photo unavailable</p>}
          <p><strong>{ref.subject_name}</strong></p>
          <p className="field-note">From "{ref.listing_title}"</p>
          {ref.description && <p className="field-note">{ref.description}</p>}
          <p className="field-note">{ref.has_embedding ? 'Indexed' : 'Not yet indexed'}</p>
          <div className="form-row">
            {provenance === 'self_reported' && <button type="button" className="text-button" disabled={busyId === ref.id} onClick={() => promote(ref.id)}>{busyId === ref.id ? 'Promoting…' : 'Promote to library'}</button>}
            <button type="button" className="text-button danger-button" disabled={busyId === ref.id} onClick={() => discard(ref.id)}>{busyId === ref.id ? 'Removing…' : 'Discard'}</button>
          </div>
        </div>)}</div>}
  </div>;
}

function AdminListingReview() {
  const [list, setList] = useState(undefined), [error, setError] = useState(''), [busyId, setBusyId] = useState(null), [reasonDraft, setReasonDraft] = useState({});
  function load() { service.adminListNeedsReviewListings().then(setList).catch(err => setError(err.message)); }
  useEffect(() => { load(); }, []);
  async function approve(id) { setBusyId(id); setError(''); try { await service.adminApproveListing(id); load(); } catch (err) { setError(err.message); } finally { setBusyId(null); } }
  async function reject(id) { setBusyId(id); setError(''); try { await service.adminRejectListing(id, reasonDraft[id]); load(); } catch (err) { setError(err.message); } finally { setBusyId(null); } }
  if (error) return <p role="alert" className="error">{error}</p>;
  if (list === undefined) return <p role="status">Loading…</p>;
  if (!list.length) return <p className="field-note">Nothing pending review.</p>;
  return <div className="items-grid">{list.map(item => <div key={item.id} className="item-card evidence-box">
    {item.media?.find(asset=>asset.kind==='item')?.url ? <img src={item.media.find(asset=>asset.kind==='item').url} alt={item.title} className="admin-signature-photo"/> : <p className="field-note">Photo unavailable</p>}
    <p><strong>{item.title}</strong></p>
    <p className="field-note">By {item.seller_name} · {item.category}</p>
    <p className="field-note">AI flagged: {item.needs_review_reason || 'No reason given.'}</p>
    <div className="form-row">
      <button type="button" className="text-button" disabled={busyId === item.id} onClick={() => approve(item.id)}>{busyId === item.id ? 'Approving…' : 'Approve'}</button>
      <button type="button" className="text-button danger-button" disabled={busyId === item.id} onClick={() => reject(item.id)}>{busyId === item.id ? 'Rejecting…' : 'Reject'}</button>
    </div>
    <label>Rejection note <span className="optional">optional</span><input value={reasonDraft[item.id] || ''} onChange={event => setReasonDraft(d => ({ ...d, [item.id]: event.target.value }))} maxLength={300}/></label>
  </div>)}</div>;
}

function AdminDashboard() {
  const [tab, setTab] = useState('disputes');
  return <div className="form-stack" data-clarity-mask="True">
    <div className="categories" role="group" aria-label="Admin sections">
      <button aria-pressed={tab === 'disputes'} className={tab === 'disputes' ? 'active' : ''} onClick={() => setTab('disputes')}>Disputes</button>
      <button aria-pressed={tab === 'reports'} className={tab === 'reports' ? 'active' : ''} onClick={() => setTab('reports')}>Reports</button>
      <button aria-pressed={tab === 'support'} className={tab === 'support' ? 'active' : ''} onClick={() => setTab('support')}>Support</button>
      <button aria-pressed={tab === 'users'} className={tab === 'users' ? 'active' : ''} onClick={() => setTab('users')}>Users</button>
      <button aria-pressed={tab === 'signatures'} className={tab === 'signatures' ? 'active' : ''} onClick={() => setTab('signatures')}>Signature library</button>
      <button aria-pressed={tab === 'listings'} className={tab === 'listings' ? 'active' : ''} onClick={() => setTab('listings')}>Listing review</button>
    </div>
    {tab === 'disputes' && <AdminDisputes/>}
    {tab === 'reports' && <AdminReports/>}
    {tab === 'support' && <AdminSupport/>}
    {tab === 'users' && <AdminUsers/>}
    {tab === 'signatures' && <AdminSignatureLibrary/>}
    {tab === 'listings' && <AdminListingReview/>}
  </div>;
}

// Greyscale photo with the royal lock on top, for a listing whose seller has not finished Stripe setup (see listingLocked).
function LockedPhoto({ locked, children }) {
  if (!locked) return children;
  return <div className="locked-photo">{children}<div className="lock-overlay large" role="status"><img src="/brand/royal-lock-v1-optimized.webp" alt="" width="120" height="120"/><span>Locked. The seller has been notified and needs to finish Stripe setup. It opens automatically once they do.</span></div></div>;
}

// Auctions that closed on their own (no bids, or the winner did not pay) wait here so the seller can relist them with one tap, as a fixed
// price or as another auction.
function EndedListings({ items, onChanged }) {
  if (!items.length) return <div className="empty-state"><Layers size={34}/><h3>No ended auctions.</h3><p>When an auction ends with no bids, or the winner does not pay, it lands here so you can relist it with one tap.</p></div>;
  return <div className="items-grid">{items.map(item => <EndedListingCard key={item.id} item={item} onChanged={onChanged}/>)}</div>;
}
function EndedListingCard({ item, onChanged }) {
  const [type, setType] = useState('fixed'), [price, setPrice] = useState((item.price_cents / 100).toFixed(2)), [days, setDays] = useState('5');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError('');
    try { await service.relistEndedListing(item.id, type, priceInCents(price), type === 'auction' ? Number(days) : null); onChanged(); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  // An auction that closed on its own gets the same treatment as a locked listing: greyscale photo with a stamp on top.
  const stamp = item.reason === 'auction_no_bids' ? { src: '/brand/auction-ended-no-bids-stamp-v1.webp', alt: 'Auction ended, no bids' }
    : item.reason === 'auction_unpaid' ? { src: '/brand/auction-ended-unpaid-stamp-v1.webp', alt: 'Auction ended, not paid' } : null;
  return <div className="item-card static"><div className={`ended-photo${stamp ? ' has-stamp' : ''}`}><ItemArt category={item.category} photo={item.media?.find(asset => asset.kind === 'item')?.url}/>{stamp && <span className="lock-overlay ended-stamp"><img src={stamp.src} alt={stamp.alt} width="170" height="168"/></span>}</div><div className="item-card-content">
    <div className="card-meta"><span>{item.category}</span><span>ENDED</span></div><h3>{item.title}</h3>
    <p className="field-note">{item.reason === 'auction_unpaid' ? 'The winner did not pay and no other bidder took it.' : 'This auction ended with no bids.'}</p>
    <form className="form-stack" onSubmit={submit}>
      <div className="categories" aria-label="Sale format"><button type="button" aria-pressed={type === 'fixed'} className={type === 'fixed' ? 'active' : ''} onClick={() => setType('fixed')}>Fixed price</button><button type="button" aria-pressed={type === 'auction'} className={type === 'auction' ? 'active' : ''} onClick={() => setType('auction')}>Auction</button></div>
      <label>{type === 'auction' ? 'Starting bid (USD)' : 'Price (USD)'}<input type="number" min="1" max="1000000" step="0.01" value={price} onChange={event => setPrice(event.target.value)} required disabled={busy}/></label>
      {type === 'auction' && <label>Auction length<select value={days} onChange={event => setDays(event.target.value)} disabled={busy}><option value="3">3 days</option><option value="5">5 days</option><option value="7">7 days</option></select></label>}
      {error && <p role="alert" className="error">{error}</p>}
      <button className="primary" disabled={busy}>{busy ? 'Relisting…' : 'Relist this item'}<ArrowRight size={16}/></button>
    </form>
  </div></div>;
}

// Switch a live listing between fixed price and auction, only while no one has bid and no buyer is mid-purchase (the server enforces it).
function SaleFormatSwitch({ item, onChanged }) {
  const [days, setDays] = useState('5'), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const auction = item.listing_type === 'auction';
  if (auction && item.bid_count > 0) return <p className="field-note">This auction has bids, so it can't be switched to a fixed price.</p>;
  async function switchFormat() {
    setBusy(true); setError('');
    try { await service.changeListingType(item.id, auction ? 'fixed' : 'auction', auction ? null : Number(days)); onChanged(); }
    catch (err) { setError(err.message); setBusy(false); }
  }
  return <div className="evidence-box"><h3>Sale format</h3>
    <p className="field-note">{auction ? 'No one has bid yet, so you can switch this to a fixed price.' : 'You can run this item as an auction instead. The current price becomes the starting bid.'}</p>
    {!auction && <label>Auction length<select value={days} onChange={event => setDays(event.target.value)} disabled={busy}><option value="3">3 days</option><option value="5">5 days</option><option value="7">7 days</option></select></label>}
    {error && <p role="alert" className="error">{error}</p>}
    <button type="button" className="text-button" disabled={busy} onClick={switchFormat}>{busy ? 'Switching…' : auction ? 'Switch to fixed price' : 'Switch to auction'}</button>
  </div>;
}

function DeleteListingButton({ item, onDeleted }) {
  const [confirming, setConfirming] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function confirmDelete() {
    setBusy(true); setError('');
    try { await service.deleteListing(item.id); onDeleted(); }
    catch (err) { setError(err.message); setBusy(false); }
  }
  return <div>
    {!confirming
      ? <button type="button" className="text-button danger-button" onClick={() => setConfirming(true)}>Delete listing</button>
      : <div className="form-row"><button type="button" className="primary danger" disabled={busy} onClick={confirmDelete}>{busy ? 'Deleting…' : 'Yes, delete this listing'}</button><button type="button" className="text-button" disabled={busy} onClick={() => setConfirming(false)}>Cancel</button></div>}
    {error && <p role="alert" className="error">{error}</p>}
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
      <SmsNotificationSettings profile={profile}/>
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
// King Credion's signature opinion as shown to everyone: his icon, the opinion, and the fixed "library is still growing" note.
function KingOpinion({ label, note }) {
  return <div className="king-opinion"><img className="king-icon" src="/brand/king-credion-signature-icon-v2.png" alt="King Credion" width="44" height="42"/><p className="field-note">King Credion's opinion: {LABELS_AI[label]} — not verified. {note} <span className="trust-highlight">King Credion's signature library is still growing, so his opinion gets smarter over time.</span></p></div>;
}

function AuditQueue({ items, session, profile, onNeedLogin, onAudited, focusItemId, onFocused }) {
  // Deep-linked from an item's own detail page ("Audit this item") -- move that item to the
  // front of the queue once, so the person lands on the exact item they came from instead of
  // whatever happened to be first. A plain useState(items) would ignore focusItemId entirely.
  const [queue, setQueue] = useState(() => {
    const idx = focusItemId ? items.findIndex(item => item.id === focusItemId) : -1;
    if (idx <= 0) return items;
    const reordered = items.slice();
    const [target] = reordered.splice(idx, 1);
    return [target, ...reordered];
  });
  const [total] = useState(items.length);
  useEffect(() => { if (focusItemId) onFocused?.(); }, []);
  const [verdict, setVerdict] = useState(null);
  const [explanation, setExplanation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [signatureBusy, setSignatureBusy] = useState(false);
  const [signatureError, setSignatureError] = useState('');
  const current = queue[0];

  function advance() { setQueue(list => list.slice(1)); setVerdict(null); setExplanation(''); setError(''); setSignatureError(''); }
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
  // The buyer-audit fallback: only reachable when automation never produced an opinion (API was
  // down at creation, or an older listing predates auto-trigger). Own busy/error state, separate
  // from the audit-submission form's -- this runs independently of submitting a verdict. Patches
  // queue[0] directly since it's seeded once from the items prop and never re-syncs (a parent
  // refresh wouldn't reach an already-mounted instance).
  async function getSignatureOpinion() {
    if (signatureBusy) return;
    setSignatureBusy(true); setSignatureError('');
    try {
      const result = await service.analyzeSignature(signaturePhoto.path, current.attributes?.subject, current.id);
      setQueue(list => [{ ...list[0], signature_ai_label: result.label, signature_ai_note: result.note }, ...list.slice(1)]);
    } catch (err) { setSignatureError(err.message); }
    finally { setSignatureBusy(false); }
  }
  return <div className="form-stack audit-queue">
    <div className="queue-progress"><span>Item {total - queue.length + 1} of {total}</span><div className="queue-progress-bar"><div style={{ width: `${((total - queue.length) / total) * 100}%` }}/></div></div>
    <div className="evidence-box">
      {current.media?.some(asset => asset.kind === 'item') ? <PhotoGallery service={service} key={current.id} media={current.media} title={current.title}/> : <ItemArt kind={current.artwork} category={current.category} large/>}
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
          <PhotoGallery service={service} media={current.media} kind="signature" title={current.title}/>
          {current.signature_ai_label ? <KingOpinion label={current.signature_ai_label} note={current.signature_ai_note}/> : <>
            <p className="field-note">King Credion has not given an opinion on this signature yet.</p>
            {profile?.can_audit && <button type="button" className="text-button" onClick={getSignatureOpinion} disabled={signatureBusy}>{signatureBusy ? 'Reviewing…' : 'Get AI opinion'}</button>}
            {signatureError && <p role="alert" className="error">{signatureError}</p>}
          </>}
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
  const [busy, setBusy] = useState(false), [sentTo, setSentTo] = useState(''), [error, setError] = useState(''), [resent, setResent] = useState(false);
  async function send(email) {
    setBusy(true); setError('');
    try { await service.signInWithEmail(email); setSentTo(email.trim()); return true; }
    catch (err) { setError(err.message); return false; }
    finally { setBusy(false); }
  }
  function submit(event) { event.preventDefault(); if (!busy) send(new FormData(event.currentTarget).get('email')); }
  async function verify(event) {
    event.preventDefault(); if (busy) return;
    const code = new FormData(event.currentTarget).get('code');
    setBusy(true); setError('');
    try { await service.verifyEmailCode(sentTo, code); }
    catch (err) { setError(/expired|invalid/i.test(err.message) ? 'That code is not right or has expired. Check the newest email, or send a new code.' : err.message); setBusy(false); }
  }
  async function resend() { setResent(false); if (await send(sentTo)) setResent(true); }
  return sentTo ? <form className="form-stack" onSubmit={verify}>
    <div role="status" className="evidence-box"><h3>Check your inbox</h3><p>We emailed an {EMAIL_CODE_LENGTH}-digit code to {sentTo}. Enter it below to sign in. It also creates your account if you're new.</p>{!isNativeApp() && <p>You can also open the sign-in link in the email in this browser.</p>}</div>
    <label>Sign-in code<input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 \-]*" maxLength={EMAIL_CODE_LENGTH + 2} required placeholder="12345678" autoFocus /></label>
    {error && <p className="error" role="alert">{error}</p>}
    {resent && !error && <p className="field-note" role="status">A new code is on its way. Only the newest one works.</p>}
    <button className="primary full-width" disabled={busy}>{busy ? 'Checking…' : 'Sign in'}<ArrowRight size={18}/></button>
    <button type="button" className="text-button" onClick={resend} disabled={busy}>Send a new code</button>
    <button type="button" className="text-button" onClick={() => { setSentTo(''); setError(''); setResent(false); }} disabled={busy}>Use a different email</button>
  </form> : <form className="form-stack" onSubmit={submit}>
    <label>Email address<input name="email" type="email" autoComplete="email" required placeholder="you@example.com" autoFocus /></label>
    <p className="field-note">We'll email you a secure sign-in code. No password to remember.</p>
    {error && <p className="error" role="alert">{error}</p>}
    <button className="primary full-width" disabled={busy}>{busy ? 'Sending code…' : 'Continue with email'}<ArrowRight size={18}/></button>
  </form>;
}

export default function App() {
  // Computed once per load (this app never navigates client-side between routes) so the
  // storefront route can skip the main app's data-fetch effects entirely below.
  const storefrontSlug = (() => { const segments = window.location.pathname.split('/').filter(Boolean); return segments.length === 1 && segments[0] !== 'auth' ? segments[0] : null; })();
  // /terms, /privacy, and /help are standalone, no-login-required pages -- checked before
  // storefrontSlug so they can never be shadowed by a seller's store name (also reserved server-side).
  const legalPage = window.location.pathname === '/terms' ? 'terms' : window.location.pathname === '/privacy' ? 'privacy' : window.location.pathname === '/help' ? 'help' : (window.location.pathname === '/sell' || (isSellHost(window.location.hostname) && window.location.pathname === '/')) ? 'sell' : null;
  // /item/<id> gives each listing its own shareable, bookmarkable, back-button-friendly URL --
  // parsed once here (same pattern as storefrontSlug/legalPage above) and reconciled against the
  // loaded `items`/`buyRequests` once they're fetched, below.
  const itemPathId = (() => { const segments = window.location.pathname.split('/').filter(Boolean); return segments.length === 2 && segments[0] === 'item' ? segments[1] : null; })();
  useState(captureListIntent); // runs once: a ?list=1 arrival becomes a stored intent for the effect below
  const [session, setSession] = useState(null), [authReady, setAuthReady] = useState(false), [profile, setProfile] = useState(null);
  const [workspace, setWorkspace] = useState('collector'), [items, setItems] = useState([]), [audits, setAudits] = useState([]);
  const [category, setCategory] = useState('All items'), [query, setQuery] = useState(''), [selectedId, setSelectedId] = useState(null);
  const [modal, setModal] = useState(null), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [favoriteIds, setFavoriteIds] = useState([]), [purchases, setPurchases] = useState([]), [collectionFilter, setCollectionFilter] = useState('all');
  const [sales, setSales] = useState([]), [sellerTab, setSellerTab] = useState('active'), [endedListings, setEndedListings] = useState([]);
  const [payoutStatus, setPayoutStatus] = useState([]);
  const payoutByPurchase = Object.fromEntries(payoutStatus.map(entry => [entry.purchase_id, entry]));
  const [buyRequests, setBuyRequests] = useState([]), [sellerBuyRequests, setSellerBuyRequests] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [focusAuditItemId, setFocusAuditItemId] = useState(null);
  const [conversations, setConversations] = useState([]), [focusConversationId, setFocusConversationId] = useState(null), [selectedConversationId, setSelectedConversationId] = useState(null);
  const [itemsHasMore, setItemsHasMore] = useState(false), [loadingMore, setLoadingMore] = useState(false);
  const [revision, setRevision] = useState(0);
  const [soldPreview, setSoldPreview] = useState(null);
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
    // The apps finish Google sign-in in a separate step (see service.js); a failure there arrives as an event.
    const onNativeAuthError = event => { if (alive) setError(event.detail || 'Sign-in did not finish. Please try again.'); };
    window.addEventListener('credabilia:auth-error', onNativeAuthError);
    return () => { alive = false; unsubscribe(); window.removeEventListener('credabilia:auth-error', onNativeAuthError); };
  }, []);
  useEffect(() => {
    if (service.mode === 'unconfigured' || storefrontSlug || legalPage) return;
    let alive = true; setLoading(true);
    Promise.all([service.listings(), session ? service.profile(session.user.id) : null, session ? service.myAudits() : [], session ? service.myFavoriteIds() : [], session ? service.myPurchases() : [], session ? service.mySales() : [], session ? service.myNotifications() : [], session ? service.myOpenBuyRequests() : [], session ? service.myBuyRequests() : [], session ? service.listConversations() : [], session ? service.myPayoutStatus().catch(() => []) : [], session ? service.myEndedListings().catch(() => []) : []])
      .then(([listings, account, myAudits, favorites, myPurchases, mySales, myNotifications, myOpenBuyRequests, myBuyRequests, myConversations, myPayoutStatus, myEnded]) => { if (alive) { setItems(listings); setItemsHasMore(listings.length >= LISTINGS_PAGE_SIZE); setProfile(account); setAudits(myAudits); setFavoriteIds(favorites); setPurchases(myPurchases); setSales(mySales); setNotifications(myNotifications); setBuyRequests(myOpenBuyRequests); setSellerBuyRequests(myBuyRequests); setConversations(myConversations); setPayoutStatus(myPayoutStatus); setEndedListings(myEnded); } })
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
  const appliedItemParam = useRef(false), soldLookupStarted = useRef(false);
  // Emails link to /?conversation=<id> (new message, item delivered). Open that conversation once the member is signed in; the id is
  // remembered across the sign-in redirect.
  const conversationParamApplied = useRef(false);
  useEffect(() => {
    if (conversationParamApplied.current || !authReady || loading || storefrontSlug || legalPage) return;
    let id = null;
    try {
      id = new URLSearchParams(window.location.search).get('conversation');
      if (id) { sessionStorage.setItem('credabilia-open-conversation', id); window.history.replaceState({}, '', window.location.pathname); }
      else id = sessionStorage.getItem('credabilia-open-conversation');
    } catch {}
    if (!id || !session) return;
    conversationParamApplied.current = true;
    try { sessionStorage.removeItem('credabilia-open-conversation'); } catch {}
    setFocusConversationId(id); setWorkspace('messages'); setSelectedId(null);
  }, [authReady, loading, session]);
  useEffect(() => {
    if (appliedItemParam.current || soldLookupStarted.current || loading) return;
    const params = new URLSearchParams(window.location.search);
    // Prefer the new /item/<id> path; fall back to the older ?item= query param still used by
    // already-sent push notifications and any bookmarked/shared links from before this existed.
    const itemId = itemPathId || params.get('item');
    if (itemId) {
      appliedItemParam.current = true;
      // A listing under an open buy request is 'pending', not 'active', so it won't be in items --
      // check buyRequests too so a push notification's deep link still resolves after a fresh load.
      if (items.some(item => item.id === itemId) || buyRequests.some(r => r.listing_id === itemId)) {
        setSelectedId(itemId);
        if (!itemPathId) window.history.replaceState({}, '', `/item/${itemId}`); // upgrade an old ?item= link to the real path
      } else if (itemPathId) {
        // Not an active listing -- it may have sold since the link was shared. Show the Sold page if so,
        // otherwise (stale/bad link) fall back to browse rather than a dead detail view.
        appliedItemParam.current = false; soldLookupStarted.current = true;
        service.soldListing(itemPathId).then(sold => {
          if (sold) setSoldPreview(sold); else window.history.replaceState({}, '', '/');
        }).catch(() => window.history.replaceState({}, '', '/')).finally(() => { appliedItemParam.current = true; });
      } else {
        window.history.replaceState({}, '', window.location.pathname); // old behavior: just strip the query param
      }
    }
  }, [items, loading]);
  // Keeps the address bar in sync with whichever item is open, from every entry point (item-card
  // click, notification, relist redirect, etc.) without touching each of those call sites --
  // they all already just call setSelectedId. Skipped on the storefront/legal-page branches below,
  // which never touch selectedId and would otherwise have this overwrite their own URL with '/'.
  useEffect(() => {
    if (!authReady || storefrontSlug || legalPage) return;
    // A direct /item/<id> load must wait for the deep-link effect above to resolve it (items has
    // to fetch first) before this starts managing the URL -- otherwise this fires first with
    // selectedId still null and immediately overwrites the good incoming URL with '/'.
    if (itemPathId && !appliedItemParam.current) return;
    if (soldPreview) return;
    const target = selectedId ? `/item/${selectedId}` : '/';
    if (window.location.pathname !== target) window.history.pushState(null, '', target);
  }, [selectedId, authReady, items, soldPreview]);
  // Share-link previews (crawlers) get real per-page meta from the Vercel routing middleware --
  // this just keeps the browser tab title honest for an actual visitor, who never sees that HTML.
  useEffect(() => {
    if (legalPage === 'sell') return; // the seller landing page sets its own title
    const item = selectedId && items.find(x => x.id === selectedId);
    document.title = item ? `${item.title} | Credabilia` : 'Credabilia | The Memorabilia Kingdom';
  }, [selectedId, items]);
  // Restores native browser back/forward support for item views.
  useEffect(() => {
    const onPopState = () => {
      const segments = window.location.pathname.split('/').filter(Boolean);
      setSelectedId(segments.length === 2 && segments[0] === 'item' ? segments[1] : null);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
  // A visitor who clicked "List your first item" on /sell lands here with a stored intent: send them through
  // sign-in (the flag survives the Google redirect) and straight into the listing form. Expires after a day so an
  // abandoned visit doesn't pop the form open weeks later.
  const loginPrompted = useRef(false);
  useEffect(() => {
    if (!authReady || loading || storefrontSlug || legalPage) return;
    let started = null;
    try { started = Number(localStorage.getItem(LIST_INTENT_KEY)); } catch { return; }
    if (!started) return;
    if (Date.now() - started > 24 * 60 * 60 * 1000) { try { localStorage.removeItem(LIST_INTENT_KEY); } catch {} return; }
    if (!session) { if (!loginPrompted.current) { loginPrompted.current = true; setModal('login'); } return; }
    if (!profile) return;
    try { localStorage.removeItem(LIST_INTENT_KEY); } catch {}
    if (profile.can_sell) setModal('create'); else setError('Your account does not have selling permission.');
  }, [authReady, loading, session, profile]);
  // /?view=requests (the "Buy Request Received" email's button) opens the seller's Requests tab. Remembered in
  // localStorage like the list intent above, because signing in redirects back to the bare site address.
  useEffect(() => {
    if (!authReady || loading || storefrontSlug || legalPage) return;
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('view') === 'requests') {
        localStorage.setItem(REQUESTS_INTENT_KEY, String(Date.now()));
        params.delete('view');
        window.history.replaceState({}, '', window.location.pathname + (params.toString() ? '?' + params : '') + window.location.hash);
      }
      const started = Number(localStorage.getItem(REQUESTS_INTENT_KEY));
      if (!started) return;
      if (Date.now() - started > 24 * 60 * 60 * 1000) { localStorage.removeItem(REQUESTS_INTENT_KEY); return; }
      if (!session) { if (!loginPrompted.current) { loginPrompted.current = true; setModal('login'); } return; }
      localStorage.removeItem(REQUESTS_INTENT_KEY);
      setWorkspace('seller'); setSellerTab('requests'); setSelectedId(null);
    } catch { /* storage unavailable: the link just opens the site */ }
  }, [authReady, loading, session]);
  if (service.mode === 'unconfigured') return <main className="setup"><div className="brand"><Brand/></div><h1>The new foundation is ready to connect.</h1><p>Configure your Supabase project URL and public publishable key to enable email sign-in. Local development also includes a separate sample workspace.</p><p>See README.md for the Supabase setup steps. No real accounts are active in this build yet.</p></main>;
  if (legalPage === 'terms') return <TermsPage/>;
  if (legalPage === 'privacy') return <PrivacyPage/>;
  if (legalPage === 'help') return <HelpPage/>;
  if (legalPage === 'sell') return <SellPage/>;
  if (soldPreview) return <SoldItemPage item={soldPreview} onBack={() => { window.location.href = '/'; }}/>;
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
  // What needs the member right now. The bell glows for anything actionable; Sell glows (until you are there) for seller work;
  // the Sold and Requests tabs glow for their own work, and opening Sell lands on the tab that has something waiting.
  const soldAttention = notifications.some(n => ['ship_pending', 'pickup_awaiting_handoff', 'refund_pending'].includes(n.kind));
  const requestsAttention = notifications.some(n => n.kind === 'buy_request_pending');
  const bellGlow = notifications.some(n => n.kind !== 'message');
  // A buyer's order needs them (inspect and accept, handoff code ready, package arrived): the order lives in its conversation, so Messages glows,
  // and the item glows in Collect > Owned until they have done it.
  const BUYER_ORDER_KINDS = ['pickup_inspect', 'pickup_code_ready', 'inspect_delivered'];
  const ownedAttention = notifications.some(n => BUYER_ORDER_KINDS.includes(n.kind));
  const ownedNeedsAction = id => notifications.some(n => BUYER_ORDER_KINDS.includes(n.kind) && n.listing_id === id);
  const actionConversationIds = new Set(notifications.flatMap(n => BUYER_ORDER_KINDS.includes(n.kind) && n.conversation_id ? [n.conversation_id]
    : n.kind === 'pickup_awaiting_handoff' ? [sales.find(x => x.id === n.purchase_id)?.conversation_id].filter(Boolean) : []));
  const messagesAttention = notifications.some(n => n.kind === 'message' || n.kind === 'pickup_awaiting_handoff' || BUYER_ORDER_KINDS.includes(n.kind));
  const sellGlow = soldAttention || requestsAttention;
  const switchWorkspace = value => { setWorkspace(value); setSelectedId(null); setSelectedConversationId(null); setCategory('All items'); setQuery(''); setError(''); setCollectionFilter('all'); setSellerTab(value === 'seller' ? (soldAttention ? 'sold' : requestsAttention ? 'requests' : 'active') : 'active'); window.scrollTo({ top: 0 }); };
  function auditItem(id) { setFocusAuditItemId(id); switchWorkspace('auditor'); }
  async function messageSeller(listingId) {
    if (!session) { setModal('login'); return; }
    setBusy(true); setError('');
    try {
      const conv = await service.getOrCreateConversation(listingId);
      setConversations(await service.listConversations());
      setFocusConversationId(conv.id);
      switchWorkspace('messages');
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  function openOrderConversation(conversationId) { setFocusConversationId(conversationId); switchWorkspace('messages'); }
  function openListingFromThread(listingId) { switchWorkspace('collector'); setSelectedId(listingId); }
  async function clearConversation(conversationId) {
    try {
      await service.clearConversation(conversationId);
      setConversations(list => list.filter(c => c.id !== conversationId));
      setSelectedConversationId(current => current === conversationId ? null : current);
    } catch (err) { setError(err.message); }
  }
  async function loadMore() {
    if (!items.length) return;
    setLoadingMore(true);
    try {
      const last = items[items.length - 1];
      const more = await service.listings({ created_at: last.created_at, id: last.id });
      setItems(list => [...list, ...more]);
      setItemsHasMore(more.length >= LISTINGS_PAGE_SIZE);
    } catch (err) { setError(err.message); } finally { setLoadingMore(false); }
  }
  function focusNotification(n) {
    setModal(null);
    if (n.kind === 'message') { setWorkspace('messages'); setSelectedId(null); setFocusConversationId(n.conversation_id); return; }
    if (BUYER_ORDER_KINDS.includes(n.kind) && n.conversation_id) { setWorkspace('messages'); setSelectedId(null); setFocusConversationId(n.conversation_id); return; }
    if (n.kind === 'pickup_awaiting_handoff') { const order = sales.find(x => x.id === n.purchase_id); if (order?.conversation_id) { setWorkspace('messages'); setSelectedId(null); setFocusConversationId(order.conversation_id); return; } }
    if (n.role === 'buyer') { setSelectedId(n.listing_id); }
    else if (n.kind === 'buy_request_pending') { setWorkspace('seller'); setSellerTab('requests'); setSelectedId(null); }
    else { setWorkspace('seller'); setSellerTab('sold'); setSelectedId(null); }
  }
  async function signIn(userId) { setBusy(true); setError(''); try { await service.signIn(userId); setModal(null); } catch (err) { setError(err.message); } finally { setBusy(false); } }
  async function signOut() { try { await service.signOut(); switchWorkspace('collector'); setNotice('You’re signed out.'); } catch (err) { setError(err.message); } }
  function openCreate() { if (!session) setModal('login'); else if (profile?.can_sell) setModal('create'); else setError('Your account does not have selling permission.'); }
  function openBulkCreate() { if (!session) setModal('login'); else if (profile?.can_sell) setModal('bulk-create'); else setError('Your account does not have selling permission.'); }
  async function toggleFavorite(listingId) {
    if (!session) { setModal('login'); return; }
    try { const now = await service.toggleFavorite(listingId); setFavoriteIds(ids => now ? [...ids, listingId] : ids.filter(id => id !== listingId)); }
    catch (err) { setError(err.message); }
  }
  async function buyNow(listingId, shippingAddress, applyCreditCents, wantInsurance, fulfillmentMethod, shippingChoice) {
    if (!session) { setModal('login'); return; }
    setBusy(true); setError('');
    try {
      const result = await service.startCheckout(listingId, shippingAddress, applyCreditCents, wantInsurance, fulfillmentMethod, shippingChoice);
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
  return <div className="app">
    {service.mode === 'demo' && <div className="demo-banner"><span><span className="live-dot"/> LOCAL PREVIEW <span className="banner-detail">· Sample items and two practice accounts. No real login or purchases.</span></span><button onClick={async () => { await service.reset(); setSelectedId(null); setWorkspace('collector'); refresh(); }}>Reset demo</button></div>}
    <header className="topbar">
      <button className="brand" onClick={() => switchWorkspace('collector')} aria-label="Credabilia home"><Brand/></button>
      <nav aria-label="Main navigation"><button className={workspace === 'collector' ? 'nav-current' : ''} onClick={() => switchWorkspace('collector')}>Discover</button><button className={workspace === 'auditor' ? 'nav-current' : ''} onClick={() => switchWorkspace('auditor')}>Community audits</button></nav>
      <div className="account-actions"><ThemeToggle/>{session && <button className="icon-button king-credion-button" aria-label="Ask King Credion" title="Ask King Credion" onClick={() => setModal('support')}><img src="/brand/screen-face-v1/chat.webp" alt="" style={{objectFit:'contain'}}/></button>}{session && <NotificationBell notifications={notifications} onNavigate={focusNotification} glow={bellGlow}/>}{session ? <><button className="avatar" aria-label="Profile and settings" title={profile?.display_name} onClick={() => setModal('profile')}>{profile?.display_name?.slice(0,1) || 'C'}</button><button className="icon-button" aria-label="Sign out" title="Sign out" onClick={signOut}><LogOut size={18}/></button></> : <button className="primary compact" onClick={() => setModal('login')} disabled={!authReady}>Sign in <ArrowUpRight size={16}/></button>}</div>
    </header>
    <div className="page-layout">
      <aside className="sidebar">
        <p className="eyebrow">YOUR WORKSPACE</p>
        <div className="workspace-list" role="group" aria-label="Choose workspace">{WORKSPACES.map((value, index) => { const Icon = [Compass, Store, ClipboardCheck, MessageCircle][index]; const label = { collector: 'Collect', seller: 'Sell', auditor: 'Audit', messages: 'Messages' }[value]; return <button key={value} aria-pressed={workspace === value} onClick={() => switchWorkspace(value)} className={`${workspace === value ? 'workspace selected' : 'workspace'}${(value === 'seller' && sellGlow && workspace !== 'seller') || (value === 'messages' && messagesAttention && workspace !== 'messages') ? ' attention-glow' : ''}`}><Icon size={19}/><span>{label}</span>{workspace === value && <span className="selected-dot"/>}</button>; })}</div>
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
          <section className="community-note"><div className="note-icon"><BookOpen size={25}/></div><div><h3>Look closer before you decide.</h3><p>A quick guide to observing evidence, checking the story, and naming what's missing.</p></div><button className="icon-button" aria-label="Read the auditing guide" onClick={() => setModal('learn')}><ArrowUpRight size={24}/></button></section>
          <AuditQueue key={session?.user?.id || 'anon'} items={filtered} session={session} profile={profile} onNeedLogin={() => setModal('login')} onAudited={result => { setNotice(result.xp_earned ? 'Audit recorded. +5 participation XP.' : 'Your audit is already recorded.'); refresh(); }} focusItemId={focusAuditItemId} onFocused={() => setFocusAuditItemId(null)}/>
        </> : workspace === 'messages' ? <>
          {!selectedConversationId && <section className="hero messages-hero"><div className="hero-copy"><p className="eyebrow"><span className="small-line"/>YOUR CONVERSATIONS</p><h1>Every chat.<br/><em>In one place.</em></h1><p>Message a seller from any listing to ask a question or arrange a meetup — every conversation stays tied to the item it's about.</p></div><div className="hero-mascot"><img src="/brand/screen-face-v1/messages.webp" width="800" height="800" alt="King Credion with a royal messenger pigeon carrying a sealed scroll" decoding="async"/></div></section>}
          <div className="clarity-contents" data-clarity-mask="True"><MessagesInbox conversations={conversations} session={session} service={service} focusConversationId={focusConversationId} onFocused={() => setFocusConversationId(null)} selectedConversationId={selectedConversationId} onSelect={setSelectedConversationId} onOpenListing={openListingFromThread} onRead={refresh} onClear={clearConversation} purchases={purchases} sales={sales} payoutByPurchase={payoutByPurchase} actionConversationIds={actionConversationIds} onOrderChanged={refresh}/></div>
        </> : selected ? <>
          <button className="back-button" onClick={() => setSelectedId(null)}><ArrowLeft size={17}/>Back to listings</button>
          {own && selected.status==='needs_review' && <p className="field-note">Only visible to you right now — this needs a quick review before buyers can see it. {selected.needs_review_reason || "It didn't clearly look like a collectible."} Edit it to add more detail and resubmit.</p>}
          {own && profile?.can_sell && <button className="text-button" onClick={()=>setModal('edit')}>Edit listing</button>}
          {own && profile?.can_sell && <DeleteListingButton item={selected} onDeleted={()=>{setSelectedId(null);setNotice('Your listing has been deleted.');refresh();}}/>}
          {session && !own && <button className="text-button" onClick={()=>toggleFavorite(selected.id)}><Heart size={16} fill={favoriteIds.includes(selected.id) ? 'currentColor' : 'none'}/>{favoriteIds.includes(selected.id) ? 'Saved' : 'Save to collection'}</button>}
          {session && !own && <ReportButton targetType="listing" targetId={selected.id} label="Report listing"/>}
          {session && !own && <BlockSellerButton sellerId={selected.seller_id}/>}
          <div className="detail-grid"><div><LockedPhoto locked={listingLocked(selected)}>{selected.media?.some(asset=>asset.kind==='item') ? <PhotoGallery service={service} key={selected.id} media={selected.media} title={selected.title}/> : <ItemArt kind={selected.artwork} category={selected.category} large/>}</LockedPhoto><PhotoGallery service={service} key={selected.id+'cert'} media={selected.media} kind="certificate" title={selected.title}/>{selected.media?.some(asset=>asset.kind==='signature') && <div className="evidence-box"><p className="field-note">Signature close-up</p><PhotoGallery service={service} key={selected.id+'sig'} media={selected.media} kind="signature" title={selected.title}/>{selected.signature_ai_label ? <KingOpinion label={selected.signature_ai_label} note={selected.signature_ai_note}/> : <p className="field-note">King Credion has not given an opinion on this signature yet.</p>}</div>}</div><section className="item-info"><span className="pill">{selected.category}</span>{selected.king_collection && <span className="king-badge"><Crown size={12}/>King's Collection</span>}<h1>{selected.title}</h1>{selected.attributes?.subject && selected.media?.some(asset=>asset.kind==='signature') && <p className="signer-badge"><img className="signed-by-quill" src="/brand/signed-by-quill.webp" alt="" aria-hidden="true"/> Signed by {selected.attributes.subject}</p>}<p className="seller-name">Shared by {selected.seller_name}{selected.seller_rating_count > 0 && <> · <RatingStars value={selected.seller_rating_avg} count={selected.seller_rating_count}/></>} · Member since {new Date(selected.seller_member_since).getFullYear()}{selected.seller_sales_count > 0 && <> · {selected.seller_sales_count} {selected.seller_sales_count === 1 ? 'sale' : 'sales'}</>}</p><p className="detail-price">{money(selected.price_cents)}</p>{selected.listing_type==='auction' && <p className="field-note">{selected.bid_count===0 ? 'Starting bid · ' : 'Current bid · '}{selected.bid_count} {selected.bid_count===1?'bid':'bids'} · {auctionTimeLeft(selected.auction_ends_at)}</p>}{!own && <ItemActions item={selected} session={session} service={service} busy={busy} request={myRequest} onCheckout={()=>setModal('checkout-address')} onRequestToBuy={requestToBuy} onMessage={messageSeller} onSignIn={()=>setModal('login')} onBid={refresh}/>}<p>{selected.description}</p><ListingDetailSummary item={selected}/><div className="evidence-box"><h3><ShieldCheck size={18}/>Evidence notes</h3><p>{selected.evidence || 'No evidence has been provided yet. Ask for more information before reaching a conclusion.'}</p></div><CertificateDetails item={selected}/><CredibilityDetails item={selected} session={session} own={own} auditedLabel={previousAudit ? LABELS[previousAudit.verdict] : null} onAudit={()=>auditItem(selected.id)}/><ItemHistory key={selected.id+selected.version} item={selected} service={service}/><TriviaPanel key={selected.id} item={selected} service={service} signedIn={!!session}/><p className="field-note">Community assessments are opinions, not professional authentication.</p></section></div>
        </> : ownedItem ? <>
          <button className="back-button" onClick={() => setSelectedId(null)}><ArrowLeft size={17}/>Back to listings</button>
          <div className="detail-grid"><div>{ownedItem.media?.some(asset=>asset.kind==='item') ? <PhotoGallery service={service} key={ownedItem.id} media={ownedItem.media} title={ownedItem.title}/> : <ItemArt category={ownedItem.category} large/>}<PhotoGallery service={service} key={ownedItem.id+'cert'} media={ownedItem.media} kind="certificate" title={ownedItem.title}/>{ownedItem.media?.some(asset=>asset.kind==='signature') && <div className="evidence-box"><p className="field-note">Signature close-up</p><PhotoGallery service={service} key={ownedItem.id+'sig'} media={ownedItem.media} kind="signature" title={ownedItem.title}/>{ownedItem.signature_ai_label ? <KingOpinion label={ownedItem.signature_ai_label} note={ownedItem.signature_ai_note}/> : <p className="field-note">King Credion has not given an opinion on this signature yet.</p>}</div>}</div><section className="item-info"><span className="pill">{ownedItem.category}</span><h1>{ownedItem.title}</h1>{ownedItem.attributes?.subject && ownedItem.media?.some(asset=>asset.kind==='signature') && <p className="signer-badge"><img className="signed-by-quill" src="/brand/signed-by-quill.webp" alt="" aria-hidden="true"/> Signed by {ownedItem.attributes.subject}</p>}<p className="seller-name">Purchased {new Date(ownedItem.purchased_at).toLocaleDateString()}</p><p className="detail-price">{money(ownedItem.price_cents)}</p><p>{ownedItem.description}</p><ListingDetailSummary item={ownedItem}/><PurchasedItemFulfillment item={ownedItem} payout={payoutByPurchase[ownedItem.purchase_id]} onOpenMessages={openOrderConversation}/><BuyerRefundPanel item={ownedItem} onRequested={refresh}/><SellerRatingForm item={ownedItem} onRated={refresh}/><MessageThread conversationId={ownedItem.conversation_id} service={service} session={session} counterpartyLabel="seller" messageCount={ownedItem.message_count} autoOpen={focusConversationId === ownedItem.conversation_id} onFocused={() => setFocusConversationId(null)} onRead={refresh} pickupStation={ownedItem.fulfillment_method === 'pickup' ? ownedItem.pickup_station : null}/><CertificateDetails item={ownedItem}/><button className="primary" onClick={()=>setModal('relist')}><RefreshCw size={16}/>Relist this item</button></section></div>
        </> : pendingBuy ? <>
          <button className="back-button" onClick={() => setSelectedId(null)}><ArrowLeft size={17}/>Back to listings</button>
          <div className="detail-grid"><div>{pendingBuy.media?.some(asset=>asset.kind==='item') ? <PhotoGallery service={service} key={pendingBuy.listing_id} media={pendingBuy.media} title={pendingBuy.title}/> : <ItemArt category={pendingBuy.category} large/>}</div><section className="item-info"><span className="pill">{pendingBuy.category}</span><h1>{pendingBuy.title}</h1><p className="detail-price">{money(pendingBuy.price_cents)}</p>{pendingBuy.status === 'confirmed' ? <><p className="field-note">The seller confirmed this is still available.</p><button className="primary" disabled={busy} onClick={()=>setModal('checkout-address')}>Continue to checkout<ArrowRight size={16}/></button></> : <p role="status" className="field-note">Waiting for the seller to confirm this item is still available…</p>}</section></div>
        </> : <>
          <section className={workspace === 'collector' ? 'hero mobile-launch-hero' : 'hero'}><div className="hero-copy"><p className="eyebrow"><span className="small-line"/>{workspace === 'collector' ? 'YOUR KINGDOM. SOON IN YOUR POCKET.' : workspace === 'seller' ? 'YOUR NEXT GREAT FIND STARTS HERE' : 'OBSERVATION OVER ASSUMPTION'}</p><h1>{workspace === 'collector' ? <>The Kingdom<br/><em>is going mobile.</em></> : workspace === 'seller' ? <>Your collection.<br/><em>A new chapter.</em></> : <>Look closer.<br/><em>Share what you see.</em></>}</h1><p>{workspace === 'collector' ? 'Coming soon to the App Store and Google Play. We’ll email our registered members when the apps are ready to download. Keep discovering and collecting here in the meantime.' : workspace === 'seller' ? 'Give every piece the context it deserves. Share its story, its condition, and what you know.' : 'Help collectors make informed decisions. Review evidence, explain your reasoning, and keep learning.'}</p><img className="ai-marketplace-badge" src="/brand/ai-powered-marketplace-badge-v2.png" width="2048" height="683" alt="AI powered marketplace"/><button className="primary" onClick={workspace === 'seller' ? openCreate : () => document.getElementById('listings').scrollIntoView({ behavior: 'smooth' })}>{workspace === 'seller' ? 'Create a listing' : workspace === 'auditor' ? 'Explore the audit queue' : 'Explore the collection'}<ArrowUpRight size={18}/></button>{workspace === 'seller' && <button className="text-button" onClick={openBulkCreate}><Layers size={16}/>Bulk list items</button>}</div><div className="hero-mascot"><img key={workspace} src={HERO_IMAGES[workspace].src} width={HERO_IMAGES[workspace].width} height={HERO_IMAGES[workspace].height} alt={HERO_IMAGES[workspace].alt} fetchPriority={workspace === 'collector' ? 'high' : 'auto'} /></div></section>
          <div className="values-strip"><span><Search size={16}/>Discover the details</span><span><ClipboardCheck size={16}/>Share your perspective</span><span><BookOpen size={16}/>Keep learning</span></div>
          <section id="listings" className="listings-section"><div className="section-heading"><div><p className="eyebrow">{workspace === 'auditor' ? 'A FRESH PERSPECTIVE' : 'THE COLLECTION'}</p><h2>{workspace === 'seller' ? (sellerTab === 'sold' ? 'Sold items' : sellerTab === 'requests' ? 'Buy requests' : 'Your listings') : workspace === 'auditor' ? 'Ready for a closer look' : collectionFilter === 'owned' ? 'Items you own' : collectionFilter === 'saved' ? 'Items you saved' : 'Discover something worth keeping'}</h2></div><span className="item-count">{workspace === 'seller' && sellerTab === 'sold' ? sales.length : workspace === 'seller' && sellerTab === 'requests' ? sellerBuyRequests.length : collectionItems.length} {(workspace === 'seller' && sellerTab === 'sold' ? sales.length : workspace === 'seller' && sellerTab === 'requests' ? sellerBuyRequests.length : collectionItems.length) === 1 ? 'item' : 'items'}</span></div>
            {workspace === 'seller' && session && service.mode === 'live' && profile && !profile.stripe_charges_enabled && <div className="evidence-box lock-banner" role="status"><h3><Lock size={16}/> Your listings are locked</h3><p className="field-note">Buyers can see them, but nobody can buy or bid until you connect payouts with Stripe. It takes a couple of minutes, and everything opens automatically when you're done.</p><button type="button" className="primary" onClick={() => setModal('profile')}>{profile.stripe_details_submitted ? 'Check payout status' : 'Set up payouts'}<ArrowRight size={16}/></button></div>}
            {workspace === 'seller' && session && <div className="categories" aria-label="Your listings"><button aria-pressed={sellerTab === 'active'} className={sellerTab === 'active' ? 'active' : ''} onClick={() => setSellerTab('active')}>Active</button><button aria-pressed={sellerTab === 'requests'} className={`${sellerTab === 'requests' ? 'active' : ''}${requestsAttention && sellerTab !== 'requests' ? ' attention-glow' : ''}`} onClick={() => setSellerTab('requests')}>Requests {sellerBuyRequests.length ? `(${sellerBuyRequests.length})` : ''}</button><button aria-pressed={sellerTab === 'sold'} className={`${sellerTab === 'sold' ? 'active' : ''}${soldAttention && sellerTab !== 'sold' ? ' attention-glow' : ''}`} onClick={() => setSellerTab('sold')}>Sold {sales.length ? `(${sales.length})` : ''}</button>{(endedListings.length > 0 || sellerTab === 'ended') && <button aria-pressed={sellerTab === 'ended'} className={sellerTab === 'ended' ? 'active' : ''} onClick={() => setSellerTab('ended')}>Ended {endedListings.length ? `(${endedListings.length})` : ''}</button>}</div>}
            {workspace === 'seller' && sellerTab === 'active' && session && <SellerStorefrontBanner slug={profile?.slug} onSetup={() => setModal('profile')}/>}
            {workspace === 'collector' && session && <div className="categories" aria-label="My collection"><button aria-pressed={collectionFilter === 'all'} className={collectionFilter === 'all' ? 'active' : ''} onClick={() => setCollectionFilter('all')}>All items</button><button aria-pressed={collectionFilter === 'saved'} className={collectionFilter === 'saved' ? 'active' : ''} onClick={() => setCollectionFilter('saved')}><Heart size={14}/> Saved</button><button aria-pressed={collectionFilter === 'owned'} className={`${collectionFilter === 'owned' ? 'active' : ''}${ownedAttention && collectionFilter !== 'owned' ? ' attention-glow' : ''}`} onClick={() => setCollectionFilter('owned')}>Owned</button></div>}
            {workspace === 'seller' && sellerTab === 'ended' ? <EndedListings items={endedListings} onChanged={() => { setSellerTab('active'); setNotice('Your item is listed again.'); refresh(); }}/>
              : workspace === 'seller' && sellerTab === 'sold' ? (!sales.length ? <div className="empty-state"><Layers size={34}/><h3>Nothing sold yet.</h3><p>Sales will show up here, ready to ship.</p></div>
              : <div className="items-grid">{sales.map(sale => <SoldItemCard key={sale.id} sale={sale} payout={payoutByPurchase[sale.id]} onOpenMessages={openOrderConversation} session={session} onShipped={shipped => setSales(list => list.map(s => s.id === shipped.id ? shipped : s))} onRefundChanged={refresh} focusConversationId={focusConversationId} onFocused={() => setFocusConversationId(null)}/>)}</div>)
              : workspace === 'seller' && sellerTab === 'requests' ? (!sellerBuyRequests.length ? <div className="empty-state"><Layers size={34}/><h3>No buy requests right now.</h3><p>When a buyer wants to purchase one of your active listings, it'll show up here for you to confirm.</p></div>
              : <div className="items-grid">{sellerBuyRequests.map(request => <BuyRequestCard key={request.id} request={request} onResolved={id => setSellerBuyRequests(list => list.filter(r => r.id !== id))}/>)}</div>) : <>
            {collectionFilter !== 'owned' && <div className="filters"><div className="categories" aria-label="Filter by category">{['All items', ...CATEGORIES].map(c => <button key={c} aria-pressed={category === c} className={category === c ? 'active' : ''} onClick={() => setCategory(c)}>{c}</button>)}</div><label className="search"><Search size={17}/><input aria-label="Search listings" value={query} onChange={e => setQuery(e.target.value)} placeholder="Find your next discovery"/></label></div>}
            {loading ? <p role="status" className="empty-state">Loading the collection…</p> : !collectionItems.length ? <div className="empty-state"><Layers size={34}/><h3>{workspace === 'seller' ? 'Your first listing starts here.' : collectionFilter === 'owned' ? 'Nothing purchased yet.' : collectionFilter === 'saved' ? 'Nothing saved yet.' : 'No items here yet.'}</h3><p>{workspace === 'seller' ? 'Add a piece and tell its story.' : collectionFilter === 'owned' ? 'Items you buy will show up here.' : collectionFilter === 'saved' ? 'Tap the heart on an item to save it here.' : 'Try a different category or search.'}</p>{workspace === 'seller' && <button className="primary" onClick={openCreate}>Create a listing <Plus size={17}/></button>}</div>
              : <div className="items-grid">{collectionItems.map(item => <button className={`${item.king_collection ? 'item-card king-collection' : 'item-card'}${listingLocked(item) ? ' locked' : ''}${collectionFilter === 'owned' && ownedNeedsAction(item.id) ? ' needs-action attention-glow' : ''}`} key={item.id} onClick={() => { const order = notifications.find(n => BUYER_ORDER_KINDS.includes(n.kind) && n.listing_id === item.id); if (collectionFilter === 'owned' && order?.conversation_id) { focusNotification(order); return; } setSelectedId(item.id); window.scrollTo({ top: 0 }); }} aria-label={`View ${item.title}`}>{collectionFilter === 'owned' && ownedNeedsAction(item.id) && <span className="action-badge">Action needed: open your order</span>}{item.king_collection && <span className="king-badge"><Crown size={12}/>King's Collection</span>}{listingLocked(item) && <span className="lock-overlay"><img src="/brand/royal-lock-v1-optimized.webp" alt="" width="84" height="84"/><span>Seller notified. Waiting on Stripe setup.</span></span>}<ItemArt kind={item.artwork} category={item.category} photo={item.media?.find(asset=>asset.kind==='item')?.url}/><div className={`item-card-content${item.listing_type === 'auction' ? ' has-auction-watermark' : item.attributes?.subject && item.media?.some(asset=>asset.kind==='signature') ? ' has-signature-watermark' : ''}`}><div className="card-meta"><span>{item.category}</span>{collectionFilter === 'owned' ? <span>OWNED</span> : <><span className="listing-type-label">{item.status !== 'needs_review' && item.listing_type === 'auction' && <img className="auction-gavel-icon" src="/brand/auction-gavel-v1.webp" alt="" aria-hidden="true" width="20" height="20"/>}{item.status==='needs_review' ? 'NEEDS REVIEW' : item.listing_type==='auction' ? 'AUCTION' : item.sample ? 'SAMPLE' : 'NEW LISTING'}</span>{session && item.seller_id !== session.user.id && <span role="button" tabIndex={0} className="icon-button" aria-label={favoriteIds.includes(item.id) ? 'Remove from saved' : 'Save to collection'} onClick={event => { event.stopPropagation(); toggleFavorite(item.id); }}><Heart size={14} fill={favoriteIds.includes(item.id) ? 'currentColor' : 'none'}/></span>}{session && item.seller_id !== session.user.id && <span role="button" tabIndex={0} className="icon-button" aria-label="Message seller" onClick={event => { event.stopPropagation(); messageSeller(item.id); }}><MessageCircle size={14}/></span>}</>}</div><h3>{item.title}</h3>{item.attributes?.subject && item.media?.some(asset=>asset.kind==='signature') && <p className="signer-badge compact"><img className="signed-by-quill" src="/brand/signed-by-quill.webp" alt="" aria-hidden="true"/> Signed by {item.attributes.subject}</p>}<p>{collectionFilter === 'owned' ? `Purchased ${new Date(item.purchased_at).toLocaleDateString()}` : item.seller_name}</p>{collectionFilter !== 'owned' && <CredibilityMeter score={item.credibility_score} compact/>}<div className="card-bottom"><strong>{money(item.price_cents)}</strong>{collectionFilter !== 'owned' && (item.listing_type==='auction' ? <span>{item.bid_count} {item.bid_count===1?'bid':'bids'} · {auctionTimeLeft(item.auction_ends_at)}</span> : <span><ClipboardCheck size={14}/>{item.audit_count || 0} audits</span>)}</div></div></button>)}</div>}
            {collectionFilter !== 'owned' && itemsHasMore && <button type="button" className="text-button load-more" onClick={loadMore} disabled={loadingMore}>{loadingMore ? 'Loading…' : 'Load more'}</button>}
            </>}
          </section>{workspace === 'collector' && <section className="community-note"><div className="note-icon"><ShieldCheck size={25}/></div><div><h3>Confidence grows with evidence.</h3><p>A community opinion is a starting point. For valuable purchases, seek qualified authentication.</p></div></section>}
        </>}
        <footer><span>© {new Date().getFullYear()} Credabilia LLC · 732 S 6th St, Ste 7531, Las Vegas, NV 89101</span><img className="footer-tagline" src="/brand/the-memorabilia-kingdom-gold-quill-v1-optimized.webp" alt="The Memorabilia Kingdom" width="2172" height="724"/><span className="footer-legal"><a href="tel:+18667500255">1 (866) 750-0255</a><a href="/help">Help</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a></span></footer>
      </main>
    </div>
    <BottomNav sellGlow={sellGlow} messagesGlow={messagesAttention} session={session} workspace={workspace} onSwitchWorkspace={switchWorkspace} profile={profile} authReady={authReady} onProfile={() => setModal('profile')} onSignIn={() => setModal('login')}/>
    {modal === 'login' && <Modal title="Welcome to Credabilia" onClose={() => setModal(null)}><p className="muted">One account to collect, sell, and share your perspective.</p>{service.mode === 'demo' ? <><div className="evidence-box"><h3>Try the local preview</h3><p>These two separate practice accounts stay in this browser. Each can switch between all three workspaces. Real sign-in is available when the Supabase project is connected.</p></div><div className="form-stack">{DEMO_ACCOUNTS.map(account => <button key={account.id} className="primary full-width" onClick={() => signIn(account.id)} disabled={busy}>{busy ? 'Opening…' : `Continue as ${account.display_name}`}<ArrowRight size={18}/></button>)}</div></> : <><button className="primary full-width" onClick={() => signIn()} disabled={busy}>{busy ? 'Opening…' : 'Continue with Google'}<ArrowRight size={18}/></button><p className="field-note">or</p><EmailLogin/><p className="field-note">By continuing, you agree to Credabilia's <a href="/terms" target="_blank" rel="noreferrer">Terms of Service</a> and <a href="/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>.</p></>}<p className="field-note">Your sign-in method does not determine your workspace. You can switch between all three after signing in.</p></Modal>}
    {modal === 'checkout-address' && (selected || pendingBuy) && <CheckoutAddress item={selected || pendingBuy} profile={profile} busy={busy} onClose={() => setModal(null)} onConfirm={(address, applyCreditCents, wantInsurance, fulfillmentMethod, shippingChoice) => { const id = selected?.id || pendingBuy?.listing_id; setModal(null); buyNow(id, address, applyCreditCents, wantInsurance, fulfillmentMethod, shippingChoice); }}/>}
    {modal === 'create' && <CreateListing onClose={() => setModal(null)} onCreated={(id,fit) => { setModal(null); setNotice(fit ? `Your listing was saved, but it needs a quick review before buyers can see it — ${fit.reason || "it didn't clearly look like a collectible."}` : service.mode === 'live' && profile && !profile.stripe_charges_enabled ? 'Your listing is published, but it is locked until you connect payouts with Stripe. Buyers can see it, and it opens for sale automatically when you are done. Open Sell to set up payouts.' : 'Your listing is published.'); setSelectedId(id); refresh(); }}/>}
    {modal === 'bulk-create' && <BulkListing onClose={() => setModal(null)} onAllDone={() => { setModal(null); setNotice('Bulk listing complete.'); refresh(); }}/>}
    {modal === 'relist' && ownedItem && <CreateListing relistFrom={ownedItem} onClose={() => setModal(null)} onCreated={(id,fit) => { setModal(null); setNotice(fit ? `Your relisted item was saved, but it needs a quick review before buyers can see it — ${fit.reason || "it didn't clearly look like a collectible."}` : 'Your relisted item is published.'); switchWorkspace('seller'); setSelectedId(id); refresh(); }}/>}
    {modal === 'edit' && selected && own && <EditListing key={selected.id} item={selected} onClose={()=>setModal(null)} onSaved={()=>{setModal(null);setNotice('Your listing changes are saved.');refresh();}}/>}
    {modal === 'profile' && <Modal title="Profile and settings" onClose={() => setModal(null)}><ProfileSettings profile={profile} session={session} onSaved={() => { setModal(null); setNotice('Your profile is saved.'); refresh(); }} onSignOut={() => { setModal(null); signOut(); }}/></Modal>}
    {modal === 'support' && <Modal title="Ask King Credion" onClose={() => setModal(null)}><SupportChat service={service}/></Modal>}
    {modal === 'learn' && <Modal title="Start with the evidence" onClose={() => setModal(null)}><ol className="guide"><li><strong>Observe before deciding.</strong><p>Look at condition, markings, materials, and the description. Record what you can actually see.</p></li><li><strong>Check the story.</strong><p>Provenance and certificates need verification. A familiar name alone does not prove authenticity.</p></li><li><strong>Say what is missing.</strong><p>Ask for clearer photos or documentation. Uncertainty is more useful than unsupported confidence.</p></li></ol><p className="field-note">Participation XP does not certify expertise.</p></Modal>}
  </div>;
}
