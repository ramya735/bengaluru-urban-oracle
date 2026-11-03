// Deterministic planning domain logic. Server-side helpers; no TanStack imports.
import type {
  AlternativeVariant,
  AnalysisResult,
  DesignOption,
  DevelopmentType,
  DomainMetrics,
  EvidencePassage,
  ImpactDomain,
  InfrastructureIntervention,
  ParsedScenario,
  RiskLevel,
  ScenarioInput,
  SimulationResult,
  SpatialFinding,
  TransportIntervention,
  ZoneLike,
} from "./planning-types";

// Prototype assumptions — illustrative values, not official Bengaluru standards.
export const ASSUMPTIONS = {
  occupancyPerUnit: { residential: 3.0, commercial: 12, industrial: 20, mixed: 8 } as Record<DevelopmentType, number>,
  tripRatePerPersonDay: { residential: 2.2, commercial: 3.4, industrial: 1.6, mixed: 2.8 } as Record<DevelopmentType, number>,
  waterLitresPerPersonDay: { residential: 135, commercial: 45, industrial: 60, mixed: 90 } as Record<DevelopmentType, number>,
  electricityKwhPerPersonDay: { residential: 4.5, commercial: 6.0, industrial: 7.5, mixed: 5.5 } as Record<DevelopmentType, number>,
  tripReduction: { "public-transport": 0.25, tod: 0.35 } as Partial<Record<TransportIntervention, number>>,
  roadCapacityBoost: 1.2,
  infraCapacityBoost: 1.25,
};

export const DEV_TYPE_LABELS: Record<DevelopmentType, string> = {
  residential: "Residential",
  commercial: "Commercial",
  industrial: "Industrial",
  mixed: "Mixed use",
};

export const TRANSPORT_LABELS: Record<TransportIntervention, string> = {
  none: "No transport intervention",
  "road-expansion": "Road expansion",
  "public-transport": "Public transport improvement",
  tod: "Transit-oriented development",
};

export const INFRA_LABELS: Record<InfrastructureIntervention, string> = {
  none: "No infrastructure intervention",
  water: "Water supply upgrade",
  electricity: "Electricity upgrade",
  both: "Water + electricity upgrade",
};

export const RISK_LABELS: Record<RiskLevel, string> = {
  low: "Low",
  moderate: "Moderate",
  high: "High",
  critical: "Critical",
};

export function classifyRisk(utilization: number): RiskLevel {
  if (utilization < 70) return "low";
  if (utilization < 85) return "moderate";
  if (utilization <= 100) return "high";
  return "critical";
}

const RISK_RANK: Record<RiskLevel, number> = { low: 0, moderate: 1, high: 2, critical: 3 };

function metrics(
  demandBefore: number,
  demandAfter: number,
  capacityBefore: number,
  capacityAfter: number,
): DomainMetrics {
  const utilizationBefore = (demandBefore / capacityBefore) * 100;
  const utilizationAfter = (demandAfter / capacityAfter) * 100;
  return {
    demandBefore,
    demandAfter,
    capacityBefore,
    capacityAfter,
    utilizationBefore,
    utilizationAfter,
    remainingCapacity: capacityAfter - demandAfter,
    risk: classifyRisk(utilizationAfter),
  };
}

