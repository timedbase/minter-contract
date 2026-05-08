import { beginCell, Cell, Builder, Dictionary, DictionaryValue } from "@ton/core";

const ONCHAIN_CONTENT_PREFIX = 0x00;
const SNAKE_PREFIX = 0x00;

// Max bytes that fit in a cell after the 1-byte prefix (1023 bits total / 8 = 127 bytes, minus 1 for prefix = 126)
const CELL_MAX_SIZE_BYTES = 126;
// Continuation cells have no prefix, so they can hold up to 127 bytes
const CONTINUATION_MAX_SIZE_BYTES = 127;

export type JettonMetadataKeys = "name" | "description" | "image" | "symbol";

export interface JettonMetadata {
  name: string;
  symbol: string;
  description?: string;
  image?: string;
}

const metadataEncoding: Record<JettonMetadataKeys, "utf8" | "ascii"> = {
  name: "utf8",
  description: "utf8",
  image: "ascii",
  symbol: "utf8",
};

/**
 * Build a snake-encoded cell from a string value.
 * Root cell: 0x00 prefix byte + up to 126 bytes of data.
 * Each continuation cell: up to 127 bytes, chained via refs.
 */
export function snakeCell(value: string, encoding: "utf8" | "ascii"): Cell {
  const encoder = new TextEncoder();
  let bytes: Uint8Array;

  if (encoding === "ascii") {
    // ASCII — encode as plain bytes
    bytes = new Uint8Array(value.length);
    for (let i = 0; i < value.length; i++) {
      bytes[i] = value.charCodeAt(i) & 0xff;
    }
  } else {
    // UTF-8
    bytes = encoder.encode(value);
  }

  // Build chain of cells tail-to-head
  // Split into chunks: first chunk = CELL_MAX_SIZE_BYTES, rest = CONTINUATION_MAX_SIZE_BYTES
  const chunks: Uint8Array[] = [];
  if (bytes.length === 0) {
    chunks.push(new Uint8Array(0));
  } else {
    let offset = 0;
    // First chunk (root) has the prefix byte, so max 126 data bytes
    chunks.push(bytes.slice(offset, offset + CELL_MAX_SIZE_BYTES));
    offset += CELL_MAX_SIZE_BYTES;
    while (offset < bytes.length) {
      chunks.push(bytes.slice(offset, offset + CONTINUATION_MAX_SIZE_BYTES));
      offset += CONTINUATION_MAX_SIZE_BYTES;
    }
  }

  // Build tail to head so we can store refs
  let currentCell: Cell | null = null;
  for (let i = chunks.length - 1; i >= 0; i--) {
    const b = beginCell();
    if (i === 0) {
      // Root cell: write snake prefix
      b.storeUint(SNAKE_PREFIX, 8);
    }
    // Write chunk bytes
    for (const byte of chunks[i]) {
      b.storeUint(byte, 8);
    }
    if (currentCell !== null) {
      b.storeRef(currentCell);
    }
    currentCell = b.endCell();
  }

  return currentCell!;
}

/**
 * Build the on-chain metadata cell.
 * Format: 0x00 prefix byte + HashmapE 256 key→snake-cell
 * Keys are SHA-256 hashes of the field names.
 */
export async function buildMetadataCell(data: JettonMetadata): Promise<Cell> {
  // SHA-256 via Web Crypto
  const sha256 = async (str: string): Promise<bigint> => {
    const encoded = new TextEncoder().encode(str);
    const hashBuf = await crypto.subtle.digest("SHA-256", encoded);
    const hashArr = new Uint8Array(hashBuf);
    // Convert to bigint (256-bit key for the dictionary)
    let n = 0n;
    for (const byte of hashArr) {
      n = (n << 8n) | BigInt(byte);
    }
    return n;
  };

  // Build a Dictionary<bigint, Cell> using @ton/core
  // We use a custom dictionary with 256-bit keys
  const cellValue: DictionaryValue<Cell> = {
    serialize(src: Cell, builder: Builder) {
      builder.storeRef(src);
    },
    parse(src) {
      return src.loadRef();
    },
  };

  const dict = Dictionary.empty<bigint, Cell>(Dictionary.Keys.BigUint(256), cellValue);

  const entries = Object.entries(data) as [JettonMetadataKeys, string | undefined][];
  for (const [key, value] of entries) {
    if (value === undefined || value === "") continue;
    const encoding = metadataEncoding[key];
    if (!encoding) continue;
    const keyHash = await sha256(key);
    const valueCell = snakeCell(value, encoding);
    dict.set(keyHash, valueCell);
  }

  return beginCell()
    .storeUint(ONCHAIN_CONTENT_PREFIX, 8)
    .storeDict(dict)
    .endCell();
}
