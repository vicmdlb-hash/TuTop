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
  return 'super_admin';
}

function patchWrite(firebase: FirebaseRestClient, path: string, data: Record<string, unknown>) {
  return { update: firebase.encodeDocumentForWrite(path, data), updateMask: { fieldPaths: Object.keys(data) } };
}

function createWrite(firebase: FirebaseRestClient, path: string, data: Record<string, unknown>) {
  return { update: firebase.encodeDocumentForWrite(path, data), currentDocument: { exists: false } };
}

function auditId(action: string, targetId: string) {
  const random = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `admin-${action}-${targetId}-${random}`.slice(0, 240);
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

async function auditedPatch(input: {
  path: string;
  patch: Record<string, unknown>;
  action: string;
  targetType: string;
  targetId: string;
  institutionId?: string;
}) {
  const firebase = client();
  const admin = await scopedAdminBackend.context();
  const at = new Date().toISOString();
  const audit = {
    admin_uid: admin.uid,
    actor_type: 'admin',
    role: admin.role,
    action: input.action,
    target_type: input.targetType,
    target_id: input.targetId,
    ...(input.institutionId ? { institution_id: input.institutionId } : {}),
    created_at: at,
  };
  await firebase.commit([
    patchWrite(firebase, input.path, { ...input.patch, updated_at: at }),
    createWrite(firebase, `audit_log/${auditId(input.action, input.targetId)}`, audit),
  ]);
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

  async noShowClaims(limit = 100) {
    const firebase = client();
    const admin = await this.context();
    if (admin.role === 'verification_reviewer' || admin.role === 'support') throw new Error('ROLE_SCOPE_DENIED');
    const filters = admin.role === 'institution_moderator'
      ? [{ field: 'institution_id', op: 'EQUAL' as const, value: admin.institution_id! }]
      : [];
    return firebase.runQuery<any>('transaction_outcome_claims', filters, [{ field: 'updated_at', direction: 'DESCENDING' }], Math.max(1, Math.min(200, limit)));
  },

  async auditLog(limit = 100) {
    const firebase = client();
    const admin = await this.context();
    if (admin.role === 'institution_moderator' && admin.institution_id) {
      return firebase.runQuery<any>('audit_log', [{ field: 'institution_id', op: 'EQUAL', value: admin.institution_id }], [{ field: 'created_at', direction: 'DESCENDING' }], Math.max(1, Math.min(200, limit)));
    }
    if (admin.role === 'verification_reviewer' || admin.role === 'support') return [];
    return firebase.runQuery<any>('audit_log', [], [{ field: 'created_at', direction: 'DESCENDING' }], Math.max(1, Math.min(200, limit));
  },

  async resolveModerationCase(caseId: string, status: 'reviewing' | 'resolved' | 'dismissed', institutionId?: string) {
    await auditedPatch({ path: `moderation_cases/${caseId}`, patch: { status }, action: `moderation_case_${status}`, targetType: 'moderation_case', targetId: caseId, institutionId });
  },

  async resolveReport(reportId: string, status: 'reviewing' | 'resolved' | 'dismissed', institutionId?: string) {
    await auditedPatch({ path: `reports/${reportId}`, patch: { status }, action: `report_${status}`, targetType: 'report', targetId: reportId, institutionId });
  },

  async resolveNoShowClaim(claimId: string, status: 'upheld' | 'dismissed', institutionId: string) {
    await auditedPatch({ path: `transaction_outcome_claims/${claimId}`, patch: { status }, action: `no_show_${status}`, targetType: 'transaction_outcome_claim', targetId: claimId, institutionId });
  },
};
