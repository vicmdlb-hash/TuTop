import { ACCOUNT_RECOVERY_POLICY, publicRecoveryResponse, type RecoveryChannel, type RecoveryProviderState } from '../lib/accountRecoveryPolicy';

export type RecoveryReadiness = {
  provider: 'disabled' | 'external';
  state: RecoveryProviderState;
  supported_channels: RecoveryChannel[];
  public_message: string;
  requires_verified_channel: true;
  challenge_ttl_ms: number;
};

export type RecoveryStartResult = {
  accepted: boolean;
  public_message: string;
  provider: RecoveryReadiness['provider'];
};

export interface RecoveryProvider {
  readonly name: string;
  readonly channels: RecoveryChannel[];
  start(identifier: string): Promise<void>;
}

class DisabledRecoveryProvider implements RecoveryProvider {
  readonly name = 'disabled';
  readonly channels: RecoveryChannel[] = [];
  async start(_identifier: string) {
    throw new Error('RECOVERY_CHANNEL_UNAVAILABLE');
  }
}

const disabledProvider = new DisabledRecoveryProvider();

function configuredProvider(): RecoveryProvider {
  // No external provider is enabled in the zero-cost staging beta. Future SMS/email
  // adapters must implement RecoveryProvider behind a trusted backend; never embed
  // provider secrets in the APK or use an unverified phone number as proof of identity.
  return disabledProvider;
}

export function accountRecoveryReadiness(): RecoveryReadiness {
  const provider = configuredProvider();
  const enabled = provider !== disabledProvider;
  return {
    provider: enabled ? 'external' : 'disabled',
    state: enabled ? 'ready' : 'disabled',
    supported_channels: [...provider.channels],
    public_message: enabled ? publicRecoveryResponse() : 'Recuperación de clave aún no disponible en esta beta: falta un canal de identidad verificado.',
    requires_verified_channel: true,
    challenge_ttl_ms: ACCOUNT_RECOVERY_POLICY.challenge_ttl_ms,
  };
}

export async function startForgottenPasswordRecovery(identifier: string): Promise<RecoveryStartResult> {
  const clean = String(identifier || '').trim().slice(0, ACCOUNT_RECOVERY_POLICY.max_identifier_length);
  if (!clean) return { accepted: false, public_message: publicRecoveryResponse(), provider: 'disabled' };
  const provider = configuredProvider();
  if (provider === disabledProvider) {
    // Generic wording avoids account enumeration while making the beta limitation explicit.
    return { accepted: false, public_message: 'TuTop todavía no tiene un canal de recuperación verificado activo. No se enviará un SMS o correo ficticio.', provider: 'disabled' };
  }
  await provider.start(clean);
  return { accepted: true, public_message: publicRecoveryResponse(), provider: 'external' };
}
