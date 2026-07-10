# SmartEscrow: Milestone-Based Escrow with Multi-Party Approval

SmartEscrow is an Ethereum-based decentralized escrow application that locks client funds inside a smart contract and releases milestone payments to a freelancer only after approval from multiple authorized approvers. The project demonstrates conditional fund transfer, role-based access control, milestone submission, multi-party approval, and automatic payment release using Solidity, Hardhat, React, MetaMask, and ethers.js.

## Project Overview

In traditional freelance or service-based work, clients and freelancers often depend on trust or third-party platforms to manage payments. This project replaces that trusted middleman with an Ethereum smart contract.

The workflow is:

```text
Client
  ↓ deposits ETH
Smart Contract
  ↓ locks funds
Freelancer
  ↓ submits milestone
Approvers
  ↓ verify and approve
Approval threshold met?
  ↓ yes
Payment released automatically
```

The system supports:

* Client-funded escrow
* Multiple project milestones
* Freelancer milestone submission
* Multi-party milestone approval
* Automatic payment release
* Dispute support
* Refund support
* Local blockchain testing using Hardhat
* Browser-based frontend using React and MetaMask

## Technology Stack

### Blockchain / Smart Contract

* Ethereum
* Solidity
* Hardhat
* OpenZeppelin

### Frontend

* React
* Vite
* ethers.js
* MetaMask

### Testing

* Hardhat Network
* Mocha
* Chai

### Runtime

* Node.js
* npm

## Project Structure

```text
smartescrow/
├── contracts/
│   └── MilestoneEscrow.sol
│
├── scripts/
│   └── deploy.js
│
├── test/
│   └── MilestoneEscrow.test.js
│
├── frontend/
│   ├── index.html
│   ├── package.json
│   └── src/
│       ├── App.jsx
│       ├── main.jsx
│       └── style.css
│
├── hardhat.config.js
├── package.json
├── .env.example
└── README.md
```

## Roles in the System

The project uses five main local accounts:

| Role       | Description                                          |
| ---------- | ---------------------------------------------------- |
| Client     | Deploys/funds the contract and locks ETH into escrow |
| Freelancer | Submits milestone completion proof                   |
| Approver 1 | Reviews and approves milestone                       |
| Approver 2 | Reviews and approves milestone                       |
| Approver 3 | Reviews and approves milestone                       |

The default approval threshold is usually set to `2 out of 3` approvers. This means a milestone payment is released only after at least two approvers approve it.

## Required Software

To run this project locally, install the following:

### 1. Node.js LTS

Download and install Node.js LTS from:

```text
https://nodejs.org
```

After installation, check:

```bash
node -v
npm -v
```

### 2. Git

Optional but recommended for cloning/uploading the project.

```text
https://git-scm.com
```

### 3. VS Code

Recommended code editor.

```text
https://code.visualstudio.com
```

### 4. MetaMask Browser Extension

Required for interacting with the frontend.

Install MetaMask in Chrome, Edge, Brave, or Firefox.

```text
https://metamask.io
```

MetaMask is used only as a local wallet for signing transactions during the demo.

## Installing the Project

Clone the repository:

```bash
git clone https://github.com/rahat1752/SmartEscrow
cd smartescrow
```

Install backend dependencies:

```bash
npm install
```

Install frontend dependencies:

```bash
cd frontend
npm install
cd ..
```

## Compile the Smart Contract

From the root project folder:

```bash
npm run compile
```

or:

```bash
npx hardhat compile
```

## Run Smart Contract Tests

From the root project folder:

```bash
npm test
```

or:

```bash
npx hardhat test
```

This runs automated tests for deployment, milestone submission, approval, payment release, dispute handling, and refund logic.

## Running the Project Locally

You need three terminals.

## Terminal 1: Start Local Hardhat Blockchain

From the root project folder:

```bash
npm run node
```

This starts a local Ethereum blockchain at:

```text
http://127.0.0.1:8545
```

Hardhat will show several fake accounts with 10000 test ETH each.

Keep this terminal open.

## Terminal 2: Deploy the Smart Contract Locally

From the root project folder:

```bash
npm run deploy:local
```

You should see output similar to:

