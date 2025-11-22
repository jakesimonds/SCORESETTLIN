# Integrating Score Settlin' with Your Website

This guide is for another Claude Code instance to build a mobile web frontend that triggers the bet flow.

## Goal

Build a mobile-friendly webpage that:
1. Collects: claim (text) + wallet address + photo (camera capture)
2. Submits to a local backend server
3. Backend triggers the bet flow (Bluesky post + blockchain registration + polling)

## Current Architecture

The bet flow is already working. When triggered:
1. Posts to Bluesky: "Jake claims X, reply T or F"
2. Registers bet on Celo blockchain
3. Polls Bluesky for T/F replies
4. On T: transfers 1 JTK to challenger wallet, posts "TRUE - you win!"
5. On F: posts "FALSE - photo time!"

**This has been tested and works.**

## What You Need to Build

### 1. Simple Express Server

Create a minimal Express server that:
- Serves a static HTML page (the mobile form)
- Has one POST endpoint `/api/start-bet`
- Runs on localhost for now (demo purposes)

```javascript
// server.js
import express from 'express';
import { spawn } from 'child_process';
import path from 'path';

const app = express();
app.use(express.json());
app.use(express.static('public'));

app.post('/api/start-bet', (req, res) => {
  const { claim, walletAddress } = req.body;

  if (!claim || !walletAddress) {
    return res.status(400).json({ error: 'Missing claim or walletAddress' });
  }

  // Path to run-bet.js in the IRLScoreSettlin repo
  const scriptPath = '/Users/jakesimonds/Documents/IRLScoreSettlin/run-bet.js';

  // Spawn the process (runs in background)
  const child = spawn('node', [scriptPath, claim, walletAddress], {
    cwd: '/Users/jakesimonds/Documents/IRLScoreSettlin',
    detached: true,
    stdio: 'ignore'
  });
  child.unref();

  res.json({
    status: 'started',
    message: 'Bet flow initiated. Check Bluesky for the post.'
  });
});

app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});
```

### 2. Mobile Form Page

Create `public/index.html` - a mobile-optimized form:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Score Settlin'</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      max-width: 400px;
      margin: 0 auto;
      padding: 20px;
      background: #1a1a1a;
      color: #fff;
      min-height: 100vh;
    }
    h1 { text-align: center; margin-bottom: 30px; }
    form { display: flex; flex-direction: column; gap: 16px; }
    label { font-weight: 600; margin-bottom: 4px; }
    input, textarea {
      width: 100%;
      padding: 14px;
      border: 1px solid #333;
      border-radius: 8px;
      font-size: 16px;
      background: #2a2a2a;
      color: #fff;
    }
    textarea { resize: vertical; min-height: 100px; }
    button {
      padding: 16px;
      background: #4CAF50;
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 18px;
      font-weight: 600;
      cursor: pointer;
    }
    button:disabled { background: #666; }
    .photo-preview {
      max-width: 100%;
      border-radius: 8px;
      margin-top: 10px;
    }
    .status {
      text-align: center;
      padding: 20px;
      background: #2a2a2a;
      border-radius: 8px;
      margin-top: 20px;
    }
  </style>
</head>
<body>
  <h1>Score Settlin'</h1>

  <form id="bet-form">
    <div>
      <label for="claim">Your Claim</label>
      <textarea id="claim" name="claim" placeholder="I can do 20 pushups in 30 seconds" required></textarea>
    </div>

    <div>
      <label for="walletAddress">Your Wallet Address</label>
      <input type="text" id="walletAddress" name="walletAddress" placeholder="0x..." required />
    </div>

    <div>
      <label for="photo">Take a Photo (optional for now)</label>
      <input type="file" id="photo" name="photo" accept="image/*" capture="environment" />
      <img id="photo-preview" class="photo-preview" style="display: none;" />
    </div>

    <button type="submit">Submit Bet</button>
  </form>

  <div id="status" class="status" style="display: none;"></div>

  <script>
    // Photo preview
    document.getElementById('photo').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const preview = document.getElementById('photo-preview');
          preview.src = e.target.result;
          preview.style.display = 'block';
        };
        reader.readAsDataURL(file);
      }
    });

    // Form submit
    document.getElementById('bet-form').addEventListener('submit', async (e) => {
      e.preventDefault();

      const button = e.target.querySelector('button');
      const status = document.getElementById('status');

      button.disabled = true;
      button.textContent = 'Submitting...';

      try {
        const response = await fetch('/api/start-bet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            claim: document.getElementById('claim').value,
            walletAddress: document.getElementById('walletAddress').value,
          }),
        });

        const result = await response.json();

        status.style.display = 'block';
        status.innerHTML = `
          <p><strong>Bet Started!</strong></p>
          <p>Your claim has been posted to Bluesky.</p>
          <p>When someone replies T or F, the bet will resolve automatically.</p>
          <p>If TRUE: you win 1 JTK!</p>
        `;

        // Reset form
        e.target.reset();
        document.getElementById('photo-preview').style.display = 'none';

      } catch (error) {
        status.style.display = 'block';
        status.innerHTML = `<p style="color: #ff6b6b;">Error: ${error.message}</p>`;
      }

      button.disabled = false;
      button.textContent = 'Submit Bet';
    });
  </script>
