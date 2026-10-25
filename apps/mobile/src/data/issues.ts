// Issue labels and poles, bundled because GET /ballot doesn't ship them yet (APP_BUILD.md §9
// gap 3). Copied from config/issues.yaml (issues-v1); keep in sync with release.configVersions.
import type { Issue } from "@ftb/types";

export const ISSUES: Issue[] = [
  {
    id: "economy.taxation",
    parentId: "economy",
    label: "Taxation",
    levels: ["federal", "state", "local"],
    negativePole: "Higher taxes on higher incomes / corporations",
    positivePole: "Lower taxes / flat or consumption-based taxation",
  },
  {
    id: "housing.zoning",
    parentId: "housing",
    label: "Zoning & land use",
    levels: ["state", "local"],
    negativePole: "Retain restrictive zoning",
    positivePole: "Allow more housing by right",
  },
  {
    id: "education.funding",
    parentId: "education",
    label: "School funding",
    levels: ["state", "local"],
    negativePole: "Increase public school funding",
    positivePole: "Direct funding to families via vouchers or ESAs",
  },
  {
    id: "infrastructure",
    label: "Infrastructure & transit",
    levels: ["federal", "state", "local"],
    negativePole: "Increase public investment in transit and infrastructure",
    positivePole: "Prioritize private-sector / road-based infrastructure",
  },
];
