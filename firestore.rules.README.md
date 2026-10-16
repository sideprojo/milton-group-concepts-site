# firestore.rules – requirements (prototype, test in emulator before deploy)

## Custom claims (set ONLY via Admin SDK)
- `owner: true` – single portal owner. Set once by an admin script.
- `sub: 'active'` – paid subscriber. Set/cleared by the Stripe webhook function.
  Clients must call `getIdToken(true)` after changes to refresh claims.

## Cloud Functions needed (Admin SDK, bypass rules)
- **stripeWebhook**: on subscription created/updated/deleted, `setCustomUserClaims(uid, {sub})`.
- **Notification writer**: creates `/notifications/{id}` (`toUid`, `read:false`, ...). Clients cannot create/delete.
- **Audit logger**: writes `/auditLog/{id}` on owner/admin actions. Clients cannot write.
- **User provisioning** (optional): sets `role`, `status`, `plan`, `pages` on `/users/{uid}`
  (or the owner does it from the client).
- **Page builder**: writes `/workspaces/{uid}/pages/{pageId}` with `status: 'ready'`
  (owner client may also write).

## Data conventions
- `/shares/{resourceType}_{resourceId}_{granteeUid}` must contain
  `resourceType, resourceId, granteeUid, perms (list, max 10)`; doc ID must match.
- Project member edit requires `'edit'` in share `perms` and an active `sub` claim.
- Access request: `{uid, status:'requested', title?, message?, brand?, createdAt?}`.
- Feature request: `{title<=120, body<=2000, createdBy, createdAt?}`; `createdAt` must equal `request.time`.

## Not covered
- Any collection not listed is denied.
- Queries must filter to rules (e.g. `where('toUid','==',uid)`), or they will be rejected.
