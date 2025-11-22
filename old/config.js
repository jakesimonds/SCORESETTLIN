// =============================================================================
// IRL Score Settlin - Configuration
// =============================================================================

export const config = {
  // ---------------------------------------------------------------------------
  // WALLETS
  // ---------------------------------------------------------------------------

  // Your main wallet (deployer, holds JakeTokens)
  DEPLOYER_WALLET: process.env.DEPLOYER_WALLET || "",

  // Test wallet for receiving bet winnings during testing
  TEST_CHALLENGER_WALLET: process.env.TEST_CHALLENGER_WALLET || "",

  // ---------------------------------------------------------------------------
  // CELO
  // ---------------------------------------------------------------------------

  // JakeToken contract address on Celo mainnet
  JAKE_TOKEN_ADDRESS: "0x4d14354151f845393ba3fa50436b3b6a36ffe762",

  // TapBet contract address (fill in after deployment)
  TAPBET_CONTRACT_ADDRESS: process.env.TAPBET_CONTRACT_ADDRESS || "",

  // Celo RPC endpoints
  CELO_MAINNET_RPC: "https://forno.celo.org",
  CELO_TESTNET_RPC: "https://alfajores-forno.celo-testnet.org",

  // ---------------------------------------------------------------------------
  // BLUESKY (ATProto) - FREE!
  // ---------------------------------------------------------------------------

  // Your Bluesky handle (e.g., yourname.bsky.social)
  BLUESKY_HANDLE: process.env.BLUESKY_HANDLE || "",

  // App password from: Settings → Privacy and Security → App Passwords
  BLUESKY_APP_PASSWORD: process.env.BLUESKY_APP_PASSWORD || "",

  // ---------------------------------------------------------------------------
  // FILECOIN (for photos)
  // ---------------------------------------------------------------------------

  // Synapse SDK credentials (fill in later)
  FILECOIN_API_KEY: process.env.FILECOIN_API_KEY || "",

  // ---------------------------------------------------------------------------
  // TEST MODE
  // ---------------------------------------------------------------------------

  // When true, only 1 vote needed to resolve (instead of 20)
  TEST_MODE: process.env.TEST_MODE === "true" || true,
  MIN_VOTES_TO_RESOLVE: process.env.TEST_MODE === "true" ? 1 : 20,
};

export default config;
