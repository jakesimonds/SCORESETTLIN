/**
 * Start a bet - posts to Bluesky AND registers on-chain
 * Usage: node mock-start.js "claim" "0xWalletAddress"
 */

import 'dotenv/config';
import { ethers } from 'ethers';
import fs from 'fs';

const HANDLE = process.env.BLUESKY_HANDLE;
const PASSWORD = process.env.BLUESKY_APP_PASSWORD;
const RPC = "https://forno.celo.org";

const pdsMatch = HANDLE?.match(/\.pds\.(.+)$/);
const SERVICE = pdsMatch ? `https://pds.${pdsMatch[1]}` : 'https://bsky.social';

// Bluesky functions
async function login() {
  const response = await fetch(`${SERVICE}/xrpc/com.atproto.server.createSession`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: HANDLE, password: PASSWORD }),
  });
  if (!response.ok) throw new Error(`Login failed: ${response.status}`);
  return response.json();
}

async function post(session, text) {
  const response = await fetch(`${SERVICE}/xrpc/com.atproto.repo.createRecord`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.accessJwt}`,
    },
    body: JSON.stringify({
      repo: session.did,
      collection: 'app.bsky.feed.post',
      record: { $type: 'app.bsky.feed.post', text, createdAt: new Date().toISOString() },
    }),
  });
  if (!response.ok) throw new Error(`Post failed: ${response.status}`);
  return response.json();
}

async function main() {
  const claim = process.argv[2];
  const challengerAddress = process.argv[3];

  if (!claim || !challengerAddress) {
    console.log('Usage: node mock-start.js "claim" "0xWalletAddress"');
    process.exit(1);
  }

  // Validate address
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

  // 1. Post to Bluesky
  console.log('Posting to Bluesky...');
  const session = await login();
  const text = `Score Settlin'! ${challengerAddress.slice(0, 6)}...${challengerAddress.slice(-4)} claims:\n\n"${claim}"\n\nReply T for TRUE or F for FALSE`;
  const result = await post(session, text);
  const postUri = result.uri;
  const postId = postUri.split('/').pop();
  const url = `https://bsky.app/profile/${session.handle}/post/${postId}`;
  console.log(`Posted: ${url}\n`);

  // 2. Register on-chain
  console.log('Registering bet on-chain...');
  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet = new ethers.Wallet(privateKey, provider);
  const tapBetAbi = JSON.parse(fs.readFileSync('TapBet.abi.json', 'utf8'));
  const tapBet = new ethers.Contract(tapBetAddress, tapBetAbi, wallet);

  // Generate betId from the Bluesky URI
  const betId = ethers.keccak256(ethers.toUtf8Bytes(postUri));
  // Photo hash (placeholder for now)
  const photoHash = ethers.ZeroHash;

  console.log(`Bet ID: ${betId}`);
  console.log(`Challenger: ${challengerAddress}`);
  console.log(`Bluesky URI: ${postUri}\n`);

  const tx = await tapBet.createBet(betId, challengerAddress, photoHash, postUri);
  console.log(`Tx: ${tx.hash}`);
  await tx.wait();
  console.log('Bet registered on-chain!\n');

  // 3. Output next step
  console.log('='.repeat(50));
  console.log('BET CREATED!');
  console.log('='.repeat(50));
  console.log(`\nBluesky: ${url}`);
  console.log(`Bet ID: ${betId}`);
  console.log(`\nTo resolve (after someone replies T or F):`);
  console.log(`node resolve-bet.js "${postUri}" "${challengerAddress}" "${betId}"`);
}

main().catch(console.error);
