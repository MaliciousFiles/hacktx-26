import type { TravisDistrictAssignments } from "./lookup";

/**
 * Candidate roster derived from the county's CONSOLIDATED (countywide union) ballot text,
 * filtered by one address's public district assignments.
 *
 * This is NOT an official ballot style. The county's precinct sample ballot is the official
 * roster; until it is published, this is the best deterministic approximation and must be
 * labeled unreviewed. Contest titles that cannot be tied to the address's districts are
 * reported in `skipped`, never guessed.
 */
export interface ParsedContest {
  title: string;
  partisan: boolean;
  candidates: { name: string; party?: string }[];
}

export interface RosterContest {
  id: string;
  title: string;
  office: string;
  officeKind: "legislative" | "executive" | "regulatory" | "judicial" | "board";
  districtType: string;
  districtId: string;
  jurisdiction: string;
  level: "federal" | "state" | "local";
  partisan: boolean;
  candidates: { id: string; name: string; aliases: string[]; party?: string }[];
}

export interface RosterResult {
  contests: RosterContest[];
  skipped: { title: string; reason: string }[];
}

const PARTY_TAG = /^(.+?)\s*\((REP|DEM|LIB|GRN|IND|NPA|WFP)\)\s*$/;
const PARTY_NAME: Record<string, string> = {
  REP: "Republican",
  DEM: "Democrat",
  LIB: "Libertarian",
  GRN: "Green",
  IND: "Independent",
  NPA: "No party",
  WFP: "Working Families",
};

const BOILERPLATE = [
  /^Travis County Joint General and Special Elections$/,
  /^Elecciones Generales y Especiales Conjuntas del Condado de Travis$/,
  /^(November 3, 2026|3 de noviembre de 2026)$/,
  /^(To view your sample ballot visit VoteTravis\.gov|Para ver su boleta de muestra visite VoteTravis\.gov)$/,
  /^Page \d+ of \d+$/,
  /^(SAMPLE BALLOT|BOLETA DE MUESTRA)$/,
  /^(Federal|State|County) Offices$/,
  /^Oficinas (Federales|Estatales|del Condado)$/,
  /^Contests continue$/,
  /^on next page$/,
  /^Party Legend$/,
  /^Leyenda de Partidos$/,
  /^(Republican|Democrat|Libertarian|Green|Republicano|Demócrata|Libertario|Verde) = \(\w+\)$/,
  /^Write-in \/ Voto Escrito$/,
];

// Spanish half of each bilingual title. English contest titles never use these words.
const SPANISH =
  /(^\d+$)|[áéíóúñ¿]|\b(de|del|la|las|los|el|para|Núm\.?|Distrito|Juez|Lugar|Condado|Estatal|Estados|Unidos|Corte|Senador|Representante|Gobernador|Teniente|Procurador|Contralor|Comisionado|Tierras|Agricultura|Ferrocarriles|Presidente|Apelaciones|Duración|Restante|Cargo|Secretario|Tesorero|Alguacil|Precinto|Miembro|Junta|Educación|Mesa|Directiva|Puesto|Posición|Consejo|Concejo|Escolar|Ciudad|Elección|Municipal|Alcalde|Uninominal|Tasación|Central|Oficina|General Municipal)\b/i;

const NONPARTISAN_TITLE =
  /^(City of Austin, City Council|Austin ISD Board of Trustees|ACC, Trustee|Travis Central Appraisal District, Travis County, Board)/;
const NAME_TOKEN = /^(?:[\p{Lu}][\p{L}'’.-]*|“[^”]+”|"[^"]+"|[\p{Ll}]{1,3}\.?)$/u;
const NOT_NAME =
  /\b(District|Election|Proposition|Trustee|Trustees|Board|City|County|Court|Judge|Justice|Austin|Coupland|Del Valle|Elgin|Pflugerville|Independent|School|College|Community|Contests|FOR|AGAINST|Elección|Distrito|Ciudad)\b|[0-9$:?]/;

function isCandidateName(line: string): boolean {
  if (NOT_NAME.test(line) || line.length > 60) return false;
  const tokens = line.split(/\s+/);
  return (
    tokens.length >= 2 && tokens.length <= 6 && tokens.every((token) => NAME_TOKEN.test(token))
  );
}

function cleanName(raw: string): { name: string; aliases: string[] } {
  const normalized = raw.replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();
  const nick = /"([^"]+)"/.exec(normalized);
  if (!nick) return { name: normalized, aliases: [] };
  const name = normalized
    .replace(/\s*"[^"]+"\s*/, " ")
    .replace(/\s+/g, " ")
    .trim();
  const last = name.split(" ").slice(-1)[0]!;
  return { name, aliases: [normalized, `${nick[1]} ${last}`] };
}

