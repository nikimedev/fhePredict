# FHE Prediction Market

An end-to-end Fully Homomorphic Encryption (FHE) prediction market. Users create markets with 2–4 outcomes, place ETH wagers where both the pick and stake stay encrypted on-chain, and decrypt totals locally when they want visibility. The stack combines Zama FHEVM smart contracts, a Sepolia-ready frontend (React + Vite), and Hardhat tooling for deployment, testing, and automation.

## Project Overview
- Confidential predictions: market names and options are public, but every bet (selection + amount) is stored as encrypted FHE ciphertexts.
- Encrypted accounting: per-option pools and the overall pool are aggregated on-chain without exposing amounts until a user decrypts client-side.
- Full user flow: create predictions, browse active markets, place encrypted bets with ETH, and decrypt totals or your own bet locally.
- Production-minded tooling: repeatable deployments with `hardhat-deploy`, typed ABIs, CLI tasks, and tests that exercise encryption flows.

## Problems This Solves
- Protects strategy and privacy by hiding choices and stakes from mempools, copy-traders, and off-chain analytics.
- Prevents prediction markets from leaking popularity signals before resolution by keeping totals encrypted.
- Demonstrates how consumer-facing apps can adopt FHE without sacrificing UX: wallet connects, RainbowKit, and a relayer-powered encryption path are built in.

## Advantages
- End-to-end encryption: selections use `externalEuint8`, stakes use `euint64`, and on-chain totals stay encrypted until the user decrypts them.
- Minimal leakage: view functions never rely on `msg.sender`; only handles and ciphertexts are exposed.
- Typed and tested: TypeChain bindings, Hardhat tasks, mock FHEVM unit tests, and Sepolia integration coverage.
- Frontend best practices: viem for reads, ethers for writes, RainbowKit for wallet UX, Zama Relayer SDK for encryption/decryption, and plain CSS (no Tailwind, no frontend environment variables).

## Architecture & Tech Stack
- **Smart contract**: `contracts/FHEPredictionMarket.sol` built on Zama FHEVM (`@fhevm/solidity`) with encrypted pools and bet storage.
- **Hardhat**: `hardhat-deploy`, TypeScript, TypeChain (ethers v6), gas reporter, Solidity coverage, and custom tasks under `tasks/`.
- **Deployment artifacts**: ABIs and addresses emitted to `deployments/<network>/FHEPredictionMarket.json`; the frontend must reuse these ABIs.
- **Frontend**: React + Vite + TypeScript in `ui/`, viem for reads, ethers for writes, RainbowKit/wagmi for wallet connections, `@zama-fhe/relayer-sdk` for encryption/decryption. No environment variables are used on the frontend; configuration lives in `ui/src/config/contracts.ts`.
- **Docs**: Zama references live in `docs/zama_llm.md` and `docs/zama_doc_relayer.md`.

## How It Works
- `createPrediction(name, options)`: Validates 2–4 non-empty options, initializes encrypted zero totals (publicly decryptable and contract-authorized), stores metadata, and emits `PredictionCreated`.
- `placeEncryptedBet(predictionId, encryptedSelection, inputProof)`: Accepts ETH, validates encrypted selection, encrypts the stake, updates encrypted per-option totals and the pool, records a per-user bet, and emits `BetPlaced`.
- Reads: `listPredictions`, `getPredictionMetadata`, `getEncryptedTotals`, `getUserBet`, and `getPredictionCount` expose metadata and ciphertext handles without leaking plaintext.
- Frontend flow: create or pick a market, encrypt the selection via the Zama relayer (Sepolia config), submit the transaction with ethers, read encrypted handles with viem, and decrypt totals or the connected user’s bet locally after signing the relayer EIP-712 payload.

## Repository Layout
- `contracts/` – FHEPredictionMarket Solidity contract.
- `deploy/` – Hardhat deployment scripts.
- `deployments/` – Network artifacts and ABIs (copy these into the frontend).
- `tasks/` – CLI helpers for creating/listing predictions, placing bets, and decrypting totals.
- `test/` – Mock FHEVM unit tests and Sepolia integration test.
- `ui/` – Vite/React frontend (no Tailwind, no env vars) using viem + ethers + RainbowKit.
- `docs/` – Zama protocol and relayer guidance.

## Requirements
- Node.js 20+
- npm (project uses npm scripts; package managers are already locked by `package-lock.json`)
- A funded Sepolia account for live deployment

## Installation
```bash
# Backend / contracts
npm install

# Frontend
cd ui
npm install
```

## Environment Setup (Hardhat)
Create a `.env` file in the project root:
```
INFURA_API_KEY=your_infura_key
PRIVATE_KEY=your_sepolia_private_key   # use a single private key, not a mnemonic
ETHERSCAN_API_KEY=optional_for_verification
REPORT_GAS=true_or_false
```
The config already loads dotenv (`import * as dotenv from "dotenv"; dotenv.config();`) and uses `process.env.INFURA_API_KEY` and `process.env.PRIVATE_KEY`. Do not use a mnemonic for deployments.

## Build, Lint, and Test
- Compile: `npm run compile`
- Tests (mock FHEVM): `npm test`
- Sepolia test (requires a deployed contract): `npm run test:sepolia`
- Coverage: `npm run coverage`
- Lint: `npm run lint`

## Local Development
```bash
# Start a local FHEVM-ready node
npm run chain

# Deploy to the local network
npm run deploy:localhost
```
Use the Hardhat tasks for quick checks:
- `npx hardhat task:prediction-address --network localhost`
- `npx hardhat task:create-prediction --name "Match" --options "Team A,Team B" --network localhost`
- `npx hardhat task:list-predictions --network localhost`
- `npx hardhat task:place-bet --prediction 1 --choice 0 --eth 0.1 --network localhost`
- `npx hardhat task:decrypt-totals --prediction 1 --network localhost`

## Sepolia Deployment
1. Ensure `INFURA_API_KEY` and `PRIVATE_KEY` are set in `.env` (private key only).
2. Deploy: `npm run deploy:sepolia`
3. (Optional) Verify: `npm run verify:sepolia`
4. Copy the deployed address and ABI from `deployments/sepolia/FHEPredictionMarket.json` into `ui/src/config/contracts.ts`. The frontend must use the generated ABI and a non-zero contract address.

## Frontend Usage
1. Update `ui/src/config/contracts.ts` with the Sepolia contract address and ABI from `deployments/sepolia/FHEPredictionMarket.json`.
2. From `ui/`, start the app: `npm run dev`
3. Connect a wallet via RainbowKit, switch to Sepolia, and:
   - Create a prediction (2–4 outcomes).
   - Browse markets, pick an option, and place an encrypted bet with ETH.
   - Decrypt pool totals or your own bet using the built-in Zama relayer flow.
The frontend does not rely on environment variables or localhost networks.

## Future Work
- Add market resolution and payouts with FHE-protected settlement logic.
- Extend relayer support for multi-chain or L2 networks.
- Introduce historical analytics and notifications (without exposing plaintext data).
- Further gas optimizations and formal verification on the contract.

## Resources
- Zama contract guide: `docs/zama_llm.md`
- Zama relayer guide: `docs/zama_doc_relayer.md`
- FHEVM docs: https://docs.zama.ai

## License
BSD-3-Clause-Clear. See `LICENSE` for full terms.
