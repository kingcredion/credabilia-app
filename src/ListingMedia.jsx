import React, { useState } from 'react';
import { MEDIA_LIMITS, prepareImage } from './media.js';

const backgroundRemoved = asset => /[.]png$/.test(asset.path);

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
    <p className="field-note">JPEG, PNG or WebP · up to 5 MB each. Photos become visible to buyers when you publish. Your main item photo (shown first) needs its background removed before you can publish.</p>
    {Object.entries(MEDIA_LIMITS).map(([kind,limit])=><div key={kind}>
      <label>{kind==='item'?'Item photos':'Certificate photos'} · up to {limit}<input aria-label={kind==='item'?'Add item photos':'Add certificate photos'} type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy} onChange={event=>add(event,kind)}/></label>
      <div className="photo-thumbnails">{media.filter(asset=>asset.kind===kind).map((asset,index)=><div key={asset.path}><img src={asset.url} alt={`${kind} photo ${index+1}`}/>
        {kind==='item' && index===0 && (backgroundRemoved(asset)
          ? <p className="field-note bg-removed-ok">Background removed ✓</p>
          : <button type="button" className="text-button" disabled={busy} onClick={()=>removeBackground(asset)}>Remove background (required)</button>)}
        <button type="button" className="text-button" disabled={busy} onClick={()=>remove(asset)} aria-label={`Remove ${kind} photo ${index+1}`}>Remove</button></div>)}</div>
    </div>)}
    {busy && <p role="status">Preparing photos…</p>}
  </fieldset>;
}

export function PhotoGallery({media=[],kind='item',title}) {
  const [index,setIndex]=useState(0);
  const photos=media.filter(x=>x.kind===kind);
  if(!photos.length) return null;
  const current=photos[Math.min(index,photos.length-1)];
  return <section className="photo-gallery" aria-label={kind==='item'?'Item photos':'Certificate photos'}>
    {kind==='certificate' && <h3>Certificate photos</h3>}
    {current.url ? <a href={current.url} target="_blank" rel="noopener noreferrer"><img className="gallery-main" src={current.url} alt={`${title} · ${kind} photo ${index+1}`}/></a> : <p>Photo unavailable. Refresh to try again.</p>}
    <div className="photo-thumbnails">{photos.map((asset,i)=><button key={asset.path} type="button" onClick={()=>setIndex(i)} aria-pressed={i===index} aria-label={`Show ${kind} photo ${i+1}`}>{asset.url && <img src={asset.url} alt=""/>}</button>)}</div>
  </section>;
}
