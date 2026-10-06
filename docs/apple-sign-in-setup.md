# Sign in with Apple: setup

The "Continue with Apple" button is in the app but hidden until `VITE_APPLE_SIGNIN_ENABLED=true` (Vercel env var, and in the app builds). Turn that on only after steps 1 to 4 are done and tested.

## 1. Apple Developer portal (developer.apple.com > Certificates, Identifiers & Profiles)

1. **App ID** (Identifiers > + > App IDs > App): description `Credabilia`, Bundle ID **explicit** `com.credabilia.app`, tick the **Sign in with Apple** capability (Enable as a primary App ID). Save.
2. **Services ID** (Identifiers > + > Services IDs): description `Credabilia web sign in`, identifier `com.credabilia.web`. Tick **Sign in with Apple** > Configure:
   - Primary App ID: `Credabilia (com.credabilia.app)`
   - Domains: `login.credabilia.com`
   - Return URLs: `https://login.credabilia.com/auth/v1/callback`
3. **Key** (Keys > + ): name `Credabilia Sign in with Apple`, tick **Sign in with Apple** > Configure > primary App ID `com.credabilia.app`. Register, **download the .p8 file once** (Apple never shows it again), and note the **Key ID**.
4. Note the **Team ID** (top right of the portal, or Membership details).
5. **Private email relay** (Services > Sign in with Apple for Email Communication > Configure): register the sending domains `auth.credabilia.com`, `send.credabilia.com`, `mail.credabilia.com`, and the address `login@auth.credabilia.com`, so email to people who chose "Hide My Email" is delivered. (Apple lists the SPF record each domain needs.)

## 2. Supabase (Authentication > Sign In / Providers > Apple)

- Enable Apple.
- Client IDs: `com.credabilia.web,com.credabilia.app`
- Secret Key (for OAuth): a signed token made from the Team ID, Key ID, the .p8 file and the Services ID. Supabase's docs have a generator. **It expires after at most 6 months**: put a reminder in the calendar to make a new one and paste it in again (about every 5 months).
- Save. The callback URL is already `https://login.credabilia.com/auth/v1/callback`.

## 3. Turn the button on

- Vercel > Project > Settings > Environment Variables: `VITE_APPLE_SIGNIN_ENABLED` = `true` (Production), then redeploy.

## 4. Test

- On credabilia.com: Sign in > Continue with Apple, finish with an Apple ID, and check you land signed in. Try once with "Hide My Email" and check an email to that address arrives.
- In the iPhone app (TestFlight build), the same button opens Apple's page in the system browser and returns to the app.

## Notes

- The first time someone signs in with Apple, Apple shares their name only once; the app falls back to "Collector" if none arrives.
- A person who already has an account by the same email will be linked to it by Supabase automatically.
