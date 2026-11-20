export type FarmRuntime = 'development' | 'staging' | 'production';

/**
 * FARM_RUNTIME=staging marks a non-production deploy. NODE_ENV=production
 * alone is not staging. This does not change payment providers or chain
 * networks; those stay on their own flags.
 */
export function farmRuntime(
  env: Record<string, string | undefined> = process.env,
): FarmRuntime {
  const named = env.FARM_RUNTIME?.trim().toLowerCase();
  if (named === 'staging' || named === 'production' || named === 'development')
    return named;
  return env.NODE_ENV === 'production' ? 'production' : 'development';
}

export function isStaging(
  env: Record<string, string | undefined> = process.env,
) {
  return farmRuntime(env) === 'staging';
}
