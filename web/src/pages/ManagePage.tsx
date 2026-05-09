import { useState } from "react";
import { useTonConnectUI, useTonWallet } from "@tonconnect/ui-react";
import { Address, toNano } from "@ton/core";
import {
  createTonClient,
  loadMinterState,
  buildMintBody,
  buildLockMintBody,
  buildChangeAdminBody,
  buildChangeContentBody,
  cellToBase64,
  MinterState,
} from "../lib/contracts";
import { buildMetadataCell, JettonMetadata } from "../lib/metadata";

interface ManagePageProps {
  network: "mainnet" | "testnet";
}

type ActionTab =
  | "mint"
  | "lockMint"
  | "changeAdmin"
  | "changeContent";

export default function ManagePage({ network }: ManagePageProps) {
  const [tonConnectUI] = useTonConnectUI();
  const wallet = useTonWallet();

  const [contractInput, setContractInput] = useState("");
  const [contractAddress, setContractAddress] = useState<Address | null>(null);
  const [minterState, setMinterState] = useState<MinterState | null>(null);
  const [loadStatus, setLoadStatus] = useState<{
    type: "idle" | "loading" | "success" | "error";
    message?: string;
  }>({ type: "idle" });

  const [activeAction, setActiveAction] = useState<ActionTab>("changeAdmin");
  const [txStatus, setTxStatus] = useState<{
    type: "idle" | "loading" | "success" | "error";
    message?: string;
  }>({ type: "idle" });

  const [mintTo, setMintTo] = useState("");
  const [mintAmount, setMintAmount] = useState("");
  const [newAdmin, setNewAdmin] = useState("");
  const [contentName, setContentName] = useState("");
  const [contentSymbol, setContentSymbol] = useState("");
  const [contentDescription, setContentDescription] = useState("");
  const [contentImage, setContentImage] = useState("");

  const isConnected = !!wallet;

  async function handleLoad() {
    setLoadStatus({ type: "loading", message: "Loading contract state..." });
    setMinterState(null);
    setContractAddress(null);

    try {
      let addr: Address;
      try {
        addr = Address.parse(contractInput.trim());
      } catch {
        throw new Error("Invalid contract address");
      }

      const client = createTonClient(network);
      const state = await loadMinterState(client, addr);

      setContractAddress(addr);
      setMinterState(state);

      setLoadStatus({ type: "success", message: "Contract loaded." });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setLoadStatus({ type: "error", message: msg });
    }
  }

  async function sendTx(payload: string, amount: string) {
    if (!contractAddress) return;
    await tonConnectUI.sendTransaction({
      validUntil: Math.floor(Date.now() / 1000) + 360,
      messages: [{ address: contractAddress.toString({ bounceable: true }), amount, payload }],
    });
  }

  async function handleMint() {
    setTxStatus({ type: "loading", message: "Sending mint transaction..." });
    try {
      const to = Address.parse(mintTo);
      const amount = parseFloat(mintAmount);
      if (isNaN(amount) || amount <= 0) throw new Error("Amount must be a positive number");
      const jettonAmount = BigInt(Math.round(amount * 1e9));
      const responseAddr = wallet ? Address.parseRaw(wallet.account.address) : to;
      await sendTx(cellToBase64(buildMintBody(to, jettonAmount, responseAddr)), toNano("0.1").toString());
      setTxStatus({ type: "success", message: "Mint transaction sent!" });
    } catch (err) { handleTxError(err); }
  }

  async function handleChangeAdmin() {
    setTxStatus({ type: "loading", message: "Sending change admin transaction..." });
    try {
      const addr = Address.parse(newAdmin);
      await sendTx(cellToBase64(buildChangeAdminBody(addr)), toNano("0.05").toString());
      setTxStatus({ type: "success", message: "Change admin transaction sent!" });
    } catch (err) { handleTxError(err); }
  }

  async function handleChangeContent() {
    setTxStatus({ type: "loading", message: "Building metadata cell..." });
    try {
      if (!contentName.trim()) throw new Error("Token name is required");
      if (!contentSymbol.trim()) throw new Error("Token symbol is required");
      const metadata: JettonMetadata = {
        name: contentName.trim(),
        symbol: contentSymbol.trim(),
        description: contentDescription.trim() || undefined,
        image: contentImage.trim() || undefined,
      };
      const metadataCell = await buildMetadataCell(metadata);
      setTxStatus({ type: "loading", message: "Sending change content transaction..." });
      await sendTx(cellToBase64(buildChangeContentBody(metadataCell)), toNano("0.05").toString());
      setTxStatus({ type: "success", message: "Change content transaction sent!" });
    } catch (err) { handleTxError(err); }
  }

  async function handleLockMint() {
    setTxStatus({ type: "loading", message: "Sending lock mint transaction..." });
    try {
      await sendTx(cellToBase64(buildLockMintBody()), toNano("0.05").toString());
      setTxStatus({ type: "success", message: "Minting permanently locked!" });
    } catch (err) { handleTxError(err); }
  }

  function handleTxError(err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("User rejecte") || message.includes("Reject")) {
      setTxStatus({ type: "idle" });
    } else {
      setTxStatus({ type: "error", message });
    }
  }

  function formatSupply(supply: bigint): string {
    const str = supply.toString().padStart(10, "0");
    const intPart = str.slice(0, -9) || "0";
    const fracPart = str.slice(-9).replace(/0+$/, "");
    return fracPart ? `${intPart}.${fracPart}` : intPart;
  }

  function computeFeePercent(num?: number, den?: number): string {
    if (num !== undefined && den !== undefined && den > 0) {
      return ((num / den) * 100).toFixed(4) + "%";
    }
    return "—";
  }

  const availableTabs: { id: ActionTab; label: string }[] = [
    ...(minterState?.mintable ? [{ id: "mint" as ActionTab, label: "Mint" }] : []),
    ...(minterState?.mintable ? [{ id: "lockMint" as ActionTab, label: "Lock Mint" }] : []),
    { id: "changeAdmin", label: "Change Admin" },
    { id: "changeContent", label: "Change Content" },
  ];

  return (
    <div className="page">
      <h2 className="page-title">Manage Jetton</h2>
      <p className="page-description">
        Load an existing Jetton contract and perform admin operations ({network}).
      </p>

      <div className="card">
        <h3 className="card-title">Contract Address</h3>
        <div className="input-row">
          <input
            type="text"
            placeholder="EQ... or 0:..."
            value={contractInput}
            onChange={(e) => setContractInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLoad()}
          />
          <button
            className="btn-secondary"
            onClick={handleLoad}
            disabled={loadStatus.type === "loading" || !contractInput.trim()}
          >
            {loadStatus.type === "loading" ? "Loading..." : "Load"}
          </button>
        </div>
        {loadStatus.type !== "idle" && (
          <div className={`status-message status-${loadStatus.type}`}>
            {loadStatus.type === "loading" && <span className="spinner" />}
            {loadStatus.message}
          </div>
        )}
      </div>

      {minterState && contractAddress && (
        <>
          <div className="card">
            <h3 className="card-title">Contract State</h3>
            <div className="state-grid">
              <div className="state-item">
                <span className="state-label">Address</span>
                <span className="state-value mono">{contractAddress.toString({ bounceable: true })}</span>
              </div>
              <div className="state-item">
                <span className="state-label">Total Supply</span>
                <span className="state-value">{formatSupply(minterState.totalSupply)} tokens</span>
              </div>
              <div className="state-item">
                <span className="state-label">Admin</span>
                <span className="state-value mono">{minterState.admin.toString({ bounceable: true })}</span>
              </div>
              <div className="state-item">
                <span className="state-label">Type</span>
                <span className={`state-value badge ${minterState.isTaxJetton ? "badge-tax" : "badge-standard"}`}>
                  {minterState.isTaxJetton ? "Tax Jetton" : "Standard Jetton"}
                </span>
              </div>
              <div className="state-item">
                <span className="state-label">Mint Authority</span>
                {minterState.mintable ? (
                  <span className="state-value mono">{minterState.admin.toString({ bounceable: true })}</span>
                ) : (
                  <span className="state-value badge badge-revoked">None — Fixed Supply</span>
                )}
              </div>
              <div className="state-item">
                <span className="state-label">Freeze Key</span>
                <span className="state-value badge badge-revoked">None</span>
              </div>
              {minterState.isTaxJetton && (
                <>
                  <div className="state-item">
                    <span className="state-label">Fee</span>
                    <span className="state-value">
                      {minterState.feeNumerator}/{minterState.feeDenominator} ={" "}
                      {computeFeePercent(minterState.feeNumerator, minterState.feeDenominator)}
                    </span>
                  </div>
                  <div className="state-item">
                    <span className="state-label">Fee Collector</span>
                    <span className="state-value mono">
                      {minterState.feeCollector?.toString({ bounceable: true }) ?? "—"}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="card">
            <h3 className="card-title">Admin Actions</h3>
            {!isConnected && (
              <div className="status-message status-error">
                Connect your wallet to perform admin actions.
              </div>
            )}
            <div className="action-tabs">
              {availableTabs.map((tab) => (
                <button
                  key={tab.id}
                  className={`action-tab ${activeAction === tab.id ? "active" : ""}`}
                  onClick={() => { setActiveAction(tab.id); setTxStatus({ type: "idle" }); }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="action-content">
              {activeAction === "mint" && minterState.mintable && (
                <div className="action-form">
                  <div className="form-group">
                    <label htmlFor="mintTo">Recipient Address</label>
                    <input
                      id="mintTo"
                      type="text"
                      placeholder="EQ..."
                      value={mintTo}
                      onChange={(e) => setMintTo(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="mintAmount">Amount</label>
                    <input
                      id="mintAmount"
                      type="number"
                      min="0"
                      step="any"
                      placeholder="e.g. 1000"
                      value={mintAmount}
                      onChange={(e) => setMintAmount(e.target.value)}
                    />
                  </div>
                  <button
                    className="btn-primary"
                    onClick={handleMint}
                    disabled={!isConnected || txStatus.type === "loading"}
                  >
                    {txStatus.type === "loading" ? "Sending..." : "Mint Tokens"}
                  </button>
                </div>
              )}

              {activeAction === "changeAdmin" && (
                <div className="action-form">
                  <div className="form-group">
                    <label htmlFor="newAdmin">New Admin Address</label>
                    <input
                      id="newAdmin"
                      type="text"
                      placeholder="EQ..."
                      value={newAdmin}
                      onChange={(e) => setNewAdmin(e.target.value)}
                    />
                    <span className="field-hint warning">
                      Warning: Changing admin is irreversible if you lose access to the new address.
                    </span>
                  </div>
                  <button
                    className="btn-primary"
                    onClick={handleChangeAdmin}
                    disabled={!isConnected || txStatus.type === "loading"}
                  >
                    {txStatus.type === "loading" ? "Sending..." : "Change Admin"}
                  </button>
                </div>
              )}

              {activeAction === "changeContent" && (
                <div className="action-form">
                  <div className="form-group">
                    <label htmlFor="contentName">Token Name *</label>
                    <input id="contentName" type="text" placeholder="e.g. My Token"
                      value={contentName} onChange={(e) => setContentName(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label htmlFor="contentSymbol">Symbol *</label>
                    <input id="contentSymbol" type="text" placeholder="e.g. MTK"
                      value={contentSymbol} onChange={(e) => setContentSymbol(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label htmlFor="contentDescription">Description</label>
                    <textarea id="contentDescription" rows={3} placeholder="Optional description"
                      value={contentDescription} onChange={(e) => setContentDescription(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label htmlFor="contentImage">Image URL</label>
                    <input id="contentImage" type="url" placeholder="https://example.com/icon.png"
                      value={contentImage} onChange={(e) => setContentImage(e.target.value)} />
                  </div>
                  <button className="btn-primary" onClick={handleChangeContent}
                    disabled={!isConnected || txStatus.type === "loading"}>
                    {txStatus.type === "loading" ? "Sending..." : "Change Content"}
                  </button>
                </div>
              )}

              {activeAction === "lockMint" && minterState.mintable && (
                <div className="action-form">
                  <span className="field-hint warning">
                    Warning: This permanently revokes minting for this contract. It cannot be undone.
                  </span>
                  <button
                    className="btn-primary"
                    onClick={handleLockMint}
                    disabled={!isConnected || txStatus.type === "loading"}
                  >
                    {txStatus.type === "loading" ? "Sending..." : "Lock Mint Forever"}
                  </button>
                </div>
              )}

              {txStatus.type !== "idle" && (
                <div className={`status-message status-${txStatus.type}`}>
                  {txStatus.type === "loading" && <span className="spinner" />}
                  {txStatus.message}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
