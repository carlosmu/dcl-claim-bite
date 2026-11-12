// Coins owed to particular players for something that went wrong on our side. Server-only: the
// list names wallets and amounts, which the client has no business seeing beyond its own.
//
// Each entry is offered to its player on their next visit, as a screen with a button that credits
// it. Credited once: the id is kept in the purse (`compensations`), so it is never offered again.
//
// To add one: a new entry with an id that player has never had. Players can share an id (one per
// incident); one player's entries cannot. Never change an id once it is live, or a player who
// already got it would be offered it again.

export type Compensation = {
  /** Unique and permanent: what the purse remembers once it is credited. */
  id: string
  /** The wallet it is for, in any case. */
  address: string
  coins: number
  /** The day it happened, as the screen says it. */
  date: string
}

export const COMPENSATIONS: readonly Compensation[] = [
  // 2026-11-11: an old deploy's server kept running and wrote stale purses over the real ones.
  // Lost a Cabin, a Master Pick and their coins: 500 coins back.
  // The id is per player (it is kept in each one's purse), so the whole incident shares one.
  { id: 'stale-server-2026-11-11', address: '0x57d1721f6223eb434e20f5b4a88e494008ea0542', coins: 500, date: 'November 11' },
  // Losses confirmed in the logs: 100 coins each.
  { id: 'stale-server-2026-11-11', address: '0x7798bf5f8444a8de38ab9700a8362ff57f866b1e', coins: 100, date: 'November 11' },
  { id: 'stale-server-2026-11-11', address: '0xc723cf4771b5373e4a2f5cfd1d773a61c9d6e18d', coins: 100, date: 'November 11' },
  { id: 'stale-server-2026-11-11', address: '0x4b538e1e044922aec2f428ec7e17a99f44205ff9', coins: 100, date: 'November 11' },
  { id: 'stale-server-2026-11-11', address: '0x071ffb4cbf023fbeb56f0a3b28353ebbd3ec70a0', coins: 100, date: 'November 11' },
  { id: 'stale-server-2026-11-11', address: '0xe339ebc7ec708bf42eed1b54a4df852312db2c5b', coins: 100, date: 'November 11' },
  { id: 'stale-server-2026-11-11', address: '0xe2912ebd119609859a07cb0b0d28329a6bba4b25', coins: 100, date: 'November 11' },
  { id: 'stale-server-2026-11-11', address: '0x27ffcc3e8967f7c51dc3ebc7c0d242ea863deb57', coins: 100, date: 'November 11' },
  // Possibly affected, not confirmable from the logs: 50 coins each.
  { id: 'stale-server-2026-11-11', address: '0x53e22947510ad64ae85c96526bdbedb0b3e54f31', coins: 50, date: 'November 11' },
  { id: 'stale-server-2026-11-11', address: '0xc5b41422a7ebc00a2176d5283e8212950fe0ca35', coins: 50, date: 'November 11' },
  { id: 'stale-server-2026-11-11', address: '0x5c61f3a6bee08f43f886bf20adac296495ee77a2', coins: 50, date: 'November 11' },
  { id: 'stale-server-2026-11-11', address: '0x598f8af1565003ae7456dac280a18ee826df7a2c', coins: 50, date: 'November 11' }
]

/** The compensations meant for this wallet, in list order. */
export function compensationsFor(address: string): Compensation[] {
  const wallet = address.toLowerCase()
  return COMPENSATIONS.filter((entry) => entry.address.toLowerCase() === wallet)
}