function cleanLines(text: string): string[] {
  return text
    .replace(/(SAMPLE BALLOT|BOLETA DE MUESTRA)/g, "\n$1\n")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line && !BOILERPLATE.some((pattern) => pattern.test(line)));
}

/** The title is the LAST English block in the buffered lines (English then Spanish). */
function titleFromBuffer(buffer: string[]): string {
  const blocks: string[][] = [];
  let previousSpanish = true;
  for (const line of buffer) {
    const spanish = SPANISH.test(line);
    if (!spanish && previousSpanish) blocks.push([]);
    if (!spanish) blocks[blocks.length - 1]!.push(line);
    previousSpanish = spanish;
  }
  return (blocks[blocks.length - 1] ?? []).join(" ").replace(/\s+/g, " ").trim();
}

/** Parse contests with a candidate list. Measures (FOR/AGAINST) are not politicians. */
export function parseConsolidatedBallot(text: string): ParsedContest[] {
  const lines = cleanLines(text);
  const contests: ParsedContest[] = [];
  let buffer: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const party = PARTY_TAG.exec(line);
    if (party) {
      const candidates: ParsedContest["candidates"] = [];
      let j = i;
      for (; j < lines.length; j++) {
        const match = PARTY_TAG.exec(lines[j]!);
        if (!match) break;
        candidates.push({ name: match[1]!.trim(), party: PARTY_NAME[match[2]!] });
      }
      const title = titleFromBuffer(buffer);
      if (title) contests.push({ title, partisan: true, candidates });
      buffer = [];
      i = j - 1;
      continue;
    }
    // Nonpartisan: recognized English title, Spanish half, then plain name lines.
    if (NONPARTISAN_TITLE.test(line)) {
      const english = [line];
      let j = i + 1;
      while (j < lines.length && !SPANISH.test(lines[j]!)) english.push(lines[j++]!);
      while (j < lines.length && SPANISH.test(lines[j]!)) j++;
      const candidates: ParsedContest["candidates"] = [];
      while (j < lines.length && isCandidateName(lines[j]!))
        candidates.push({ name: lines[j++]!.trim() });
      if (candidates.length)
        contests.push({
          title: english.join(" ").replace(/\s+/g, " ").trim(),
          partisan: false,
          candidates,
        });
      buffer = [];
      i = j - 1;
      continue;
    }
    buffer.push(line);
    if (buffer.length > 40) buffer = buffer.slice(-40);
  }
  return contests;
}

