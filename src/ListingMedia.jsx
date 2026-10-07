import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { MEDIA_LIMITS, prepareImage } from './media.js';

const backgroundRemoved = asset => /[.]png$/.test(asset.path);
const KIND_LABELS = { item:'Item photos', certificate:'Certificate photos', signature:'Signature close-up' };

export function MediaPicker({service,media,onChange,busy,onBusy,onError}) {
  async function add(event,kind) {
    const files=Array.from(event.target.files || []); event.target.value='';
    if(!files.length || busy) return;
    if(media.filter(x=>x.kind===kind).length+files.length>MEDIA_LIMITS[kind]) {onError(`Choose up to ${MEDIA_LIMITS[kind]} ${kind} photos.`);return;}
    onBusy(true);onError('');
    const added=[];
    try {
      for(const file of files) added.push(await service.uploadImage(await prepareImage(file),kind));
      onChange([...media,...added]);
    } catch(error) {
      for(const asset of added) await service.removeImage(asset.path).catch(()=>{});
      onError(error.message);
    } finally {onBusy(false);}
  }
  async function remove(asset) {
    onBusy(true);onError('');
    try {await service.removeImage(asset.path);onChange(media.filter(x=>x.path!==asset.path));}
    catch(error){onError(error.message);}finally{onBusy(false);}
  }
  async function removeBackground(asset) {
    onBusy(true);onError('');
    try {
      const replaced=await service.removeBackground(asset.path);
      onChange(media.map(x=>x.path===asset.path?replaced:x));
    } catch(error){onError(error.message);}finally{onBusy(false);}
  }
  return <fieldset className="form-stack"><legend>Photos and certificate images</legend>
    <p className="field-note">JPEG, PNG or WebP · up to 5 MB each. Photos become visible to buyers when you publish. Your main item photo (shown first) has its background removed automatically when you publish.</p>
    {Object.entries(MEDIA_LIMITS).map(([kind,limit])=><div key={kind}>
      <label>{KIND_LABELS[kind]} · up to {limit}<input aria-label={`Add ${KIND_LABELS[kind].toLowerCase()}`} type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy} onChange={event=>add(event,kind)}/></label>
      <div className="photo-thumbnails">{media.filter(asset=>asset.kind===kind).map((asset,index)=><div key={asset.path}><img src={asset.url} alt={`${kind} photo ${index+1}`}/>
        {kind==='item' && index===0 && (backgroundRemoved(asset)
          ? <p className="field-note bg-removed-ok">Background removed ✓</p>
          : <button type="button" className="text-button" disabled={busy} onClick={()=>removeBackground(asset)}>Remove background now</button>)}
        <button type="button" className="text-button" disabled={busy} onClick={()=>remove(asset)} aria-label={`Remove ${kind} photo ${index+1}`}>Remove</button></div>)}</div>
    </div>)}
    {busy && <p role="status">Preparing photos…</p>}
  </fieldset>;
}

// Full-screen photo viewer inside the app: a clear Close button, swipe or arrows between photos, and tap outside the photo to close.
function PhotoViewer({photos,start,title,kind,onClose}) {
  const [index,setIndex]=useState(start);
  const dialog=useRef(null), touchStart=useRef(null);
  useEffect(()=>{ const d=dialog.current; if(d && !d.open) d.showModal(); return ()=>{ if(d?.open) d.close(); }; },[]);
  const count=photos.length, go=step=>setIndex(n=>(n+step+count)%count), asset=photos[index];
  return <dialog ref={dialog} className="photo-viewer" aria-label={`${title} photos`} onCancel={event=>{event.preventDefault();onClose();}}
    onClick={event=>{ if(event.target===dialog.current) onClose(); }}
    onKeyDown={event=>{ if(count>1 && event.key==='ArrowRight') go(1); if(count>1 && event.key==='ArrowLeft') go(-1); }}
    onTouchStart={event=>{ touchStart.current=event.touches[0].clientX; }}
    onTouchEnd={event=>{ if(touchStart.current==null || count<2) return; const dx=event.changedTouches[0].clientX-touchStart.current; touchStart.current=null; if(Math.abs(dx)>60) go(dx<0?1:-1); }}>
    <div className="photo-viewer-top"><span>{count>1 ? `${index+1} of ${count}` : ''}</span><button type="button" className="photo-viewer-close" onClick={onClose} aria-label="Close photo"><X size={22}/></button></div>
    {asset?.url && <img className="photo-viewer-img" src={asset.url} alt={`${title} · ${kind} photo ${index+1}`} draggable={false}/>}
    {count>1 && <><button type="button" className="photo-viewer-nav prev" onClick={()=>go(-1)} aria-label="Previous photo"><ChevronLeft size={26}/></button>
      <button type="button" className="photo-viewer-nav next" onClick={()=>go(1)} aria-label="Next photo"><ChevronRight size={26}/></button></>}
  </dialog>;
}

function GalleryPhoto({asset,service,title,kind,index,onOpen}) {
  const [url,setUrl]=useState(asset.url);
  const [failed,setFailed]=useState(!asset.url);
  const [retrying,setRetrying]=useState(false);
  async function retry() {
    setRetrying(true);
    try {
      const [fresh]=await service.signMediaUrls([asset]);
      if (!fresh?.url) throw new Error('Photo unavailable');
      setUrl(fresh.url);
      setFailed(false);
    } catch { setFailed(true); }
    finally { setRetrying(false); }
  }
  if (failed) return <div role="status"><p>This photo couldn’t load.</p>{service?.signMediaUrls && <button type="button" className="text-button" disabled={retrying} onClick={retry}>{retrying ? 'Retrying…' : 'Retry photo'}</button>}</div>;
  return <button type="button" className="gallery-open" onClick={onOpen} aria-label={`View ${kind} photo ${index+1} full screen`}><img className="gallery-main" src={url} decoding="async" fetchPriority={kind==='item' ? 'high' : 'auto'} loading={kind==='item' ? 'eager' : 'lazy'} onError={()=>setFailed(true)} alt={`${title} · ${kind} photo ${index+1}`}/></button>;
}

export function PhotoGallery({media=[],kind='item',title,service}) {
  const [index,setIndex]=useState(0), [viewing,setViewing]=useState(false);
  const photos=media.filter(x=>x.kind===kind);
  if(!photos.length) return null;
  const current=photos[Math.min(index,photos.length-1)];
  return <section className="photo-gallery" aria-label={KIND_LABELS[kind] || 'Item photos'}>
    {kind!=='item' && <h3>{KIND_LABELS[kind]}</h3>}
    <GalleryPhoto key={current.path+current.url} asset={current} service={service} title={title} kind={kind} index={Math.min(index,photos.length-1)} onOpen={()=>setViewing(true)}/>
    <div className="photo-thumbnails">{photos.map((asset,i)=><button key={asset.path} type="button" onClick={()=>setIndex(i)} aria-pressed={i===index} aria-label={`Show ${kind} photo ${i+1}`}>{asset.url && <img src={asset.url} loading="lazy" decoding="async" alt=""/>}</button>)}</div>
    {viewing && <PhotoViewer photos={photos.filter(photo=>photo.url)} start={Math.max(0,photos.filter(photo=>photo.url).findIndex(photo=>photo.path===current.path))} title={title} kind={kind} onClose={()=>setViewing(false)}/>}
  </section>;
}
