/**
 * Reading a Pyth `PriceUpdateV2` account.
 *
 * The layout is the same one the program verifies, duplicated here so the
 * interface shows exactly what the program will see rather than a number from
 * a different source. The account is 134 bytes.
 */
import { Connection, PublicKey } from "@solana/web3.js";

export const PYTH_RECEIVER = new PublicKey("rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ");

const OFF_FEED_ID = 8 + 32 + 1;
const OFF_PRICE = OFF_FEED_ID + 32;
const OFF_CONF = OFF_PRICE + 8;
const OFF_EXPO = OFF_CONF + 8;
const OFF_PUBLISH = OFF_EXPO + 4;

export type OracleRead = {
  feedId: string;
  price: bigint;
  conf: bigint;
  exponent: number;
  publishTime: number;
  /** Whoever actually owns the account. Compared against the owner the market
   *  recorded at registration, which is what the program checks. */
  owner: string;
  /** True when that owner is not the Pyth receiver, i.e. this is a mirror. */
  isMirror: boolean;
};

export function decodePriceUpdate(data: Buffer, owner: PublicKey): OracleRead | null {
  if (data.length < OFF_PUBLISH + 8) return null;
  return {
    feedId: Buffer.from(data.subarray(OFF_FEED_ID, OFF_FEED_ID + 32)).toString("hex"),
    price: data.readBigInt64LE(OFF_PRICE),
    conf: data.readBigUInt64LE(OFF_CONF),
    exponent: data.readInt32LE(OFF_EXPO),
    publishTime: Number(data.readBigInt64LE(OFF_PUBLISH)),
    owner: owner.toBase58(),
    isMirror: !owner.equals(PYTH_RECEIVER),
  };
}

export async function readOracles(
  connection: Connection,
  accounts: PublicKey[],
): Promise<(OracleRead | null)[]> {
  if (accounts.length === 0) return [];
  const infos = await connection.getMultipleAccountsInfo(accounts, "confirmed");
  return infos.map((info) =>
    info ? decodePriceUpdate(Buffer.from(info.data), info.owner) : null,
  );
}

/**
 * The same judgement the program makes, so the interface can warn before a
 * click rather than after a failed transaction.
 *
 * Owner is checked against `expectedOwner`, which is what the market recorded
 * when it was registered. A mirrored feed has a different owner than the Pyth
 * receiver and is still perfectly settleable; being a mirror is a disclosure,
 * not a fault. What would be a fault is the owner having changed since
 * registration, and that is what this catches.
 */
export function oracleStatus(
  read: OracleRead | null,
  nowUnix: number,
  maxStalenessSecs: number,
  maxConfBps: number,
  expectedOwner?: string,
): { ok: boolean; reason: string | null; ageSecs: number; confBps: number; isMirror: boolean } {
  if (!read)
    return { ok: false, reason: "Feed account not found", ageSecs: 0, confBps: 0, isMirror: false };
  const ageSecs = nowUnix - read.publishTime;
  const confBps = read.price > 0n ? Number((read.conf * 10_000n) / read.price) : 0;
  const base = { ageSecs, confBps, isMirror: read.isMirror };
  if (expectedOwner && read.owner !== expectedOwner)
    return { ok: false, reason: "The feed account changed owner since this market was registered", ...base };
  if (read.exponent !== -8)
    return { ok: false, reason: `Exponent is ${read.exponent}, expected -8`, ...base };
  if (read.price <= 0n) return { ok: false, reason: "Price is not positive", ...base };
  if (ageSecs > maxStalenessSecs)
    return { ok: false, reason: `Print is older than the ${maxStalenessSecs}s limit`, ...base };
  if (maxConfBps > 0 && confBps > maxConfBps)
    return { ok: false, reason: `Confidence band is ${confBps} bps, limit is ${maxConfBps}`, ...base };
  return { ok: true, reason: null, ...base };
}