```text
MilestoneEscrow deployed to: 0x5FbDB2315678afecb367f032d93F642f64180aa3
Client: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
Freelancer: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8
Approver 1: 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC
Approver 2: 0x90F79bf6EB2c4f870365E785982E1f101E93b906
Approver 3: 0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65
Total locked ETH: 0.03
```

Copy the deployed contract address.

If the frontend does not already use this address, update it in:

```text
frontend/src/App.jsx
```

Find:

```javascript
const CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
```

Replace it with the address printed by the deployment script.

## Terminal 3: Start the React Frontend

From the root project folder:

```bash
cd frontend
npm run dev
```

Open the local frontend URL shown in the terminal. Usually:

```text
http://localhost:5173
```

## Setting Up MetaMask for Local Hardhat

Open MetaMask and add a custom network.

Use these settings:

```text
Network Name: Hardhat Local
RPC URL: http://127.0.0.1:8545
Chain ID: 31337
Currency Symbol: ETH
Block Explorer URL: leave blank
```

If `127.0.0.1` does not work, try:

```text
http://localhost:8545
```

## Import Hardhat Test Accounts into MetaMask

Import the fake Hardhat private keys shown in the Hardhat terminal.

Default Hardhat accounts:

### Client

```text
Address:
0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

Private Key:
0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

### Freelancer

```text
Address:
0x70997970C51812dc3A010C7d01b50e0d17dc79C8

Private Key:
0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
```

### Approver 1

```text
Address:
0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC

Private Key:
0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a
```

### Approver 2

```text
Address:
0x90F79bf6EB2c4f870365E785982E1f101E93b906

Private Key:
0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6
```

### Approver 3

```text
Address:
0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65

Private Key:
0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a
```

Important: these are public Hardhat development accounts. They are safe only for local testing. Never use them on Ethereum mainnet or with real funds.

## Local Demo Workflow

After starting the Hardhat node, deploying the contract, and opening the frontend:

### Step 1: Connect Wallet

In MetaMask, select the `Hardhat Local` network.

Open the frontend:

```text
http://localhost:5173
```

Click:

```text
Connect MetaMask
```

### Step 2: Submit Milestone as Freelancer

Switch MetaMask account to the Freelancer account:

```text
0x70997970C51812dc3A010C7d01b50e0d17dc79C8
```

In the frontend:

```text
Select Milestone 0
Enter proof link or keep default proof
Click Submit Milestone
Confirm transaction in MetaMask
```

### Step 3: Approve as Approver 1

Switch MetaMask account to Approver 1:

```text
0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC
```

Click:

```text
Approve Milestone
```

Confirm the transaction in MetaMask.

### Step 4: Approve as Approver 2

Switch MetaMask account to Approver 2:

```text
0x90F79bf6EB2c4f870365E785982E1f101E93b906
```

Click:

```text
Approve Milestone
```

Confirm the transaction in MetaMask.

### Step 5: Payment Release

After the second approval, the approval threshold is met. The smart contract automatically releases the milestone payment to the freelancer.

For example:

```text
Contract balance before approval: 0.03 ETH
Milestone 0 payment: 0.01 ETH
Contract balance after payment: 0.02 ETH
```

This demonstrates conditional fund transfer using Ethereum smart contracts.

## Important Notes

If you restart the Hardhat blockchain using:

```bash
npm run node
```

the local blockchain resets. You must deploy the contract again:

```bash
npm run deploy:local
```

Then confirm the contract address in the frontend matches the latest deployed contract address.

If the frontend cannot load contract data, check:

```text
1. Hardhat node is still running.
2. MetaMask is connected to Hardhat Local.
3. Contract address in frontend/src/App.jsx is correct.
4. You imported the correct Hardhat accounts.
5. You are using the correct role account for each action.
```

## Useful Commands

### Install dependencies

```bash
npm install
cd frontend
npm install
cd ..
```

### Compile contract

```bash
npm run compile
```

### Run tests

```bash
npm test
```

### Start local blockchain

```bash
npm run node
```

### Deploy locally

```bash
npm run deploy:local
```

### Start frontend

```bash
cd frontend
npm run dev
```

This project demonstrates:

* Role-based access control
* Approval threshold enforcement
* Prevention of duplicate approvals
* Escrowed fund locking
* Automatic payment release
* Reentrancy protection
* Dispute and refund logic

