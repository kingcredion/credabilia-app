// A small, cached copy of an active listing's main photo at an address that never expires (api/email-image.js, ?fmt=webp). Cards use it first:
// it loads much faster than the full-size photo and cannot go stale while the app sits in the background.
// The edge keeps each address for up to a day, so the address also carries a version: the first 8 characters of the photo's file name, read from its
// signed link. Replace or fix a listing's main photo and the file name changes, so the card asks for a fresh copy straight away instead of showing the old one.
const FILE_NAME = /([0-9a-f]{8})-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:png|jpe?g|webp)(?:\?|$)/i;

export function thumbUrl(id, photo) {
  const base = 'https://credabilia.com/img/item/' + id + '?fmt=webp&w=640';
  const version = typeof photo === 'string' ? photo.match(FILE_NAME)?.[1] : null;
  return version ? base + '&v=' + version.toLowerCase() : base;
}
