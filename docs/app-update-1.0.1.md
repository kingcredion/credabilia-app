# App update 1.0.1 (after both stores approve 1.0)

Why: the iPhone and Android apps carry their own copy of the web code, so fixes only reach phones through an app update. The 1.0.1 update carries:

- Photo fixes: stable cached thumbnails on cards, self-healing images, quiet re-sign of photo links when the app returns after 5+ minutes / the network returns / a photo fails, 6-hour photo links (commit 2dbe40b).
- Admin: listing/member/message details on the Reports tab, certificate lookup page, Fiterman issuer and Option A scoring, "checked with the issuer" note, Seller accounts tab, Beckett lookup note (all already on `main`, none in build 6 / release 15).

Branch: `update-1.0.1` already has the version names bumped (iOS `MARKETING_VERSION` 1.0.1, Android `versionName` 1.0.1). Build numbers are automatic (iOS: next TestFlight number; Android: Codemagic build number).

## Steps (when Apple and Google have both approved 1.0)

1. Merge anything new from `main` into `update-1.0.1` (`git merge main`), run `npm test` and `npx vite build`.
2. Codemagic > Start new build > branch `update-1.0.1`:
   - workflow "iPhone app to TestFlight" (wait for the build, then ~15 min of Apple processing),
   - workflow "Android app bundle" (about 3 minutes; the workflow dropdown resets to iPhone each time).
3. Apple: App Store Connect > the app > "+" next to iOS App > new version **1.0.1** > "What's New" text > pick the new build > Add for Review > Submit. Updates are usually reviewed faster than a first release. Release setting: automatic or manual, your choice.
4. Google Play: download the new `.aab`, then Test and release > Production > Create new release > upload (version code goes up on its own) > release notes > Save > Publishing overview > Send for review. Optionally put it on Internal testing first and install it on your phone.
5. Keep the App Review login switch (`public.app_review_access`) ON until you have no more reviews pending; turn it off after the last approval: `update public.app_review_access set enabled=false;`
6. After 1.0.1 is live: merge `update-1.0.1` back into `main` (so `main` also says 1.0.1) and delete the branch.

## What to watch after launch

- Admin > Reports: reports from `appreview@credabilia.com` are Apple/Google test reports; dismiss them, do not remove the listing.
- Google Play pre-launch report (Play Console) and App Store Connect crash reports.
- Twilio: toll-free verification and the business profile must be approved before SMS delivers.
