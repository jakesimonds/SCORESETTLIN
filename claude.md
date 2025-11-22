# IRL Score Settlin (Tap Bet)

NFC-triggered betting with social voting and smart contract settlement.

## Core Flow
```
NFC Tap → Form (statement + ENS + selfie) → Post to Bluesky/Farcaster
→ T/F replies (24h or 20 votes) → Count votes → Resolve on-chain
→ TRUE wins: tokens to challenger | FALSE wins: photo posted
```

---

## To Do (Original)
- [ ] find Celo token from workshop
- [ ] validate: can we use it for a reward for the smart contract
    - [ ] make more granular to-do for smart contract flow
- [ ] validate: can we programmatically 1: create a post to farcaster 2: poll for T/F comments
- [ ] personal website repo: repurpose selfie page for claim + wallet
    - [ ] NFC point user to page

---

## Target Prizes (3 categories)

### 1. Celo - Best MiniApp ($10k)
**Prize**: Best MiniApp on Celo - $6k/$2.5k/$1.5k
**Fit**: Already planned for Celo. Build as Farcaster MiniApp.
**Requirements**:
- Live Farcaster Mini App (wagmi wallet connector)
- Onchain actions on Celo
- Verified contract on Celo Mainnet
- README with description, team, how Celo was used

**Integration**:
- Deploy TapBet.sol to Celo mainnet
- Use jakeToken (ERC20) on Celo for rewards
- Farcaster Mini App for bet creation UI

---

### 2. ENS - Most Creative Use ($10k)
**Prize**: Most creative use of ENS - $3.5k/$2k/$1.5k×3
**Fit**: Already using ENS for challenger identification!
**Requirements**:
- Obvious ENS improvement (not afterthought)
- Working demo (not hard-coded)
- Video + GitHub + open source

**Integration**:
- Resolve challenger ENS → address for token transfer
- Display ENS avatar in bet UI
- ENS name in social posts ("challenged by vitalik.eth")
- Optional: Mint ENS subname for bet (bet-1234.tapbet.eth)

---

### 3. Filecoin - Best dApps powered by Filecoin Onchain Cloud ($10k)
**Prize**: Best dApps - $5k/$3.5k/$1.5k
**Fit**: Perfect for photo storage!
**Requirements**:
- Use Synapse SDK or Filecoin Pin meaningfully
- Working demo (frontend or CLI)
- Open source GitHub

**Integration**:
- Store photos via Synapse SDK
- Retrieve photo URL for posting when FALSE wins
- Permanent, decentralized archive

---

## Alternative/Bonus Prize Ideas

### XMTP - Best Miniapp in Group Chat ($2.5k)
**Interesting idea**: Token-gated group chat for bettors
- Win a bet → get access to winners chat
- Lose a bet → losers chat where losers post apologies
- Could be lightweight addition if time permits

### World - Best Mini App ($17k)
- Different chain (World Chain, not Celo)
- Bigger prize but more integration work
- "Must not be gambling or chance based" - we're voting, not gambling!

### The Graph - Best Use for AI ($2k)
- Index bet events for analytics

---

## Hosting Photos On-Chain

**Filecoin** (Synapse SDK) - Best option
- Decentralized storage for photos
- Serve via IPFS gateway URLs
- Permanent storage

No direct "host static site on-chain" sponsor, but Filecoin + IPFS gateway = effectively permanent hosting.

---

## Implementation Priority

### Phase 1: Core Contract (Celo)
- [ ] Deploy TapBet.sol to Celo testnet
- [ ] Deploy/find jakeToken (ERC20)
- [ ] Test bet creation + resolution

### Phase 2: ENS Integration
- [ ] Add ENS resolution in frontend form
- [ ] Resolve ENS → address before createBet()
- [ ] Fetch ENS avatar for display
- [ ] Include ENS name in social posts

### Phase 3: Filecoin Photo Storage
- [ ] Integrate Synapse SDK
- [ ] Upload photo on bet creation
- [ ] Store CID/hash in contract
- [ ] Retrieve for PhotoTime event

### Phase 4: Farcaster MiniApp
- [ ] Adapt mini-app for Farcaster frames
- [ ] wagmi wallet connector
- [ ] Deploy

### Phase 5: Social Posting
- [ ] Bluesky + Farcaster posting
- [ ] Vote counting automation
- [ ] Photo posting on FALSE wins

---

## Existing Code (from research/tap-bet)

```
tap-bet/
├── index.html              # NFC landing page - bet creation form
├── mini-app/
│   └── index.html          # Farcaster Mini App
├── social-poster.js        # Bluesky + Farcaster posting & vote counting
├── resolve-bet.js          # Resolution script
├── contracts/
│   ├── TapBet.sol          # Smart contract
│   └── deploy.js           # Deployment script
└── README.md
```

---

## Smart Contract Flow (from original notes)

```
executeSmartContract(claim, wallet, blob/photo):
    - post claim to farcaster via API
    while commentsOnPost != T | F and !Timeout:
        checkForComments
    if commentsOnPost = T:
        return send JakeTokens
    if commentsOnPost = F:
        return post blob/photo
    if Timeout:
        return post It timedout!
```

---

## Prize Synergy

All three prizes complement each other naturally:
1. **Celo** = settlement layer (tokens + contract)
2. **ENS** = identity layer (human-readable names)
3. **Filecoin** = storage layer (photos)

This is legitimate multi-sponsor integration, not bolted-on afterthoughts.
