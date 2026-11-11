// LOCAL PATCH (not upstream): lets the scene's own server code hear about each saved response,
// e.g. to reward a player for answering. Called once per accepted row, Intro answers excluded.

export type SavedResponse = {
  /** The sender, as the room reports it (context.from). */
  address: string
  questionId: string
  trigger: string
  /** A rating or a comment was given: not a skip. */
  answered: boolean
}

const listeners: ((response: SavedResponse) => void)[] = []

export function onResponseSaved(listener: (response: SavedResponse) => void): void {
  listeners.push(listener)
}

export function notifyResponseSaved(response: SavedResponse): void {
  for (const listener of listeners) {
    try {
      listener(response)
    } catch (error) {
      console.log(`[SERVER] onResponseSaved listener failed: ${error}`)
    }
  }
}
