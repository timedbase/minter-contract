import { useState, useEffect } from "react";
import { useTonConnectUI, useTonWallet } from "@tonconnect/ui-react";
import { Address, toNano } from "@ton/core";
import {
  getStandardDeployParams,
  getTaxDeployParams,
  buildGenesisBody,
  cellToBase64,
} from "../lib/contracts";
import type { JettonMetadata } from "../lib/metadata";

interface DeployPageProps {
  network: "mainnet" | "testnet";
}

type JettonType = "standard" | "tax";

const DEPLOY_MINTER_FEE = "0.05";   // stateInit deploy
const GENESIS_FEE_STANDARD = "0.10"; // mint + deploy jetton wallet
const GENESIS_FEE_TAX = "0.15";      // mint + deploy jetton wallet + push fee params

interface FormState {
  name: string;
  symbol: string;
  description: string;
  image: string;
  jettonType: JettonType;
  initialSupply: string;
  feeNumerator: string;
  feeDenominator: string;
  feeCollector: string;
  adminAddress: string;
}

export default function DeployPage({ network }: DeployPageProps) {
  const [tonConnectUI] = useTonConnectUI();
  const wallet = useTonWallet();

  const [form, setForm] = useState<FormState>({
    name: "",
    symbol: "",
    description: "",
    image: "",
    jettonType: "standard",
    initialSupply: "",
    feeNumerator: "30",
    feeDenominator: "1000",
    feeCollector: "",
    adminAddress: "",
  });

  const [status, setStatus] = useState<{ type: "idle" | "loading" | "success" | "error"; message?: string }>({
    type: "idle",
  });
  const [deployedAddress, setDeployedAddress] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (wallet?.account?.address) {
      try {
        const addr = Address.parseRaw(wallet.account.address);
        setForm((prev) => ({ ...prev, adminAddress: addr.toString({ bounceable: true }) }));
      } catch {
        setForm((prev) => ({ ...prev, adminAddress: wallet.account.address }));
      }
    }
  }, [wallet?.account?.address]);

  function updateField(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function computedFeePercent(): string {
    const num = parseFloat(form.feeNumerator);
    const den = parseFloat(form.feeDenominator);
    if (!isNaN(num) && !isNaN(den) && den > 0) {
      return ((num / den) * 100).toFixed(4) + "%";
    }
    return "—";
  }

  async function handleDeploy() {
    if (!wallet) return;

    setStatus({ type: "loading", message: "Preparing transaction..." });
    setDeployedAddress(null);

    try {
      let ownerAddress: Address;
      try {
        ownerAddress = Address.parse(form.adminAddress);
      } catch {
        throw new Error("Invalid admin address");
      }

      if (!form.name.trim()) throw new Error("Token name is required");
      if (!form.symbol.trim()) throw new Error("Token symbol is required");

      const supplyNum = parseFloat(form.initialSupply);
      if (isNaN(supplyNum) || supplyNum <= 0) throw new Error("Initial supply must be a positive number");
      const jettonAmount = BigInt(Math.round(supplyNum * 1e9));

      const metadata: JettonMetadata = {
        name: form.name.trim(),
        symbol: form.symbol.trim(),
        description: form.description.trim() || undefined,
        image: form.image.trim() || undefined,
      };

      let deployParams;
      if (form.jettonType === "standard") {
        deployParams = await getStandardDeployParams(ownerAddress, metadata);
      } else {
        const feeNum = parseInt(form.feeNumerator, 10);
        const feeDen = parseInt(form.feeDenominator, 10);
        if (isNaN(feeNum) || isNaN(feeDen)) throw new Error("Fee values must be numbers");
        if (feeDen === 0) throw new Error("Fee denominator must not be zero");
        if (feeNum * 20 > feeDen) throw new Error("Fee exceeds maximum of 5%");

        let feeCollectorAddr: Address;
        try {
          feeCollectorAddr = Address.parse(form.feeCollector || form.adminAddress);
        } catch {
          throw new Error("Invalid fee collector address");
        }

        deployParams = await getTaxDeployParams(ownerAddress, metadata, feeNum, feeDen, feeCollectorAddr);
      }

      const contractAddr = deployParams.address.toString({ bounceable: true });
      const genesisBody = buildGenesisBody(ownerAddress, jettonAmount, ownerAddress);

      setStatus({ type: "loading", message: `Sending deploy transaction to ${contractAddr}...` });

      const genesisFee = form.jettonType === "tax" ? GENESIS_FEE_TAX : GENESIS_FEE_STANDARD;

      // Two messages in one transaction:
      //   1. Deploy the minter contract (stateInit, no body)
      //   2. Genesis: distribute the fixed initial supply to the admin
      // On-chain: op 7 throws error 78 if total_supply != 0, so supply can never be inflated.
      await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 360,
        messages: [
          {
            address: contractAddr,
            amount: toNano(DEPLOY_MINTER_FEE).toString(),
            stateInit: deployParams.stateInitBoc,
          },
          {
            address: contractAddr,
            amount: toNano(genesisFee).toString(),
            payload: cellToBase64(genesisBody),
          },
        ],
      });

      setDeployedAddress(contractAddr);
      setStatus({ type: "success", message: "Contract deployed with fixed supply!" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("User rejecte") || message.includes("Reject")) {
        setStatus({ type: "idle" });
      } else {
        setStatus({ type: "error", message });
      }
    }
  }

  async function copyAddress() {
    if (!deployedAddress) return;
    await navigator.clipboard.writeText(deployedAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const isConnected = !!wallet;

  return (
    <div className="page">
      <h2 className="page-title">Deploy New Jetton</h2>
      <p className="page-description">
        Deploy a new Jetton on TON ({network}). The supply is set once at creation and is immutable — no minting after deploy.
      </p>

      <div className="card">
        <h3 className="card-title">Token Metadata</h3>

        <div className="form-group">
          <label htmlFor="name">Token Name *</label>
          <input
            id="name"
            type="text"
            placeholder="e.g. My Awesome Token"
            value={form.name}
            onChange={(e) => updateField("name", e.target.value)}
          />
        </div>

        <div className="form-group">
          <label htmlFor="symbol">Symbol *</label>
          <input
            id="symbol"
            type="text"
            placeholder="e.g. MAT"
            value={form.symbol}
            onChange={(e) => updateField("symbol", e.target.value)}
          />
        </div>

        <div className="form-group">
          <label htmlFor="description">Description</label>
          <textarea
            id="description"
            placeholder="Optional description"
            value={form.description}
            onChange={(e) => updateField("description", e.target.value)}
            rows={3}
          />
        </div>

        <div className="form-group">
          <label htmlFor="image">Image URL</label>
          <input
            id="image"
            type="url"
            placeholder="https://example.com/token-icon.png"
            value={form.image}
            onChange={(e) => updateField("image", e.target.value)}
          />
        </div>
      </div>

      <div className="card">
        <h3 className="card-title">Supply</h3>
        <div className="form-group">
          <label htmlFor="initialSupply">Initial Supply * <span className="label-hint">(fixed forever after deploy)</span></label>
          <input
            id="initialSupply"
            type="number"
            min="1"
            step="any"
            placeholder="e.g. 1000000"
            value={form.initialSupply}
            onChange={(e) => updateField("initialSupply", e.target.value)}
          />
          <span className="field-hint">All tokens are minted to the admin address on deploy. No further minting is possible.</span>
        </div>
      </div>

      <div className="card">
        <h3 className="card-title">Jetton Type</h3>

        <div className="radio-group">
          <label className={`radio-option ${form.jettonType === "standard" ? "selected" : ""}`}>
            <input
              type="radio"
              name="jettonType"
              value="standard"
              checked={form.jettonType === "standard"}
              onChange={() => updateField("jettonType", "standard")}
            />
            <div className="radio-content">
              <span className="radio-title">Standard</span>
              <span className="radio-desc">Basic Jetton with no transfer fees</span>
            </div>
          </label>
          <label className={`radio-option ${form.jettonType === "tax" ? "selected" : ""}`}>
            <input
              type="radio"
              name="jettonType"
              value="tax"
              checked={form.jettonType === "tax"}
              onChange={() => updateField("jettonType", "tax")}
            />
            <div className="radio-content">
              <span className="radio-title">Tax</span>
              <span className="radio-desc">Jetton with configurable transfer fee (max 5%)</span>
            </div>
          </label>
        </div>

        {form.jettonType === "tax" && (
          <div className="tax-params">
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="feeNumerator">Fee Numerator</label>
                <input
                  id="feeNumerator"
                  type="number"
                  min="0"
                  value={form.feeNumerator}
                  onChange={(e) => updateField("feeNumerator", e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="feeDenominator">Fee Denominator</label>
                <input
                  id="feeDenominator"
                  type="number"
                  min="1"
                  value={form.feeDenominator}
                  onChange={(e) => updateField("feeDenominator", e.target.value)}
                />
              </div>
            </div>
            <div className="fee-display">
              Computed fee: <strong>{computedFeePercent()}</strong>
            </div>
            <div className="form-group">
              <label htmlFor="feeCollector">
                Fee Collector Address
                <span className="label-hint"> (leave blank to use admin address)</span>
              </label>
              <input
                id="feeCollector"
                type="text"
                placeholder="EQ..."
                value={form.feeCollector}
                onChange={(e) => updateField("feeCollector", e.target.value)}
              />
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <h3 className="card-title">Admin</h3>
        <div className="form-group">
          <label htmlFor="adminAddress">
            Admin Address
            {isConnected && <span className="label-hint"> (auto-filled from connected wallet)</span>}
          </label>
          <input
            id="adminAddress"
            type="text"
            placeholder="EQ..."
            value={form.adminAddress}
            onChange={(e) => updateField("adminAddress", e.target.value)}
          />
        </div>
      </div>

      <div className="card fee-summary">
        <h3 className="card-title">Deployment Cost</h3>
        <div className="fee-breakdown">
          <div className="fee-line">
            <span className="fee-label">Deploy minter contract</span>
            <span className="fee-amount">{DEPLOY_MINTER_FEE} TON</span>
          </div>
          <div className="fee-line">
            <span className="fee-label">
              Mint initial supply{form.jettonType === "tax" ? " + push fee params" : ""}
            </span>
            <span className="fee-amount">
              {form.jettonType === "tax" ? GENESIS_FEE_TAX : GENESIS_FEE_STANDARD} TON
            </span>
          </div>
          <div className="fee-line fee-total">
            <span className="fee-label">Total (excess returned)</span>
            <span className="fee-amount">
              {(
                parseFloat(DEPLOY_MINTER_FEE) +
                parseFloat(form.jettonType === "tax" ? GENESIS_FEE_TAX : GENESIS_FEE_STANDARD)
              ).toFixed(2)} TON
            </span>
          </div>
        </div>
      </div>

      {status.type !== "idle" && (
        <div className={`status-message status-${status.type}`}>
          {status.type === "loading" && <span className="spinner" />}
          {status.message}
        </div>
      )}

      {deployedAddress && (
        <div className="result-card">
          <div className="result-label">Contract Deployed At:</div>
          <div className="result-address">
            <span className="address-text">{deployedAddress}</span>
            <button className="copy-btn" onClick={copyAddress}>
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>
      )}

      <button
        className="btn-primary btn-large"
        onClick={handleDeploy}
        disabled={!isConnected || status.type === "loading"}
      >
        {!isConnected ? "Connect Wallet to Deploy" : status.type === "loading" ? "Deploying..." : "Deploy Jetton"}
      </button>
    </div>
  );
}
