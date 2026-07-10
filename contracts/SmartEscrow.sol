// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title SmartEscrow
 * @notice Version 3.0.1. Milestone escrow with an application-layer Byzantine-resilient approval committee.
 *
 * Byzantine idea used here:
 * - n = 4 approvers
 * - f = 1 Byzantine/faulty approver tolerated
 * - approval threshold = 2f + 1 = 3 approvals
 * - n >= 3f + 1 = 4 approvers
 *
 * This is not a replacement for Ethereum consensus. Ethereum provides the underlying PoS consensus.
 * This contract adds a Byzantine-resilient decision rule at the application layer before releasing escrow funds.
 */
contract SmartEscrow {
    string public constant PROJECT_NAME = "SmartEscrow";
    string public constant PROJECT_VERSION = "3.0.1";

    uint256 public constant MILESTONE_COUNT = 3;
    uint256 public constant APPROVER_COUNT = 4;
    uint256 public constant FAULT_TOLERANCE_F = 1;
    uint256 public constant APPROVAL_THRESHOLD = 3; // 2f + 1

    uint256 public constant MILESTONE_PAYMENT = 10 ether;
    uint256 public constant APPROVER_STAKE = 5 ether;
    uint256 public constant CLIENT_REWARD_PER_APPROVER = 2 ether;
    uint256 public constant FREELANCER_REWARD_PER_APPROVER = 1 ether;

    uint256 public constant TOTAL_CLIENT_ESCROW =
        MILESTONE_COUNT * (MILESTONE_PAYMENT + (APPROVAL_THRESHOLD * CLIENT_REWARD_PER_APPROVER));
    uint256 public constant TOTAL_FREELANCER_REWARD_RESERVE =
        MILESTONE_COUNT * APPROVAL_THRESHOLD * FREELANCER_REWARD_PER_APPROVER;

    enum MilestoneStatus {
        NotSubmitted,
        Submitted,
        Disputed,
        Resubmitted,
        Paid
    }

    struct Milestone {
        string description;
        string proofURI;
        string responseURI;
        MilestoneStatus status;
        uint256 approvalCount;
        uint256 disputeCount;
        bool paid;
        uint256 submittedAt;
        uint256 paidAt;
    }

    address public immutable client;
    address public immutable freelancer;

    address[] private approvers;
    mapping(address => bool) public isApproverCandidate;
    mapping(address => bool) public hasStaked;
    mapping(address => uint256) public approverRewardBalance;
    mapping(address => bool) public stakeAndRewardClaimed;

    uint256 public stakedApproverCount;
    bool public freelancerReserveDeposited;

    Milestone[MILESTONE_COUNT] private milestones;

    mapping(uint256 => mapping(address => bool)) private approvals;
    mapping(uint256 => mapping(address => bool)) private disputes;
    mapping(uint256 => mapping(address => string)) private disputeMessages;

    bool private locked;

    event ApproverStaked(address indexed approver, uint256 amount);
    event FreelancerRewardReserveDeposited(address indexed freelancer, uint256 amount);
    event MilestoneSubmitted(uint256 indexed milestoneId, string proofURI);
    event MilestoneApproved(uint256 indexed milestoneId, address indexed approver, uint256 approvalCount);
    event MilestoneDisputed(uint256 indexed milestoneId, address indexed approver, string message);
    event MilestoneResubmitted(uint256 indexed milestoneId, string responseURI, string newProofURI);
    event MilestonePaid(uint256 indexed milestoneId, address indexed freelancer, uint256 freelancerPayment);
    event ApproverRewardCredited(uint256 indexed milestoneId, address indexed approver, uint256 rewardAmount);
    event ApproverClaimed(address indexed approver, uint256 totalAmount);

    modifier onlyClient() {
        require(msg.sender == client, "Only client");
        _;
    }

    modifier onlyFreelancer() {
        require(msg.sender == freelancer, "Only freelancer");
        _;
    }

    modifier onlyApproverCandidate() {
        require(isApproverCandidate[msg.sender], "Only listed approver candidate");
        _;
    }

    modifier onlyStakedApprover() {
        require(hasStaked[msg.sender], "Only staked approver");
        _;
    }

    modifier projectReadyOnly() {
        require(projectReady(), "Project not ready: all approvers must stake and freelancer must deposit reserve");
        _;
    }

    modifier milestoneExists(uint256 milestoneId) {
        require(milestoneId < MILESTONE_COUNT, "Invalid milestone");
        _;
    }

    modifier nonReentrant() {
        require(!locked, "Reentrant call");
        locked = true;
        _;
        locked = false;
    }

    constructor(
        address _freelancer,
        address[APPROVER_COUNT] memory _approvers,
        string[MILESTONE_COUNT] memory _descriptions
    ) payable {
        require(_freelancer != address(0), "Invalid freelancer");
        require(msg.value == TOTAL_CLIENT_ESCROW, "Client must fund exact escrow amount");

        client = msg.sender;
        freelancer = _freelancer;

        for (uint256 i = 0; i < APPROVER_COUNT; i++) {
            address approver = _approvers[i];
            require(approver != address(0), "Invalid approver");
            require(approver != client, "Client cannot be approver");
            require(approver != freelancer, "Freelancer cannot be approver");
            require(!isApproverCandidate[approver], "Duplicate approver");

            isApproverCandidate[approver] = true;
            approvers.push(approver);
        }

        for (uint256 j = 0; j < MILESTONE_COUNT; j++) {
            milestones[j].description = _descriptions[j];
            milestones[j].status = MilestoneStatus.NotSubmitted;
        }
    }

    /**
     * @notice Approvers must stake 5 ETH before they can vote. This makes approval economically accountable.
     */
    function stakeAsApprover() external payable onlyApproverCandidate {
        require(!hasStaked[msg.sender], "Already staked");
        require(msg.value == APPROVER_STAKE, "Stake must be exactly 5 ETH");

        hasStaked[msg.sender] = true;
        stakedApproverCount += 1;

        emit ApproverStaked(msg.sender, msg.value);
    }

    /**
     * @notice Freelancer deposits the 1 ETH-per-approver reward reserve.
     * For each paid milestone, each approving approver receives 1 ETH from this reserve.
     */
    function depositFreelancerRewardReserve() external payable onlyFreelancer {
        require(!freelancerReserveDeposited, "Reserve already deposited");
        require(msg.value == TOTAL_FREELANCER_REWARD_RESERVE, "Reserve must be exactly 9 ETH");

        freelancerReserveDeposited = true;

        emit FreelancerRewardReserveDeposited(msg.sender, msg.value);
    }

    function submitMilestone(uint256 milestoneId, string calldata proofURI)
        external
        onlyFreelancer
        projectReadyOnly
        milestoneExists(milestoneId)
    {
        Milestone storage m = milestones[milestoneId];
        require(bytes(proofURI).length > 0, "Proof required");
        require(m.status == MilestoneStatus.NotSubmitted, "Use resubmit for disputed work");
        if (milestoneId > 0) {
            require(milestones[milestoneId - 1].paid, "Previous milestone must be paid first");
        }

        m.proofURI = proofURI;
        m.status = MilestoneStatus.Submitted;
        m.submittedAt = block.timestamp;

        emit MilestoneSubmitted(milestoneId, proofURI);
    }

    function approveMilestone(uint256 milestoneId)
        external
        onlyStakedApprover
        projectReadyOnly
        milestoneExists(milestoneId)
    {
        Milestone storage m = milestones[milestoneId];
        require(m.status == MilestoneStatus.Submitted || m.status == MilestoneStatus.Resubmitted, "Milestone not under review");
        require(!approvals[milestoneId][msg.sender], "Already approved this round");
        require(!disputes[milestoneId][msg.sender], "Already disputed this round");

        approvals[milestoneId][msg.sender] = true;
        m.approvalCount += 1;

        emit MilestoneApproved(milestoneId, msg.sender, m.approvalCount);

        if (m.approvalCount >= APPROVAL_THRESHOLD) {
            _releaseMilestone(milestoneId);
        }
    }

    function raiseDispute(uint256 milestoneId, string calldata message)
        external
        onlyStakedApprover
        projectReadyOnly
        milestoneExists(milestoneId)
    {
        Milestone storage m = milestones[milestoneId];
        require(m.status == MilestoneStatus.Submitted || m.status == MilestoneStatus.Resubmitted, "Milestone not under review");
        require(bytes(message).length > 0, "Dispute message required");
        require(!approvals[milestoneId][msg.sender], "Already approved this round");
        require(!disputes[milestoneId][msg.sender], "Already disputed this round");

        disputes[milestoneId][msg.sender] = true;
        disputeMessages[milestoneId][msg.sender] = message;
        m.disputeCount += 1;
        m.status = MilestoneStatus.Disputed;

        emit MilestoneDisputed(milestoneId, msg.sender, message);
    }

    function respondAndResubmit(
        uint256 milestoneId,
        string calldata responseURI,
        string calldata newProofURI
    ) external onlyFreelancer projectReadyOnly milestoneExists(milestoneId) {
        Milestone storage m = milestones[milestoneId];
        require(m.status == MilestoneStatus.Disputed, "Milestone is not disputed");
        require(bytes(responseURI).length > 0, "Response required");
        require(bytes(newProofURI).length > 0, "New proof required");

        _clearRoundVotes(milestoneId);

        m.responseURI = responseURI;
        m.proofURI = newProofURI;
        m.status = MilestoneStatus.Resubmitted;
        m.submittedAt = block.timestamp;

        emit MilestoneResubmitted(milestoneId, responseURI, newProofURI);
    }

    function claimApproverRewardsAndStake() external onlyStakedApprover nonReentrant {
        require(allMilestonesPaid(), "Job is not finished yet");
        require(!stakeAndRewardClaimed[msg.sender], "Already claimed");

        uint256 amount = APPROVER_STAKE + approverRewardBalance[msg.sender];
        stakeAndRewardClaimed[msg.sender] = true;
        approverRewardBalance[msg.sender] = 0;

        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        require(ok, "Claim transfer failed");

        emit ApproverClaimed(msg.sender, amount);
    }

    function _releaseMilestone(uint256 milestoneId) internal nonReentrant {
        Milestone storage m = milestones[milestoneId];
        require(!m.paid, "Already paid");

        m.status = MilestoneStatus.Paid;
        m.paid = true;
        m.paidAt = block.timestamp;

        for (uint256 i = 0; i < approvers.length; i++) {
            address approver = approvers[i];
            if (approvals[milestoneId][approver]) {
                uint256 reward = CLIENT_REWARD_PER_APPROVER + FREELANCER_REWARD_PER_APPROVER;
                approverRewardBalance[approver] += reward;
                emit ApproverRewardCredited(milestoneId, approver, reward);
            }
        }

        (bool ok, ) = payable(freelancer).call{value: MILESTONE_PAYMENT}("");
        require(ok, "Freelancer payment failed");

        emit MilestonePaid(milestoneId, freelancer, MILESTONE_PAYMENT);
    }

    function _clearRoundVotes(uint256 milestoneId) internal {
        Milestone storage m = milestones[milestoneId];
        for (uint256 i = 0; i < approvers.length; i++) {
            address approver = approvers[i];
            approvals[milestoneId][approver] = false;
            disputes[milestoneId][approver] = false;
            disputeMessages[milestoneId][approver] = "";
        }
        m.approvalCount = 0;
        m.disputeCount = 0;
    }

    function projectReady() public view returns (bool) {
        return stakedApproverCount == APPROVER_COUNT && freelancerReserveDeposited;
    }

    function allMilestonesPaid() public view returns (bool) {
        for (uint256 i = 0; i < MILESTONE_COUNT; i++) {
            if (!milestones[i].paid) {
                return false;
            }
        }
        return true;
    }

    function getApprovers() external view returns (address[] memory) {
        return approvers;
    }

    function getMilestone(uint256 milestoneId)
        external
        view
        milestoneExists(milestoneId)
        returns (
            string memory description,
            string memory proofURI,
            string memory responseURI,
            MilestoneStatus status,
            uint256 approvalCount,
            uint256 disputeCount,
            bool paid,
            uint256 submittedAt,
            uint256 paidAt
        )
    {
        Milestone storage m = milestones[milestoneId];
        return (
            m.description,
            m.proofURI,
            m.responseURI,
            m.status,
            m.approvalCount,
            m.disputeCount,
            m.paid,
            m.submittedAt,
            m.paidAt
        );
    }

    function hasApproved(uint256 milestoneId, address approver) external view milestoneExists(milestoneId) returns (bool) {
        return approvals[milestoneId][approver];
    }

    function hasDisputed(uint256 milestoneId, address approver) external view milestoneExists(milestoneId) returns (bool) {
        return disputes[milestoneId][approver];
    }

    function getDisputeMessage(uint256 milestoneId, address approver)
        external
        view
        milestoneExists(milestoneId)
        returns (string memory)
    {
        return disputeMessages[milestoneId][approver];
    }

    function getRole(address account) external view returns (string memory) {
        if (account == client) return "Client";
        if (account == freelancer) return "Freelancer";
        if (isApproverCandidate[account]) {
            if (hasStaked[account]) return "Staked Approver";
            return "Approver Candidate";
        }
        return "Unknown";
    }

    function getContractBalance() external view returns (uint256) {
        return address(this).balance;
    }
}
