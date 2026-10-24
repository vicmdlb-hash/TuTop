import { FirebaseRestClient } from './firebaseRest';
import { getFirebaseConfig } from './runtimeConfig';
import { nationalSchemaEnabled } from './nationalBackend';

function clientAndOwner() {
  if (!nationalSchemaEnabled()) throw new Error('USER_BLOCK_V2_REQUIRED');
  const client = new FirebaseRestClient(getFirebaseConfig());
  const ownerUid = client.currentSession?.uid;
  if (!ownerUid) throw new Error('AUTH_REQUIRED');
  return { client, ownerUid };
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
    const { client, ownerUid } = clientAndOwner();
    const uid = targetId(ownerUid, rawUid);
    const result = await client.getDocument(`user_blocks/${ownerUid}/targets/${uid}`);
    if (client.currentSession?.uid !== ownerUid) throw new Error('SESSION_CHANGED');
    return Boolean(result);
  },
  async setBlocked(rawUid: string, shouldBlock: boolean) {
    const { client, ownerUid } = clientAndOwner();
    const uid = targetId(ownerUid, rawUid);
    if (client.currentSession?.uid !== ownerUid) throw new Error('SESSION_CHANGED');
    const path = `user_blocks/${ownerUid}/targets/${uid}`;
    if (shouldBlock) {
      const existing = await client.getDocument(path);
      if (client.currentSession?.uid !== ownerUid) throw new Error('SESSION_CHANGED');
      if (!existing) await client.setDocument(path, {
        blocker_uid: ownerUid, blocked_uid: uid, created_at: new Date().toISOString(),
      }, { exists: false });
    } else {
      const existing = await client.getDocument(path);
      if (client.currentSession?.uid !== ownerUid) throw new Error('SESSION_CHANGED');
      if (existing) await client.deleteDocument(path);
    }
    return shouldBlock;
  },
};
