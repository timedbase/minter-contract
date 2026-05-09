import {
  beginCell,
  Cell,
  Address,
  contractAddress,
  StateInit,
  storeStateInit,
  toNano,
  TupleReader,
} from "@ton/core";
import { TonClient } from "@ton/ton";
import { JettonMetadata, buildMetadataCell } from "./metadata";

// Compiled contract code imports (resolved via @contracts alias → ../build/)
import minterCompiledJson from "@contracts/jetton-minter.compiled.json";
import walletCompiledJson from "@contracts/jetton-wallet.compiled.json";
import taxMinterCompiledJson from "@contracts/jetton-minter-tax.compiled.json";
import taxWalletCompiledJson from "@contracts/jetton-wallet-tax.compiled.json";

// ─── Code cells ──────────────────────────────────────────────────────────────

function hexToCell(hex: string): Cell {
  return Cell.fromBoc(Buffer.from(hex, "hex"))[0];
}

export function getMinterCode(): Cell {
  return hexToCell((minterCompiledJson as { hex: string }).hex);
}

export function getWalletCode(): Cell {
  return hexToCell((walletCompiledJson as { hex: string }).hex);
}

export function getTaxMinterCode(): Cell {
  return hexToCell((taxMinterCompiledJson as { hex: string }).hex);
}

export function getTaxWalletCode(): Cell {
  return hexToCell((taxWalletCompiledJson as { hex: string }).hex);
}

// ─── State init builders ──────────────────────────────────────────────────────

function buildMinterInitData(owner: Address, metadataCell: Cell, walletCode: Cell): Cell {
  return beginCell()
    .storeCoins(0n) // total_supply = 0; set by genesis (op 7)
    .storeAddress(owner)
    .storeRef(metadataCell)
    .storeRef(walletCode)
    .endCell();
}

function buildTaxMinterInitData(
  owner: Address,
  metadataCell: Cell,
  walletCode: Cell,
  feeNumerator: number,
  feeDenominator: number,
  feeCollector: Address
): Cell {
  return beginCell()
    .storeCoins(0n) // total_supply = 0; set by genesis (op 7)
    .storeAddress(owner)
    .storeRef(metadataCell)
    .storeRef(walletCode)
    .storeUint(feeNumerator, 16)
    .storeUint(feeDenominator, 16)
    .storeAddress(feeCollector)
    .endCell();
}

// ─── Deploy param types ───────────────────────────────────────────────────────

export interface DeployParams {
  address: Address;
  stateInitBoc: string; // base64 BOC
  amount: string;       // nanoton string
}

function stateInitToBase64(init: StateInit): string {
  return beginCell()
    .store(storeStateInit(init))
    .endCell()
    .toBoc()
    .toString("base64");
}

// ─── Standard deploy ─────────────────────────────────────────────────────────

export async function getStandardDeployParams(
  owner: Address,
  metadata: JettonMetadata
): Promise<DeployParams> {
  const metadataCell = await buildMetadataCell(metadata);
  const walletCode = getWalletCode();
  const minterCode = getMinterCode();

  const initData = buildMinterInitData(owner, metadataCell, walletCode);
  const stateInit: StateInit = { code: minterCode, data: initData };
  const address = contractAddress(0, stateInit);

  return {
    address,
    stateInitBoc: stateInitToBase64(stateInit),
    amount: toNano("0.05").toString(),
  };
}

// ─── Tax deploy ───────────────────────────────────────────────────────────────

export async function getTaxDeployParams(
  owner: Address,
  metadata: JettonMetadata,
  feeNumerator: number,
  feeDenominator: number,
  feeCollector: Address
): Promise<DeployParams> {
  if (feeDenominator === 0) throw new Error("feeDenominator must not be zero");
  if (feeNumerator * 20 > feeDenominator) throw new Error("Fee exceeds 5% maximum");

  const metadataCell = await buildMetadataCell(metadata);
  const walletCode = getTaxWalletCode();
  const minterCode = getTaxMinterCode();

  const initData = buildTaxMinterInitData(
    owner,
    metadataCell,
    walletCode,
    feeNumerator,
    feeDenominator,
    feeCollector
  );
  const stateInit: StateInit = { code: minterCode, data: initData };
  const address = contractAddress(0, stateInit);

  return {
    address,
    stateInitBoc: stateInitToBase64(stateInit),
    amount: toNano("0.05").toString(),
  };
}

