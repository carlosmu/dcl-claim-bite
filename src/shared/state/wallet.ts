// What the player carries: raw ore (mined) and coins (legal tender).
//
// Two currencies, and only the bank converts one into the other — see design/decisions.md,
// 2026-08-31.
//
// That move to the authoritative server has happened (decisions.md, 2026-09-15), and it
// turned this module inside out: the purse is no longer kept here, it is kept per player on
// the server. What is left is a read-only mirror of the local player's copy of it.
//
// The adders that used to live here are gone on purpose rather than left unused. On this
// side they would be a trap: adding ore locally would move the number on screen without the
// server agreeing, and the next wallet message would silently undo it.

let ore = 0
let coins = 0

export function getOre(): number {
  return ore
}

export function getCoins(): number {
  return coins
}

/**
 * Overwrites the purse with the server's copy.
 *
 * The ONLY thing that changes a balance on this side: mining, selling and buying all ask
 * the server and wait to be told the result.
 */
export function applyServerWallet(serverOre: number, serverCoins: number): void {
  ore = serverOre
  coins = serverCoins
}
