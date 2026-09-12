import type { RecoveryChannel } from '../lib/accountRecoveryPolicy';

export type RecoveryChallengeRequest = {
  identifier: string;
  channel: RecoveryChannel;
  correlation_id: string;
};

export type RecoveryChallengeResult = {
  accepted: boolean;
  provider_reference?: string;
};

export interface RecoveryProviderAdapter {
  readonly name: string;
  readonly channels: RecoveryChannel[];
  readonly trusted_backend_only: true;
  start(request: RecoveryChallengeRequest): Promise<RecoveryChallengeResult>;
}

export class DisabledRecoveryAdapter implements RecoveryProviderAdapter {
  readonly name = 'disabled';
  readonly channels: RecoveryChannel[] = [];
  readonly trusted_backend_only = true as const;

  async start(_request: RecoveryChallengeRequest): Promise<RecoveryChallengeResult> {
    throw new Error('RECOVERY_CHANNEL_UNAVAILABLE');
  }
}

export class ContractTestRecoveryAdapter implements RecoveryProviderAdapter {
  readonly name = 'contract-test';
  readonly channels: RecoveryChannel[] = ['verified_email', 'verified_sms', 'recovery_code'];
  readonly trusted_backend_only = true as const;
  private readonly calls: RecoveryChallengeRequest[] = [];

  async start(request: RecoveryChallengeRequest): Promise<RecoveryChallengeResult> {
    if (!this.channels.includes(request.channel)) throw new Error('RECOVERY_CHANNEL_UNSUPPORTED');
    if (!request.identifier.trim()) throw new Error('RECOVERY_IDENTIFIER_REQUIRED');
    if (!/^[a-z0-9-]{8,80}$/i.test(request.correlation_id)) throw new Error('RECOVERY_CORRELATION_INVALID');
    this.calls.push({ ...request });
    return { accepted: true, provider_reference: `contract:${request.correlation_id}` };
  }

  snapshotCalls() {
    return this.calls.map((call) => ({ ...call }));
  }
}

const disabled = new DisabledRecoveryAdapter();

export function runtimeRecoveryAdapter(): RecoveryProviderAdapter {
  // Runtime remains deliberately disabled until a real verified recovery channel
  // exists behind a trusted backend. Never switch this from client-side env flags.
  return disabled;
}

export function createRecoveryContractTestAdapter() {
  return new ContractTestRecoveryAdapter();
}
