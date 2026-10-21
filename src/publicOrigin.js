import { isNativeApp } from './nativeAuth.js';

export const SITE_ORIGIN = 'https://credabilia.com';

// The address to put in links people will share. On the web that is the page's own address; inside the phone apps the page
// is served from capacitor://localhost (iPhone) or https://localhost (Android), which no one else can open.
export function publicOrigin(location = globalThis.window?.location) {
  const origin = location?.origin;
  if (isNativeApp() || !origin || !/^https?:\/\//.test(origin)) return SITE_ORIGIN;
  return origin;
}