export function simulate(zone: ZoneLike, input: ScenarioInput): { result: SimulationResult; trace: string[] } {
  const a = ASSUMPTIONS;
  const type = input.developmentType;

  const occupancy = a.occupancyPerUnit[type];
  const newPopulation = Math.round(input.units * occupancy);
  const populationBefore = zone.population;
  const populationAfter = populationBefore + newPopulation;

  const area = zone.area_km2;
  const densityBefore = populationBefore / area;
  const densityAfter = populationAfter / area;
  const developmentIntensity = input.units / (area * 100); // units per hectare

  const tripRate = a.tripRatePerPersonDay[type];
  const baseTrips = newPopulation * tripRate;
  const rho = a.tripReduction[input.transportIntervention] ?? 0;
  const additionalTrips = baseTrips * (1 - rho);

  const roadCapacityAfter =
    input.transportIntervention === "road-expansion" || input.transportIntervention === "tod"
      ? zone.road_capacity * a.roadCapacityBoost
      : zone.road_capacity;
  const road = metrics(
    zone.baseline_traffic,
    zone.baseline_traffic + additionalTrips,
    zone.road_capacity,
    roadCapacityAfter,
  );

  const waterDemandAdd = newPopulation * a.waterLitresPerPersonDay[type];
  const waterCapacityAfter =
    input.infrastructureIntervention === "water" || input.infrastructureIntervention === "both"
      ? zone.water_capacity * a.infraCapacityBoost
      : zone.water_capacity;
  const water = metrics(
    zone.water_demand,
    zone.water_demand + waterDemandAdd,
    zone.water_capacity,
    waterCapacityAfter,
  );

  const electricityDemandAdd = newPopulation * a.electricityKwhPerPersonDay[type];
  const electricityCapacityAfter =
    input.infrastructureIntervention === "electricity" || input.infrastructureIntervention === "both"
      ? zone.electricity_capacity * a.infraCapacityBoost
      : zone.electricity_capacity;
  const electricity = metrics(
    zone.electricity_demand,
    zone.electricity_demand + electricityDemandAdd,
    zone.electricity_capacity,
    electricityCapacityAfter,
  );

  const overallRisk = [road.risk, water.risk, electricity.risk].reduce<RiskLevel>(
    (max, r) => (RISK_RANK[r] > RISK_RANK[max] ? r : max),
    "low",
  );

  const fmt = (n: number, d = 0) => n.toLocaleString("en-IN", { maximumFractionDigits: d, minimumFractionDigits: 0 });
  const pct = (n: number) => `${n.toFixed(1)}%`;

  const trace = [
    `1. Proposal: ${fmt(input.units)} ${DEV_TYPE_LABELS[type].toLowerCase()} units in ${zone.name}.`,
    `2. Occupancy assumption: ${occupancy} persons per ${type} unit → new population = ${fmt(input.units)} × ${occupancy} = ${fmt(newPopulation)}.`,
    `3. Zone population: ${fmt(populationBefore)} → ${fmt(populationAfter)}; density ${densityBefore.toFixed(0)} → ${densityAfter.toFixed(0)} persons/km² over ${area} km².`,
    `4. Trip rate assumption: ${tripRate} trips per person-day → base additional trips = ${fmt(newPopulation)} × ${tripRate} = ${fmt(baseTrips)}.`,
    rho > 0
      ? `5. ${TRANSPORT_LABELS[input.transportIntervention]} reduces private-vehicle trips by ${Math.round(rho * 100)}% → net additional trips = ${fmt(additionalTrips)}.`
      : `5. No transport intervention selected → no trip reduction; net additional trips = ${fmt(additionalTrips)}.`,
    roadCapacityAfter > zone.road_capacity
      ? `6. ${TRANSPORT_LABELS[input.transportIntervention]} raises road capacity ${Math.round(a.roadCapacityBoost * 100)}% to ${fmt(roadCapacityAfter)} trips/day → road utilization ${pct(road.utilizationAfter)} (${RISK_LABELS[road.risk]} risk).`
      : `6. Road capacity unchanged at ${fmt(roadCapacityAfter)} trips/day → road utilization ${pct(road.utilizationAfter)} (${RISK_LABELS[road.risk]} risk).`,
    `7. Water: ${a.waterLitresPerPersonDay[type]} L/person-day → additional demand ${fmt(waterDemandAdd)} L/day; capacity ${fmt(waterCapacityAfter)} L/day → utilization ${pct(water.utilizationAfter)} (${RISK_LABELS[water.risk]} risk).`,
    `8. Electricity: ${a.electricityKwhPerPersonDay[type]} kWh/person-day → additional demand ${fmt(electricityDemandAdd)} kWh/day; capacity ${fmt(electricityCapacityAfter)} kWh/day → utilization ${pct(electricity.utilizationAfter)} (${RISK_LABELS[electricity.risk]} risk).`,
    `9. Overall risk = highest of transport, water, electricity → ${RISK_LABELS[overallRisk]}.`,
  ];

  const result: SimulationResult = {
    populationBefore,
    populationAfter,
    newPopulation,
    densityBefore,
    densityAfter,
    densityChange: densityAfter - densityBefore,
    developmentIntensity,
    additionalTrips,
    tripsAfter: road.demandAfter,
    road,
    water,
    electricity,
    overallRisk,
    assumptions: [
      { label: `Occupancy per ${type} unit`, value: `${occupancy} persons` },
      { label: `Trip rate (${type})`, value: `${tripRate} trips/person-day` },
      { label: `Water demand (${type})`, value: `${a.waterLitresPerPersonDay[type]} L/person-day` },
      { label: `Electricity demand (${type})`, value: `${a.electricityKwhPerPersonDay[type]} kWh/person-day` },
      { label: "Trip reduction (public transport / TOD)", value: "25% / 35%" },
      { label: "Capacity boosts (road / water / electricity)", value: "20% / 25% / 25%" },
      { label: "Risk thresholds", value: "<70% Low · <85% Moderate · ≤100% High · >100% Critical" },
    ],
  };

  return { result, trace };
}

