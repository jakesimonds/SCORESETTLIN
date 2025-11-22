/**
 * Fake contract - orchestrates full flow for testing
 *
 * Usage: node fake-contract.js "claim" "challenger.eth"
 */

import 'dotenv/config';

const HANDLE = process.env.BLUESKY_HANDLE;
const PASSWORD = process.env.BLUESKY_APP_PASSWORD;

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
    if (text === 'T') return { vote: 'TRUE', cid: data.thread.post.cid };
    if (text === 'F') return { vote: 'FALSE', cid: data.thread.post.cid };
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

async function main() {
  const statement = process.argv[2] || 'This is a test claim';
  const challenger = process.argv[3] || 'test.eth';

  // 1. CREATE BET
  console.log('=== CREATE BET ===');
  console.log(`Statement: "${statement}"`);
  console.log(`Challenger: ${challenger}\n`);

  const betText = `Score Settlin'! ${challenger} claims:\n\n"${statement}"\n\nReply T for TRUE or F for FALSE`;
  const postResult = await post(betText);
  const postUri = postResult.uri;
  const sess = await login();
  const postId = postUri.split('/').pop();
  const url = `https://bsky.app/profile/${sess.handle}/post/${postId}`;

  console.log(`Posted: ${url}`);
  console.log('[contract] createBet() called\n');

  // 2. POLL FOR VOTES
  console.log('=== POLLING ===');
  console.log('Waiting for T or F reply...');

  let result;
  while (true) {
    result = await getFirstVote(postUri);
    if (result) break;
    process.stdout.write('.');
    await new Promise(r => setTimeout(r, 3000));
  }

  console.log(`\nVote received: ${result.vote}\n`);

  // 3. RESOLVE
  console.log('=== RESOLVE ===');
  console.log(`[contract] resolve(betId, ${result.vote})`);

  let replyText;
  if (result.vote === 'TRUE') {
    console.log(`[contract] TokensTransferred → ${challenger}`);
    replyText = `Poll closed! Result: TRUE\n\n${challenger} wins! Tokens transferred.`;
  } else {
    console.log(`[contract] PhotoTime → posting photo`);
    replyText = `Poll closed! Result: FALSE\n\n${challenger} was WRONG!`;
  }

  await postReply(postUri, result.cid, replyText);
  console.log('\nPosted resolution to thread.');
  console.log('Done!');
}

main().catch(console.error);
