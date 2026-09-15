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
  /** True when the receiver program does not own the account. */
  untrustedOwner: boolean;
};

export function decodePriceUpdate(data: Buffer, owner: PublicKey): OracleRead | null {
  if (data.length < OFF_PUBLISH + 8) return null;
  return {
    feedId: Buffer.from(data.subarray(OFF_FEED_ID, OFF_FEED_ID + 32)).toString("hex"),
    price: data.readBigInt64LE(OFF_PRICE),
    conf: data.readBigUInt64LE(OFF_CONF),
    exponent: data.readInt32LE(OFF_EXPO),
    publishTime: Number(data.readBigInt64LE(OFF_PUBLISH)),
    untrustedOwner: !owner.equals(PYTH_RECEIVER),
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

/** How the program judges a price, mirrored so the UI can warn before a click. */
export function oracleStatus(
  read: OracleRead | null,
  nowUnix: number,
  maxStalenessSecs: number,
  maxConfBps: number,
): { ok: boolean; reason: string | null; ageSecs: number; confBps: number } {
  if (!read) return { ok: false, reason: "Feed account not found", ageSecs: 0, confBps: 0 };
  const ageSecs = nowUnix - read.publishTime;
  const confBps = read.price > 0n ? Number((read.conf * 10_000n) / read.price) : 0;
  if (read.untrustedOwner)
    return { ok: false, reason: "Account is not owned by the Pyth receiver", ageSecs, confBps };
  if (read.exponent !== -8)
    return { ok: false, reason: `Exponent is ${read.exponent}, expected -8`, ageSecs, confBps };
  if (read.price <= 0n) return { ok: false, reason: "Price is not positive", ageSecs, confBps };
  if (ageSecs > maxStalenessSecs)
    return { ok: false, reason: `Print is older than the ${maxStalenessSecs}s limit`, ageSecs, confBps };
  if (maxConfBps > 0 && confBps > maxConfBps)
    return { ok: false, reason: `Confidence band is ${confBps} bps, limit is ${maxConfBps}`, ageSecs, confBps };
  return { ok: true, reason: null, ageSecs, confBps };
}
