/**
 * Deploy TapBet to Celo mainnet
 *
 * Usage: node deploy.js
 * Requires PRIVATE_KEY in .env
 */

import 'dotenv/config';
import { ethers } from 'ethers';
import solc from 'solc';
import fs from 'fs';
import path from 'path';

const JAKE_TOKEN = "0x4d14354151f845393ba3fa50436b3b6a36ffe762";
const REWARD_AMOUNT = 1000; // 10.00 JTK (2 decimals)ss
const RPC = "https://forno.celo.org";

async function main() {
  if (!process.env.PRIVATE_KEY) {
    console.error('❌ PRIVATE_KEY not found in .env');
    process.exit(1);
  }

  // Read contract source
  const contractPath = path.join(process.cwd(), 'contracts', 'TapBet.sol');
  const source = fs.readFileSync(contractPath, 'utf8');

  // Read OpenZeppelin dependencies
  const ozPath = path.join(process.cwd(), 'node_modules', '@openzeppelin', 'contracts');

  function findImports(importPath) {
    if (importPath.startsWith('@openzeppelin/contracts/')) {
      const filePath = path.join(ozPath, importPath.replace('@openzeppelin/contracts/', ''));
      return { contents: fs.readFileSync(filePath, 'utf8') };
    }
    return { error: 'File not found' };
  }

  console.log('Compiling TapBet.sol...');

  const input = {
    language: 'Solidity',
    sources: { 'TapBet.sol': { content: source } },
    settings: { outputSelection: { '*': { '*': ['abi', 'evm.bytecode'] } } }
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));

  if (output.errors) {
    const errors = output.errors.filter(e => e.severity === 'error');
    if (errors.length > 0) {
      console.error('Compilation errors:', errors);
      process.exit(1);
    }
  }

  const contract = output.contracts['TapBet.sol']['TapBet'];
  const abi = contract.abi;
  const bytecode = contract.evm.bytecode.object;

  console.log('✅ Compiled\n');

  // Deploy
  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

  console.log('Deploying from:', wallet.address);
  console.log('JakeToken:', JAKE_TOKEN);
  console.log('Reward:', REWARD_AMOUNT);

  const factory = new ethers.ContractFactory(abi, bytecode, wallet);
  const tapBet = await factory.deploy(JAKE_TOKEN, REWARD_AMOUNT);

  console.log('\nWaiting for deployment...');
  await tapBet.waitForDeployment();

  const address = await tapBet.getAddress();
  console.log('\n✅ TapBet deployed to:', address);
  console.log('\nAdd to .env:');
  console.log(`TAPBET_CONTRACT_ADDRESS=${address}`);

  // Save ABI for later use
  fs.writeFileSync('TapBet.abi.json', JSON.stringify(abi, null, 2));
  console.log('\nSaved ABI to TapBet.abi.json');
}

main().catch(console.error);
