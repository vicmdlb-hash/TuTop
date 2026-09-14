export interface V2RegistrationIdentity {
  country_code: 'MX';
  state_code?: string;
  state_name?: string;
  city_id?: string;
  city_name?: string;
  institution_id?: string;
  institution_name?: string;
  campus_id?: string;
  campus_name?: string;
  faculty_id?: string;
  faculty_name?: string;
  career_id?: string;
  career_name?: string;
  community_id?: string;
  community_name?: string;
}

export interface V2InitialAccountInput {
  uid: string;
  phone: string;
  nombre: string;
  legacyFacultad?: string;
  identity: V2RegistrationIdentity;
  now: unknown;
}

// This allowlist MUST mirror /users/{uid} create keys in firestore.v2.rules.
// Do not spread UniversityIdentity wholesale: it also contains presentation-only
// metadata such as state_name (and may gain future fields) that Firestore Rules
// intentionally reject on the public account document.
const PROFILE_IDENTITY_KEYS = [
  'country_code',
  'state_code',
  'city_id',
  'city_name',
  'institution_id',
  'institution_name',
  'campus_id',
  'campus_name',
  'faculty_id',
  'faculty_name',
  'career_id',
  'career_name',
] as const;

type ProfileIdentityKey = (typeof PROFILE_IDENTITY_KEYS)[number];

function compactIdentity(identity: V2RegistrationIdentity) {
  const projected: Partial<Record<ProfileIdentityKey, string>> = {};
  for (const key of PROFILE_IDENTITY_KEYS) {
    const value = identity[key];
    if (value !== undefined && value !== null && value !== '') projected[key] = String(value);
  }
  return projected;
}

export function buildV2InitialAccountDocuments(input: V2InitialAccountInput) {
  const { uid, phone, identity, now } = input;
  if (!uid) throw new Error('V2_REGISTRATION_UID_REQUIRED');
  if (!identity.institution_id || !identity.campus_id) throw new Error('V2_REGISTRATION_IDENTITY_REQUIRED');

  const nombre = input.nombre.trim().slice(0, 80);
  if (!nombre) throw new Error('V2_REGISTRATION_NAME_REQUIRED');
  const facultad = String(input.legacyFacultad || identity.faculty_name || identity.campus_name || 'Comunidad universitaria').trim().slice(0, 120);
  const walletTxId = `welcome-${uid}`;

  return {
    profile: {
      uid,
      nombre,
      facultad,
      esta_verificado: false,
      ...compactIdentity(identity),
      verification_level: 0,
      verification_badge: 'Cuenta TuTop',
      created_at: now,
      updated_at: now,
    },
    privateProfile: {
      uid,
      telefono: phone,
      created_at: now,
      auth_mode: 'phone_password_beta',
    },
    wallet: {
      owner_uid: uid,
      balance: 10,
      prestige: 0,
      welcome_granted: true,
      last_op_id: walletTxId,
      updated_at: now,
    },
    walletTransaction: {
      id: walletTxId,
      data: {
        user_id: uid,
        type: 'income',
        description: 'Bono de bienvenida',
        amount: 10,
        operation_id: walletTxId,
        created_at: now,
      },
    },
  } as const;
}
