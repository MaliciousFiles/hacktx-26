export const tloBillTypes = ["HB", "SB", "HJR", "SJR", "HCR", "SCR", "HR", "SR"] as const;
export type TloBillType = (typeof tloBillTypes)[number];

export interface TloBillIdentity {
  session: string;
  billType: TloBillType;
  billNumber: number;
}

const directories: Record<TloBillType, string> = {
  HB: "house_bills",
  SB: "senate_bills",
  HJR: "house_joint_resolutions",
  SJR: "senate_joint_resolutions",
  HCR: "house_concurrent_resolutions",
  SCR: "senate_concurrent_resolutions",
  HR: "house_resolutions",
  SR: "senate_resolutions",
};

/** TLO's structured bill-history archive starts with the 71st Legislature.
 * Regular sessions use 89R; called sessions use 891, 892, etc., not 89S1. */
export function tloBillIdentity(
  session: string,
  billType: string,
  billNumber: number,
): TloBillIdentity {
  const match = /^([1-9]\d{1,2})(R|[1-9])$/.exec(session);
  if (!match || Number(match[1]) < 71)
    throw new Error("Invalid TLO session (expected 71R, 89R, 891, etc.)");
  if (!(tloBillTypes as readonly string[]).includes(billType))
    throw new Error("Invalid Texas bill/resolution prefix");
  if (!Number.isSafeInteger(billNumber) || billNumber < 1 || billNumber > 99_999) {
    throw new Error("Texas bill/resolution number must be an integer from 1 through 99999");
  }
  return { session, billType: billType as TloBillType, billNumber };
}

/** Builds one explicit XML source; does not discover or download the archive. */
export function tloBillHistoryUrl(session: string, billType: string, billNumber: number): string {
  const identity = tloBillIdentity(session, billType, billNumber);
  const base = Math.floor(billNumber / 100) * 100;
  const pad = (number: number) => String(number).padStart(5, "0");
  const range = `${billType}${pad(base || 1)}_${billType}${pad(base + 99)}`;
  const file = encodeURIComponent(`${billType} ${billNumber}.xml`);
  return `ftp://ftp.legis.state.tx.us/bills/${session}/billhistory/${directories[identity.billType]}/${range}/${file}`;
}

/** Only the explicitly approved TLO FTP XML source is accepted by this adapter. */
export function parseTloBillHistoryUrl(value: string): TloBillIdentity {
  const url = new URL(value);
  if (
    url.protocol !== "ftp:" ||
    url.hostname !== "ftp.legis.state.tx.us" ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error("Expected a public TLO FTP bill-history XML URL");
  }
  const path = decodeURIComponent(url.pathname);
  const match =
    /^\/bills\/([^/]+)\/billhistory\/[^/]+\/[^/]+\/(HB|SB|HJR|SJR|HCR|SCR|HR|SR) ([1-9]\d{0,4})\.xml$/.exec(
      path,
    );
  if (!match) throw new Error("Expected a TLO bill-history XML path");
  const identity = tloBillIdentity(match[1], match[2], Number(match[3]));
  const expected = new URL(
    tloBillHistoryUrl(identity.session, identity.billType, identity.billNumber),
  );
  if (path !== decodeURIComponent(expected.pathname))
    throw new Error("Incorrect TLO bill-history directory/range");
  return identity;
}