export function buildAlternatives(zone: ZoneLike, input: ScenarioInput): AlternativeVariant[] {
  const variants: AlternativeVariant[] = [
    {
      strategy: "original",
      label: "Original proposal",
      note: "The proposal as entered, without modification.",
      input,
      ...simulate(zone, input),
    },
    {
      strategy: "reduced-density",
      label: "Reduced density",
      note: "Units reduced to 70% of the original proposal.",
      input: { ...input, units: Math.max(1, Math.round(input.units * 0.7)), name: `${input.name} (reduced density)` },
      ...simulate(zone, { ...input, units: Math.max(1, Math.round(input.units * 0.7)) }),
    },
    {
      strategy: "transit-oriented",
      label: "Transit-oriented",
      note: "Transport intervention set to transit-oriented development: lower private-vehicle demand and 20% higher road capacity.",
      input: { ...input, transportIntervention: "tod", name: `${input.name} (transit-oriented)` },
      ...simulate(zone, { ...input, transportIntervention: "tod" }),
    },
    {
      strategy: "infrastructure-first",
      label: "Infrastructure first",
      note: "Water and electricity upgrades applied first: both capacities raised by 25%.",
      input: { ...input, infrastructureIntervention: "both", name: `${input.name} (infrastructure first)` },
      ...simulate(zone, { ...input, infrastructureIntervention: "both" }),
    },
  ];
  return variants;
}

export function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export const SPATIAL_LAYERS: { layer: string; label: string }[] = [
  { layer: "roads", label: "Roads" },
  { layer: "bus_stops", label: "Bus stops & transit" },
  { layer: "traffic_events", label: "Traffic event observations" },
  { layer: "schools", label: "Schools" },
  { layer: "hospitals", label: "Hospitals" },
  { layer: "police", label: "Police stations" },
  { layer: "fire_stations", label: "Fire stations" },
  { layer: "pois", label: "Other points of interest" },
  { layer: "landuse", label: "Land-use tagged features" },
  { layer: "parks", label: "Parks" },
  { layer: "water_bodies", label: "Water bodies" },
];

export function analyzeSpatial(
  features: { layer: string; name: string; lat: number; lng: number }[],
  center: { lat: number; lng: number },
  radiusM: number,
): SpatialFinding[] {
  const loaded = new Set(features.map((f) => f.layer));
  return SPATIAL_LAYERS.map(({ layer, label }) => {
    if (!loaded.has(layer)) {
      return { layer, label, status: "not_loaded" as const, count: null, nearestM: null, nearestName: null };
    }
    const inLayer = features.filter((f) => f.layer === layer);
    const withDistance = inLayer.map((f) => ({ ...f, d: haversineM(center.lat, center.lng, f.lat, f.lng) }));
    const within = withDistance.filter((f) => f.d <= radiusM).sort((x, y) => x.d - y.d);
    return {
      layer,
      label,
      status: "ready" as const,
      count: within.length,
      nearestM: within.length > 0 ? (within[0]?.d ?? null) : null,
      nearestName: within.length > 0 ? (within[0]?.name ?? null) : null,
    };
  });
}

