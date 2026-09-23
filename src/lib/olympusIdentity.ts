export type PodiumMedal = 'gold' | 'silver' | 'bronze' | 'none';
export type OlympusReputationTier = 'Iniciado' | 'Héroe' | 'Semidiós' | 'Olímpico';
export type OlympusPlan = 'Gratis' | 'Hermes' | 'Atenea' | 'Zeus';

export const TUTOP_PODIUM = Object.freeze({
  1: { medal: 'gold' as const, label: 'Oro', shortLabel: 'Top 1' },
  2: { medal: 'silver' as const, label: 'Plata', shortLabel: 'Top 2' },
  3: { medal: 'bronze' as const, label: 'Bronce', shortLabel: 'Top 3' },
});

export const OLYMPUS_REPUTATION = Object.freeze([
  { tier: 'Iniciado' as const, source: 'earned_only' as const, description: 'Cuenta con historial todavía limitado.' },
  { tier: 'Héroe' as const, source: 'earned_only' as const, description: 'Historial positivo suficiente para mostrar progreso ganado.' },
  { tier: 'Semidiós' as const, source: 'earned_only' as const, description: 'Trayectoria consistente respaldada por operaciones y señales de confianza.' },
  { tier: 'Olímpico' as const, source: 'earned_only' as const, description: 'Nivel superior ganado; nunca se compra.' },
]);

export const OLYMPUS_PLANS = Object.freeze([
  { plan: 'Gratis' as const, paid: false, trustEffect: false, theme: 'TuTop base' },
  { plan: 'Hermes' as const, paid: true, trustEffect: false, theme: 'Agilidad, herramientas y movimiento' },
  { plan: 'Atenea' as const, paid: true, trustEffect: false, theme: 'Analítica, IA y herramientas inteligentes' },
  { plan: 'Zeus' as const, paid: true, trustEffect: false, theme: 'Paquete comercial superior y mayor capacidad' },
]);

export function podiumForRank(rank: number) {
  return TUTOP_PODIUM[rank as 1 | 2 | 3] || { medal: 'none' as const, label: '', shortLabel: '' };
}

export function reputationDisplay(tier: OlympusReputationTier) {
  return OLYMPUS_REPUTATION.find((item) => item.tier === tier)!;
}

export function planDisplay(plan: OlympusPlan) {
  return OLYMPUS_PLANS.find((item) => item.plan === plan)!;
}

// Important product invariant: money, plan, UCoins balance and paid visibility
// are not accepted as inputs here. Reputation must come from a separate trusted
// reputation engine built from completed transactions / reviews / safety facts.
export function reputationInputsAreEarnedOnly(input: {
  completedTransactions: number;
  positiveReviewRate: number | null;
  cancellations: number;
  noShows: number;
  upheldReports: number;
}) {
  return {
    completedTransactions: Math.max(0, Math.trunc(input.completedTransactions)),
    positiveReviewRate: input.positiveReviewRate == null ? null : Math.max(0, Math.min(100, input.positiveReviewRate)),
    cancellations: Math.max(0, Math.trunc(input.cancellations)),
    noShows: Math.max(0, Math.trunc(input.noShows)),
    upheldReports: Math.max(0, Math.trunc(input.upheldReports)),
  };
}
