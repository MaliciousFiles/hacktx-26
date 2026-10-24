import { XMLParser, XMLValidator } from "fast-xml-parser";
import { z } from "zod";

// No value coercion (IDs and leading zeros must survive). External entities are
// never resolved; reject entity declarations rather than expanding untrusted XML.
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  removeNSPrefix: true,
});

export function parseXml(text: string, root: string): Record<string, unknown> {
  if (/<!ENTITY\b/i.test(text)) throw new Error("XML entity declarations are not accepted");
  if (XMLValidator.validate(text) !== true) throw new Error("Malformed XML");
  const doc = z.record(z.string(), z.unknown()).parse(parser.parse(text));
  if (!(root in doc) || /^(html|error)$/i.test(root)) throw new Error(`Expected XML root <${root}>`);
  return doc;
}

export function array<T>(value: T | T[] | undefined | null): T[] {
  return value === undefined || value === null || value === "" ? [] : Array.isArray(value) ? value : [value];
}

export const xmlText = z.union([z.string(), z.object({ "#text": z.string().optional() })])
  .transform((value) => typeof value === "string" ? value : value["#text"] ?? "");

export const count = z.string().regex(/^\d+$/).transform(Number).refine(Number.isSafeInteger);
