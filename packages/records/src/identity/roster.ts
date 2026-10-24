import { z } from "zod";
import { normalizeName } from "../model";
import { array, parseXml, xmlText } from "../xml";
import type { HouseRoster, HouseRosterMember } from "./types";

export const HOUSE_ROSTER_URL = "https://clerk.house.gov/xml/lists/MemberData.xml";
export const BIOGUIDE_ID = /^[A-Z]\d{6}$/;
export const IDENTITY_ADAPTER = "official-house-identity/v1";

const text = xmlText.optional().default("");
const rosterSchema = z.object({
  "title-info": z.object({
    "congress-num": xmlText.optional(),
    "@congress-num": z.string().optional(),
  }),
  members: z.union([
    z.object({ member: z.unknown().optional() }),
    z.literal(""),
  ]),
});
const memberSchema = z.object({
  statedistrict: text,
  "member-info": z.object({
    bioguideID: text,
    "official-name": text,
    firstname: text,
    middlename: text,
    lastname: text,
    suffix: text,
    state: z.object({ "@postal-code": z.string().regex(/^[A-Z]{2}$/) }).optional(),
    district: text,
  }),
});

/** Parse the Clerk's actual MemberData > members > member structure. */
export function parseHouseRoster(source: string): HouseRoster {
  const root = rosterSchema.parse(parseXml(source, "MemberData").MemberData);
  const title = root["title-info"];
  const congress = z.string().regex(/^\d+$/).transform(Number)
    .pipe(z.number().int().positive())
    .parse(title["congress-num"] ?? title["@congress-num"]);
  const members: HouseRosterMember[] = [];

  for (const [index, raw] of array(root.members === "" ? undefined : root.members.member).entries()) {
    const node = memberSchema.parse(raw);
    const info = node["member-info"];
    // Vacant districts have no person to identify. Named entries without an ID
    // are malformed, not silently omitted (which could hide a name collision).
    const emptyOrVacant = (value: string) => /^(vacant|vacancy)?$/.test(normalizeName(value));
    if ([info.bioguideID, info.firstname, info.lastname, info["official-name"]].every(emptyOrVacant)) continue;
    if (!BIOGUIDE_ID.test(info.bioguideID)) throw new Error("Invalid roster bioguide ID");
    if (!normalizeName(info["official-name"]).includes(" ") && !(info.firstname && info.lastname)) {
      throw new Error("Roster member lacks a full name");
    }
    const state = z.string().regex(/^[A-Z]{2}$/).parse(info.state?.["@postal-code"]);
    // The Clerk uses AQ00 for American Samoa, whose postal code is AS.
    // Preserve that source identifier, but use the postal state for identity.
    const districtState = node.statedistrict.startsWith("AQ") ? "AS" : node.statedistrict.slice(0, 2);
    if (node.statedistrict && (!/^[A-Z]{2}\d{2}$/.test(node.statedistrict) ||
        districtState !== state)) throw new Error("Inconsistent roster state");

    members.push({
      bioguideId: info.bioguideID,
      officialName: info["official-name"],
      firstName: info.firstname,
      middleName: info.middlename,
      lastName: info.lastname,
      suffix: info.suffix,
      state,
      district: info.district,
      stateDistrict: node.statedistrict,
      locator: `/MemberData/members/member[${index + 1}]`,
    });
  }
  return { congress, members };
}

export function matchesFullName(names: Set<string>, officialNames: string[]): boolean {
  return officialNames.some((value) => {
    const name = normalizeName(value);
    return name.includes(" ") && names.has(name);
  });
}

export function rosterNames(member: HouseRosterMember): string[] {
  return [
    normalizeName(member.officialName) !== normalizeName(member.lastName) ? member.officialName : "",
    member.firstName && member.lastName ? `${member.firstName} ${member.lastName}` : "",
  ];
}
