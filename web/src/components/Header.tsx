import { TonConnectButton } from "@tonconnect/ui-react";

interface HeaderProps {
  network: "mainnet" | "testnet";
  onNetworkChange: (network: "mainnet" | "testnet") => void;
  activeTab: "deploy" | "manage";
  onTabChange: (tab: "deploy" | "manage") => void;
}

export default function Header({
  network,
  onNetworkChange,
  activeTab,
  onTabChange,
}: HeaderProps) {
  return (
    <header className="header">
      <div className="header-top">
        <div className="header-brand">
          <h1 className="header-title">Jetton Deployer</h1>
          <span className="header-subtitle">TON Blockchain</span>
        </div>
        <div className="header-actions">
          <div className="network-toggle">
            <button
              className={`network-btn ${network === "mainnet" ? "active" : ""}`}
              onClick={() => onNetworkChange("mainnet")}
            >
              Mainnet
            </button>
            <button
              className={`network-btn ${network === "testnet" ? "active" : ""}`}
              onClick={() => onNetworkChange("testnet")}
            >
              Testnet
            </button>
          </div>
          <TonConnectButton />
        </div>
      </div>
      <nav className="tabs">
        <button
          className={`tab ${activeTab === "deploy" ? "active" : ""}`}
          onClick={() => onTabChange("deploy")}
        >
          Deploy
        </button>
        <button
          className={`tab ${activeTab === "manage" ? "active" : ""}`}
          onClick={() => onTabChange("manage")}
        >
          Manage
        </button>
      </nav>
    </header>
  );
}
