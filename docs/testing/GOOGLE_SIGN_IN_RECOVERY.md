# Google sign-in recovery (#356)

Mobile browsers (including iPad desktop mode) and installed PWAs use full-page
Google sign-in when Firebase's `authDomain` matches the application host.
Desktop browsers retain popups. Cross-origin/local development configurations
retain popups because redirect recovery requires access to the Auth helper's
storage. This follows Firebase's [mobile sign-in guidance](https://firebase.google.com/docs/auth/web/google-signin)
and [redirect configuration requirements](https://firebase.google.com/docs/auth/web/redirect-best-practices).

The primary project's Firebase Hosting domains already resolve to the current
hostname. For custom/secondary Hosting domains, configure the frontend hostname
as `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, authorize the domain in Firebase Auth,
and authorize `https://<frontend-host>/__/auth/handler` in the Google OAuth client.
See [configuration](../CONFIGURATION.md#local-auth-setup).

The sign-in button waits for redirect processing. A tab-scoped pending marker
detects a return without a session and shows a retry message; it never grants
access. Successful popup and redirect results enter the same trusted-role
verification as the Auth observer, coalescing pending work and reusing completed
verification. This also handles a delayed observer in an existing app runtime.
Sign-out and account changes continue to invalidate stale verification.

## Automated coverage

Run from the repository root:

```powershell
npm exec --workspace=frontend -- vitest run src/hooks/useAuth.test.tsx src/lib/googleSignInFlow.test.ts src/lib/firebaseAuth.test.ts src/lib/firebaseAuthDomain.test.ts src/app/page.test.tsx src/components/shared/RoleGuard.test.tsx --maxWorkers=2
```

Coverage uses mocked Firebase OAuth and claims: mobile/PWA flow selection,
logout followed by login, repeated desktop login with the same/different
accounts, delayed observer delivery, redirect/refresh restoration, missing
sessions, errors, popup fallback, and role-gated dashboard routing. It does not
certify live Google OAuth or physical Android/iOS behavior.

## Deployment acceptance

After deploying the frontend, verify on Android Chrome, iOS Safari, the installed
PWA, and a desktop browser:

1. Sign in, confirm the account's permitted dashboard, then refresh it.
2. Sign out and sign in again with the same account without clearing site data.
3. Repeat with another Google account and verify the matching dashboard/profile.
4. Repeat for passenger and administrator accounts.
5. Cancel Google sign-in or interrupt the network, then retry from the displayed
   recovery state.

Google account selection and real browser storage behavior require these live
checks; unit tests cannot replace them. Worker updates continue to wait for old
tabs to close, so close existing app windows and reopen to load a new deployment.
