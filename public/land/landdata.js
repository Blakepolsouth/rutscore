/* Land Manager reference data.
   Seeding rates are broadcast rates in lbs/acre from university extension guides
   (University of Arkansas FSA-9096, Mississippi State P3604, University of Georgia WMS No. 1). Ranges vary by source and region;
   the bag label always wins. Rates are pure live seed: coated seed (common with clovers) needs more product. */

export const CROPS = [
  // key, name, season, low, high, default bag lbs
  ["wheat", "Wheat (forage)", "cool", 90, 150, 50],
  ["oats", "Oats", "cool", 90, 150, 50],
  ["rye", "Cereal rye", "cool", 90, 150, 50],
  ["crimson", "Crimson clover", "cool", 20, 30, 25],
  ["whiteclover", "White / ladino clover", "cool", 4, 8, 5],
  ["redclover", "Red clover", "cool", 8, 15, 25],
  ["arrowleaf", "Arrowleaf clover", "cool", 8, 15, 25],
  ["winterpeas", "Austrian winter peas", "cool", 20, 30, 50],
  ["turnips", "Turnips", "cool", 2, 4, 5],
  ["kale", "Kale", "cool", 3.5, 4, 5],
  ["alfalfa", "Alfalfa", "cool", 20, 20, 25],
  ["soybeans", "Soybeans", "warm", 60, 60, 50],
  ["peas", "Cowpeas / iron clay peas", "warm", 60, 60, 50],
  ["buckwheat", "Buckwheat", "warm", 50, 50, 50],
  ["millet", "Millet", "warm", 40, 40, 50],
  ["chufa", "Chufa", "warm", 30, 30, 50],
  ["sorghum", "Grain sorghum", "warm", 10, 10, 50]
];

/* Partner products. Leave null for the generic version. A partner (e.g. a feed and seed company) fills this in and
   their products show up in the pickers with label rates and a dealer link.
   Shape: { name, dealer: "https://...", products: [{ name, kind: "seed" | "attractant" | "feed", rate, unit, bag, url }] }
   seed: rate = lbs/acre · attractant: rate = lbs per site per refresh · feed: bag = lbs per bag */
export const PARTNER = null;

/* Typical windows by latitude band. Months are 1-12. Approximate and regional: the county extension office has the exact dates. */
export function calendar(lat) {
  const south = lat < 33.5, mid = lat >= 33.5 && lat < 38;
  return [
    { k: "protein", label: "Protein feed for antler growth", from: [3, 1], to: [8, 31], color: "var(--good)" },
    { k: "minerals", label: "Mineral sites", from: [3, 1], to: [8, 31], color: "#b88cff" },
    { k: "warm", label: "Plant warm-season plots", from: south ? [4, 1] : mid ? [4, 15] : [5, 1], to: south ? [5, 31] : mid ? [6, 15] : [6, 30], color: "#4cb3ff" },
    { k: "cool", label: "Plant fall plots", from: south ? [9, 15] : mid ? [8, 25] : [8, 1], to: south ? [11, 1] : mid ? [10, 10] : [9, 15], color: "var(--fair)" },
    { k: "attract", label: "Attractant season", from: [8, 15], to: [1, 31], color: "var(--gold)" },
    { k: "recover", label: "Post-rut recovery feed", from: [12, 15], to: [2, 28], color: "var(--tough)" }
  ];
}
