/**
 * Score Settlin' Backend Server
 *
 * Receives POST requests from frontend, executes bet flow.
 * Designed to be easily converted to AWS Lambda.
 *
 * POST /bet
 * Body: { claim, walletAddress, photo }
 * Returns: { success, postUrl, message } or { success: false, error }
 */

import 'dotenv/config';
import http from 'http';
import { ethers } from 'ethers';
import fs from 'fs';

// =============================================================================
// CONFIG
// =============================================================================

const PORT = process.env.PORT || 3001;
const RPC = "https://forno.celo.org";

const HANDLE = process.env.BLUESKY_HANDLE;
const PASSWORD = process.env.BLUESKY_APP_PASSWORD;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const TAPBET_ADDRESS = process.env.TAPBET_CONTRACT_ADDRESS;

const pdsMatch = HANDLE?.match(/\.pds\.(.+)$/);
const SERVICE = pdsMatch ? `https://pds.${pdsMatch[1]}` : 'https://bsky.social';

// Load ABI
let tapBetAbi;
try {
  tapBetAbi = JSON.parse(fs.readFileSync('TapBet.abi.json', 'utf8'));
} catch (e) {
  console.error('Failed to load TapBet.abi.json');
  process.exit(1);
}

// =============================================================================
// BLUESKY FUNCTIONS
// =============================================================================

let session = null;

async function login() {
  if (session) return session;
  const response = await fetch(`${SERVICE}/xrpc/com.atproto.server.createSession`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: HANDLE, password: PASSWORD }),
  });
  if (!response.ok) throw new Error(`Login failed: ${response.status}`);
  session = await response.json();
  return session;
}

// Extract URL facets from text (makes links clickable)
function extractUrlFacets(text) {
  const facets = [];
  const urlRegex = /https?:\/\/[^\s]+/g;
  let match;

  // Need byte positions, not character positions
  const encoder = new TextEncoder();

  while ((match = urlRegex.exec(text)) !== null) {
    const beforeMatch = text.slice(0, match.index);
    const byteStart = encoder.encode(beforeMatch).length;
    const byteEnd = byteStart + encoder.encode(match[0]).length;

    facets.push({
      index: { byteStart, byteEnd },
      features: [{
        $type: 'app.bsky.richtext.facet#link',
        uri: match[0]
      }]
    });
  }

  return facets;
}

async function post(text) {
  const sess = await login();
  const facets = extractUrlFacets(text);

  const record = {
    $type: 'app.bsky.feed.post',
    text,
    createdAt: new Date().toISOString()
  };

  if (facets.length > 0) {
    record.facets = facets;
  }

  const response = await fetch(`${SERVICE}/xrpc/com.atproto.repo.createRecord`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${sess.accessJwt}`,
    },
    body: JSON.stringify({
      repo: sess.did,
      collection: 'app.bsky.feed.post',
      record,
    }),
  });
  if (!response.ok) throw new Error(`Post failed: ${response.status}`);
  return response.json();
}

async function getFirstVote(postUri) {
  const sess = await login();
  const response = await fetch(
    `${SERVICE}/xrpc/app.bsky.feed.getPostThread?uri=${encodeURIComponent(postUri)}&depth=3`,
    { headers: { 'Authorization': `Bearer ${sess.accessJwt}` } }
  );
  if (!response.ok) throw new Error(`Get thread failed: ${response.status}`);

  const data = await response.json();

  // Recursively check all replies (including nested)
  function checkReplies(replies) {
    for (const reply of replies || []) {
      const text = reply.post?.record?.text?.toUpperCase().trim();
      if (text === 'T') return true;
      if (text === 'F') return false;
      // Check nested replies
      const nested = checkReplies(reply.replies);
      if (nested !== null) return nested;
    }
    return null;
  }

  return checkReplies(data.thread.replies);
}

async function postReply(postUri, text) {
  const sess = await login();
  const facets = extractUrlFacets(text);

  const threadRes = await fetch(
    `${SERVICE}/xrpc/app.bsky.feed.getPostThread?uri=${encodeURIComponent(postUri)}&depth=0`,
    { headers: { 'Authorization': `Bearer ${sess.accessJwt}` } }
  );
  if (!threadRes.ok) throw new Error(`Get post failed: ${threadRes.status}`);
  const threadData = await threadRes.json();
  const postCid = threadData.thread.post.cid;

  const record = {
    $type: 'app.bsky.feed.post',
    text,
    createdAt: new Date().toISOString(),
    reply: {
      root: { uri: postUri, cid: postCid },
      parent: { uri: postUri, cid: postCid },
    },
  };

  if (facets.length > 0) {
    record.facets = facets;
  }

  const response = await fetch(`${SERVICE}/xrpc/com.atproto.repo.createRecord`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${sess.accessJwt}`,
    },
    body: JSON.stringify({
      repo: sess.did,
      collection: 'app.bsky.feed.post',
      record,
    }),
  });
  if (!response.ok) throw new Error(`Reply failed: ${response.status}`);
  return response.json();
}

