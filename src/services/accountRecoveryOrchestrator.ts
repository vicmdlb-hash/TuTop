import { ACCOUNT_RECOVERY_POLICY, publicRecoveryResponse, type RecoveryChannel, type RecoveryProviderState } from '../lib/accountRecoveryPolicy';
import { runtimeRecoveryAdapter } from './recoveryProviderAdapter';

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

function correlationId() {
  const raw = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return raw.replace(/[^a-z0-9-]/gi, '').slice(0, 80);
}

export function accountRecoveryReadiness(): RecoveryReadiness {
  const provider = runtimeRecoveryAdapter();
  const enabled = provider.name !== 'disabled' && provider.channels.length > 0;
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

  const provider = runtimeRecoveryAdapter();
  if (provider.name === 'disabled' || provider.channels.length === 0) {
    // Generic wording avoids account enumeration while making the beta limitation explicit.
    return { accepted: false, public_message: 'TuTop todavía no tiene un canal de recuperación verificado activo. No se enviará un SMS o correo ficticio.', provider: 'disabled' };
  }

  // A real adapter may only advertise verified channels and must execute behind a
  // trusted backend. The client never receives provider credentials or raw OTP secrets.
  const channel = provider.channels[0];
  await provider.start({ identifier: clean, channel, correlation_id: correlationId() });
  return { accepted: true, public_message: publicRecoveryResponse(), provider: 'external' };
}
