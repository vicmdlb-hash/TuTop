// READ-ONLY audit of existing staging admins. This never creates, edits,
// grants, revokes or deletes a Firebase identity. No UID or email is printed.
import { firebaseCiAccessToken } from './firebase-ci-auth.mjs';
import { summarizeModerationAdminInventory } from './moderation-admin-audit-lib.mjs';

const PROJECT = 'tutop-beta-vicmdlb-1356585881';
if (String(process.env.TUTOP_FIREBASE_PROJECT_ID || '').trim() !== PROJECT) {
  throw new Error('STAGING_PROJECT_REQUIRED');
}
if (process.env.GITHUB_ACTIONS !== 'true') {
  throw new Error('GITHUB_ACTIONS_REQUIRED');
}

const token = await firebaseCiAccessToken();
const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents:runQuery`;
const response = await fetch(url, {
  // Firestore runQuery is a READ request using POST for the query body.
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'X-Goog-User-Project': PROJECT,
  },
  body: JSON.stringify({
    structuredQuery: {
      select: {
        fields: [
          { fieldPath: 'active' },
          { fieldPath: 'role' },
          { fieldPath: 'institution_id' },
        ],
      },
      from: [{ collectionId: 'admins' }],
      limit: 1000,
    },
  }),
});
if (!response.ok) throw new Error(`MODERATION_AUDIT_HTTP_${response.status}`);
const summary = summarizeModerationAdminInventory(await response.json());
console.log(JSON.stringify({
  status: 'READ_ONLY',
  project_id: PROJECT,
  mutation: false,
  pii_logged: false,
  ...summary,
}, null, 2));
console.log('PASS staging moderation inventory read only; identity legitimacy and actual moderation rights remain unverified.');
