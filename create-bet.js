/**
 * Create a bet - posts to Bluesky, saves URI for polling
 */

import 'dotenv/config';

const HANDLE = process.env.BLUESKY_HANDLE;
const PASSWORD = process.env.BLUESKY_APP_PASSWORD;

const pdsMatch = HANDLE?.match(/\.pds\.(.+)$/);
const SERVICE = pdsMatch ? `https://pds.${pdsMatch[1]}` : 'https://bsky.social';

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
  const statement = process.argv[2];
  const challenger = process.argv[3];

  if (!statement || !challenger) {
    console.log('Usage: node create-bet.js "claim" "challenger.eth"');
    process.exit(1);
  }

  const session = await login();
  const text = `Score Settlin'! ${challenger} claims:\n\n"${statement}"\n\nReply T for TRUE or F for FALSE`;

  const result = await post(session, text);
  const postId = result.uri.split('/').pop();
  const url = `https://bsky.app/profile/${session.handle}/post/${postId}`;

  console.log('Bet created!');
  console.log(`URI: ${result.uri}`);
  console.log(`URL: ${url}`);
  console.log(`\nTo resolve: node resolve-bet.js "${result.uri}" "${challenger}"`);
}

main().catch(console.error);
