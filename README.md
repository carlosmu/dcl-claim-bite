# Claim Bite

<p align="center">
  <img src="assets/images/thumbnail.png" alt="Claim Bite" width="640">
</p>

A Decentraland SDK7 scene set in a half-abandoned gold-rush mining town.

You arrive as a stranger, and the mayor hands you a free pick. Walk up to a rock in the quarry and
you swing on your own, filling a progress bar until the ore breaks loose — share a rock with
another player and you both earn more. Carry your ore to the bank in town and sell it for coins,
the only legal tender. Every sale pushes the town's ore price down for everyone, and it recovers
slowly, so *when* you sell is the decision the game is built on.

Coins buy better picks, more storage and a M.U.L.E. at the Market — a rig that keeps mining while
you are away, as long as you keep it fueled. At the Land & Claim Office you trade your starting
wagon up to a cabin, a house and finally a ranch, standing on a lot in town with your name on it.

The game runs on an authoritative server: mining, selling and buying are requests, and balances and
the shared market price come back from the server, so the town is the same town for everyone in it.

**Deployment target:** World `claimbite.dcl.eth`

## Design documents

The design lives in [`design/`](design) — the [GDD](design/gdd.md), an append-only
[decision log](design/decisions.md), the [hypothesis log](design/hypothesis-log.md) and
[ideas](design/ideas.md). Economy numbers live in [`balance.md`](design/balance.md).

## Run it

**With the Creator Hub (recommended)**

1. Download this repository.

2. Install the [Creator Hub](https://decentraland.org/download/creator-hub), the official desktop app for creating, previewing, and publishing Decentraland scenes.

3. In the **Scenes** tab, import this scene's root folder.

4. Press **Preview** to explore the scene in Decentraland.

**With the command line**

Inside this scene's root directory run:

```
npm install
npm run start
```

`npm run build` type-checks and bundles the scene, `npm run deploy` publishes it to the World, and
`npm run server-logs` streams the authoritative server's logs.

**With an AI coding assistant**

If you build with an AI coding assistant (Claude Code, Cursor, GitHub Copilot, and others), install the official Decentraland SDK Skills first. They teach your agent verified SDK7 patterns for every topic: scene creation, 3D models, interactivity, UI, multiplayer, deployment, and more.

```
npx skills add decentraland/sdk-skills --all
```

See [Vibe Coding with AI](https://docs.decentraland.org/creator/scenes-sdk7/getting-started/vibe-coding) for the full guide.
