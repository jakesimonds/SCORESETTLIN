/**
 * Score Settlin' Lambda Function
 *
 * Handles bet flow: Bluesky post -> on-chain registration -> poll for T/F -> resolve
 */

import { ethers } from 'ethers';

// =============================================================================
// HARDCODED CONFIG (burner accounts)
// =============================================================================

const RPC = "https://forno.celo.org";
const HANDLE = "babysfirst.pds.jakesimonds.com";
const PASSWORD = "yom4-2hgc-32ks-le3s";
const PRIVATE_KEY = "0xda944bc0b7b56c395c1607a2945c902c2f127c6b0f21380566d06dc7de17ce03";
const TAPBET_ADDRESS = "0x332F5eF8B056fcf8cb6973ca3D0173c43eA17f12";

const SERVICE = "https://pds.jakesimonds.com";

// TapBet ABI (minimal)
const tapBetAbi = [
  "function createBet(bytes32 betId, address challenger, bytes32 photoHash, string blueskyUri)",
  "function resolve(bytes32 betId, bool trueWon)",
  "event TokensTransferred(bytes32 indexed betId, address indexed winner, uint256 amount)",
  "event PhotoTime(bytes32 indexed betId, address indexed challenger, bytes32 photoHash)"
];

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

function extractUrlFacets(text) {
  const facets = [];
  const urlRegex = /https?:\/\/[^\s]+/g;
  let match;
  const encoder = new TextEncoder();

  while ((match = urlRegex.exec(text)) !== null) {
    const beforeMatch = text.slice(0, match.index);
    const byteStart = encoder.encode(beforeMatch).length;
    const byteEnd = byteStart + encoder.encode(match[0]).length;

    facets.push({
      index: { byteStart, byteEnd },
      features: [{ $type: 'app.bsky.richtext.facet#link', uri: match[0] }]
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
  if (facets.length > 0) record.facets = facets;

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

  function checkReplies(replies) {
    for (const reply of replies || []) {
      const text = reply.post?.record?.text?.toUpperCase().trim();
      if (text === 'T') return true;
      if (text === 'F') return false;
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
  if (facets.length > 0) record.facets = facets;

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
// WRONG.PEOPLE CUSTOM LEXICON
// =============================================================================

async function uploadBlob(imageBase64) {
  const sess = await login();
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
  return response.json();
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
  return response.json();
}

// =============================================================================
// BET FLOW
// =============================================================================

async function runBetFlow(claim, walletAddress, photo, postUri, betId, displayName) {
  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const tapBet = new ethers.Contract(TAPBET_ADDRESS, tapBetAbi, wallet);
  // Use displayName (ENS or shortened address) for Bluesky posts
  const shortAddr = displayName;

  console.log(`[${betId.slice(0, 10)}] Starting bet flow...`);

  // Step 1: Upload photo and create wrong.people record
  let wrongPeopleUri = null;
  let photoHash = ethers.ZeroHash;

  if (photo) {
    try {
      console.log(`[${betId.slice(0, 10)}] Uploading photo blob...`);
      const blobData = await uploadBlob(photo);
      console.log(`[${betId.slice(0, 10)}] Blob uploaded: ${blobData.blob.ref.$link}`);

      const rkey = betId.slice(2, 34);
      console.log(`[${betId.slice(0, 10)}] Creating wrong.people record...`);
      const wpRecord = await createWrongPeopleRecord(claim, blobData, rkey);
      wrongPeopleUri = wpRecord.uri;
      console.log(`[${betId.slice(0, 10)}] wrong.people record created: ${wrongPeopleUri}`);

      const blobCid = blobData.blob.ref.$link;
      photoHash = ethers.keccak256(ethers.toUtf8Bytes(blobCid));
    } catch (e) {
      console.error(`[${betId.slice(0, 10)}] Photo upload failed:`, e.message);
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

  // Post Celoscan link
  const createCeloscanUrl = `https://celoscan.io/tx/${createTxHash}`;
  await postReply(postUri, `Smart Contract created: \n\n${createCeloscanUrl}`);
  console.log(`[${betId.slice(0, 10)}] Posted creation tx link`);

  // Step 3: Poll for T/F (max 14 minutes to stay under Lambda 15min limit)
  const maxPollTime = 14 * 60 * 1000;
  const pollInterval = 3000;
  const startTime = Date.now();

  console.log(`[${betId.slice(0, 10)}] Polling for T/F...`);

  let trueWon = null;
  while (trueWon === null && (Date.now() - startTime) < maxPollTime) {
    trueWon = await getFirstVote(postUri);
    if (trueWon === null) {
      await new Promise(r => setTimeout(r, pollInterval));
    }
  }

  if (trueWon === null) {
    console.log(`[${betId.slice(0, 10)}] Timeout - no vote received`);
    await postReply(postUri, `Timeout - no vote received within 14 minutes. Bet unresolved.`);
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
// LAMBDA HANDLER
// =============================================================================

export const handler = async (event) => {
  // CORS preflight
  if (event.requestContext?.http?.method === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: '',
    };
  }

  try {
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    const { claim, walletAddress: inputAddress, photo } = body;

    // Validate claim
    if (!claim || typeof claim !== 'string') {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, error: 'Missing or invalid claim' }),
      };
    }

    // Resolve ENS name or validate address
    let walletAddress = inputAddress;
    if (inputAddress && inputAddress.endsWith('.eth')) {
      try {
        console.log(`Resolving ENS name: ${inputAddress}`);
        const ethProvider = new ethers.JsonRpcProvider('https://eth.llamarpc.com');
        const resolved = await ethProvider.resolveName(inputAddress);
        if (!resolved) {
          return {
            statusCode: 400,
            headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
            body: JSON.stringify({ success: false, error: `Could not resolve ENS name: ${inputAddress}` }),
          };
        }
        walletAddress = resolved;
        console.log(`ENS resolved: ${inputAddress} -> ${walletAddress}`);
      } catch (e) {
        return {
          statusCode: 400,
          headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
          body: JSON.stringify({ success: false, error: `ENS resolution failed: ${e.message}` }),
        };
      }
    } else if (!inputAddress || !ethers.isAddress(inputAddress)) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, error: 'Invalid wallet address' }),
      };
    }

    // Use ENS name for display if provided, otherwise shortened address
    const displayName = inputAddress.endsWith('.eth')
      ? inputAddress
      : `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;

    // Post to Bluesky first
    let postUri, postUrl;
    try {
      const postText = `"${claim}"\n\nReply T for TRUE or F for FALSE`;
      const postResult = await post(postText);
      postUri = postResult.uri;
      const postId = postUri.split('/').pop();
      const sess = await login();
      postUrl = `https://bsky.app/profile/${sess.handle}/post/${postId}`;
    } catch (e) {
      console.error('Failed to post to Bluesky:', e.message);
      return {
        statusCode: 500,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, error: 'Failed to post to Bluesky' }),
      };
    }

    const betId = ethers.keccak256(ethers.toUtf8Bytes(postUri));
    console.log(`New bet: ${betId.slice(0, 10)}... | ${displayName} | "${claim.slice(0, 30)}..."`);

    // Run bet flow (await it - Lambda will wait)
    await runBetFlow(claim, walletAddress, photo, postUri, betId, displayName);

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        postUrl,
        message: 'Bet completed!'
      }),
    };

  } catch (e) {
    console.error('Lambda error:', e);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: e.message }),
    };
  }
};
