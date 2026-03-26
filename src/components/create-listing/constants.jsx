
export const AUTHENTICATORS = {
  "PSA/DNA": { score: 95, tier: "premium" },
  "JSA": { score: 92, tier: "premium" },
  "Beckett (BAS)": { score: 93, tier: "premium" },
  "SGC": { score: 90, tier: "premium" },
  "CGC": { score: 91, tier: "premium" },
  "Upper Deck Authenticated": { score: 88, tier: "trusted" },
  "Fanatics Authentic": { score: 87, tier: "trusted" },
  "Steiner Sports": { score: 85, tier: "trusted" },
  "TriStar Productions": { score: 84, tier: "trusted" },
  "MLB Authenticated": { score: 89, tier: "trusted" },
  "Credabilia": { score: 100, tier: "premium" },
  "Other": { score: 50, tier: "unverified" }
};

export const SPORTS = ["baseball", "basketball", "football", "hockey", "boxing", "soccer", "other"];

export const GRADE_STATUS = [
  { value: "graded", label: "Graded (No Signature)" },
  { value: "graded_signed", label: "Graded & Signed" },
  { value: "raw", label: "Raw (No Signature)" },
  { value: "raw_signed", label: "Raw & Signed" }
];
