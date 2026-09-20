export const MEDIA_LIMITS = { item:6, certificate:3 };
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export function validateImage(file) {
  if (!['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('Choose a JPEG, PNG or WebP image.');
  if (!file.size || file.size>MAX_IMAGE_BYTES) throw new Error('Each image must be under 5 MB.');
}
export async function prepareImage(file) {
  validateImage(file);
  let bitmap;
  try { bitmap=await createImageBitmap(file); } catch { throw new Error('This image could not be opened. Try another photo.'); }
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width*bitmap.height>40000000) throw new Error('Choose a photo smaller than 40 megapixels.');
    const scale=Math.min(1,1800/Math.max(bitmap.width,bitmap.height));
    const canvas=document.createElement('canvas'); canvas.width=Math.round(bitmap.width*scale); canvas.height=Math.round(bitmap.height*scale);
    const context=canvas.getContext('2d'); context.fillStyle='#fff'; context.fillRect(0,0,canvas.width,canvas.height); context.drawImage(bitmap,0,0,canvas.width,canvas.height);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.85));
    if (!blob || blob.size>MAX_IMAGE_BYTES) throw new Error('This photo is too large to save.');
    return blob;
  } finally { bitmap.close(); }
}
export function mediaInput(media=[]) {
  if (!Array.isArray(media) || media.length>9) throw new Error('Choose up to six item photos and three certificate photos.');
  for(const kind of Object.keys(MEDIA_LIMITS)) if(media.filter(x=>x.kind===kind).length>MEDIA_LIMITS[kind]) throw new Error(`Too many ${kind} photos.`);
  return media.map(({path,kind})=>{
    if(!Object.hasOwn(MEDIA_LIMITS,kind) || typeof path!=='string' || !path.length || path.length>200) throw new Error('Invalid photo reference.');
    return {path,kind};
  });
}
