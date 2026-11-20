import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AlgorandWalletClient } from './algorand-wallet.client';
import { ChainWalletService } from './chain-wallet.service';

/**
 * Support view of chain deposits. Lookup and notes do not move funds.
 * Reprocess credits only when the caller sets dry=false, and then only
 * through the existing exactly-once credit path after an indexer check.
 */
@Injectable()
export class DepositAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chain: AlgorandWalletClient,
    private readonly wallets: ChainWalletService,
  ) {}

  async list(q: {
    txId?: string;
    status?: string;
    address?: string;
    asset?: string;
    limit?: string;
  }) {
    const take = Math.min(Math.max(Number(q.limit) || 50, 1), 100);
    const rows = await this.prisma.chain_deposits.findMany({
      where: {
        ...(q.txId?.trim() ? { tx_id: q.txId.trim() } : {}),
        ...(q.status?.trim() ? { status: q.status.trim() } : {}),
        ...(q.address?.trim() ? { address: q.address.trim() } : {}),
        ...(q.asset?.trim()
          ? { asset_symbol: q.asset.trim().toUpperCase() }
          : {}),
      },
      orderBy: { created_at: 'desc' },
      take,
    });
    return { data: rows.map(shapeDeposit) };
  }

  async lookup(txId: string) {
    const id = txId.trim();
    if (!/^[A-Z2-7]{52}$/.test(id))
      throw new BadRequestException('tx_id must be an Algorand transaction id');
    const rows = await this.prisma.chain_deposits.findMany({
      where: { tx_id: id },
      orderBy: { created_at: 'asc' },
    });
    let chain: Awaited<ReturnType<AlgorandWalletClient['lookupTransaction']>> =
      null;
    let indexer_error: string | null = null;
    try {
      chain = await this.chain.lookupTransaction(id);
    } catch {
      indexer_error = 'Indexer lookup failed';
    }
    return {
      data: {
        tx_id: id,
        indexer: chain
          ? {
              confirmed: chain.confirmedRound != null,
              confirmed_round:
                chain.confirmedRound == null
                  ? null
                  : chain.confirmedRound.toString(),
              asset_id: chain.assetId.toString(),
              amount_units: chain.amount.toString(),
              sender: chain.sender,
              destination: chain.receiver,
            }
          : null,
        indexer_error,
        deposits: rows.map(shapeDeposit),
        ledger_status: rows.some((r) => r.status === 'credited')
          ? 'credited'
          : rows.length
            ? rows[rows.length - 1].status
            : 'not_recorded',
      },
    };
  }

  /**
   * dry defaults to true at the controller. A dry run still asks the indexer
   * inside creditDepositByTx and writes nothing.
   */
  reprocess(input: {
    txId: string;
    asset?: string;
    network?: string;
    dry: boolean;
    actorId: string | null;
  }) {
    return this.wallets.creditDepositByTx(input);
  }

  async setNote(id: string, note: string, actorId: string | null) {
    const text = note.trim().slice(0, 2000);
    if (!text) throw new BadRequestException('A note is required');
    const row = await this.prisma.chain_deposits.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Deposit not found');
    const updated = await this.prisma.chain_deposits.update({
      where: { id },
      data: {
        resolution_note: text,
      },
    });
    void actorId;
    return { data: shapeDeposit(updated) };
  }
}

function shapeDeposit(d: any) {
  const decimals = Number(d.decimals ?? 0);
  const units = Number(d.amount_units);
  const amount =
    Number.isFinite(units) && decimals >= 0 ? units / 10 ** decimals : null;
  return {
    id: d.id,
    tx_id: d.tx_id,
    network: d.network,
    asset_id: d.asset_id?.toString?.() ?? String(d.asset_id),
    asset: d.asset_symbol,
    amount,
    amount_units: d.amount_units?.toString?.() ?? String(d.amount_units),
    destination: d.address,
    sender: d.sender,
    user_id: d.user_id,
    detection_status: d.status,
    confirmation_round: d.confirmed_round?.toString?.() ?? null,
    ledger_transaction_id: d.transaction_id,
    ledger_status: d.transaction_id ? 'posted' : 'not_posted',
    farm_amount: d.farm_amount == null ? null : Number(d.farm_amount),
    error: d.error ?? null,
    resolution_note: d.resolution_note ?? null,
    alerted_at: d.alerted_at ?? null,
    credited_at: d.credited_at ?? null,
    created_at: d.created_at,
  };
}
