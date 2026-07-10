const { expect } = require("chai");
const { ethers } = require("hardhat");

const parse = ethers.parseEther;
const Status = {
  NotSubmitted: 0n,
  Submitted: 1n,
  Disputed: 2n,
  Resubmitted: 3n,
  Paid: 4n,
};

async function deployFixture() {
  const [client, freelancer, approver1, approver2, approver3, approver4, outsider] = await ethers.getSigners();
  const descriptions = ["M1", "M2", "M3"];
  const approvers = [approver1.address, approver2.address, approver3.address, approver4.address];

  const Escrow = await ethers.getContractFactory("SmartEscrow");
  const escrow = await Escrow.connect(client).deploy(freelancer.address, approvers, descriptions, {
    value: parse("48"),
  });
  await escrow.waitForDeployment();

  return { escrow, client, freelancer, approver1, approver2, approver3, approver4, outsider };
}

async function activateProject(escrow, freelancer, approvers) {
  for (const approver of approvers) {
    await escrow.connect(approver).stakeAsApprover({ value: parse("5") });
  }
  await escrow.connect(freelancer).depositFreelancerRewardReserve({ value: parse("9") });
}

describe("SmartEscrow", function () {
  it("deploys with 4 approvers, 3-of-4 threshold, and 48 ETH client escrow", async function () {
    const { escrow, client, freelancer } = await deployFixture();

    expect(await escrow.client()).to.equal(client.address);
    expect(await escrow.freelancer()).to.equal(freelancer.address);
    expect(await escrow.APPROVER_COUNT()).to.equal(4n);
    expect(await escrow.FAULT_TOLERANCE_F()).to.equal(1n);
    expect(await escrow.APPROVAL_THRESHOLD()).to.equal(3n);
    expect(await escrow.getContractBalance()).to.equal(parse("48"));
  });

  it("requires all approvers to stake and the freelancer to deposit reserve before work starts", async function () {
    const { escrow, freelancer, approver1, approver2, approver3, approver4 } = await deployFixture();

    await expect(
      escrow.connect(freelancer).submitMilestone(0, "ipfs://first-proof")
    ).to.be.revertedWith("Project not ready: all approvers must stake and freelancer must deposit reserve");

    await activateProject(escrow, freelancer, [approver1, approver2, approver3, approver4]);
    expect(await escrow.projectReady()).to.equal(true);
  });

  it("releases milestone payment after 3-of-4 Byzantine threshold approvals", async function () {
    const { escrow, freelancer, approver1, approver2, approver3, approver4 } = await deployFixture();
    await activateProject(escrow, freelancer, [approver1, approver2, approver3, approver4]);

    await escrow.connect(freelancer).submitMilestone(0, "ipfs://m1-proof");
    await escrow.connect(approver1).approveMilestone(0);
    await escrow.connect(approver2).approveMilestone(0);

    let m = await escrow.getMilestone(0);
    expect(m.status).to.equal(Status.Submitted);
    expect(m.approvalCount).to.equal(2n);

    await expect(() => escrow.connect(approver3).approveMilestone(0)).to.changeEtherBalance(
      freelancer,
      parse("10")
    );

    m = await escrow.getMilestone(0);
    expect(m.status).to.equal(Status.Paid);
    expect(m.paid).to.equal(true);
    expect(await escrow.approverRewardBalance(approver1.address)).to.equal(parse("3"));
    expect(await escrow.approverRewardBalance(approver2.address)).to.equal(parse("3"));
    expect(await escrow.approverRewardBalance(approver3.address)).to.equal(parse("3"));
    expect(await escrow.approverRewardBalance(approver4.address)).to.equal(0n);
  });

  it("supports dispute messages and freelancer resubmission", async function () {
    const { escrow, freelancer, approver1, approver2, approver3, approver4 } = await deployFixture();
    await activateProject(escrow, freelancer, [approver1, approver2, approver3, approver4]);

    await escrow.connect(freelancer).submitMilestone(0, "ipfs://bad-proof");
    await escrow.connect(approver1).raiseDispute(0, "Missing test evidence");

    let m = await escrow.getMilestone(0);
    expect(m.status).to.equal(Status.Disputed);
    expect(await escrow.getDisputeMessage(0, approver1.address)).to.equal("Missing test evidence");

    await escrow.connect(freelancer).respondAndResubmit(
      0,
      "Added missing test evidence",
      "ipfs://fixed-proof"
    );

    m = await escrow.getMilestone(0);
    expect(m.status).to.equal(Status.Resubmitted);
    expect(m.proofURI).to.equal("ipfs://fixed-proof");
    expect(m.responseURI).to.equal("Added missing test evidence");
    expect(m.approvalCount).to.equal(0n);
    expect(m.disputeCount).to.equal(0n);
  });

  it("lets approvers claim stake plus earned rewards only after all milestones are paid", async function () {
    const { escrow, freelancer, approver1, approver2, approver3, approver4 } = await deployFixture();
    await activateProject(escrow, freelancer, [approver1, approver2, approver3, approver4]);

    for (let i = 0; i < 3; i++) {
      await escrow.connect(freelancer).submitMilestone(i, `ipfs://m${i + 1}`);
      await escrow.connect(approver1).approveMilestone(i);
      await escrow.connect(approver2).approveMilestone(i);
      await escrow.connect(approver3).approveMilestone(i);
    }

    expect(await escrow.allMilestonesPaid()).to.equal(true);
    expect(await escrow.approverRewardBalance(approver1.address)).to.equal(parse("9"));

    await expect(() => escrow.connect(approver1).claimApproverRewardsAndStake()).to.changeEtherBalance(
      approver1,
      parse("14")
    );
  });
});
