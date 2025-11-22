# Score Settlin' Lambda Spec

This document defines the contract between the frontend (this repo) and the Lambda (separate repo) for the Score Settlin' bet flow.

## Frontend Delivers

**POST** to Lambda URL

```json
{
  "claim": "I can do 20 pushups in 30 seconds",
  "walletAddress": "0x725c7f7952e372402c49a4cb4468d6115c3340a3",
  "photo": "<base64-encoded-image>"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `claim` | string | yes | The claim/bet text (e.g., "I can juggle 5 balls") |
| `walletAddress` | string | yes | Celo wallet address, ENS, or email (for future wallet creation) |
| `photo` | string | yes | Base64-encoded JPEG image (max ~1MB) |

## Lambda Returns (Immediately)

```json
{
  "success": true,
  "postUrl": "https://bsky.app/profile/babysfirst.pds.jakesimonds.com/post/abc123",
  "message": "Bet posted! Watch Bluesky for results."
}
```

Or on error:

```json
{
  "success": false,
  "error": "Invalid wallet address"
}
```

## What Happens After Response

Frontend **does not wait** - it redirects user to `postUrl` on Bluesky.

Lambda continues running (up to 15 min):

1. **Post to Bluesky** - "Score Settlin'! 0x123...abc claims: 'X'. Reply T or F"
2. **Register bet on-chain** - Call `TapBet.createBet(betId, walletAddress, photoHash, postUri)`
3. **Poll for T/F** - Check Bluesky replies every 3 seconds
4. **Resolve on-chain** - Call `TapBet.resolve(betId, trueWon)`
5. **Post result reply** - "Poll closed! Result: TRUE/FALSE. Winner gets X JTK!"
6. **Timeout** - If no vote after 15 min, resolve as FALSE (or leave unresolved?)

## Photo Handling (Future)

For now, photo is received but not stored. Future plan:
- Upload photo to IPFS/Filecoin
- Store CID hash on-chain in `createBet()`
- On FALSE result, photo can be retrieved for "proof"

## Contract Details

- **TapBet Contract:** `0x332F5eF8B056fcf8cb6973ca3D0173c43eA17f12`
- **JakeToken:** `0x4d14354151f845393ba3fa50436b3b6a36ffe762`
- **Network:** Celo Mainnet (Chain ID: 42220)
- **RPC:** `https://forno.celo.org`
- **Reward per TRUE:** 1 JTK

## Environment Variables (Lambda)

```
PRIVATE_KEY=<deployer-wallet-private-key>
TAPBET_CONTRACT_ADDRESS=0x332F5eF8B056fcf8cb6973ca3D0173c43eA17f12
BLUESKY_HANDLE=babysfirst.pds.jakesimonds.com
BLUESKY_APP_PASSWORD=<app-password>
```

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                 │
│  /scoresettlin page                                             │
│  - claim input                                                  │
│  - wallet/ens/email input                                       │
│  - camera capture → base64 photo                                │
└───────────────────────────┬─────────────────────────────────────┘
                            │ POST { claim, walletAddress, photo }
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                         LAMBDA                                   │
│  Returns immediately: { success: true, postUrl: "..." }         │
│                                                                 │
│  Then continues in background:                                  │
│  1. Post to Bluesky (claim + "Reply T or F")                   │
│  2. Register bet on Celo (TapBet.createBet)                    │
│  3. Poll Bluesky for T/F replies (every 3s, max 15 min)        │
│  4. On vote: resolve on-chain (TapBet.resolve)                 │
│  5. Post result reply to Bluesky                               │
└───────────────────────────┬─────────────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              ▼                           ▼
       ┌─────────────┐             ┌─────────────┐
       │   Bluesky   │             │    Celo     │
       │   (posts)   │             │   (JTK)     │
       └─────────────┘             └─────────────┘
```

## Frontend After Submit

1. Show loading spinner briefly
2. On success response, redirect to `postUrl`
3. User watches Bluesky for T/F votes and result
4. Done - frontend's job is finished
