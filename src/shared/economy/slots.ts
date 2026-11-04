// The slot machine's rules, in the style of Charles Fey's Liberty Bell: three reels, five symbols.
//
// Shared so the panel can show the same table the server pays by; only the server ever spins.
//
// Long-run return to players, about 80%: the table pays out 74.5% of what is bet, JACKPOT_RATE puts
// another 5% into the town's pot, which three bells pay back, and topping the pot up to JACKPOT_MIN
// adds at most 0.7%. The rest leaves the economy, which is what the casino is for (decisions.md,
// 2026-11-03). Changing a weight or a multiplier changes that return, so work it out again afterwards.

export type SlotSymbol = {
  id: string
  label: string
  /** How many stops of each reel show it. */
  weight: number
  /** Times the bet that three of it pay. */
  pays: number
}

export const SLOT_SYMBOLS: SlotSymbol[] = [
  { id: 'horseshoe', label: 'Horseshoe', weight: 8, pays: 5 },
  { id: 'spade', label: 'Spade', weight: 6, pays: 7 },
  { id: 'diamond', label: 'Diamond', weight: 4, pays: 14 },
  { id: 'heart', label: 'Heart', weight: 3, pays: 30 },
  { id: 'bell', label: 'Bell', weight: 2, pays: 50 }
]

const HORSESHOE = 0
const BELL = 4

/** Times the bet that exactly two horseshoes pay: the bet back. */
export const TWO_HORSESHOES_PAY = 1

/** The bets the machine takes, in coins. */
export const SLOT_BETS = [1, 5, 25]

/** The bet that plays for the whole jackpot; smaller bets play for their share of it. */
export const SLOT_MAX_BET = 25

/** The part of every bet that goes into the town's jackpot. */
export const JACKPOT_RATE = 0.05

/** The least the jackpot ever holds: after a win it is topped back up to this, so it is always worth playing for. */
export const JACKPOT_MIN = 250

/** When each reel stops, in seconds from the moment the lever is pulled. */
export const SLOT_REEL_STOP_SECONDS = [1.2, 1.7, 2.2]

/** The least the server allows between two spins from one player: a little under a full spin. */
export const SLOT_MIN_SECONDS_BETWEEN_SPINS = 2

const TOTAL_WEIGHT = SLOT_SYMBOLS.reduce((total, symbol) => total + symbol.weight, 0)

/** One reel's stop, as an index into SLOT_SYMBOLS. `random` is in [0, 1). */
export function spinReel(random: () => number): number {
  let stop = random() * TOTAL_WEIGHT
  for (let index = 0; index < SLOT_SYMBOLS.length; index++) {
    stop -= SLOT_SYMBOLS[index].weight
    if (stop < 0) return index
  }
  return 0
}

/** Times the bet these reels pay, the jackpot aside. */
export function payMultiplier(reels: readonly number[]): number {
  if (reels[0] === reels[1] && reels[1] === reels[2]) return SLOT_SYMBOLS[reels[0]].pays
  const horseshoes = reels.filter((reel) => reel === HORSESHOE).length
  return horseshoes === 2 ? TWO_HORSESHOES_PAY : 0
}

/** Three bells. */
export function isJackpot(reels: readonly number[]): boolean {
  return reels[0] === BELL && reels[1] === BELL && reels[2] === BELL
}

/** The whole coins of the pot this bet takes on three bells. */
export function jackpotShare(pot: number, bet: number): number {
  return Math.floor((pot * Math.min(bet, SLOT_MAX_BET)) / SLOT_MAX_BET)
}

/** Everything three bells pay at this bet: the table's prize and the pot's share. */
export function threeBellsPay(pot: number, bet: number): number {
  return bet * SLOT_SYMBOLS[BELL].pays + jackpotShare(pot, bet)
}
