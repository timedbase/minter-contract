import { Cell, beginCell, Address, WalletContract } from "ton";

import walletHex from "./jetton-wallet-tax.compiled.json";
import minterHex from "./jetton-minter-tax.compiled.json";
import { Sha256 } from "@aws-crypto/sha256-js";
import BN from "bn.js";

export const JETTON_TAX_WALLET_CODE = Cell.fromBoc(walletHex.hex)[0];
export const JETTON_TAX_MINTER_CODE = Cell.fromBoc(minterHex.hex)[0];

const ONCHAIN_CONTENT_PREFIX = 0x00;
const SNAKE_PREFIX = 0x00;

// Modify these params for your own tax jetton.
// fee: feeNumerator / feeDenominator  (max 5%, enforced on-chain)
// Example: feeNumerator=30, feeDenominator=1000 → 3%
const jettonParams = {
  owner: Address.parse("EQD4gS-Nj2Gjr2FYtg-s3fXUvjzKbzHGZ5_1Xe_V0-GCp0p2"),
  name: "MyTaxJetton",
  symbol: "TAXJET",
  image: "https://www.linkpicture.com/q/download_183.png",
  description: "My tax jetton with transfer fee",
  feeNumerator: 30,      // 3%
  feeDenominator: 1000,
  feeCollector: Address.parse("EQD4gS-Nj2Gjr2FYtg-s3fXUvjzKbzHGZ5_1Xe_V0-GCp0p2"),
};

export type JettonMetaDataKeys = "name" | "description" | "image" | "symbol";

const jettonOnChainMetadataSpec: { [key in JettonMetaDataKeys]: "utf8" | "ascii" | undefined } = {
  name: "utf8",
  description: "utf8",
  image: "ascii",
  symbol: "utf8",
};

const sha256 = (str: string) => {
  const sha = new Sha256();
  sha.update(str);
  return Buffer.from(sha.digestSync());
};

export function buildTokenMetadataCell(data: { [s: string]: string | undefined }): Cell {
  const KEYLEN = 256;
  const { beginDict } = require("ton");
  const dict = beginDict(KEYLEN);

  Object.entries(data).forEach(([k, v]: [string, string | undefined]) => {
    if (!jettonOnChainMetadataSpec[k as JettonMetaDataKeys])
      throw new Error(`Unsupported onchain key: ${k}`);
    if (v === undefined || v === "") return;

    let bufferToStore = Buffer.from(v, jettonOnChainMetadataSpec[k as JettonMetaDataKeys]);
    const CELL_MAX_SIZE_BYTES = Math.floor((1023 - 8) / 8);
    const rootCell = new Cell();
    rootCell.bits.writeUint8(SNAKE_PREFIX);
    let currentCell = rootCell;

    while (bufferToStore.length > 0) {
      currentCell.bits.writeBuffer(bufferToStore.slice(0, CELL_MAX_SIZE_BYTES));
      bufferToStore = bufferToStore.slice(CELL_MAX_SIZE_BYTES);
      if (bufferToStore.length > 0) {
        const newCell = new Cell();
        currentCell.refs.push(newCell);
        currentCell = newCell;
      }
    }
    dict.storeRef(sha256(k), rootCell);
  });

  return beginCell().storeInt(ONCHAIN_CONTENT_PREFIX, 8).storeDict(dict.endDict()).endCell();
}

export function jettonTaxMinterInitData(
  owner: Address,
  metadata: { [s in JettonMetaDataKeys]?: string },
  feeNumerator: number,
  feeDenominator: number,
  feeCollector: Address
): Cell {
  if (feeDenominator === 0) throw new Error("feeDenominator must not be zero");
  if (feeNumerator * 20 > feeDenominator) throw new Error("Fee exceeds 5% maximum");

  return beginCell()
    .storeCoins(0)          // total_supply starts at 0; set via genesis (op 7)
    .storeAddress(owner)
    .storeRef(buildTokenMetadataCell(metadata))
    .storeRef(JETTON_TAX_WALLET_CODE)
    .storeUint(feeNumerator, 16)
    .storeUint(feeDenominator, 16)
    .storeAddress(feeCollector)
    .endCell();
}

export function initData() {
  return jettonTaxMinterInitData(
    jettonParams.owner,
    {
      name: jettonParams.name,
      symbol: jettonParams.symbol,
      image: jettonParams.image,
      description: jettonParams.description,
    },
    jettonParams.feeNumerator,
    jettonParams.feeDenominator,
    jettonParams.feeCollector
  );
}

export function initMessage() {
  return null;
}

export async function postDeployTest(
  walletContract: WalletContract,
  secretKey: Buffer,
  contractAddress: Address
) {
  const client = walletContract.client;

  const data = await client.callGetMethod(contractAddress, "get_jetton_data");
  console.log("Total supply:", data.stack[0][1]);
  console.log("Admin:", data.stack[2][1]);

  const fees = await client.callGetMethod(contractAddress, "get_fee_params");
  const feeNum = parseInt(fees.stack[0][1], 16);
  const feeDen = parseInt(fees.stack[1][1], 16);
  console.log(`Fee: ${feeNum}/${feeDen} = ${((feeNum / feeDen) * 100).toFixed(2)}%`);
  console.log("Fee collector:", fees.stack[2][1]);
}