// ─── Message body builders ────────────────────────────────────────────────────

/**
 * op 7: genesis — one-time initial supply distribution.
 * Can only be called when total_supply == 0 (enforced on-chain).
 * After this call the supply is permanently fixed.
 */
export function buildGenesisBody(to: Address, jettonAmount: bigint, adminAddr: Address): Cell {
  const internalTransfer = beginCell()
    .storeUint(0x178d4519, 32) // op::internal_transfer
    .storeUint(0, 64)
    .storeCoins(jettonAmount)
    .storeUint(0, 2)           // addr_none (from)
    .storeAddress(adminAddr)   // response_address
    .storeCoins(0n)
    .storeUint(0, 1)
    .endCell();

  return beginCell()
    .storeUint(7, 32)               // op genesis
    .storeUint(0, 64)
    .storeAddress(to)
    .storeCoins(toNano("0.05"))     // TON for gas
    .storeRef(internalTransfer)
    .endCell();
}

/** op 3: change admin */
export function buildChangeAdminBody(newAdmin: Address): Cell {
  return beginCell()
    .storeUint(3, 32)
    .storeUint(0, 64)
    .storeAddress(newAdmin)
    .endCell();
}

/** op 4: change content */
export function buildChangeContentBody(contentCell: Cell): Cell {
  return beginCell()
    .storeUint(4, 32)
    .storeUint(0, 64)
    .storeRef(contentCell)
    .endCell();
}

/** op 5: set fees (tax only) */
export function buildSetFeesBody(
  feeNumerator: number,
  feeDenominator: number,
  feeCollector: Address
): Cell {
  return beginCell()
    .storeUint(5, 32)
    .storeUint(0, 64)
    .storeUint(feeNumerator, 16)
    .storeUint(feeDenominator, 16)
    .storeAddress(feeCollector)
    .endCell();
}

/** op 6: push fee update to wallet (tax only) */
export function buildPushFeeUpdateBody(targetWallet: Address): Cell {
  return beginCell()
    .storeUint(6, 32)
    .storeUint(0, 64)
    .storeAddress(targetWallet)
    .endCell();
}

// ─── TonClient helpers ────────────────────────────────────────────────────────

export function createTonClient(network: "mainnet" | "testnet"): TonClient {
  const endpoint =
    network === "mainnet"
      ? "https://toncenter.com/api/v2/jsonRPC"
      : "https://testnet.toncenter.com/api/v2/jsonRPC";
  return new TonClient({ endpoint });
}

export interface MinterState {
  totalSupply: bigint;
  admin: Address;
  isTaxJetton: boolean;
  feeNumerator?: number;
  feeDenominator?: number;
  feeCollector?: Address;
}

/**
 * Load minter contract state by calling get methods.
 * get_jetton_data() returns (total_supply, mintable, admin_address, content, wallet_code)
 * get_fee_params() returns (fee_numerator, fee_denominator, fee_collector) — tax only
 */
export async function loadMinterState(
  client: TonClient,
  address: Address
): Promise<MinterState> {
  const jettonData = await client.runMethod(address, "get_jetton_data");
  const stack = jettonData.stack as TupleReader;

  const totalSupply = stack.readBigNumber(); // stack[0]: total_supply
  stack.skip(1);                             // stack[1]: mintable — always 0, skip
  const adminSlice = stack.readCell().beginParse(); // stack[2]: admin_address as cell
  const admin = adminSlice.loadAddress();

  // Try tax-specific method
  let isTaxJetton = false;
  let feeNumerator: number | undefined;
  let feeDenominator: number | undefined;
  let feeCollector: Address | undefined;

  try {
    const feeData = await client.runMethod(address, "get_fee_params");
    const feeStack = feeData.stack as TupleReader;
    feeNumerator = feeStack.readNumber();    // fee_numerator
    feeDenominator = feeStack.readNumber();  // fee_denominator
    const feeCollectorCell = feeStack.readCell();
    feeCollector = feeCollectorCell.beginParse().loadAddress();
    isTaxJetton = true;
  } catch {
    // Not a tax jetton or get_fee_params doesn't exist
    isTaxJetton = false;
  }

  return {
    totalSupply,
    admin,
    isTaxJetton,
    feeNumerator,
    feeDenominator,
    feeCollector,
  };
}

// ─── Cell to base64 BOC helper ─────────────────────────────────────────────

export function cellToBase64(cell: Cell): string {
  return cell.toBoc().toString("base64");
}
