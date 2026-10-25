/**
 * Texas Legislature session codes, TLO style: regular sessions are `89R`; called
 * (special) sessions are `891`, `892`, … Legislature N convenes in 1847 + 2N.
 *
 * Called-session counts are public record (Legislative Reference Library, "Texas
 * Legislative Sessions"); a legislature absent from this table is treated as
 * regular-session-only, which can only under-collect, never misattribute.
 */
const CALLED_SESSIONS: Record<number, number> = {
  78: 4, 79: 3, 80: 0, 81: 1, 82: 1, 83: 3, 84: 0, 85: 1, 86: 0, 87: 3, 88: 4, 89: 2,
};

export function legislatureYear(legislature: number): number {
  return 1847 + 2 * legislature;
}

export function legislatureOfYear(year: number): number {
  return Math.floor((year - 1847) / 2);
}

/** Session codes (newest first) of legislatures whose regular session year is in [sinceYear, beforeYear]. */
export function texasSessionCodes(
  sinceYear: number,
  beforeYear: number,
  options: { calledSessions?: boolean } = {},
): string[] {
  const codes: string[] = [];
  const last = legislatureOfYear(beforeYear);
  const first = Math.max(71, legislatureOfYear(sinceYear));
  for (let legislature = last; legislature >= first; legislature--) {
    const year = legislatureYear(legislature);
    if (year < sinceYear || year > beforeYear) continue;
    if (options.calledSessions !== false) {
      for (let called = CALLED_SESSIONS[legislature] ?? 0; called >= 1; called--) codes.push(`${legislature}${called}`);
    }
    codes.push(`${legislature}R`);
  }
  return codes;
}

/** `89R` → 89; `891` → 89. */
export function sessionLegislature(code: string): number {
  const match = /^(\d{2,3})(R|[1-9])$/.exec(code);
  if (!match) throw new Error(`Invalid Texas session code: ${code}`);
  return Number(match[1]);
}

export function isRegularSession(code: string): boolean {
  return /R$/.test(code);
}
