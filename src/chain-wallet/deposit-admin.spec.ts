import { DepositAdminService } from './deposit-admin.service';

describe('deposit reconciliation admin', () => {
  it('lookup reads the indexer and does not credit', async () => {
    const prisma: any = {
      chain_deposits: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'd1',
            tx_id: 'A'.repeat(52),
            network: 'mainnet',
            asset_id: 31566704n,
            asset_symbol: 'USDC',
            amount_units: 5000000n,
            decimals: 6,
            address: 'ADDR',
            sender: 'FROM',
            user_id: 'u1',
            status: 'pending_rate',
            confirmed_round: 10n,
            transaction_id: null,
            farm_amount: null,
            error: null,
            resolution_note: null,
            alerted_at: null,
            credited_at: null,
            created_at: new Date(),
          },
        ]),
      },
    };
    const chain: any = {
      lookupTransaction: jest.fn().mockResolvedValue({
        txId: 'A'.repeat(52),
        confirmedRound: 10n,
        sender: 'FROM',
        receiver: 'ADDR',
        amount: 5000000n,
        assetId: 31566704n,
      }),
    };
    const wallets: any = { creditDepositByTx: jest.fn() };
    const admin = new DepositAdminService(prisma, chain, wallets);
    const res = await admin.lookup('A'.repeat(52));
    expect(res.data.ledger_status).toBe('pending_rate');
    expect(res.data.indexer?.destination).toBe('ADDR');
    expect(res.data.deposits[0].amount).toBe(5);
    expect(wallets.creditDepositByTx).not.toHaveBeenCalled();
  });

  it('reprocess forwards dry=true and does not invent a credit', async () => {
    const wallets: any = {
      creditDepositByTx: jest.fn().mockResolvedValue({ data: { dry: true } }),
    };
    const admin = new DepositAdminService({} as any, {} as any, wallets);
    await admin.reprocess({
      txId: 'A'.repeat(52),
      dry: true,
      actorId: 'admin',
    });
    expect(wallets.creditDepositByTx).toHaveBeenCalledWith(
      expect.objectContaining({ dry: true }),
    );
  });
});
