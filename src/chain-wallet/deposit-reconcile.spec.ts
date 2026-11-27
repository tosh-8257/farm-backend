import { ChainWalletService } from './chain-wallet.service';

const DEST = 'U5QHAQ5LMSJDPCDYX5LFFVSUSDSMBHEKH4TXQZZXWLJ3LAKLFBNUUMXXAU';

function harness(opts?: {
  existing?: { status: string } | null;
  credit?: jest.Mock;
  indexerError?: boolean;
}) {
  const prisma: any = {
    user_chain_wallets: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ address: DEST, funded_tx_id: null, user_id: 'u1' }]),
      findUnique: jest.fn().mockResolvedValue({ user_id: 'u1' }),
    },
    business_chain_wallets: { findMany: jest.fn().mockResolvedValue([]) },
    project_escrows: { findMany: jest.fn().mockResolvedValue([]) },
    chain_deposits: {
      findUnique: jest.fn().mockResolvedValue(opts?.existing ?? null),
      update: jest.fn(),
      create: jest.fn(),
    },
  };
  const chain: any = {
    currentRound: jest.fn().mockResolvedValue(67_000_000n),
    funderAddress: jest.fn(() => 'FUNDER'),
    paymentsTo: jest.fn().mockResolvedValue([]),
    assetTransfersTo: jest.fn(async (_addr: string, asset: bigint) => {
      if (opts?.indexerError) throw new Error('indexer timeout');
      if (asset === 31566704n) {
        return [
          {
            txId: 'FP5HWID2YV6T2LTGK3SKT7LFIVP5TC2SXWZDB4IK2PZ6YB5GLTDQ',
            assetId: asset,
            sender: 'SENDER',
            receiver: DEST,
            amount: 4_999_039n,
            round: 66_926_263n,
          },
        ];
      }
      return [];
    }),
  };
  const rates: any = {};
  const svc = new ChainWalletService(prisma, chain, rates);
  const credit =
    opts?.credit ??
    jest.fn().mockResolvedValue({ data: { credited: true, mode: 'send' } });
  jest.spyOn(svc, 'creditDepositByTx').mockImplementation(credit);
  return { svc, prisma, credit };
}

describe('missed deposit reconcile', () => {
  const prev = process.env.CHAIN_DEPOSITS_ENABLED;
  beforeEach(() => {
    process.env.CHAIN_WALLETS_ENABLED = 'true';
    process.env.ALGORAND_NETWORK = 'mainnet';
    process.env.ALGORAND_ALLOW_MAINNET = 'true';
    process.env.ALGORAND_NODE_URL = 'https://node.example';
    process.env.ALGORAND_INDEXER_URL = 'https://idx.example';
    process.env.ALGORAND_FUNDER_MNEMONIC = 'x';
    process.env.WALLET_KEY_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString(
      'base64',
    );
    process.env.USDC_ASA_ID = '31566704';
    process.env.FARM_ASA_ID = '3759208862';
    process.env.FARM_RESERVE_ADDRESS = 'R'.repeat(58);
    process.env.CHAIN_DEPOSITS_ENABLED = 'true';
    delete process.env.CHAIN_DEPOSIT_MIN_USDC;
  });
  afterAll(() => {
    if (prev === undefined) delete process.env.CHAIN_DEPOSITS_ENABLED;
    else process.env.CHAIN_DEPOSITS_ENABLED = prev;
  });

  it('credits a confirmed USDC transfer the poller cursor already passed and no webhook recorded', async () => {
    const { svc, credit } = harness();
    const out = await svc.reconcileMissedDeposits();
    expect(out.credited).toBe(1);
    expect(credit).toHaveBeenCalledWith(
      expect.objectContaining({
        txId: 'FP5HWID2YV6T2LTGK3SKT7LFIVP5TC2SXWZDB4IK2PZ6YB5GLTDQ',
        asset: 'USDC',
        dry: false,
      }),
    );
  });

  it('does not credit the same deposit twice', async () => {
    const { svc, credit } = harness({ existing: { status: 'credited' } });
    const out = await svc.reconcileMissedDeposits();
    expect(out.credited).toBe(0);
    expect(credit).not.toHaveBeenCalled();
  });

  it('records a below-minimum transfer without crediting it', async () => {
    process.env.CHAIN_DEPOSIT_MIN_USDC = '5';
    const { svc, credit, prisma } = harness();
    await svc.reconcileMissedDeposits();
    expect(credit).not.toHaveBeenCalled();
    expect(prisma.chain_deposits.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'below_minimum' }),
      }),
    );
  });

  it('holds the sweep when the indexer is delayed and does not credit', async () => {
    const { svc, credit } = harness({ indexerError: true });
    const out = await svc.reconcileMissedDeposits();
    expect(out.failed).toBe(1);
    expect(credit).not.toHaveBeenCalled();
  });

  it('logs a ledger failure and does not report a credit', async () => {
    const credit = jest
      .fn()
      .mockRejectedValue(new Error('ledger write failed'));
    const { svc } = harness({ credit });
    const out = await svc.reconcileMissedDeposits();
    expect(out.credited).toBe(0);
    expect(out.failed).toBe(1);
    expect(credit).toHaveBeenCalledTimes(1);
  });
});

describe('credit path rejects the wrong payment', () => {
  it('rejects the wrong asset, an unknown address, and a network mismatch', async () => {
    const prisma: any = {
      user_chain_wallets: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      business_chain_wallets: { findUnique: jest.fn().mockResolvedValue(null) },
      project_escrows: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const chain: any = {
      lookupTransaction: jest.fn().mockResolvedValue({
        txId: 'TX',
        assetId: 99n,
        sender: 'S',
        receiver: DEST,
        amount: 1n,
        confirmedRound: 10n,
      }),
    };
    const svc = new ChainWalletService(prisma, chain, {} as any);
    await expect(
      svc.creditDepositByTx({
        txId: 'TX',
        dry: false,
        actorId: null,
      }),
    ).rejects.toThrow('not ALGO, FARM, or USDC');
    chain.lookupTransaction.mockResolvedValue({
      txId: 'TX',
      assetId: 0n,
      sender: 'S',
      receiver: 'UNKNOWN',
      amount: 1n,
      confirmedRound: 10n,
    });
    await expect(
      svc.creditDepositByTx({ txId: 'TX', dry: false, actorId: null }),
    ).rejects.toThrow('not a FARM-managed');
    prisma.user_chain_wallets.findUnique.mockResolvedValue({
      address: DEST,
      network: 'testnet',
      user_id: 'u',
    });
    chain.lookupTransaction.mockResolvedValue({
      txId: 'TX',
      assetId: 0n,
      sender: 'S',
      receiver: DEST,
      amount: 1n,
      confirmedRound: 10n,
    });
    await expect(
      svc.creditDepositByTx({
        txId: 'TX',
        network: 'mainnet',
        dry: false,
        actorId: null,
      }),
    ).rejects.toThrow('not a FARM-managed');
  });
});
