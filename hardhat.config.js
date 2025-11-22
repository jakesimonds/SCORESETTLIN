import "@nomicfoundation/hardhat-toolbox";
import "dotenv/config";

export default {
  solidity: "0.8.19",
  networks: {
    celo: {
      url: "https://forno.celo.org",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 42220,
    },
  },
};
