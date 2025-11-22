# AWS Lambda Setup Instructions

## Files Created

- `lambda/index.mjs` - Lambda handler with hardcoded credentials
- `lambda.zip` - Ready to upload (5.4MB)

## Step-by-Step AWS Console Setup

### 1. Create the Lambda Function

1. Go to **AWS Console** → **Lambda** → **Create function**
2. Choose **Author from scratch**
3. Settings:
   - **Function name:** `score-settlin`
   - **Runtime:** `Node.js 20.x`
   - **Architecture:** `x86_64`
4. Click **Create function**

### 2. Upload the Code

1. In the function page, scroll to **Code source**
2. Click **Upload from** → **.zip file**
3. Upload `lambda.zip` from this repo
4. Click **Save**

### 3. Configure Timeout (CRITICAL!)

1. Go to **Configuration** tab → **General configuration** → **Edit**
2. Set **Timeout** to `15 minutes` (15 min 0 sec)
3. Set **Memory** to `512 MB` (should be enough)
4. Click **Save**

### 4. Create Function URL (easiest way to expose HTTP endpoint)

1. Go to **Configuration** tab → **Function URL**
2. Click **Create function URL**
3. Auth type: **NONE** (public access for hackathon demo)
4. Check **Configure cross-origin resource sharing (CORS)**
5. Click **Save**
6. Copy the **Function URL** (looks like `https://xxxxx.lambda-url.us-east-1.on.aws/`)

### 5. Update Frontend

Change your frontend to POST to the Lambda Function URL instead of localhost:

```javascript
// Old
const response = await fetch('http://localhost:3001/bet', { ... });

// New
const response = await fetch('https://xxxxx.lambda-url.us-east-1.on.aws/', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ claim, walletAddress, photo }),
});
```

## Testing

### Test from command line:

```bash
curl -X POST https://xxxxx.lambda-url.us-east-1.on.aws/ \
  -H "Content-Type: application/json" \
  -d '{"claim": "test claim", "walletAddress": "0x725c7f7952e372402c49a4cb4468d6115c3340a3"}'
```

### Expected response:

```json
{
  "success": true,
  "postUrl": "https://bsky.app/profile/babysfirst.pds.jakesimonds.com/post/xxx",
  "message": "Bet completed!"
}
```

## Important Notes

1. **Lambda waits for completion** - Unlike Docker (which returned immediately), Lambda will wait for the entire bet flow to complete (up to 14 minutes of polling). The frontend will wait for this response.

2. **If you want immediate response** - We'd need to split into two Lambdas (one to start, one to poll) or use Step Functions. For hackathon demo, waiting is fine.

3. **Credentials are hardcoded** - This is intentional for the hackathon. For production, use AWS Secrets Manager or Lambda environment variables.

4. **Costs** - Lambda free tier: 1M requests/month, 400,000 GB-seconds. A 15-minute 512MB Lambda = ~7,500 GB-seconds per invocation. You get ~53 free invocations/month.

## Troubleshooting

### Check CloudWatch Logs

1. Go to **Monitor** tab → **View CloudWatch logs**
2. Look for recent log streams
3. Logs will show the bet flow progress

### Common Issues

- **Timeout before 15 min**: Check timeout is set to 15 min
- **CORS errors**: Make sure Function URL has CORS enabled
- **Cold start slow**: First invocation takes ~5-10 seconds to start

## Shutting Down Docker

Once Lambda is working:

```bash
docker-compose down
```

Your frontend now hits Lambda instead of local Docker.
