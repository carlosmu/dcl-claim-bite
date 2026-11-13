// The wallets allowed to run admin tools (maintenance before a deploy). Lower case. The server
// checks the sender of every admin message against this list; the client only uses it to decide
// whether to show the buttons.
export const ADMINS: readonly string[] = ['0x4b538e1e044922aec2f428ec7e17a99f44205ff9']

export function isAdmin(address: string): boolean {
  return ADMINS.includes(address.toLowerCase())
}
