export const SUPPLIER_STATUSES = [
  'draft',
  'submitted',
  'under_review',
  'more_information_required',
  'approved',
  'rejected',
  'suspended',
] as const;

const ADMIN_NEXT: Record<string, string[]> = {
  submitted: [
    'under_review',
    'approved',
    'rejected',
    'more_information_required',
  ],
  under_review: ['approved', 'rejected', 'more_information_required'],
  more_information_required: ['under_review', 'approved', 'rejected'],
  approved: ['suspended'],
  suspended: ['approved'],
  rejected: [],
  draft: [],
};

export function supplierAdminTransition(from: string, to: string) {
  return (ADMIN_NEXT[from] ?? []).includes(to);
}

export const ORDER_NEXT: Record<string, string[]> = {
  placed: ['paid', 'cancelled'],
  paid: ['forwarded', 'cancelled'],
  forwarded: ['accepted', 'rejected'],
  accepted: ['fulfilled'],
  fulfilled: [],
  rejected: [],
  cancelled: [],
};

export function orderTransition(from: string, to: string) {
  return (ORDER_NEXT[from] ?? []).includes(to);
}

/** Basis points from env. Unset means the fee is not configured, not 10%. */
export function commissionBps(
  env: Record<string, string | undefined> = process.env,
) {
  const raw = env.DROPSHIP_COMMISSION_BPS;
  if (raw == null || raw.trim() === '') return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 10_000) return null;
  return n;
}

export function money(n: number) {
  return Math.round(n * 100) / 100;
}

export function commissionFarm(retail: number, bps: number | null) {
  if (bps == null) return null;
  return money((retail * bps) / 10_000);
}

export function margin(retail: number, wholesale: number, fee: number | null) {
  return {
    retail: money(retail),
    wholesale: money(wholesale),
    commission_farm: fee,
    estimated_net: money(retail - wholesale - (fee ?? 0)),
    commission_configured: fee != null,
  };
}
