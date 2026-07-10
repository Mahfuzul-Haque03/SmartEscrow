import { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import contractInfo from "./contractInfo.json";

const STATUS_LABELS = ["Not Submitted", "Submitted", "Disputed", "Resubmitted", "Paid"];
const ZERO = "0x0000000000000000000000000000000000000000";
const MILESTONE_COUNT = 3;
const DEBUG_LOG_KEY = "smartescrow.walletDebugLog";

function short(addr) {
  if (!addr) return "";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function same(a, b) {
  return (a || "").toLowerCase() === (b || "").toLowerCase();
}

function formatEth(value) {
  try {
    return Number(ethers.formatEther(value || 0n)).toFixed(4);
  } catch {
    return "0.0000";
  }
}

function asInt(value) {
  return Number(value ?? 0n);
}

function milestoneLabel(id) {
  return `Milestone ${id + 1}`;
}

function isReviewable(m) {
  return m.status === 1 || m.status === 3;
}

export default function App() {
  const [page, setPage] = useState("dashboard");
  const [provider, setProvider] = useState(null);
  const [account, setAccount] = useState("");
  const [contract, setContract] = useState(null);
  const [readContract, setReadContract] = useState(null);
  const [role, setRole] = useState("Not connected");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState(null);
  const [debugLogs, setDebugLogs] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(DEBUG_LOG_KEY) || "[]");
    } catch {
      return [];
    }
  });
  const [selectedMilestone, setSelectedMilestone] = useState(0);
  const [proof, setProof] = useState("ipfs://demo-proof-or-github-link");
  const [disputeMessage, setDisputeMessage] = useState("The submitted work is incomplete. Please add test evidence.");
  const [response, setResponse] = useState("I fixed the issue and added the requested test evidence.");
  const [newProof, setNewProof] = useState("ipfs://updated-demo-proof-or-github-link");

  const contractAddress = contractInfo.address;
  const contractAbi = contractInfo.abi;

  const hasDeployment = useMemo(() => {
    return contractAddress && contractAddress !== ZERO && Array.isArray(contractAbi) && contractAbi.length > 0;
  }, [contractAddress, contractAbi]);

  function pageForRole(accountRole) {
    if (accountRole === "Freelancer") return "freelancer";
    if (accountRole === "Approver Candidate" || accountRole === "Staked Approver") return "approver";
    return "dashboard";
  }

  function addDebugLog(message, details) {
    const timestamp = new Date().toISOString();
    const detailText = details ? ` ${JSON.stringify(details)}` : "";
    const line = `[${timestamp}] ${message}${detailText}`;
    console.log("[SmartEscrow]", message, details || "");
    setDebugLogs((logs) => {
      const nextLogs = [line, ...logs].slice(0, 100);
      localStorage.setItem(DEBUG_LOG_KEY, JSON.stringify(nextLogs));
      return nextLogs;
    });
  }

  function clearDebugLogs() {
    localStorage.removeItem(DEBUG_LOG_KEY);
    setDebugLogs([]);
  }

  function downloadDebugLog() {
    const body = debugLogs.length ? debugLogs.slice().reverse().join("\n") : "No wallet debug logs yet.";
    const blob = new Blob([body], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "smartescrow-wallet-debug.log";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function connectWallet() {
    addDebugLog("Connect MetaMask clicked", {
      hasEthereum: Boolean(window.ethereum),
      hasDeployment,
      contractAddress,
    });

    try {
      if (!window.ethereum) {
        setStatus("MetaMask not found. Install MetaMask first.");
        addDebugLog("MetaMask provider missing");
        return;
      }
      if (!hasDeployment) {
        setStatus("Contract info is missing. Run npm run deploy:local first.");
        addDebugLog("Deployment info missing or invalid", {
          contractAddress,
          abiItems: Array.isArray(contractAbi) ? contractAbi.length : 0,
        });
        return;
      }

      const existingAccounts = await window.ethereum.request({ method: "eth_accounts" });
      addDebugLog("Existing connected accounts", { count: existingAccounts.length, accounts: existingAccounts });

      if (!existingAccounts.length) {
        addDebugLog("Requesting account permission from MetaMask");
        await window.ethereum.request({
          method: "wallet_requestPermissions",
          params: [{ eth_accounts: {} }],
        });
      }

      const requestedAccounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      addDebugLog("MetaMask account request completed", {
        count: requestedAccounts.length,
        accounts: requestedAccounts,
      });

      if (!requestedAccounts.length) {
        setStatus("No MetaMask account selected. Open MetaMask and connect this site to an account.");
        addDebugLog("No accounts returned from MetaMask");
        return;
      }

      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      const network = await browserProvider.getNetwork();
      addDebugLog("Detected network", { chainId: network.chainId.toString(), name: network.name });

      if (Number(network.chainId) !== 31337) {
        setStatus(`Wrong network. Please switch MetaMask to Hardhat Local / chainId 31337. Current chainId: ${network.chainId}`);
        return;
      }

      const walletSigner = await browserProvider.getSigner();
      const user = await walletSigner.getAddress();
      addDebugLog("Signer loaded", { account: user });

      const write = new ethers.Contract(contractAddress, contractAbi, walletSigner);
      const read = new ethers.Contract(contractAddress, contractAbi, browserProvider);
      addDebugLog("Contract objects created", { contractAddress });

      setProvider(browserProvider);
      setAccount(user);
      setContract(write);
      setReadContract(read);
      setStatus("Wallet connected.");
      const loadedRole = await refresh(user, browserProvider, write);
      setPage(pageForRole(loadedRole));
    } catch (e) {
      console.error("Connect wallet failed", e);
      const message = e.shortMessage || e.reason || e.message || "Unknown MetaMask connection error";
      addDebugLog("Connect wallet failed", {
        code: e.code,
        message,
      });
      if (message.toLowerCase().includes("no active wallet")) {
        setStatus("Connect failed: No active wallet found. Open MetaMask, unlock it, select an imported Hardhat account, then connect this site.");
      } else {
        setStatus(`Connect failed: ${message}`);
      }
    }
  }

  async function refresh(activeAccount = account, activeProvider = provider, activeContract = contract || readContract) {
    const c = activeContract;
    const p = activeProvider;
    if (!c || !p) return;

    try {
      const [
        projectName,
        projectVersion,
        client,
        freelancer,
        approvers,
        balance,
        projectReady,
        allPaid,
        freelancerReserveDeposited,
        stakedApproverCount,
      ] = await Promise.all([
        c.PROJECT_NAME(),
        c.PROJECT_VERSION(),
        c.client(),
        c.freelancer(),
        c.getApprovers(),
        c.getContractBalance(),
        c.projectReady(),
        c.allMilestonesPaid(),
        c.freelancerReserveDeposited(),
        c.stakedApproverCount(),
      ]);

      const constants = {
        milestonePayment: await c.MILESTONE_PAYMENT(),
        approverStake: await c.APPROVER_STAKE(),
        clientReward: await c.CLIENT_REWARD_PER_APPROVER(),
        freelancerReward: await c.FREELANCER_REWARD_PER_APPROVER(),
        freelancerReserve: await c.TOTAL_FREELANCER_REWARD_RESERVE(),
        threshold: await c.APPROVAL_THRESHOLD(),
        f: await c.FAULT_TOLERANCE_F(),
        approverCount: await c.APPROVER_COUNT(),
      };

      const accountRole = activeAccount ? await c.getRole(activeAccount) : "Not connected";
      addDebugLog("Role loaded", { account: activeAccount, role: accountRole });
      const milestones = [];
      for (let i = 0; i < MILESTONE_COUNT; i++) {
        const m = await c.getMilestone(i);
        const perApprover = [];
        for (const a of approvers) {
          const [approved, disputed, message, reward, staked, nativeBalance, claimed] = await Promise.all([
            c.hasApproved(i, a),
            c.hasDisputed(i, a),
            c.getDisputeMessage(i, a),
            c.approverRewardBalance(a),
            c.hasStaked(a),
            p.getBalance(a),
            c.stakeAndRewardClaimed(a),
          ]);
          perApprover.push({ address: a, approved, disputed, message, reward, staked, nativeBalance, claimed });
        }
        milestones.push({
          id: i,
          description: m.description,
          proofURI: m.proofURI,
          responseURI: m.responseURI,
          status: Number(m.status),
          approvalCount: Number(m.approvalCount),
          disputeCount: Number(m.disputeCount),
          paid: m.paid,
          submittedAt: Number(m.submittedAt),
          paidAt: Number(m.paidAt),
          perApprover,
        });
      }

      const balances = {
        client: await p.getBalance(client),
        freelancer: await p.getBalance(freelancer),
        connected: activeAccount ? await p.getBalance(activeAccount) : 0n,
      };

      setRole(accountRole);
      setState({
        projectName,
        projectVersion,
        client,
        freelancer,
        approvers,
        balance,
        projectReady,
        allPaid,
        freelancerReserveDeposited,
        stakedApproverCount,
        constants,
        milestones,
        balances,
      });
      setStatus("Data refreshed.");
      return accountRole;
    } catch (e) {
      console.error(e);
      setStatus(`Read error: ${e.shortMessage || e.message}`);
      return null;
    }
  }

  async function runTx(label, fn) {
    if (!contract) {
      setStatus("Connect MetaMask first.");
      return;
    }
    setBusy(true);
    setStatus(`${label}: waiting for MetaMask confirmation...`);
    addDebugLog(`${label}: starting transaction`, { account });
    try {
      const tx = await fn();
      addDebugLog(`${label}: transaction sent`, { hash: tx.hash });
      setStatus(`${label}: transaction sent ${tx.hash}. Waiting for confirmation...`);
      await tx.wait();
      addDebugLog(`${label}: transaction confirmed`, { hash: tx.hash });
      setStatus(`${label}: confirmed.`);
      await refresh();
    } catch (e) {
      console.error(e);
      const message = e.shortMessage || e.reason || e.message || "Unknown transaction error";
      addDebugLog(`${label}: transaction failed`, {
        account,
        code: e.code,
        reason: e.reason,
        message,
      });
      setStatus(`${label} failed: ${message}`);
    } finally {
      setBusy(false);
    }
  }

  async function stakeAsApprover() {
    if (!contract || !provider || !account) {
      setStatus("Connect MetaMask with an approver account first.");
      return;
    }

    const [candidate, staked, balance] = await Promise.all([
      contract.isApproverCandidate(account),
      contract.hasStaked(account),
      provider.getBalance(account),
    ]);
    addDebugLog("Stake preflight", {
      account,
      isApproverCandidate: candidate,
      hasStaked: staked,
      balanceEth: ethers.formatEther(balance),
    });

    if (!candidate) {
      setStatus("Stake failed before MetaMask: connected account is not one of the deployed approvers.");
      return;
    }
    if (staked) {
      setStatus("Stake skipped: this approver has already staked.");
      return;
    }
    if (balance < ethers.parseEther("5")) {
      setStatus("Stake failed before MetaMask: connected approver has less than 5 ETH.");
      return;
    }

    await runTx("Stake as approver", () => contract.stakeAsApprover({ value: ethers.parseEther("5") }));
  }

  async function depositFreelancerReserve() {
    await runTx("Deposit freelancer reward reserve", () =>
      contract.depositFreelancerRewardReserve({ value: ethers.parseEther("9") })
    );
  }

  async function submitMilestone() {
    await runTx(`Submit ${milestoneLabel(selectedMilestone)}`, () =>
      contract.submitMilestone(selectedMilestone, proof)
    );
  }

  async function approveMilestone(id = selectedMilestone) {
    await runTx(`Approve ${milestoneLabel(id)}`, () => contract.approveMilestone(id));
  }

  async function raiseDispute(id = selectedMilestone) {
    await runTx(`Raise dispute on ${milestoneLabel(id)}`, () => contract.raiseDispute(id, disputeMessage));
  }

  async function respondAndResubmit(id = selectedMilestone) {
    await runTx(`Respond and resubmit ${milestoneLabel(id)}`, () =>
      contract.respondAndResubmit(id, response, newProof)
    );
  }

  async function claimRewards() {
    await runTx("Claim rewards and stake", () => contract.claimApproverRewardsAndStake());
  }

  useEffect(() => {
    if (!window.ethereum) return;
    const accountsHandler = async (accounts) => {
      addDebugLog("MetaMask accountsChanged", { accounts });
      if (!accounts.length) {
        setAccount("");
        setContract(null);
        setReadContract(null);
        setProvider(null);
        setRole("Not connected");
        setState(null);
        setPage("dashboard");
        setStatus("MetaMask disconnected. Select an account and connect again.");
        return;
      }
      await connectWallet();
    };
    const chainHandler = async (chainId) => {
      addDebugLog("MetaMask chainChanged", { chainId });
      await connectWallet();
    };
    window.ethereum.on?.("accountsChanged", accountsHandler);
    window.ethereum.on?.("chainChanged", chainHandler);
    return () => {
      window.ethereum.removeListener?.("accountsChanged", accountsHandler);
      window.ethereum.removeListener?.("chainChanged", chainHandler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasDeployment, contractAddress, contractAbi]);

  useEffect(() => {
    if (contract && provider) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contract, provider]);

  return (
    <div className="app">
      <header className="hero">
        <div>
          <p className="eyebrow">Ethereum Smart Contract Demo</p>
          <h1>SmartEscrow</h1>
          <p className="version">Version 3.0.1</p>
          <p>
            Milestone escrow with approver staking, 3-of-4 Byzantine-threshold approval,
            dispute messages, freelancer resubmission, and reward distribution.
          </p>
        </div>
        <div className="wallet-card">
          <button onClick={connectWallet} disabled={busy}>{account ? "Reconnect" : "Connect MetaMask"}</button>
          <button className="secondary" onClick={() => refresh()} disabled={!contract || busy}>Refresh</button>
          <p><b>Account:</b> {account ? short(account) : "Not connected"}</p>
          <p><b>Role:</b> {role}</p>
          <p><b>Network:</b> Hardhat Local, chainId 31337</p>
        </div>
      </header>

      {!hasDeployment && (
        <section className="warning">
          Contract ABI/address missing. Run <code>npm run deploy:local</code> from the root project folder before starting the frontend.
        </section>
      )}

      <section className="statusbar"><b>Status:</b> {status || "Ready."}</section>

      <section className="debug-panel">
        <div className="debug-header">
          <b>Wallet Debug Log</b>
          <div className="debug-actions">
            <button className="secondary small" onClick={downloadDebugLog}>Download Log File</button>
            <button className="secondary small" onClick={clearDebugLogs}>Clear</button>
          </div>
        </div>
        {debugLogs.length === 0 ? (
          <p>No wallet debug logs yet. Click Connect MetaMask.</p>
        ) : (
          <pre>{debugLogs.join("\n")}</pre>
        )}
      </section>

      <nav className="tabs">
        <button className={page === "dashboard" ? "active" : ""} onClick={() => setPage("dashboard")}>Dashboard</button>
        <button className={page === "freelancer" ? "active" : ""} onClick={() => setPage("freelancer")}>Freelancer Page</button>
        <button className={page === "approver" ? "active" : ""} onClick={() => setPage("approver")}>Approver Page</button>
      </nav>

      {page === "dashboard" && <Dashboard state={state} contractAddress={contractAddress} />}
      {page === "freelancer" && (
        <FreelancerPage
          state={state}
          account={account}
          selectedMilestone={selectedMilestone}
          setSelectedMilestone={setSelectedMilestone}
          proof={proof}
          setProof={setProof}
          response={response}
          setResponse={setResponse}
          newProof={newProof}
          setNewProof={setNewProof}
          submitMilestone={submitMilestone}
          respondAndResubmit={respondAndResubmit}
          depositFreelancerReserve={depositFreelancerReserve}
          busy={busy}
        />
      )}
      {page === "approver" && (
        <ApproverPage
          state={state}
          account={account}
          selectedMilestone={selectedMilestone}
          setSelectedMilestone={setSelectedMilestone}
          disputeMessage={disputeMessage}
          setDisputeMessage={setDisputeMessage}
          approveMilestone={approveMilestone}
          raiseDispute={raiseDispute}
          stakeAsApprover={stakeAsApprover}
          claimRewards={claimRewards}
          busy={busy}
        />
      )}
    </div>
  );
}

function Dashboard({ state, contractAddress }) {
  if (!state) return <EmptyState />;
  const c = state.constants;
  return (
    <main className="grid two">
      <section className="card">
        <h2>Project Setup</h2>
        <p><b>Project:</b> {state.projectName}</p>
        <p><b>Version:</b> {state.projectVersion}</p>
        <p><b>Contract:</b> {contractAddress}</p>
        <p><b>Client:</b> {state.client}</p>
        <p><b>Freelancer:</b> {state.freelancer}</p>
        <p><b>Contract balance:</b> {formatEth(state.balance)} ETH</p>
        <p><b>Project ready:</b> {state.projectReady ? "Yes" : "No"}</p>
        <p><b>All milestones paid:</b> {state.allPaid ? "Yes" : "No"}</p>
      </section>

      <section className="card">
        <h2>Economic Rules</h2>
        <ul>
          <li>Each local Hardhat account starts with <b>100 ETH</b>.</li>
          <li>Client locks <b>48 ETH</b> at deployment.</li>
          <li>Freelancer deposits <b>{formatEth(c.freelancerReserve)} ETH</b> reward reserve.</li>
          <li>Each approver stakes <b>{formatEth(c.approverStake)} ETH</b>.</li>
          <li>Freelancer receives <b>{formatEth(c.milestonePayment)} ETH</b> per paid milestone.</li>
          <li>Each approving approver earns <b>3 ETH</b>: 2 ETH from client + 1 ETH from freelancer.</li>
        </ul>
      </section>

      <section className="card wide">
        <h2>Approver Committee</h2>
        <p><b>Staked approvers:</b> {asInt(state.stakedApproverCount)} / {asInt(c.approverCount)}</p>
        <div className="table">
          <div className="row header"><span>Approver</span><span>Staked?</span><span>Reward Balance</span><span>Wallet Balance</span></div>
          {state.approvers.map((a, i) => {
            const info = state.milestones[0].perApprover.find((x) => same(x.address, a));
            return (
              <div className="row" key={a}>
                <span>Approver {i + 1}: {short(a)}</span>
                <span>{info?.staked ? "Yes" : "No"}</span>
                <span>{formatEth(info?.reward)} ETH</span>
                <span>{formatEth(info?.nativeBalance)} ETH</span>
              </div>
            );
          })}
        </div>
      </section>

      <MilestoneList state={state} />

      <section className="card accent wide">
        <h2>Byzantine Threshold Calculation</h2>
        <p>The committee approval rule is implemented at the smart-contract application layer.</p>
        <div className="formula">n = {asInt(c.approverCount)}, f = {asInt(c.f)}, threshold = 2f + 1 = {asInt(c.threshold)}</div>
        <p>
          Because n ≥ 3f + 1, four approvers can tolerate one faulty or dishonest approver.
          Payment is released only when three approvers approve the submitted milestone.
        </p>
      </section>
    </main>
  );
}

function FreelancerPage(props) {
  const {
    state,
    account,
    selectedMilestone,
    setSelectedMilestone,
    proof,
    setProof,
    response,
    setResponse,
    newProof,
    setNewProof,
    submitMilestone,
    respondAndResubmit,
    depositFreelancerReserve,
    busy,
  } = props;
  if (!state) return <EmptyState />;

  const isFreelancer = same(account, state.freelancer);
  const selected = state.milestones[selectedMilestone];
  const disputes = state.milestones.flatMap((m) =>
    m.perApprover
      .filter((a) => a.disputed && a.message)
      .map((a) => ({ milestone: m, approver: a }))
  );

  const depositDisabled = busy || !isFreelancer || state.freelancerReserveDeposited;
  const submitDisabled = busy || !isFreelancer || !state.projectReady || selected.status !== 0;
  const resubmitDisabled = busy || !isFreelancer || selected.status !== 2;

  return (
    <main className="grid two">
      <section className="card">
        <h2>Freelancer Page</h2>
        <p><b>Your role active?</b> {isFreelancer ? "Yes" : "No — switch MetaMask to Freelancer account"}</p>
        <p><b>Freelancer wallet:</b> {state.freelancer}</p>
        <p><b>Freelancer wallet balance:</b> {formatEth(state.balances.freelancer)} ETH</p>
        <p><b>Reward reserve deposited?</b> {state.freelancerReserveDeposited ? "Yes" : "No"}</p>
        <button onClick={depositFreelancerReserve} disabled={depositDisabled}>
          {state.freelancerReserveDeposited ? "9 ETH Reserve Deposited" : "Deposit 9 ETH Reward Reserve"}
        </button>
      </section>

      <section className="card notice">
        <h2>Freelancer Notifications</h2>
        {disputes.length === 0 ? <p>No active dispute notifications.</p> : disputes.map(({ milestone, approver }) => (
          <div className="notification danger" key={`${milestone.id}-${approver.address}`}>
            <b>Dispute on {milestoneLabel(milestone.id)}</b>
            <p>From {short(approver.address)}: {approver.message}</p>
          </div>
        ))}
      </section>

      <section className="card wide">
        <h2>Submit or Resubmit Work</h2>
        <label>Milestone</label>
        <select value={selectedMilestone} onChange={(e) => setSelectedMilestone(Number(e.target.value))}>
          {state.milestones.map((m) => <option key={m.id} value={m.id}>{milestoneLabel(m.id)}: {m.description}</option>)}
        </select>
        <p><b>Status:</b> {STATUS_LABELS[selected.status]}</p>
        <p><b>Approvals received:</b> {selected.approvalCount} / {asInt(state.constants.threshold)}</p>
        <p><b>Disputes:</b> {selected.disputeCount}</p>

        <label>Proof URI / GitHub link / IPFS CID</label>
        <input value={proof} onChange={(e) => setProof(e.target.value)} />
        <button onClick={submitMilestone} disabled={submitDisabled}>Submit {milestoneLabel(selectedMilestone)}</button>

        <hr />
        <label>Response to dispute</label>
        <textarea value={response} onChange={(e) => setResponse(e.target.value)} />
        <label>New proof URI / updated work link</label>
        <input value={newProof} onChange={(e) => setNewProof(e.target.value)} />
        <button onClick={() => respondAndResubmit(selectedMilestone)} disabled={resubmitDisabled}>
          Respond and Resubmit {milestoneLabel(selectedMilestone)}
        </button>
      </section>

      <MilestoneList state={state} />
    </main>
  );
}

function ApproverPage(props) {
  const {
    state,
    account,
    selectedMilestone,
    setSelectedMilestone,
    disputeMessage,
    setDisputeMessage,
    approveMilestone,
    raiseDispute,
    stakeAsApprover,
    claimRewards,
    busy,
  } = props;
  if (!state) return <EmptyState />;

  const approverInfo = state.milestones[0].perApprover.find((a) => same(a.address, account));
  const isApprover = Boolean(approverInfo);
  const isStaked = Boolean(approverInfo?.staked);
  const hasClaimed = Boolean(approverInfo?.claimed);
  const pending = state.milestones.filter((m) =>
    isReviewable(m) &&
    !m.perApprover.find((a) => same(a.address, account))?.approved &&
    !m.perApprover.find((a) => same(a.address, account))?.disputed
  );
  const approved = state.milestones.filter((m) => m.perApprover.find((a) => same(a.address, account))?.approved);
  const disputed = state.milestones.filter((m) => m.perApprover.find((a) => same(a.address, account))?.disputed);
  const selected = state.milestones[selectedMilestone];
  const selectedVote = selected.perApprover.find((a) => same(a.address, account));
  const voteLocked = Boolean(selectedVote?.approved || selectedVote?.disputed);

  const stakeDisabled = busy || !isApprover || isStaked;
  const voteDisabled = busy || !isApprover || !isStaked || !isReviewable(selected) || voteLocked;
  const claimDisabled = busy || !isApprover || !state.allPaid || hasClaimed;
  const stakeDisabledReason = busy
    ? "Waiting for current transaction."
    : !isApprover
      ? "Connected wallet is not one of this contract's approvers."
      : isStaked
        ? "This approver has already staked."
        : "";

  return (
    <main className="grid two">
      <section className="card">
        <h2>Approver Page</h2>
        <p><b>Approver account?</b> {isApprover ? "Yes" : "No — switch MetaMask to an approver account"}</p>
        <p><b>Staked?</b> {isStaked ? "Yes" : "No"}</p>
        <p><b>Reward balance:</b> {formatEth(approverInfo?.reward)} ETH</p>
        <p><b>Connected wallet balance:</b> {formatEth(state.balances.connected)} ETH</p>
        <button onClick={stakeAsApprover} disabled={stakeDisabled}>{isStaked ? "5 ETH Stake Deposited" : "Stake 5 ETH"}</button>
        {stakeDisabledReason && <p className="hint">{stakeDisabledReason}</p>}
        <button onClick={claimRewards} disabled={claimDisabled}>
          {hasClaimed ? "Rewards + Stake Claimed" : "Claim Rewards + Stake After Job Completion"}
        </button>
      </section>

      <section className="card notice">
        <h2>Approver Notifications</h2>
        {pending.length === 0 ? <p>No pending milestone requiring your review.</p> : pending.map((m) => (
          <div className="notification" key={m.id}>
            <b>{milestoneLabel(m.id)} submitted for review</b>
            <p>{m.description}</p>
            <p>Proof: {m.proofURI || "No proof"}</p>
          </div>
        ))}
        {approved.map((m) => <div className="notification success" key={`a-${m.id}`}>You approved {milestoneLabel(m.id)}.</div>)}
        {disputed.map((m) => <div className="notification danger" key={`d-${m.id}`}>You disputed {milestoneLabel(m.id)}.</div>)}
      </section>

      <section className="card wide">
        <h2>Review Milestone</h2>
        <label>Milestone</label>
        <select value={selectedMilestone} onChange={(e) => setSelectedMilestone(Number(e.target.value))}>
          {state.milestones.map((m) => <option key={m.id} value={m.id}>{milestoneLabel(m.id)}: {m.description}</option>)}
        </select>
        <p><b>Status:</b> {STATUS_LABELS[selected.status]}</p>
        <p><b>Proof:</b> {selected.proofURI || "No proof submitted yet"}</p>
        <p><b>Freelancer response:</b> {selected.responseURI || "No response yet"}</p>
        <p><b>Approvals:</b> {selected.approvalCount} / {asInt(state.constants.threshold)}</p>

        <button onClick={() => approveMilestone(selectedMilestone)} disabled={voteDisabled}>Approve {milestoneLabel(selectedMilestone)}</button>
        <label>Dispute message</label>
        <textarea value={disputeMessage} onChange={(e) => setDisputeMessage(e.target.value)} />
        <button className="dangerBtn" onClick={() => raiseDispute(selectedMilestone)} disabled={voteDisabled}>Raise Dispute</button>
      </section>

      <MilestoneList state={state} />
    </main>
  );
}

function MilestoneList({ state }) {
  return (
    <section className="card wide">
      <h2>Milestones</h2>
      <div className="milestones">
        {state.milestones.map((m) => (
          <div className="milestone" key={m.id}>
            <h3>{milestoneLabel(m.id)}: {m.description}</h3>
            <p><b>Status:</b> {STATUS_LABELS[m.status]}</p>
            <p><b>Proof:</b> {m.proofURI || "Not submitted"}</p>
            <p><b>Response:</b> {m.responseURI || "None"}</p>
            <p><b>Approvals:</b> {m.approvalCount} / {asInt(state.constants.threshold)} | <b>Disputes:</b> {m.disputeCount}</p>
            <div className="miniTable">
              {m.perApprover.map((a, idx) => (
                <div key={a.address} className="miniRow">
                  <span>Approver {idx + 1} {short(a.address)}</span>
                  <span>{a.approved ? "Approved" : a.disputed ? "Disputed" : "No vote"}</span>
                  <span>Reward {formatEth(a.reward)} ETH</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function EmptyState() {
  return (
    <main className="card">
      <h2>No contract data loaded yet</h2>
      <p>Start Hardhat, deploy the contract, connect MetaMask, and click Refresh.</p>
    </main>
  );
}