function slug(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const num = (value: string): string => String(Number(value.replace(/\D/g, "")));

type Rule = {
  pattern: RegExp;
  build: (match: RegExpExecArray) => {
    office: string;
    officeKind: RosterContest["officeKind"];
    districtType: string;
    districtId: string;
    jurisdiction: string;
    level: RosterContest["level"];
    /** Which district assignment must match, if any. */
    require?: (d: TravisDistrictAssignments) => string;
    /** The county's code for this district type cannot be mapped to the ballot's number. */
    unmappable?: string;
  };
};

const statewide = (office: string, officeKind: RosterContest["officeKind"]) => ({
  office,
  officeKind,
  districtType: office,
  districtId: "TX",
  jurisdiction: "us/tx",
  level: "state" as const,
});

const RULES: Rule[] = [
  {
    pattern: /^United States Senator$/,
    build: () => ({ ...statewide("us_senate", "legislative"), level: "federal" }),
  },
  {
    pattern: /^United States Representative, District (\d+)$/,
    build: (m) => ({
      office: "us_house",
      officeKind: "legislative",
      districtType: "us_house",
      districtId: num(m[1]!),
      jurisdiction: "us/tx",
      level: "federal",
      require: (d) => num(d.Congressional),
    }),
  },
  { pattern: /^Governor$/, build: () => statewide("governor", "executive") },
  { pattern: /^Lieutenant Governor$/, build: () => statewide("tx_lt_governor", "executive") },
  { pattern: /^Attorney General$/, build: () => statewide("tx_ag", "executive") },
  {
    pattern: /^Comptroller of Public Accounts$/,
    build: () => statewide("tx_comptroller", "executive"),
  },
  {
    pattern: /^Commissioner of the General Land Office$/,
    build: () => statewide("tx_land_commissioner", "executive"),
  },
  {
    pattern: /^Commissioner of Agriculture$/,
    build: () => statewide("tx_agriculture_commissioner", "executive"),
  },
  {
    pattern: /^Railroad Commissioner$/,
    build: () => statewide("tx_railroad_commissioner", "regulatory"),
  },
  {
    pattern: /^(Chief Justice|Justice), Supreme Court/,
    build: () => statewide("tx_supreme_court", "judicial"),
  },
  {
    pattern: /^Judge, Court of Criminal Appeals/,
    build: () => statewide("tx_court_of_criminal_appeals", "judicial"),
  },
  {
    pattern: /^(Chief Justice|Justice), 15th Court of Appeals/,
    build: () => statewide("tx_15th_court_of_appeals", "judicial"),
  },
  {
    // Travis County is in the 3rd Court of Appeals District.
    pattern: /^(Chief Justice|Justice), 3rd Court of Appeals/,
    build: () => ({
      ...statewide("tx_3rd_court_of_appeals", "judicial"),
      districtType: "court_of_appeals",
      districtId: "3",
    }),
  },
  {
    pattern: /^Member, State Board of Education, District (\d+)$/,
    build: (m) => ({
      office: "tx_sboe",
      officeKind: "board",
      districtType: "tx_sboe",
      districtId: num(m[1]!),
      jurisdiction: "us/tx",
      level: "state",
      require: (d) => num(d.SBOE),
    }),
  },
  {
    pattern: /^State Senator, District (\d+)$/,
    build: (m) => ({
      office: "tx_senate",
      officeKind: "legislative",
      districtType: "tx_senate",
      districtId: num(m[1]!),
      jurisdiction: "us/tx",
      level: "state",
      require: (d) => num(d.Senate),
    }),
  },
  {
    pattern: /^State Representative, District (\d+)$/,
    build: (m) => ({
      office: "tx_house",
      officeKind: "legislative",
      districtType: "tx_house",
      districtId: num(m[1]!),
      jurisdiction: "us/tx",
      level: "state",
      require: (d) => num(d.Legislative),
    }),
  },
  {
    pattern: /^District Judge, (\d+)(?:st|nd|rd|th) Judicial District$/,
    build: (m) => ({
      office: "tx_district_judge",
      officeKind: "judicial",
      districtType: "judicial_district",
      districtId: num(m[1]!),
      jurisdiction: "us/tx/travis",
      level: "state",
    }),
  },
  {
    pattern: /^County Judge$/,
    build: () => ({
      office: "county_judge",
      officeKind: "executive",
      districtType: "county",
      districtId: "travis",
      jurisdiction: "us/tx/travis",
      level: "local",
    }),
  },
  {
    pattern: /^Judge, (County Court at Law|Probate Court) No\. (\d+)$/,
    build: (m) => ({
      office: m[1] === "Probate Court" ? "probate_judge" : "county_court_at_law_judge",
      officeKind: "judicial",
      districtType: "county_court",
      districtId: num(m[2]!),
      jurisdiction: "us/tx/travis",
      level: "local",
    }),
  },
  ...(["District Clerk", "County Clerk", "County Treasurer"] as const).map((title): Rule => ({
    pattern: new RegExp(`^${title}$`),
    build: () => ({
      office: slug(title).replace(/-/g, "_"),
      officeKind: "executive",
      districtType: "county",
      districtId: "travis",
      jurisdiction: "us/tx/travis",
      level: "local",
    }),
  })),
  {
    pattern: /^County Commissioner, Precinct (\d+)$/,
    build: (m) => ({
      office: "county_commissioner",
      officeKind: "legislative",
      districtType: "commissioner_precinct",
      districtId: num(m[1]!),
      jurisdiction: "us/tx/travis",
      level: "local",
      require: (d) => num(d.Commissioner),
    }),
  },
  {
    pattern: /^Justice of the Peace, Precinct (\d+)$/,
    build: (m) => ({
      office: "justice_of_the_peace",
      officeKind: "judicial",
      districtType: "jp_precinct",
      districtId: num(m[1]!),
      jurisdiction: "us/tx/travis",
      level: "local",
      require: (d) => num(d.JPConstable),
    }),
  },
  {
    pattern: /^County Constable, Precinct (\d+)/,
    build: (m) => ({
      office: "county_constable",
      officeKind: "executive",
      districtType: "constable_precinct",
      districtId: num(m[1]!),
      jurisdiction: "us/tx/travis",
      level: "local",
      require: (d) => num(d.JPConstable),
    }),
  },
  {
    pattern: /^Travis Central Appraisal District, Travis County, Board of Directors, Place (\d+)$/,
    build: (m) => ({
      office: "appraisal_district_director",
      officeKind: "board",
      districtType: "tcad_place",
      districtId: num(m[1]!),
      jurisdiction: "us/tx/travis",
      level: "local",
    }),
  },
  {
    pattern: /^City of Austin, City Council Member, District (\d+)$/,
    build: (m) => ({
      office: "city_council",
      officeKind: "legislative",
      districtType: "city_council",
      districtId: num(m[1]!),
      jurisdiction: "us/tx/austin",
      level: "local",
      require: (d) => num(d.MuniSMD),
    }),
  },
  {
    pattern: /^Austin ISD Board of Trustees, District (\d+)$/,
    build: (m) => ({
      office: "school_board",
      officeKind: "board",
      districtType: "austin_isd_district",
      districtId: num(m[1]!),
      jurisdiction: "us/tx/austin-isd",
      level: "local",
      // The address index's ISDSMD code (e.g. T44) is not the Austin ISD trustee district number.
      unmappable: "county ISD single-member code is not mapped to Austin ISD trustee districts",
    }),
  },
  {
    pattern: /^Austin ISD Board of Trustees, At-Large Position (\d+)$/,
    build: (m) => ({
      office: "school_board",
      officeKind: "board",
      districtType: "austin_isd_at_large",
      districtId: num(m[1]!),
      jurisdiction: "us/tx/austin-isd",
      level: "local",
    }),
  },
  {
    pattern: /^ACC, Trustee, Place (\d+)$/,
    build: (m) => ({
      office: "college_trustee",
      officeKind: "board",
      districtType: "acc_place",
      districtId: num(m[1]!),
      jurisdiction: "us/tx/acc",
      level: "local",
    }),
  },
];

/**
 * Keep contests that appear on a ballot for these district assignments. Anything that does not
 * match a rule (other cities, other school districts, unknown offices) is skipped with a reason.
 */
export function selectRoster(
  contests: ParsedContest[],
  districts: TravisDistrictAssignments,
): RosterResult {
  const result: RosterResult = { contests: [], skipped: [] };
  const usedIds = new Set<string>();
  for (const contest of contests) {
    const title = contest.title;
    let matched = false;
    for (const rule of RULES) {
      const match = rule.pattern.exec(title);
      if (!match) continue;
      matched = true;
      const built = rule.build(match);
      if (built.unmappable) {
        result.skipped.push({ title, reason: built.unmappable });
        break;
      }
      if (built.require && built.require(districts) !== built.districtId) {
        result.skipped.push({
          title,
          reason: `district ${built.districtId} is not this address's district (${built.require(districts)})`,
        });
        break;
      }
      let id = `${built.office}-${slug(built.districtId)}-${slug(title).slice(0, 40)}`;
      if (usedIds.has(id)) id = `${id}-${usedIds.size}`;
      usedIds.add(id);
      const used = new Set<string>();
      result.contests.push({
        id,
        title,
        ...built,
        partisan: contest.partisan,
        candidates: contest.candidates.map((candidate) => {
          const { name, aliases } = cleanName(candidate.name);
          let candidateId = `${id}-${slug(name)}`.slice(0, 120);
          if (used.has(candidateId)) candidateId = `${candidateId}-${used.size}`;
          used.add(candidateId);
          return {
            id: candidateId,
            name,
            aliases,
            ...(candidate.party ? { party: candidate.party } : {}),
          };
        }),
      });
      break;
    }
    if (!matched)
      result.skipped.push({ title, reason: "not a contest for this address's jurisdictions" });
  }
  return result;
}
