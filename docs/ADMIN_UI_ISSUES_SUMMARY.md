# Admin UI Issues Summary

This document tracks the Admin UI issues identified during the current debugging session.

## 1. Firebase App Check site key error

**Symptom**

The browser logged:

```text
[AppCheck] reCAPTCHA Enterprise site key is not configured.
```

The error originated from `frontend/src/lib/firebaseAppCheck.ts` during authentication restoration.

**Cause**

`NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY` was not present in `frontend/.env.local`. The app attempted to initialize Firebase App Check without a site key.

**Fix applied**

- Development without a site key skips initialization only with the explicit `NEXT_PUBLIC_FIREBASE_APPCHECK_DISABLED=true` opt-out for a project whose enforcement is disabled. The browser cannot infer console enforcement. Enforced local projects require a registered debug token or valid provider key.
- Production still fails closed when the required key is missing.
- `ensureAppCheck()` safely handles non-browser/development no-op behavior.

**Required configuration**

For production, or for local development against a Firebase project with App Check enforcement enabled, configure:

```env
NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY=your_recaptcha_enterprise_site_key
```

For local development, a registered Firebase App Check debug token may also be used:

```env
NEXT_PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN=your_registered_debug_token
```

Never commit either value to source control.

## 2. Fleet data permission denied

**Symptom**

The Admin UI displayed:

```text
Fleet data could not be loaded.
Permission denied reading buses.
```

The affected data comes from the Firestore `buses` collection.

**Cause**

The authenticated user was published to React state before the first App Check token was ready. The `useCollection("buses")` listener then opened too early, causing Firebase to reject the protected read.

**Fix applied**

- Authentication waits for App Check and role verification before publishing the signed-in user and opening protected readiness; readiness resets on account changes. Timeouts never grant readiness.
- Firestore listeners therefore start only after authentication and App Check are ready.
- If App Check fails, the app does not publish a partially verified user and show a misleading Firestore permission error.
- Sign-out closes readiness immediately and invalidates pending role verification. Failed sign-out keeps protected content hidden and offers reload recovery.

**Relevant files**

- `frontend/src/hooks/useAuth.ts`
- `frontend/src/lib/firebaseAppCheck.ts`
- `frontend/src/hooks/useCollection.ts`
- `firestore.rules`

The Firestore rule for registered buses remains authenticated-read only:

```text
allow read: if isAuthenticated();
```

## 3. Feedback permission denied

**Symptom**

The Admin UI displayed:

```text
COULDN'T LOAD FEEDBACK
Permission denied reading feedbacks.
```

**Cause**

The feedback screen read the sensitive Firestore `feedbacks` collection directly from the browser. Firestore correctly restricts that collection to users with the trusted admin claim, so the browser listener was rejected when the claim/session state did not match the deployed rules.

**Fix applied**

- Added an admin-protected `GET /api/v2/feedback` endpoint.
- The backend reads and serializes the latest 200 feedback records with the Admin SDK.
- The Admin UI now loads feedback through that endpoint using the Firebase ID token.
- Standalone and embedded feedback views use the shared panel, validate list responses, abort stale reads and writes, and hide previous-session data even when the same account is verified again. Status changes update the local list only after a valid acknowledgement from the admin-protected PATCH; old completions cannot clear a new request's loading or error state.
- Firestore rules remain restricted to `allow read: if isAdmin();`; no public access was added.

## 4. Settings save shows `Failed to fetch`

**Symptom**

Saving changes in Admin → Settings displayed:

```text
Failed to save: Failed to fetch
```

**Cause**

The frontend was configured with `NEXT_PUBLIC_BACKEND_URL=http://localhost:4000`, but the backend was not reachable. The Settings hook used raw `fetch`, so the browser exposed the unhelpful low-level `Failed to fetch` message.

**Fix applied**

- Settings saves now use the shared `apiRequest` client.
- Backend outages, invalid URLs, timeouts, and network failures now produce actionable API errors.
- Authentication and admin authorization errors from the backend are preserved.

**Local development requirement**

Run both applications from the repository root:

```powershell
npm run dev
```

This starts the frontend on `http://localhost:3000` and backend on `http://localhost:4000`. If the backend is hosted elsewhere, update `NEXT_PUBLIC_BACKEND_URL` and restart the frontend.

## Verification

The original 35-file/221-test statement described the old branch. Current regression coverage includes App Check configuration/debug/production/token/deadline behavior; auth readiness, restoration timeout and account switches; collection/settings listener disposal; visible null-user security recovery; actual admin middleware and feedback HTTP contracts; and standalone/embedded feedback API loading, retry and acknowledged status changes. Final run counts and exact-head CI evidence are recorded in PR #205.

## Follow-up checklist

- [ ] Add the production reCAPTCHA Enterprise site key to the deployment environment.
- [ ] Confirm the deployed hostname is registered for the Firebase App Check provider.
- [ ] If App Check enforcement is enabled locally, register and configure a local debug token instead of relying on the development no-op.
- [ ] Restart the Next.js development or production process after changing environment variables.
