import { FirebaseRestClient } from './firebaseRest';
import { getFirebaseConfig } from './runtimeConfig';
import { nationalSchemaEnabled } from './nationalBackend';
import { sameFirebaseSession } from '../lib/firebaseSharedSessionGuard';

function clientAndOwner() {
  if (!nationalSchemaEnabled()) throw new Error('USER_BLOCK_V2_REQUIRED');
  const client = new FirebaseRestClient(getFirebaseConfig());
  const requestSession = client.currentSession;
  const ownerUid = requestSession?.uid;
  if (!ownerUid) throw new Error('AUTH_REQUIRED');
  // A same-UID relogin is a different session: compare tokens in memory,
  // not merely the UID, before accepting data or sending a write.
  const assertCurrent = () => {
    if (!sameFirebaseSession(requestSession, client.currentSession)
      || !sameFirebaseSession(requestSession, new FirebaseRestClient(getFirebaseConfig()).currentSession)) {
      throw new Error('SESSION_CHANGED');
    }
  };
  return { client, ownerUid, assertCurrent };
}
function targetId(ownerUid: string, rawUid: string) {
  const targetUid = rawUid.trim();
  if (!targetUid || targetUid === ownerUid || targetUid.length > 128 || targetUid.includes('/')) {
    throw new Error('USER_BLOCK_TARGET_INVALID');
  }
  return targetUid;
}

export const userBlockBackend = {
  async isBlocked(rawUid: string) {
    const { client, ownerUid, assertCurrent } = clientAndOwner();
    const uid = targetId(ownerUid, rawUid);
    const result = await client.getDocument(`user_blocks/${ownerUid}/targets/${uid}`);
    assertCurrent();
    return Boolean(result);
  },
  async setBlocked(rawUid: string, shouldBlock: boolean) {
    const { client, ownerUid, assertCurrent } = clientAndOwner();
    const uid = targetId(ownerUid, rawUid);
    assertCurrent();
    const path = `user_blocks/${ownerUid}/targets/${uid}`;
    if (shouldBlock) {
      const existing = await client.getDocument(path);
      assertCurrent();
      if (!existing) await client.setDocument(path, {
        blocker_uid: ownerUid, blocked_uid: uid, created_at: new Date().toISOString(),
      }, { exists: false });
    } else {
      const existing = await client.getDocument(path);
      assertCurrent();
      if (existing) await client.deleteDocument(path);
    }
    assertCurrent();
    return shouldBlock;
  },
};