</body>
</html>
```

### 3. Package.json

```json
{
  "name": "score-settlin-frontend",
  "type": "module",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^4.18.2"
  }
}
```

## Setup Steps

1. Create a new directory for the frontend
2. Create the files above (`server.js`, `public/index.html`, `package.json`)
3. Run `npm install`
4. Run `npm start`
5. Open `http://localhost:3000` on your phone (same network) or computer

## Testing the Flow

1. Fill in a claim: "I can juggle"
2. Enter wallet address: `0x725c7f7952e372402c49a4cb4468d6115c3340a3`
3. Submit
4. Check Bluesky for the post (account: `babysfirst.pds.jakesimonds.com`)
5. Reply "T" to the post
6. Watch the token transfer happen on Celoscan

## Environment Notes

The backend (`run-bet.js`) uses these env vars from `/Users/jakesimonds/Documents/IRLScoreSettlin/.env`:
- `PRIVATE_KEY` - deployer wallet
- `TAPBET_CONTRACT_ADDRESS` - `0x332F5eF8B056fcf8cb6973ca3D0173c43eA17f12`
- `BLUESKY_HANDLE` - `babysfirst.pds.jakesimonds.com`
- `BLUESKY_APP_PASSWORD` - app password for posting

## Contract Details

- **TapBet Contract:** `0x332F5eF8B056fcf8cb6973ca3D0173c43eA17f12`
- **JakeToken:** `0x4d14354151f845393ba3fa50436b3b6a36ffe762`
- **Network:** Celo Mainnet (Chain ID: 42220)
- **Reward per win:** 1.00 JTK
- **Contract balance:** ~997 JTK (enough for many tests)

## Photo Handling (Future TODO)

Photo is captured but not uploaded yet. Future steps:
1. Upload photo to Filecoin/IPFS from frontend or backend
2. Pass CID to the bet flow
3. Store hash on-chain
4. On FALSE result, retrieve and display the photo

## Flow Diagram

```
┌─────────────────────┐
│  Mobile Browser     │
│  (localhost:3000)   │
│  - claim input      │
│  - wallet input     │
│  - photo capture    │
└──────────┬──────────┘
           │ POST /api/start-bet
           ▼
┌─────────────────────┐
│  Express Server     │
│  (localhost:3000)   │
│  spawns run-bet.js  │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  run-bet.js         │
│  (IRLScoreSettlin)  │
│  - posts to Bluesky │
│  - registers on-chain│
│  - polls for T/F    │
│  - resolves bet     │
│  - posts result     │
└─────────────────────┘
           │
     ┌─────┴─────┐
     ▼           ▼
┌─────────┐  ┌─────────┐
│ Bluesky │  │  Celo   │
│         │  │ (JTK)   │
└─────────┘  └─────────┘
```