const STOPWORDS = new Set(
  "a an and are as at be by for from has have how in is it its of on or that the this to was were what when where which will with would".split(
    " ",
  ),
);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

// Lexical (TF-IDF style) retrieval over planning-document chunks.
export function retrieveEvidence(
  chunks: { documentTitle: string; caution: string; chunkIndex: number; content: string }[],
  query: string,
  topK = 4,
): EvidencePassage[] {
  if (chunks.length === 0) return [];
  const queryTerms = tokenize(query);
  if (queryTerms.length === 0) return [];

  const docs = chunks.map((c) => ({ ...c, terms: tokenize(c.content) }));
  const df = new Map<string, number>();
  for (const term of queryTerms) {
    df.set(term, docs.filter((d) => d.terms.includes(term)).length);
  }

  const scored = docs.map((d) => {
    let score = 0;
    for (const term of queryTerms) {
      const tf = d.terms.filter((t) => t === term).length;
      if (tf > 0) {
        const idf = Math.log(1 + docs.length / (1 + (df.get(term) ?? 0)));
        score += tf * idf;
      }
    }
    return { ...d, score: Math.round(score * 1000) / 1000 };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(({ documentTitle, caution, chunkIndex, content, score }) => ({
      documentTitle,
      caution,
      chunkIndex,
      content,
      score,
    }));
}

export function interpretImpacts(
  spatial: SpatialFinding[],
  evidence: EvidencePassage[],
  zone: ZoneLike,
): ImpactDomain[] {
  const find = (layer: string) => spatial.find((s) => s.layer === layer);
  const roads = find("roads");
  const buses = find("bus_stops");
  const events = find("traffic_events");
  const schools = find("schools");
  const hospitals = find("hospitals");
  const police = find("police");
  const fire = find("fire_stations");
  const parks = find("parks");
  const water = find("water_bodies");
  const landuse = find("landuse");
  const pois = find("pois");

  const nearest = (f?: SpatialFinding) =>
    f?.nearestName ? ` nearest "${f.nearestName}" at ${Math.round(f.nearestM ?? 0)} m` : "";

  return [
    {
      domain: "Mobility",
      observation: `${roads?.count ?? 0} mapped road feature(s)${nearest(roads)}; ${buses?.count ?? 0} transit stop(s)${nearest(buses)}; ${events?.count ?? 0} traffic-event record(s) within the radius.`,
      canSay: "Nearby road and transit context is observed in the processed extract.",
      cannotSay: "Traffic congestion, speed, capacity or travel-time impact from event rows alone.",
    },
    {
      domain: "Social infrastructure",
      observation: `${schools?.count ?? 0} school(s)${nearest(schools)}, ${hospitals?.count ?? 0} hospital(s)${nearest(hospitals)}, ${police?.count ?? 0} police and ${fire?.count ?? 0} fire station(s) within the radius.`,
      canSay: "Facility proximity and mapped counts.",
      cannotSay: "Whether services are adequate for projected demand without service standards or capacity data.",
    },
    {
      domain: "Environment",
      observation: `${parks?.count ?? 0} mapped park(s)${nearest(parks)} and ${water?.count ?? 0} water body/bodies${nearest(water)} within the radius.`,
      canSay: "Mapped green and water features in the search area.",
      cannotSay: "Quantified flood, air-quality, noise or biodiversity impact without relevant environmental inputs.",
    },
    {
      domain: "Built context / land use",
      observation: `${landuse?.count ?? 0} land-use tagged feature(s) and ${pois?.count ?? 0} POI(s) within the radius; modeled zone land use is "${zone.land_use}".`,
      canSay: "Available mapped building/land-use context for the area.",
      cannotSay: "Complete parcel-level land-use or zoning determination.",
    },
    {
      domain: "Utilities",
      observation: "BWSSB and BESCOM infrastructure datasets are registered but not connected.",
      canSay: "Quantitative water/electricity utilization shown in the simulation comes from prototype zone assumptions, not validated network data.",
      cannotSay: "Real network capacity or demand based on utility datasets.",
    },
    {
      domain: "Regulatory evidence",
      observation: `${evidence.length} planning-document passage(s) retrieved${evidence.length > 0 ? ` from: ${[...new Set(evidence.map((e) => e.documentTitle))].join("; ")}` : ""}.`,
      canSay: "Potentially relevant planning evidence is surfaced with source cautions attached.",
      cannotSay: "A statutory compliance verdict; verify jurisdiction, road width and current regulation before drawing conclusions.",
    },
  ];
}

const DESIGN_PROFILES = [
  { key: "balanced", name: "Balanced development", intent: "Balance development footprint and open space.", unitsPerBlock: 100, greenShare: 25, parkingShare: 10 },
  { key: "open-space", name: "Open-space priority", intent: "Fewer blocks and a larger conceptual open-space target.", unitsPerBlock: 140, greenShare: 38, parkingShare: 8 },
  { key: "efficiency", name: "Development efficiency", intent: "More blocks / more efficient conceptual use of the site envelope.", unitsPerBlock: 80, greenShare: 18, parkingShare: 12 },
] as const;

// Conceptual layout generator: deterministic heuristics on a square fallback
// envelope derived from the proposal scale. Visualization only, not a
// statutory calculation or architectural plan.
export function generateDesignOptions(
  zone: ZoneLike,
  input: ScenarioInput,
  spatial: SpatialFinding[],
): DesignOption[] {
  const center = {
    lat: input.lat ?? zone.lat,
    lng: input.lng ?? zone.lng,
  };
  const GROSS_AREA_PER_UNIT_M2 = 55;
  const COVERAGE = 0.35;
  const siteAreaM2 = (input.units * GROSS_AREA_PER_UNIT_M2) / COVERAGE;
  const siteSideM = Math.sqrt(siteAreaM2);
  const roads = spatial.find((s) => s.layer === "roads");
  const parks = spatial.find((s) => s.layer === "parks");
  const water = spatial.find((s) => s.layer === "water_bodies");

  return DESIGN_PROFILES.map((p) => {
    const blocks = Math.min(12, Math.max(3, Math.ceil(input.units / p.unitsPerBlock)));
    const reasons = [
      `Block count heuristic: ceil(${input.units.toLocaleString("en-IN")} / ${p.unitsPerBlock}) = ${blocks} blocks (capped between 3 and 12 for visualization).`,
      `Target green share ${p.greenShare}% and parking share ${p.parkingShare}% — configurable visualization heuristics, not statutory calculations.`,
      `Conceptual site envelope ≈ ${Math.round(siteAreaM2).toLocaleString("en-IN")} m² (≈ ${(siteAreaM2 / 10000).toFixed(1)} ha) from ${GROSS_AREA_PER_UNIT_M2} m² gross area per unit at ${Math.round(COVERAGE * 100)}% coverage.`,
    ];
    if (roads?.nearestName) {
      reasons.push(`Schematic access chosen near the nearest mapped road feature "${roads.nearestName}" (${Math.round(roads.nearestM ?? 0)} m away). A mapped road does not establish legal access.`);
    } else {
      reasons.push("No mapped road feature found in the radius; no access location asserted.");
    }
    const greenFeatures = (parks?.count ?? 0) + (water?.count ?? 0);
    if (greenFeatures > 0) {
      reasons.push(`${greenFeatures} mapped green/water feature(s) within the radius would be preserved as conceptual context constraints.`);
    }
    reasons.push(`Zone land use is "${zone.land_use}"; verify permissible use under the applicable zonal regulations.`);
    return {
      name: p.name,
      intent: p.intent,
      blocks,
      unitsPerBlock: p.unitsPerBlock,
      greenShare: p.greenShare,
      parkingShare: p.parkingShare,
      accessRoad: roads?.nearestName ?? null,
      accessDistanceM: roads?.nearestM ?? null,
      siteAreaM2,
      siteSideM,
      center,
      reasons,
    };
  });
}

// Rule-based planning copilot: keyword routing over simulation values.
export function copilotReply(
  question: string,
  ctx: {
    zoneName: string;
    developmentType: DevelopmentType;
    result: SimulationResult;
    spatial: SpatialFinding[];
    evidence: EvidencePassage[];
    alternatives: AlternativeVariant[];
    impacts: ImpactDomain[];
  },
): string {
  const q = question.toLowerCase();
  const r = ctx.result;
  const pct = (n: number) => `${n.toFixed(1)}%`;
  const fmt = (n: number, d = 0) => n.toLocaleString("en-IN", { maximumFractionDigits: d });

  const has = (...keys: string[]) => keys.some((k) => q.includes(k));

  if (has("road", "traffic", "transport")) {
    const roads = ctx.spatial.find((s) => s.layer === "roads");
    const buses = ctx.spatial.find((s) => s.layer === "bus_stops");
    return [
      `Road utilization is ${pct(r.road.utilizationAfter)} (${RISK_LABELS[r.road.risk]} risk) in ${ctx.zoneName}: ${fmt(r.tripsAfter)} trips/day against ${fmt(r.road.capacityAfter)} trips/day of capacity.`,
      `${fmt(r.additionalTrips)} additional trips/day come from ${fmt(r.newPopulation)} new residents/workers at ${ASSUMPTIONS.tripRatePerPersonDay[ctx.developmentType]} trips/person-day.`,
      roads ? `Mapped context: ${roads.count} road feature(s) and ${buses?.count ?? 0} transit stop(s) within the search radius.` : "",
      r.road.utilizationAfter > 100
        ? "Utilization exceeds 100%, meaning estimated demand is above capacity under the prototype assumptions. A road expansion (+20%) or public-transport measure (−25% trips) would reduce it."
        : "Utilization is within capacity under the prototype assumptions.",
    ].filter(Boolean).join(" ");
  }

  if (has("water")) {
    return `Water utilization is ${pct(r.water.utilizationAfter)} (${RISK_LABELS[r.water.risk]}): demand ${fmt(r.water.demandAfter)} L/day against capacity ${fmt(r.water.capacityAfter)} L/day. The estimate uses ${ASSUMPTIONS.waterLitresPerPersonDay.residential} L per person-day for residential use and leaves ${fmt(Math.max(0, r.water.remainingCapacity))} L/day of headroom. BWSSB network data is not connected, so this is an assumption-driven estimate.`;
  }

  if (has("electric", "power")) {
    return `Electricity utilization is ${pct(r.electricity.utilizationAfter)} (${RISK_LABELS[r.electricity.risk]}): demand ${fmt(r.electricity.demandAfter)} kWh/day against capacity ${fmt(r.electricity.capacityAfter)} kWh/day. The estimate uses ${ASSUMPTIONS.electricityKwhPerPersonDay.residential} kWh per person-day for residential use. BESCOM datasets are not connected, so this is an assumption-driven estimate.`;
  }

  if (has("increase", "more units", "what happens if", "what if")) {
    return `Utilization scales with units: each additional unit adds ${ASSUMPTIONS.occupancyPerUnit.residential} persons, which drives trips, water and electricity demand linearly. You can change the unit count in the Planning Workspace and re-run the simulation to see the new utilization and risk classification.`;
  }

  if (has("closest", "constrained", "bottleneck", "highest risk")) {
    const domains = [
      { name: "Road", m: r.road },
      { name: "Water", m: r.water },
      { name: "Electricity", m: r.electricity },
    ].sort((a, b) => b.m.utilizationAfter - a.m.utilizationAfter);
    return `The most constrained system is ${domains[0]!.name} at ${pct(domains[0]!.m.utilizationAfter)} utilization (${RISK_LABELS[domains[0]!.m.risk]}). Then ${domains[1]!.name} at ${pct(domains[1]!.m.utilizationAfter)} and ${domains[2]!.name} at ${pct(domains[2]!.m.utilizationAfter)}. Overall risk is ${RISK_LABELS[r.overallRisk]} — the highest of the three.`;
  }

  if (has("mitigat", "option", "reduce", "lower")) {
    return `Available mitigations in the model: public transport (−25% trips), transit-oriented development (−35% trips and +20% road capacity), road expansion (+20% road capacity), and water/electricity upgrades (+25% respective capacity). The Scenario Lab compares all of them for this proposal.`;
  }

  if (has("alternativ", "compare", "lab")) {
    const lines = ctx.alternatives.map(
      (a) => `• ${a.label}: road ${pct(a.result.road.utilizationAfter)}, water ${pct(a.result.water.utilizationAfter)}, electricity ${pct(a.result.electricity.utilizationAfter)} → ${RISK_LABELS[a.result.overallRisk]}`,
    );
    return `Alternative strategies and their utilization:\n${lines.join("\n")}\nOpen the Scenario Lab for the full comparison and trade-offs.`;
  }

  if (has("assumption", "how calculated", "how is", "method")) {
    const lines = r.assumptions.map((a) => `• ${a.label}: ${a.value}`);
    return `Every output traces to explicit prototype assumptions:\n${lines.join("\n")}\nThe calculation pathway is shown step by step in the Planning Workspace.`;
  }

  if (has("evidence", "regulation", "far", "law", "policy", "rule")) {
    return ctx.evidence.length > 0
      ? `Retrieved planning evidence (${ctx.evidence.length} passage(s)):\n${ctx.evidence.map((e) => `• [${e.documentTitle}] ${e.content}`).join("\n")}\nCaution: ${ctx.evidence[0]?.caution ?? "Verify against the original document."}`
      : "No planning-document passages matched this question in the local retrieval index. Try terms like FAR, setbacks, parking, road width or TOD.";
  }

  if (has("impact", "nearby", "school", "hospital", "park")) {
    const lines = ctx.impacts.map((i) => `• ${i.domain}: ${i.observation}`);
    return `Observed spatial context by domain:\n${lines.join("\n")}`;
  }

  // Default overview
  return `For this ${fmt(ctx.result.newPopulation)}-person proposal in ${ctx.zoneName}: road utilization ${pct(r.road.utilizationAfter)}, water ${pct(r.water.utilizationAfter)}, electricity ${pct(r.electricity.utilizationAfter)}; overall risk ${RISK_LABELS[r.overallRisk]}. Ask about roads, water, electricity, assumptions, evidence, alternatives or mitigations for detail. Responses are rule-based explanations of the simulation values, not planning advice.`;
}

// Rule-based natural-language scenario parser.
export const ZONE_ALIASES: { id: string; name: string; aliases: string[] }[] = [
  { id: "electronic-city", name: "Electronic City", aliases: ["electronic city", "electronics city", "e-city", "ec"] },
  { id: "whitefield", name: "Whitefield", aliases: ["whitefield", "white field"] },
  { id: "koramangala", name: "Koramangala", aliases: ["koramangala"] },
  { id: "hebbal", name: "Hebbal", aliases: ["hebbal"] },
  { id: "yelahanka", name: "Yelahanka", aliases: ["yelahanka"] },
];

const DEV_KEYWORDS: { type: DevelopmentType; keys: string[] }[] = [
  { type: "residential", keys: ["residential", "residency", "apartment", "housing", "homes", "villa"] },
  { type: "commercial", keys: ["commercial", "office", "retail", "mall", "shop", "it park", "tech park"] },
  { type: "industrial", keys: ["industrial", "factory", "warehouse", "manufacturing"] },
  { type: "mixed", keys: ["mixed use", "mixed-use", "mixed development"] },
];

export function parseScenarioText(text: string): ParsedScenario {
  const t = text.toLowerCase();
  const notes: string[] = [];

  let units: number | null = null;
  const unitsMatch = t.match(/([\d,]+(?:\.\d+)?)\s*(thousand|k)?\s*(?:-|–)?\s*(?:residential\s+|commercial\s+|industrial\s+|mixed\s+)?units?\b/);
  if (unitsMatch) {
    let n = parseFloat(unitsMatch[1]!.replace(/,/g, ""));
    if (unitsMatch[2]! === "thousand" || unitsMatch[2] === "k") n *= 1000;
    units = Math.round(n);
  } else {
    const bare = t.match(/(\d[\d,]{2,})/);
    if (bare) {
      units = parseInt(bare[1].replace(/,/g, ""), 10);
      notes.push("Unit count inferred from the large number in the text.");
    }
  }

  let developmentType: DevelopmentType | null = null;
  for (const d of DEV_KEYWORDS) {
    if (d.keys.some((k) => t.includes(k))) {
      developmentType = d.type;
      break;
    }
  }

  let zoneId: string | null = null;
  let zoneName: string | null = null;
  for (const z of ZONE_ALIASES) {
    for (const alias of [z.name.toLowerCase(), ...z.aliases]) {
      const re = new RegExp(`\\b${alias.replace(/[-\s]/g, "[-\\s]?")}\\b`);
      if (re.test(t)) {
        zoneId = z.id;
        zoneName = z.name;
        break;
      }
    }
    if (zoneId) break;
  }

  let radiusM: number | null = null;
  const radiusMatch = t.match(/within\s+([\d,]+(?:\.\d+)?)\s*(km|kilometers?|kilometres?|m|meters?|metres?)?/);
  if (radiusMatch) {
    let n = parseFloat(radiusMatch[1]!.replace(/,/g, ""));
    if (radiusMatch[2]! && radiusMatch[2]!.startsWith("k")) n *= 1000;
    radiusM = Math.round(n);
  }

  let transportIntervention: TransportIntervention | null = null;
  if (t.includes("transit-oriented") || t.includes("transit oriented") || /\btod\b/.test(t)) {
    transportIntervention = "tod";
  } else if (t.includes("public transport") || t.includes("metro") || t.includes("bus")) {
    transportIntervention = "public-transport";
  } else if (t.includes("road expansion") || t.includes("widen") || t.includes("road widening")) {
    transportIntervention = "road-expansion";
  }

  let infrastructureIntervention: InfrastructureIntervention | null = null;
  const wantsWater = t.includes("water");
  const wantsElectricity = t.includes("electric") || t.includes("power");
  if (wantsWater && wantsElectricity) infrastructureIntervention = "both";
  else if (wantsWater) infrastructureIntervention = "water";
  else if (wantsElectricity) infrastructureIntervention = "electricity";

  let locationPhrase: string | null = null;
  if (!zoneId) {
    const locMatch = text.match(/\b(?:at|in|near|around)\s+([A-Za-z0-9'’.\- ]+?)(?=\s*,\s*|\s+within\b|\s+with\b|[.,;]|$)/i);
    if (locMatch) {
      const phrase = locMatch[1]!.trim().replace(/^(a|an|the)\s+/i, "");
      // Strip a trailing development phrase like "500-unit residential development"
      const cleaned = phrase
        .replace(/[\d,]+\s*-?\s*units?\s*/i, "")
        .replace(/\b(residential|commercial|industrial|mixed)\s+(development|project|complex)?\s*$/i, "")
        .trim();
      if (cleaned.length >= 3) {
        locationPhrase = cleaned;
        notes.push(`Location phrase "${cleaned}" will be geocoded with Google Maps within Bengaluru.`);
      }
    }
  }

  if (units === null) notes.push("No unit count detected; defaulting to 1,000 units.");
  if (developmentType === null) notes.push("No development type detected; defaulting to residential.");
  if (zoneId === null && locationPhrase === null) notes.push("No zone or location detected; defaulting to Bengaluru city centre.");
  if (radiusM === null) notes.push("No search radius detected; defaulting to 500 m.");
  if (transportIntervention === null) notes.push("No transport intervention detected; defaulting to none.");
  if (infrastructureIntervention === null) notes.push("No infrastructure intervention detected; defaulting to none.");

  return {
    units,
    developmentType,
    zoneId,
    zoneName,
    locationPhrase,
    radiusM,
    transportIntervention,
    infrastructureIntervention,
    notes,
  };
}

export function buildAnalysis(params: {
  zone: ZoneLike;
  input: ScenarioInput;
  spatial: SpatialFinding[];
  evidence: EvidencePassage[];
}): AnalysisResult {
  const { zone, input, spatial, evidence } = params;
  const { result, trace } = simulate(zone, input);
  return {
    simulation: result,
    trace,
    spatialContext: spatial,
    evidence,
    impacts: interpretImpacts(spatial, evidence, zone),
    designOptions: generateDesignOptions(zone, input, spatial),
    alternatives: buildAlternatives(zone, input),
  };
}
