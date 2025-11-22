# IRL Score Settlin (Tap Bet)

NFC-triggered betting with social voting and smart contract settlement on Celo + Bluesky.

---

## Development Workflow (IMPORTANT)

**Two codebases exist (for hackathon speed):**
- `server.js` - Local Docker development (uses .env, loads ABI from file)
- `lambda/index.mjs` - AWS Lambda deployment (hardcoded creds, inline ABI)

**Workflow:**
1. Develop/test locally with `docker-compose up --build` → hits `localhost:3001`
2. When ready to deploy, sync changes from `server.js` → `lambda/index.mjs`
3. Rebuild zip: `cd lambda && zip -r ../lambda.zip .`
4. Upload `lambda.zip` to AWS Lambda console (drag and drop)

**Note:** Lambda has hardcoded burner account creds - no AWS CLI/env setup needed.

## Core Flow
```
NFC Tap → Form (claim + ENS/wallet + selfie) → POST to backend
→ Post claim to Bluesky → Create bet on-chain (Celo)
→ Poll for T/F replies → Resolve on-chain
→ TRUE wins: JakeTokens to challenger
→ FALSE wins: photo posted to PDS as wrong.people.look.like.this record
```

---

## Current State
- [x] TapBet contract deployed to Celo mainnet: `0x332F5eF8B056fcf8cb6973ca3D0173c43eA17f12`
- [x] JakeToken (ERC20) on Celo: `0x4d14354151f845393ba3fa50436b3b6a36ffe762`
- [x] Bluesky posting + polling for T/F replies
- [x] ENS resolution (name.eth → address)
- [x] Photo upload to PDS with custom lexicon `wrong.people.look.like.this`
- [x] Lambda deployment working
- [ ] Frontend integration

---

## Key Files

- `server.js` - Main backend (Docker/local)
- `lambda/index.mjs` - Lambda version of backend
- `TapBet.abi.json` - Contract ABI
- `contracts/TapBet.sol` - Smart contract source

## Bluesky/ATProto Details

- PDS: `https://pds.jakesimonds.com`
- Handle: `babysfirst.pds.jakesimonds.com`
- Custom lexicon: `wrong.people.look.like.this` (for storing photos on FALSE)

## API Endpoint

**POST /bet**
```json
{
  "claim": "I can do 10 pushups",
  "walletAddress": "0x123..." or "name.eth",
  "photo": "data:image/jpeg;base64,..."
}
```

**Response:**
```json
{
  "success": true,
  "postUrl": "https://bsky.app/profile/.../post/...",
  "message": "Bet posted!"
}
```