// =============================================================================
// WRONG.PEOPLE CUSTOM LEXICON (photo storage on PDS)
// =============================================================================

async function uploadBlob(imageBase64) {
  const sess = await login();

  // Remove data URL prefix if present (e.g., "data:image/jpeg;base64,")
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  const imageBuffer = Buffer.from(base64Data, 'base64');

  const response = await fetch(`${SERVICE}/xrpc/com.atproto.repo.uploadBlob`, {
    method: 'POST',
    headers: {
      'Content-Type': 'image/jpeg',
      'Authorization': `Bearer ${sess.accessJwt}`,
    },
    body: imageBuffer,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Upload blob failed: ${response.status} - ${errText}`);
  }
  return response.json(); // { blob: { $type: "blob", ref: { $link: "bafkrei..." }, mimeType, size } }
}

async function createWrongPeopleRecord(claim, blobData, rkey) {
  const sess = await login();

  const response = await fetch(`${SERVICE}/xrpc/com.atproto.repo.createRecord`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${sess.accessJwt}`,
    },
    body: JSON.stringify({
      repo: sess.did,
      collection: 'wrong.people.look.like.this',
      rkey: rkey,
      record: {
        $type: 'wrong.people.look.like.this',
        claim: claim,
        photo: blobData.blob,
        createdAt: new Date().toISOString(),
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Create wrong.people record failed: ${response.status} - ${errText}`);
  }

  const result = await response.json();
  // result: { uri: "at://did:plc:.../wrong.people/rkey", cid: "..." }
  return result;
}

// =============================================================================
// BET FLOW (runs in background after response)
// =============================================================================

async function runBetFlow(claim, walletAddress, photo, postUri, betId, displayName) {
  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const tapBet = new ethers.Contract(TAPBET_ADDRESS, tapBetAbi, wallet);
  // Use displayName (ENS or shortened address) for Bluesky posts
  const shortAddr = displayName;
  const sess = await login();

  console.log(`[${betId.slice(0, 10)}] Starting bet flow...`);

  // Step 1: Upload photo and create wrong.people record (if photo provided)
  let wrongPeopleUri = null;
  let photoHash = ethers.ZeroHash;

  if (photo) {
    try {
      console.log(`[${betId.slice(0, 10)}] Uploading photo blob...`);
      const blobData = await uploadBlob(photo);
      console.log(`[${betId.slice(0, 10)}] Blob uploaded: ${blobData.blob.ref.$link}`);

      // Use betId as rkey (remove 0x prefix, take first 32 chars)
      const rkey = betId.slice(2, 34);

      console.log(`[${betId.slice(0, 10)}] Creating wrong.people record...`);
      const wpRecord = await createWrongPeopleRecord(claim, blobData, rkey);
      wrongPeopleUri = wpRecord.uri;
      console.log(`[${betId.slice(0, 10)}] wrong.people record created: ${wrongPeopleUri}`);

      // Use blob CID as photoHash (convert to bytes32)
      const blobCid = blobData.blob.ref.$link;
      photoHash = ethers.keccak256(ethers.toUtf8Bytes(blobCid));
    } catch (e) {
      console.error(`[${betId.slice(0, 10)}] Photo upload failed:`, e.message);
      // Continue without photo
    }
  }

  // Step 2: Register on-chain
  let createTxHash = null;
  try {
    console.log(`[${betId.slice(0, 10)}] Registering on-chain...`);
    const createTx = await tapBet.createBet(betId, walletAddress, photoHash, postUri);
    createTxHash = createTx.hash;
    await createTx.wait();
    console.log(`[${betId.slice(0, 10)}] Registered on-chain: ${createTxHash}`);
  } catch (e) {
    console.error(`[${betId.slice(0, 10)}] Failed to register on-chain:`, e.message);
    return;
  }

  // Post Celoscan link for bet creation
  const createCeloscanUrl = `https://celoscan.io/tx/${createTxHash}`;
  await postReply(postUri, `Smart Contract created: \n\n${createCeloscanUrl}`);
  console.log(`[${betId.slice(0, 10)}] Posted creation tx link`);

  // Step 3: Poll for T/F (max 15 minutes for Lambda compatibility)
  const maxPollTime = 15 * 60 * 1000; // 15 min
  const pollInterval = 3000; // 3 sec
  const startTime = Date.now();

  console.log(`[${betId.slice(0, 10)}] Polling for T/F...`);

  let trueWon = null;
  while (trueWon === null && (Date.now() - startTime) < maxPollTime) {
    trueWon = await getFirstVote(postUri);
    if (trueWon === null) {
      await new Promise(r => setTimeout(r, pollInterval));
    }
  }

  // Timeout - no vote received
  if (trueWon === null) {
    console.log(`[${betId.slice(0, 10)}] Timeout - no vote received`);
    return;
  }

  const resultText = trueWon ? 'TRUE' : 'FALSE';
  console.log(`[${betId.slice(0, 10)}] Vote received: ${resultText}`);

  // Step 4: Resolve on-chain
  try {
    console.log(`[${betId.slice(0, 10)}] Resolving on-chain...`);
    const resolveTx = await tapBet.resolve(betId, trueWon);
    const resolveTxHash = resolveTx.hash;
    const receipt = await resolveTx.wait();
    console.log(`[${betId.slice(0, 10)}] Resolved on-chain: ${resolveTxHash}`);

    // Check for token transfer
    let tokensTransferred = null;
    for (const log of receipt.logs) {
      try {
        const parsed = tapBet.interface.parseLog(log);
        if (parsed.name === 'TokensTransferred') {
          tokensTransferred = parsed.args.amount;
        }
      } catch {}
    }

    const resolveCeloscanUrl = `https://celoscan.io/tx/${resolveTxHash}`;

    // Step 5: Post result to Bluesky
    let replyText;
    if (trueWon) {
      if (tokensTransferred) {
        replyText = `${shortAddr} was right, they get ${tokensTransferred / BigInt(100)} JakeTokens: \n\n${resolveCeloscanUrl}`;
      } else {
        replyText = `Error case\n\n${shortAddr} wins!\n\n${resolveCeloscanUrl}`;
      }
    } else {
      // FALSE - include link to wrong.people record on pdsls.dev AND the resolve tx
      if (wrongPeopleUri) {
        const pdslsUrl = `https://pdsls.dev/${wrongPeopleUri}`;
        replyText = `wrong.people.look.like.this: ${pdslsUrl}\n\nContract resolved: ${resolveCeloscanUrl}`;
      } else {
        replyText = `something went wrong ${shortAddr}!\n\n${resolveCeloscanUrl}`;
      }
    }

    await postReply(postUri, replyText);
    console.log(`[${betId.slice(0, 10)}] Posted result to Bluesky`);
    console.log(`[${betId.slice(0, 10)}] COMPLETE`);

  } catch (e) {
    console.error(`[${betId.slice(0, 10)}] Failed to resolve:`, e.message);
  }
}

// =============================================================================
// HANDLER (Lambda-compatible shape)
// =============================================================================

async function handleBetRequest(body) {
  const { claim, walletAddress: inputAddress, photo } = body;

  // Validate claim
  if (!claim || typeof claim !== 'string') {
    return { success: false, error: 'Missing or invalid claim' };
  }

  // Resolve ENS name or validate address
  let walletAddress = inputAddress;
  if (inputAddress && inputAddress.endsWith('.eth')) {
    try {
      console.log(`Resolving ENS name: ${inputAddress}`);
      const ethProvider = new ethers.JsonRpcProvider('https://eth.llamarpc.com');
      const resolved = await ethProvider.resolveName(inputAddress);
      if (!resolved) {
        return { success: false, error: `Could not resolve ENS name: ${inputAddress}` };
      }
      walletAddress = resolved;
      console.log(`ENS resolved: ${inputAddress} -> ${walletAddress}`);
    } catch (e) {
      return { success: false, error: `ENS resolution failed: ${e.message}` };
    }
  } else if (!inputAddress || !ethers.isAddress(inputAddress)) {
    return { success: false, error: 'Invalid wallet address' };
  }

  // Use ENS name for display if provided, otherwise shortened address
  const displayName = inputAddress.endsWith('.eth')
    ? inputAddress
    : `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;

  // Step 1: Post to Bluesky (do this first to get URL for response)
  let postUri, postUrl;
  try {
    const postText = ` "${claim}"\n\nReply T for TRUE or F for FALSE`;
    const postResult = await post(postText);
    postUri = postResult.uri;
    const postId = postUri.split('/').pop();
    const sess = await login();
    postUrl = `https://bsky.app/profile/${sess.handle}/post/${postId}`;
  } catch (e) {
    console.error('Failed to post to Bluesky:', e.message);
    return { success: false, error: 'Failed to post to Bluesky' };
  }

  // Generate betId
  const betId = ethers.keccak256(ethers.toUtf8Bytes(postUri));

  console.log(`New bet: ${betId.slice(0, 10)}... | ${displayName} | "${claim.slice(0, 30)}..."`);

  // Start bet flow in background (don't await)
  runBetFlow(claim, walletAddress, photo, postUri, betId, displayName).catch(e => {
    console.error(`Bet flow error [${betId.slice(0, 10)}]:`, e.message);
  });

  // Return immediately
  return {
    success: true,
    postUrl,
    message: 'Bet posted! Watch Bluesky for results.'
  };
}

// =============================================================================
// HTTP SERVER
// =============================================================================

const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/bet') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const json = JSON.parse(body);
        const result = await handleBetRequest(json);
        res.writeHead(result.success ? 200 : 400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Invalid JSON' }));
      }
    });
    return;
  }

  // Health check
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`Score Settlin' server running on port ${PORT}`);
  console.log(`POST /bet - Start a new bet`);
  console.log(`GET /health - Health check`);
});

// =============================================================================
// LAMBDA EXPORT (for future use)
// =============================================================================

export { handleBetRequest };
