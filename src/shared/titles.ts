// The town's titles and its newest property owners, as both halves of the scene see them.
//
// A title has one holder at a time. Titles are judged on the last seven days, today included, so
// a title lapses only when what earned it does; the list of new owners never lapses at all.
//
// The days are game days, turning over at DAY_START_HOUR_UTC, kept one record each: that is all the detail a seven-day window
// needs, and it keeps the stored record small.

export type TitleId = 'whale' | 'panic' | 'active' | 'baron' | 'roller'

/** How many days a title looks back, today included. */
export const TITLE_WINDOW_DAYS = 7

/** A feat worth a title. `value` is ore, except for the Panic Seller's, a rate, and the High Roller's, coins. */
export type TitleFeat = { address: string; name: string; value: number }

export type TitleHolder = TitleFeat & { id: TitleId }

/** What one player dug in one day, by hand and by rig. */
export type MinerTally = { name: string; hand: number; rig: number }

/** One day of the town: its biggest sale, its worst-priced one, its biggest slot win, and what each player dug. */
export type TownDay = { day: number; whale?: TitleFeat; panic?: TitleFeat; roller?: TitleFeat; miners: Record<string, MinerTally>; stats?: DayStats }

/**
 * One day of the town's economy, for the board in the plaza. Kept apart from the miners' tallies,
 * which drop their smallest entries to stay under the storage limit. Days saved before these were
 * kept have none: their ore is then counted from the tallies, and their coins as nothing.
 */
export type DayStats = {
  /** Ore mined by hand, and dug by the rigs. */
  hand: number
  rig: number
  /** Ore sold to the bank, and the coins it paid for it. */
  oreSold: number
  bankPaid: number
  /** Coins that came into the town (sales, the bank buying homes back, slot wins, compensations), and coins spent (the Market, fuel, homes, the Tailor Shop, slot bets). */
  coinsIn: number
  coinsOut: number
}

export function emptyDayStats(): DayStats {
  return { hand: 0, rig: 0, oreSold: 0, bankPaid: 0, coinsIn: 0, coinsOut: 0 }
}

/** The economy over these days, added up. */
export function weekStats(days: TownDay[]): DayStats {
  const total = emptyDayStats()
  for (const entry of days) {
    if (entry.stats !== undefined) {
      total.hand += entry.stats.hand
      total.rig += entry.stats.rig
      total.oreSold += entry.stats.oreSold
      total.bankPaid += entry.stats.bankPaid
      total.coinsIn += entry.stats.coinsIn
      total.coinsOut += entry.stats.coinsOut
    } else {
      for (const miner of Object.values(entry.miners)) {
        total.hand += miner.hand
        total.rig += miner.rig
      }
    }
  }
  return total
}

/** A property bought: who bought it, which kind, and when (wall-clock ms). */
export type NewOwner = { kind: string; address: string; name: string; at: number }

/** How many new owners the board shows. */
export const NEW_OWNERS_SHOWN = 3

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000

/** The hour (UTC) the game's day turns over at, for everything that counts by day. */
export const DAY_START_HOUR_UTC = 10

const DAY_START_OFFSET_MS = DAY_START_HOUR_UTC * 60 * 60 * 1000

/** Which game day this moment falls in, so every player's day turns over at once (at DAY_START_HOUR_UTC). */
export function dayOf(now: number): number {
  return Math.floor((now - DAY_START_OFFSET_MS) / MILLISECONDS_PER_DAY)
}

/** The game day this moment falls in, as YYYY-MM-DD: the UTC date its day started on. */
export function dayKeyOf(now: number): string {
  return new Date(now - DAY_START_OFFSET_MS).toISOString().slice(0, 10)
}

/** The days still inside the window on `today`. */
export function daysInWindow(days: TownDay[], today: number): TownDay[] {
  return days.filter((entry) => entry.day > today - TITLE_WINDOW_DAYS && entry.day <= today)
}

/**
 * Who holds each title over these days. A draw on a sale goes to the latest; a draw on ore goes to
 * whoever first dug in the window.
 */
export function titleHolders(days: TownDay[]): TitleHolder[] {
  const oldestFirst = [...days].sort((a, b) => a.day - b.day)
  let whale: TitleFeat | undefined
  let panic: TitleFeat | undefined
  let roller: TitleFeat | undefined
  const totals = new Map<string, MinerTally>()

  for (const entry of oldestFirst) {
    if (entry.whale !== undefined && (whale === undefined || entry.whale.value >= whale.value)) whale = entry.whale
    if (entry.panic !== undefined && (panic === undefined || entry.panic.value >= panic.value)) panic = entry.panic
    if (entry.roller !== undefined && (roller === undefined || entry.roller.value >= roller.value)) roller = entry.roller
    for (const address of Object.keys(entry.miners)) {
      const miner = entry.miners[address]
      const total = totals.get(address)
      // The newest name wins: an avatar's name can change, or arrive late.
      totals.set(address, { name: miner.name, hand: (total?.hand ?? 0) + miner.hand, rig: (total?.rig ?? 0) + miner.rig })
    }
  }

  let active: TitleFeat | undefined
  let baron: TitleFeat | undefined
  for (const [address, total] of totals) {
    if (total.hand > (active?.value ?? 0)) active = { address, name: total.name, value: total.hand }
    if (total.rig > (baron?.value ?? 0)) baron = { address, name: total.name, value: total.rig }
  }

  const holders: TitleHolder[] = []
  if (whale !== undefined) holders.push({ ...whale, id: 'whale' })
  if (panic !== undefined) holders.push({ ...panic, id: 'panic' })
  if (active !== undefined) holders.push({ ...active, id: 'active' })
  if (baron !== undefined) holders.push({ ...baron, id: 'baron' })
  if (roller !== undefined) holders.push({ ...roller, id: 'roller' })
  return holders
}

/**
 * The owners the board shows, newest first: the newest of each kind, so a rare Ranch is not pushed
 * off by a run of Cabins, then whoever is newest overall until the board is full.
 */
export function featuredOwners(owners: NewOwner[]): NewOwner[] {
  const newest = [...owners].sort((a, b) => b.at - a.at)
  const featured: NewOwner[] = []
  for (const owner of newest) if (!featured.some((other) => other.kind === owner.kind)) featured.push(owner)
  for (const owner of newest) if (!featured.includes(owner)) featured.push(owner)
  return featured.slice(0, NEW_OWNERS_SHOWN).sort((a, b) => b.at - a.at)
}
