/**
 * Resolve a bet - polls for T/F, calls contract, posts result
 * Usage: node resolve-bet.js "at://..." "0xAddress" "betId"
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

async function postReply(postUri, postCid, text) {
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

async function getPostCid(postUri) {
  const sess = await login();
  const response = await fetch(
    `${SERVICE}/xrpc/app.bsky.feed.getPostThread?uri=${encodeURIComponent(postUri)}&depth=0`,
    { headers: { 'Authorization': `Bearer ${sess.accessJwt}` } }
  );
  if (!response.ok) throw new Error(`Get post failed: ${response.status}`);
  const data = await response.json();
  return data.thread.post.cid;
}

async function main() {
  const postUri = process.argv[2];
  const challengerAddress = process.argv[3];
  const betId = process.argv[4];

  if (!postUri || !challengerAddress || !betId) {
    console.log('Usage: node resolve-bet.js "at://..." "0xAddress" "betId"');
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

  console.log('Polling for T or F...');

  while (true) {
    const trueWon = await getFirstVote(postUri);
    if (trueWon !== null) {
      const resultText = trueWon ? 'TRUE' : 'FALSE';
      console.log(`\nResult: ${resultText}`);

      // Call contract to resolve
      console.log('\nResolving on-chain...');
      const tx = await tapBet.resolve(betId, trueWon);
      console.log(`Tx: ${tx.hash}`);
      const receipt = await tx.wait();
      console.log('Resolved on-chain!');

      // Check for TokensTransferred event
      const transferEvent = receipt.logs.find(log => {
        try {
          const parsed = tapBet.interface.parseLog(log);
          return parsed.name === 'TokensTransferred';
        } catch { return false; }
      });

      // Post result to Bluesky
      const cid = await getPostCid(postUri);
      let replyText;

      if (trueWon) {
        if (transferEvent) {
          const parsed = tapBet.interface.parseLog(transferEvent);
          const amount = parsed.args.amount;
          replyText = `Poll closed! Result: TRUE\n\n${challengerAddress.slice(0, 6)}...${challengerAddress.slice(-4)} wins ${amount / BigInt(100)} JTK!`;
        } else {
          replyText = `Poll closed! Result: TRUE\n\n${challengerAddress.slice(0, 6)}...${challengerAddress.slice(-4)} wins!`;
        }
      } else {
        replyText = `Poll closed! Result: FALSE\n\nPhoto time for ${challengerAddress.slice(0, 6)}...${challengerAddress.slice(-4)}!`;
      }

      await postReply(postUri, cid, replyText);
      console.log('\nPosted result to Bluesky!');
      console.log(`Result: ${replyText}`);
      break;
    }
    process.stdout.write('.');
    await new Promise(r => setTimeout(r, 3000));
  }
}

main().catch(console.error);
