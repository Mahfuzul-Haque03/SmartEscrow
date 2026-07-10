const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function main() {
  const [client, freelancer, approver1, approver2, approver3, approver4] = await hre.ethers.getSigners();

  const descriptions = [
    "Milestone 1: UI prototype and basic user flow",
    "Milestone 2: Backend smart contract integration",
    "Milestone 3: Final testing and deployment documentation",
  ];

  const approvers = [
    approver1.address,
    approver2.address,
    approver3.address,
    approver4.address,
  ];

  const Escrow = await hre.ethers.getContractFactory("SmartEscrow");
  const escrow = await Escrow.connect(client).deploy(
    freelancer.address,
    approvers,
    descriptions,
    { value: hre.ethers.parseEther("48") }
  );

  await escrow.waitForDeployment();
  const address = await escrow.getAddress();

  const artifact = await hre.artifacts.readArtifact("SmartEscrow");
  const contractInfo = {
    address,
    abi: artifact.abi,
    network: hre.network.name,
    chainId: hre.network.config.chainId || 31337,
    deployedAt: new Date().toISOString(),
  };

  const frontendSrc = path.join(__dirname, "..", "frontend", "src");
  fs.mkdirSync(frontendSrc, { recursive: true });
  fs.writeFileSync(
    path.join(frontendSrc, "contractInfo.json"),
    JSON.stringify(contractInfo, null, 2)
  );

  console.log("\nSmartEscrow Version 3.0.1 deployed to:", address);
  console.log("\nRoles");
  console.log("Client:      ", client.address);
  console.log("Freelancer:  ", freelancer.address);
  console.log("Approver 1:  ", approver1.address);
  console.log("Approver 2:  ", approver2.address);
  console.log("Approver 3:  ", approver3.address);
  console.log("Approver 4:  ", approver4.address);

  console.log("\nEconomic parameters");
  console.log("Each local Hardhat account starts with: 100 ETH");
  console.log("Client escrow locked at deployment:   48 ETH");
  console.log("Freelancer reserve needed:            9 ETH");
  console.log("Approver stake needed per approver:   5 ETH");
  console.log("Freelancer payment per milestone:     10 ETH");
  console.log("Approver reward per approved milestone: 3 ETH (2 client + 1 freelancer)");

  console.log("\nByzantine committee");
  console.log("n = 4 approvers, f = 1 tolerated Byzantine/faulty approver, threshold = 3 approvals");

  console.log("\nFrontend updated:", path.join(frontendSrc, "contractInfo.json"));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
