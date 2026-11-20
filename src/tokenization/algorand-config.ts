/**
 * Tokenization is OFF unless every required env var is set. Values are never
 * returned or logged; only the *names* of missing variables are reported.
 *
 * Network is explicit:
 * - `TOKENIZATION_NETWORK=testnet|mainnet` wins.
 * - If it is unset, `ALGORAND_NETWORK=testnet` is accepted.
 * - Mainnet is not inherited from `ALGORAND_NETWORK`. It requires
 *   `TOKENIZATION_NETWORK=mainnet` plus `TOKENIZATION_ENABLED=true`.
 * Nothing here mints an asset. The ASA client still refuses to run while
 * `enabled` is false.
 */
export const REQUIRED_ENV = [
  'TOKENIZATION_ENABLED',
  'TOKENIZATION_NETWORK',
  'ALGORAND_NODE_URL',
  'ALGORAND_ISSUER_MNEMONIC',
] as const;

export interface AlgorandConfig {
  enabled: boolean;
  network: string;
  /** Which variable selected the network: TOKENIZATION_NETWORK, ALGORAND_NETWORK, or none. */
  network_source: 'TOKENIZATION_NETWORK' | 'ALGORAND_NETWORK' | 'none';
  missing: string[];
  problems: string[];
}

export function algorandConfig(env = process.env): AlgorandConfig {
  const missing: string[] = [];
  const problems: string[] = [];
  if (!env.TOKENIZATION_ENABLED?.trim()) missing.push('TOKENIZATION_ENABLED');
  else if (env.TOKENIZATION_ENABLED !== 'true')
    problems.push('TOKENIZATION_ENABLED must be "true"');
  if (!env.ALGORAND_NODE_URL?.trim()) missing.push('ALGORAND_NODE_URL');
  else if (!/^https:\/\//.test(env.ALGORAND_NODE_URL))
    problems.push('ALGORAND_NODE_URL must be https');
  if (!env.ALGORAND_ISSUER_MNEMONIC?.trim())
    missing.push('ALGORAND_ISSUER_MNEMONIC');

  const explicit = env.TOKENIZATION_NETWORK?.trim().toLowerCase() || '';
  const walletNet = env.ALGORAND_NETWORK?.trim().toLowerCase() || '';
  let network = '';
  let network_source: AlgorandConfig['network_source'] = 'none';
  if (explicit === 'testnet' || explicit === 'mainnet') {
    network = explicit;
    network_source = 'TOKENIZATION_NETWORK';
  } else if (explicit) {
    problems.push('TOKENIZATION_NETWORK must be testnet or mainnet');
  } else if (walletNet === 'testnet') {
    network = 'testnet';
    network_source = 'ALGORAND_NETWORK';
  } else if (walletNet === 'mainnet') {
    missing.push('TOKENIZATION_NETWORK');
    problems.push('Mainnet tokenization requires TOKENIZATION_NETWORK=mainnet');
  } else {
    missing.push('TOKENIZATION_NETWORK');
    if (walletNet) problems.push('ALGORAND_NETWORK must be testnet or mainnet');
  }
  if (
    network &&
    walletNet &&
    (walletNet === 'testnet' || walletNet === 'mainnet') &&
    walletNet !== network
  ) {
    problems.push(
      'TOKENIZATION_NETWORK must match ALGORAND_NETWORK when both are set',
    );
  }

  return {
    enabled: !missing.length && !problems.length,
    network: network || 'testnet',
    network_source,
    missing,
    problems,
  };
}

export const explorerAsset = (network: string, id: bigint | number | string) =>
  `https://${network === 'testnet' ? 'testnet.' : ''}explorer.perawallet.app/asset/${id}/`;
export const explorerTx = (network: string, tx: string) =>
  `https://${network === 'testnet' ? 'testnet.' : ''}explorer.perawallet.app/tx/${tx}/`;
