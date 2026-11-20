/** V2 Phase 4 investment rules: one place for sectors, statuses and gates. */
export const SECTORS = [
  'agriculture',
  'energy',
  'real_estate',
  'infrastructure',
  'technology',
  'manufacturing',
  'other',
] as const;
export type Sector = (typeof SECTORS)[number];

export const INSTRUMENT_TYPES = [
  'equity',
  'debt',
  'revenue_share',
  'asset_backed',
  'other',
] as const;

export const DOCUMENT_KINDS = [
  'business_plan',
  'financial_statements',
  'financial_projections',
  'licence_permit',
  'land_title_lease',
  'pitch_deck',
  'valuation_report',
  'legal_agreement',
  'environmental_assessment',
  'other',
] as const;
/** Documents a business must attach before a project can be submitted. */
export const REQUIRED_DOCUMENTS = [
  'business_plan',
  'financial_statements',
] as const;

/**
 * Fields and uploads required before submit-for-review or tokenization.
 * Tokenization is not a shortcut around an unfinished application.
 */
export function projectApplicationGaps(p: {
  project_name?: string | null;
  sector?: string | null;
  summary?: string | null;
  description?: string | null;
  use_of_funds?: string | null;
  risk_factors?: string | null;
  instrument_type?: string | null;
  location?: string | null;
  target_amount?: unknown;
  minimum_investment?: unknown;
  maximum_investment?: unknown;
  milestones?: { amount?: unknown }[] | null;
  documents?: { kind?: string | null }[] | null;
}): string[] {
  const missing: string[] = [];
  for (const f of [
    'project_name',
    'sector',
    'summary',
    'description',
    'use_of_funds',
    'risk_factors',
    'instrument_type',
    'location',
  ] as const)
    if (!p[f]) missing.push(f);
  if (!p.target_amount || Number(p.target_amount) <= 0)
    missing.push('target_amount');
  if (!p.minimum_investment || Number(p.minimum_investment) <= 0)
    missing.push('minimum_investment');
  if (
    p.maximum_investment &&
    Number(p.maximum_investment) < Number(p.minimum_investment)
  )
    missing.push('maximum_investment (below minimum)');
  if (Number(p.minimum_investment ?? 0) > Number(p.target_amount))
    missing.push('minimum_investment (above target)');
  const ms = p.milestones ?? [];
  if (!ms.length) missing.push('milestones');
  else if (
    Math.abs(
      ms.reduce((t, m) => t + Number(m.amount), 0) - Number(p.target_amount),
    ) > 0.005
  )
    missing.push('milestones (amounts must add up to the target)');
  const kinds = new Set((p.documents ?? []).map((d) => d.kind));
  for (const k of REQUIRED_DOCUMENTS)
    if (!kinds.has(k)) missing.push(`document:${k}`);
  return missing;
}
export const DOCUMENT_VISIBILITY = ['public', 'investors', 'admin'] as const;

/** Project lifecycle. Every step after `submitted` is an explicit admin action. */
export const PROJECT_STATUSES = [
  'draft',
  'submitted', // = Under Review
  'more_info_required',
  'approved',
  'rejected',
  'listed',
  'funded',
  'closed',
  'cancelled',
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/** Business-editable states. */
export const EDITABLE: string[] = ['draft', 'more_info_required'];
/** Legacy admin-created projects used `open`; treat as listed. */
export const INVESTABLE: string[] = ['listed', 'open'];
export const MARKET_VISIBLE: string[] = ['listed', 'open', 'funded', 'closed'];

/** Allowed admin transitions (never automatic). */
export const ADMIN_TRANSITIONS: Record<
  string,
  { from: string[]; to: ProjectStatus }
> = {
  start_review: { from: ['submitted'], to: 'submitted' },
  request_info: { from: ['submitted'], to: 'more_info_required' },
  approve: { from: ['submitted'], to: 'approved' },
  reject: {
    from: ['submitted', 'more_info_required', 'approved'],
    to: 'rejected',
  },
  list: { from: ['approved'], to: 'listed' },
  unlist: { from: ['listed'], to: 'approved' },
  close: { from: ['listed', 'funded', 'open'], to: 'closed' },
  cancel: { from: ['approved', 'listed', 'funded', 'open'], to: 'cancelled' },
};

/** Bump when the disclosure text changes; investors must accept the current version. */
export const RISK_DISCLOSURE_VERSION = '2026-10-v2';
export const RISK_DISCLOSURE_TEXT = [
  'Investing in projects is risky. You can lose some or all of the money you invest.',
  'Returns are not guaranteed. Any figures a business shares are its own estimates, not promises by FARM.',
  'Your investment may be hard or impossible to sell or withdraw before the project ends.',
  'FARM reviews projects before listing them, but this is not investment advice or an endorsement.',
  'Only invest money you can afford to lose, and spread your money across different investments.',
  "Fees: an investment fee is added on top of what you invest and is not refunded. When the round closes, part of the total raised is held as this project's consolidation fund (a reserve); if the project is cancelled or makes a loss, investors get their share of that reserve back; if it completes successfully, FARM keeps it. Current rates are shown with each project.",
];

/**
 * Investor eligibility (approved rule): any KYC-verified user may invest,
 * unless an admin has restricted them. No per-investor retail cap.
 */
export const ELIGIBILITY_RULE = 'kyc_verified';

/** Milestones: raised funds are released to the business stage by stage, each by an admin. */
export const MAX_MILESTONES = 12;
/** Funding rounds that have ended and can release milestones. */
export const RELEASABLE: string[] = ['funded', 'closed'];

/** Strip every guaranteed-return / ROI field before a project leaves the API. */
export const HIDDEN_RETURN_FIELDS = [
  'roi_percent',
  'roi_percentage',
  'expected_roi',
];
export function stripReturns<T extends Record<string, any>>(o: T): T {
  const c: any = { ...o };
  for (const k of HIDDEN_RETURN_FIELDS) delete c[k];
  return c;
}
