import {
  cursorQueryFrom,
  cursorStartRound,
  depositLookbackRounds,
  isBelowChainMinimum,
  nextCursorRound,
  reconcileLookbackRounds,
} from './deposit-watch';

describe('deposit watcher lookback', () => {
  it('starts at the current round unless a bounded lookback is configured', () => {
    expect(depositLookbackRounds({})).toBe(0n);
    expect(cursorStartRound(1000n, 0n)).toBe(1000n);
    expect(cursorStartRound(1000n, 25n)).toBe(975n);
  });

  it('caps a huge lookback', () => {
    expect(depositLookbackRounds({ CHAIN_DEPOSIT_LOOKBACK_ROUNDS: '999999' })).toBe(
      10_000n,
    );
  });

  it('overlaps the cursor and refuses to skip a full indexer page', () => {
    expect(cursorQueryFrom(1000n, 200n)).toBe(800n);
    expect(
      nextCursorRound({ previous: 1000n, newest: 1500n, truncated: true }),
    ).toBe(1000n);
    expect(
      nextCursorRound({ previous: 1000n, newest: 1100n, truncated: false }),
    ).toBe(1100n);
  });

  it('does not treat 4.999039 USDC as below a minimum unless one is configured', () => {
    expect(isBelowChainMinimum('USDC', 4.999039, {})).toBe(false);
    expect(
      isBelowChainMinimum('USDC', 4.999039, { CHAIN_DEPOSIT_MIN_USDC: '5' }),
    ).toBe(true);
    expect(reconcileLookbackRounds({})).toBe(1_000_000n);
  });
});
