import type { AdminPrincipal, AdminRole, ModerationCaseKind } from '../lib/marketplaceGovernance.ts';
import { FirebaseRestClient } from './firebaseRest.ts';
import { nationalSchemaEnabled } from './nationalBackend.ts';
import { getFirebaseConfig } from './runtimeConfig.ts';

export type AdminContext = AdminPrincipal & { role: AdminRole };

function client() {
  if (!nationalSchemaEnabled()) throw new Error('SCHEMA_V2_DISABLED');
  const firebase = new FirebaseRestClient(getFirebaseConfig());
  if (!firebase.currentSession?.uid) throw new Error('AUTH_REQUIRED');
  return firebase;
}

function normalizeRole(value: unknown): AdminRole {
  if (['super_admin', 'trust_safety', 'moderator', 'institution_moderator', 'verification_reviewer', 'support'].includes(String(value))) return value as AdminRole;
  return 'super_admin'; // legacy active admin keeps global compatibility until role migration completes.
}

export function moderationQueryScope(admin: AdminContext, kind?: ModerationCaseKind) {
  if (!admin.active) throw new Error('ADMIN_REQUIRED');
  if (admin.role === 'institution_moderator') {
    if (!admin.institution_id) throw new Error('INSTITUTION_SCOPE_REQUIRED');
    return [{ field: 'institution_id', op: 'EQUAL' as const, value: admin.institution_id }];
  }
  if (admin.role === 'verification_reviewer') {
    if (kind && kind !== 'credential') throw new Error('ROLE_SCOPE_DENIED');
    return [{ field: 'kind', op: 'EQUAL' as const, value: 'credential' }];
  }
  if (admin.role === 'support') {
    if (kind && kind !== 'appeal') throw new Error('ROLE_SCOPE_DENIED');
    return [{ field: 'kind', op: 'EQUAL' as const, value: 'appeal' }];
  }
  return kind ? [{ field: 'kind', op: 'EQUAL' as const, value: kind }] : [];
}

export const scopedAdminBackend = {
  async context(): Promise<AdminContext> {
    const firebase = client();
    const uid = firebase.currentSession!.uid;
    const doc = await firebase.getDocument<Record<string, unknown>>(`admins/${uid}`);
    if (!doc?.data?.active) throw new Error('ADMIN_REQUIRED');
    return {
      uid,
      active: true,
      role: normalizeRole(doc.data.role),
      institution_id: doc.data.institution_id ? String(doc.data.institution_id) : undefined,
    };
  },

  async moderationCases(kind?: ModerationCaseKind, limit = 100) {
    const firebase = client();
    const admin = await this.context();
    return firebase.runQuery<any>('moderation_cases', moderationQueryScope(admin, kind), [{ field: 'updated_at', direction: 'DESCENDING' }], Math.max(1, Math.min(200, limit)));
  },

  async reports(limit = 100) {
    const firebase = client();
    const admin = await this.context();
    const filters = admin.role === 'institution_moderator'
      ? [{ field: 'institution_id', op: 'EQUAL' as const, value: admin.institution_id! }]
      : [];
    if (admin.role === 'verification_reviewer' || admin.role === 'support') throw new Error('ROLE_SCOPE_DENIED');
    return firebase.runQuery<any>('reports', filters, [{ field: 'updated_at', direction: 'DESCENDING' }], Math.max(1, Math.min(200, limit)));
  },
};
