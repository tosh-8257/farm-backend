import { cursorStartRound, depositLookbackRounds } from './deposit-watch';

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
});
