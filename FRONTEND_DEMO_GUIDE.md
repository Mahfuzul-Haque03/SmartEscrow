# SmartEscrow Local Frontend Demo Guide

This frontend is a simple React + ethers.js dashboard for demonstrating the MilestoneEscrow smart contract on a local Hardhat blockchain.

## Tools

- Solidity smart contract: `contracts/MilestoneEscrow.sol`
- Local Ethereum network: Hardhat
- Browser wallet: MetaMask
- Frontend: React + Vite
- Ethereum JS library: ethers.js

## Run the local demo

### Terminal 1: start local blockchain

```powershell
npm run node
```

Keep this terminal open.

### Terminal 2: deploy the contract

```powershell
npm run deploy:local
```

Copy the contract address from the output. If this is the first deployment after starting Hardhat, it is usually:

```text
0x5FbDB2315678afecb367f032d93F642f64180aa3
```

### MetaMask local network

Add a custom network:

```text
Network Name: Hardhat Local
RPC URL: http://127.0.0.1:8545
Chain ID: 31337
Currency Symbol: ETH
```

### Import Hardhat test accounts into MetaMask

Use these local private keys only for this demo.

Client:
```text
0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

Freelancer:
```text
0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
```

Approver 1:
```text
0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a
```

Approver 2:
```text
0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6
```

Approver 3:
```text
0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a
```

### Terminal 3: run frontend

```powershell
cd frontend
npm install
npm run dev
```

Open the Vite URL, usually:

```text
http://localhost:5173
```

## Demo flow

1. Select the Freelancer account in MetaMask.
2. Click **Connect MetaMask**.
3. Click **Refresh Contract Data**.
4. Submit milestone `0` with a proof link.
5. Switch MetaMask to Approver 1.
6. Click **Approve Milestone**.
7. Switch MetaMask to Approver 2.
8. Click **Approve Milestone** again.
9. Refresh the page/status.
10. Milestone 0 should become `Paid`, and the locked contract balance should decrease.

## Important notes

- Restarting `npm run node` resets the local blockchain.
- After a reset, deploy again with `npm run deploy:local`.
- If the deployed contract address changes, paste the new address into the frontend.
- Do not use Hardhat private keys with real ETH or mainnet.
