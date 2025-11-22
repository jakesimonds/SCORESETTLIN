/**
 * Fund the TapBet contract with JakeTokens
 * Usage: node fund-contract.js [amount]
 * Default: 1000 (10.00 JTK with 2 decimals)
 */

import 'dotenv/config';
import { ethers } from 'ethers';
import fs from 'fs';

const JAKE_TOKEN = "0x4d14354151f845393ba3fa50436b3b6a36ffe762";
const RPC = "https://forno.celo.org";

// ERC20 ABI (just what we need)
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)"
];

async function main() {
  const tapBetAddress = process.env.TAPBET_CONTRACT_ADDRESS;
  const privateKey = process.env.PRIVATE_KEY;

  if (!tapBetAddress) {
    console.error('TAPBET_CONTRACT_ADDRESS not set in .env');
    process.exit(1);
  }
  if (!privateKey) {
    console.error('PRIVATE_KEY not set in .env');
    process.exit(1);
  }

  // Amount to fund (default 1000 = 10.00 JTK)
  const amount = process.argv[2] ? parseInt(process.argv[2]) : 100000;

  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet = new ethers.Wallet(privateKey, provider);
  const jakeToken = new ethers.Contract(JAKE_TOKEN, ERC20_ABI, wallet);
  const tapBetAbi = JSON.parse(fs.readFileSync('TapBet.abi.json', 'utf8'));
  const tapBet = new ethers.Contract(tapBetAddress, tapBetAbi, wallet);

  const symbol = await jakeToken.symbol();
  const decimals = await jakeToken.decimals();

  console.log(`Funding TapBet contract: ${tapBetAddress}`);
  console.log(`Token: ${symbol} (${decimals} decimals)`);
  console.log(`Amount: ${amount} (${amount / Math.pow(10, Number(decimals))} ${symbol})`);
  console.log(`From: ${wallet.address}\n`);

  // Check current balances
  const walletBalance = await jakeToken.balanceOf(wallet.address);
  const contractBalance = await jakeToken.balanceOf(tapBetAddress);
  console.log(`Your ${symbol} balance: ${walletBalance}`);
  console.log(`Contract ${symbol} balance: ${contractBalance}\n`);

  if (walletBalance < amount) {
    console.error(`Insufficient ${symbol}! Need ${amount}, have ${walletBalance}`);
    process.exit(1);
  }

  // Approve TapBet to spend tokens
  console.log('Approving tokens...');
  const approveTx = await jakeToken.approve(tapBetAddress, amount);
  await approveTx.wait();
  console.log('Approved!\n');

  // Fund the contract
  console.log('Funding contract...');
  const fundTx = await tapBet.fundContract(amount);
  await fundTx.wait();
  console.log('Funded!\n');

  // Verify
  const newContractBalance = await jakeToken.balanceOf(tapBetAddress);
  console.log(`Contract ${symbol} balance: ${newContractBalance}`);
  console.log(`Ready to pay out ${newContractBalance / BigInt(100)} wins!`);
}

main().catch(console.error);
