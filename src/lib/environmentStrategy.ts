export type TuTopEnvironment = 'development' | 'staging' | 'production';

export type FeatureFlagKey =
  | 'network_identity_v2'
  | 'structured_offers'
  | 'transactions_v2'
  | 'institutional_moderation'
  | 'saved_search_alerts'
  | 'push_notifications'
  | 'trusted_reputation'
  | 'account_deletion_v2';

export type FeatureFlagRule = {
  enabled: boolean;
  institution_ids?: string[];
  campus_ids?: string[];
  min_verification_level?: number;
};

export type FeatureFlagSet = Partial<Record<FeatureFlagKey, FeatureFlagRule>>;

export const HISTORICAL_FIREBASE_PROJECT_ID = 'tutop-3a4f7';
export const STAGING_FIREBASE_PROJECT_ID = 'tutop-beta-vicmdlb-1356585881';

export function assertEnvironmentProject(environment: TuTopEnvironment, projectId: string) {
  const id = projectId.trim();
  if (!id) throw new Error('Missing Firebase project id.');
  if (environment === 'staging' && id !== STAGING_FIREBASE_PROJECT_ID) {
    throw new Error(`Staging must use ${STAGING_FIREBASE_PROJECT_ID}.`);
  }
  if (environment !== 'production' && id === HISTORICAL_FIREBASE_PROJECT_ID) {
    throw new Error('Historical Firebase project cannot be used as development/staging V2.');
  }
  if (environment === 'production' && /(beta|staging|stage|dev|test|sandbox)/i.test(id)) {
    throw new Error('Production cannot target a staging-like Firebase project id.');
  }
  return true;
}

export function featureEnabled(
  flags: FeatureFlagSet,
  key: FeatureFlagKey,
  context: { institution_id?: string; campus_id?: string; verification_level?: number } = {},
) {
  const rule = flags[key];
  if (!rule?.enabled) return false;
  if (rule.institution_ids?.length && (!context.institution_id || !rule.institution_ids.includes(context.institution_id))) return false;
  if (rule.campus_ids?.length && (!context.campus_id || !rule.campus_ids.includes(context.campus_id))) return false;
  if (typeof rule.min_verification_level === 'number' && (context.verification_level || 0) < rule.min_verification_level) return false;
  return true;
}

export const STAGING_DEFAULT_FLAGS: FeatureFlagSet = {
  network_identity_v2: { enabled: true },
  structured_offers: { enabled: true, institution_ids: ['uatx'] },
  transactions_v2: { enabled: true, institution_ids: ['uatx'] },
  institutional_moderation: { enabled: false },
  saved_search_alerts: { enabled: true, institution_ids: ['uatx'] },
  push_notifications: { enabled: false },
  trusted_reputation: { enabled: true, institution_ids: ['uatx'] },
  account_deletion_v2: { enabled: false },
};
