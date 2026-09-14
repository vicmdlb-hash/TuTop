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

function compactIdentity(identity: V2RegistrationIdentity) {
  return Object.fromEntries(
    Object.entries(identity).filter(([, value]) => value !== undefined && value !== null && value !== ''),
  );
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
