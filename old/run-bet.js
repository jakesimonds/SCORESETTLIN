/**
 * Run a complete bet flow:
 * 1. Post to Bluesky
 * 2. Register on-chain
 * 3. Poll for T/F vote
 * 4. Resolve on-chain (tokens transfer if T)
 * 5. Post result to Bluesky
 *
 * Usage: node run-bet.js "claim" "0xWalletAddress"
 */

import 'dotenv/config';
import { ethers } from 'ethers';
import fs from 'fs';

const HANDLE = process.env.BLUESKY_HANDLE;
const PASSWORD = process.env.BLUESKY_APP_PASSWORD;
const RPC = "https://forno.celo.org";

const pdsMatch = HANDLE?.match(/\.pds\.(.+)$/);
const SERVICE = pdsMatch ? `https://pds.${pdsMatch[1]}` : 'https://bsky.social';

let session = null;

// =============================================================================
// BLUESKY FUNCTIONS
// =============================================================================

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

async function post(text) {
  const sess = await login();
  const response = await fetch(`${SERVICE}/xrpc/com.atproto.repo.createRecord`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${sess.accessJwt}`,
    },
    body: JSON.stringify({
      repo: sess.did,
      collection: 'app.bsky.feed.post',
      record: { $type: 'app.bsky.feed.post', text, createdAt: new Date().toISOString() },
    }),
  });
  if (!response.ok) throw new Error(`Post failed: ${response.status}`);
  return response.json();
}

async function getFirstVote(postUri) {
  const sess = await login();
  const response = await fetch(
    `${SERVICE}/xrpc/app.bsky.feed.getPostThread?uri=${encodeURIComponent(postUri)}&depth=1`,
    { headers: { 'Authorization': `Bearer ${sess.accessJwt}` } }
  );
  if (!response.ok) throw new Error(`Get thread failed: ${response.status}`);

  const data = await response.json();
  const replies = data.thread.replies || [];

  for (const reply of replies) {
    const text = reply.post.record.text.toUpperCase().trim();
    if (text === 'T') return true;
    if (text === 'F') return false;
  }
  return null;
}

async function postReply(postUri, text) {
  const sess = await login();

  // Get CID first
  const threadRes = await fetch(
    `${SERVICE}/xrpc/app.bsky.feed.getPostThread?uri=${encodeURIComponent(postUri)}&depth=0`,
    { headers: { 'Authorization': `Bearer ${sess.accessJwt}` } }
  );
  if (!threadRes.ok) throw new Error(`Get post failed: ${threadRes.status}`);
  const threadData = await threadRes.json();
  const postCid = threadData.thread.post.cid;

  const response = await fetch(`${SERVICE}/xrpc/com.atproto.repo.createRecord`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${sess.accessJwt}`,
    },
    body: JSON.stringify({
      repo: sess.did,
      collection: 'app.bsky.feed.post',
      record: {
        $type: 'app.bsky.feed.post',
        text,
        createdAt: new Date().toISOString(),
        reply: {
          root: { uri: postUri, cid: postCid },
          parent: { uri: postUri, cid: postCid },
        },
      },
    }),
  });
  if (!response.ok) throw new Error(`Reply failed: ${response.status}`);
  return response.json();
}

// =============================================================================
// MAIN FLOW
// =============================================================================

async function main() {
  const claim = process.argv[2];
  const challengerAddress = process.argv[3];

  if (!claim || !challengerAddress) {
    console.log('Usage: node run-bet.js "claim" "0xWalletAddress"');
    process.exit(1);
  }

  if (!ethers.isAddress(challengerAddress)) {
    console.error('Invalid wallet address');
    process.exit(1);
  }

  const tapBetAddress = process.env.TAPBET_CONTRACT_ADDRESS;
  const privateKey = process.env.PRIVATE_KEY;

  if (!tapBetAddress || !privateKey) {
    console.error('Missing TAPBET_CONTRACT_ADDRESS or PRIVATE_KEY in .env');
    process.exit(1);
  }

  // Set up contract
  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet = new ethers.Wallet(privateKey, provider);
  const tapBetAbi = JSON.parse(fs.readFileSync('TapBet.abi.json', 'utf8'));
  const tapBet = new ethers.Contract(tapBetAddress, tapBetAbi, wallet);

  const shortAddr = `${challengerAddress.slice(0, 6)}...${challengerAddress.slice(-4)}`;

  // =========================================================================
  // STEP 1: Post to Bluesky
  // =========================================================================
  console.log('\n[1/5] Posting to Bluesky...');
  const postText = `Score Settlin'! ${shortAddr} claims:\n\n"${claim}"\n\nReply T for TRUE or F for FALSE`;
  const postResult = await post(postText);
  const postUri = postResult.uri;
  const postId = postUri.split('/').pop();
  const sess = await login();
  const url = `https://bsky.app/profile/${sess.handle}/post/${postId}`;
  console.log(`Posted: ${url}`);

  // =========================================================================
  // STEP 2: Register on-chain
  // =========================================================================
  console.log('\n[2/5] Registering bet on-chain...');
  const betId = ethers.keccak256(ethers.toUtf8Bytes(postUri));
  const photoHash = ethers.ZeroHash;

  const createTx = await tapBet.createBet(betId, challengerAddress, photoHash, postUri);
  console.log(`Tx: ${createTx.hash}`);
  await createTx.wait();
  console.log('Bet registered!');

  // =========================================================================
  // STEP 3: Poll for T/F
  // =========================================================================
  console.log('\n[3/5] Waiting for T or F vote...');
  let trueWon = null;
  while (trueWon === null) {
    trueWon = await getFirstVote(postUri);
    if (trueWon === null) {
      process.stdout.write('.');
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  const resultText = trueWon ? 'TRUE' : 'FALSE';
  console.log(`\nVote received: ${resultText}`);

  // =========================================================================
  // STEP 4: Resolve on-chain
  // =========================================================================
  console.log('\n[4/5] Resolving on-chain...');
  const resolveTx = await tapBet.resolve(betId, trueWon);
  console.log(`Tx: ${resolveTx.hash}`);
  const receipt = await resolveTx.wait();
  console.log('Resolved!');

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

  // =========================================================================
  // STEP 5: Post result to Bluesky
  // =========================================================================
  console.log('\n[5/5] Posting result to Bluesky...');
  let replyText;
  if (trueWon) {
    if (tokensTransferred) {
      replyText = `Poll closed! Result: TRUE\n\n${shortAddr} wins ${tokensTransferred / BigInt(100)} JTK!`;
    } else {
      replyText = `Poll closed! Result: TRUE\n\n${shortAddr} wins!`;
    }
  } else {
    replyText = `Poll closed! Result: FALSE\n\nPhoto time for ${shortAddr}!`;
  }
  await postReply(postUri, replyText);
  console.log('Posted!');

  // =========================================================================
  // DONE
  // =========================================================================
  console.log('\n' + '='.repeat(50));
  console.log('BET COMPLETE!');
  console.log('='.repeat(50));
  console.log(`Result: ${resultText}`);
  if (trueWon && tokensTransferred) {
    console.log(`Tokens sent: ${tokensTransferred / BigInt(100)} JTK to ${shortAddr}`);
  }
  console.log(`Bluesky: ${url}`);
}

main().catch(console.error);
