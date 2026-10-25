import { describe, expect, it } from "vitest";
import {
  BIOGUIDE_BOUND_ADAPTERS,
  isCongressionalOffice,
  isTxAgOffice,
  isUsHouseOffice,
  isUsSenateOffice,
} from "./offices";

describe("office classification", () => {
  it("recognizes only explicit US House / Senate labels as congressional", () => {
    expect(isUsHouseOffice("us_house")).toBe(true);
    expect(isUsHouseOffice("US House")).toBe(true);
    expect(isUsSenateOffice("us_senate")).toBe(true);
    expect(isCongressionalOffice("us_house")).toBe(true);
    expect(isCongressionalOffice("tx_house")).toBe(false);
    expect(isCongressionalOffice("tx_senate")).toBe(false);
    expect(isCongressionalOffice("representative")).toBe(false);
    expect(isCongressionalOffice("senator")).toBe(false);
    expect(isCongressionalOffice("congress")).toBe(false);
    expect(isCongressionalOffice("tx_ag")).toBe(false);
    expect(isCongressionalOffice("governor")).toBe(false);
  });

  it("recognizes AG office labels without treating them as congressional", () => {
    expect(isTxAgOffice("tx_ag")).toBe(true);
    expect(isTxAgOffice("attorney_general")).toBe(true);
    expect(isCongressionalOffice("attorney_general")).toBe(false);
  });

  it("lists only federal adapters as bioguide-bound", () => {
    expect(BIOGUIDE_BOUND_ADAPTERS.has("house-clerk")).toBe(true);
    expect(BIOGUIDE_BOUND_ADAPTERS.has("socrata-votes")).toBe(false);
    expect(BIOGUIDE_BOUND_ADAPTERS.has("ag-opinions")).toBe(false);
    expect(BIOGUIDE_BOUND_ADAPTERS.has("tlo-billhistory")).toBe(false);
  });
});
