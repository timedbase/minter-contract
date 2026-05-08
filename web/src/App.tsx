import { useState } from "react";
import { TonConnectUIProvider } from "@tonconnect/ui-react";
import Header from "./components/Header";
import DeployPage from "./pages/DeployPage";
import ManagePage from "./pages/ManagePage";

type Tab = "deploy" | "manage";
type Network = "mainnet" | "testnet";

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("deploy");
  const [network, setNetwork] = useState<Network>("mainnet");

  const manifestUrl = window.location.origin + "/tonconnect-manifest.json";

  return (
    <TonConnectUIProvider manifestUrl={manifestUrl}>
      <div className="app">
        <Header
          network={network}
          onNetworkChange={setNetwork}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
        <main className="main-content">
          {activeTab === "deploy" ? (
            <DeployPage network={network} />
          ) : (
            <ManagePage network={network} />
          )}
        </main>
      </div>
    </TonConnectUIProvider>
  );
}
