// Shared planning domain types (client-safe).

export type DevelopmentType = "residential" | "commercial" | "industrial" | "mixed";
export type TransportIntervention = "none" | "road-expansion" | "public-transport" | "tod";
export type InfrastructureIntervention = "none" | "water" | "electricity" | "both";
export type RiskLevel = "low" | "moderate" | "high" | "critical";

export interface ZoneLike {
  id: string;
  name: string;
  area_km2: number;
  population: number;
  road_capacity: number;
  baseline_traffic: number;
  water_capacity: number;
  water_demand: number;
  electricity_capacity: number;
  electricity_demand: number;
  land_use: string;
  lat: number;
  lng: number;
  color: string;
}

export interface ScenarioInput {
  name: string;
  zoneId: string | null;
  locationLabel: string | null;
  lat: number | null;
  lng: number | null;
  radiusM: number;
  developmentType: DevelopmentType;
  units: number;
  transportIntervention: TransportIntervention;
  infrastructureIntervention: InfrastructureIntervention;
  description: string | null;
}

export interface DomainMetrics {
  demandBefore: number;
  demandAfter: number;
  capacityBefore: number;
  capacityAfter: number;
  utilizationBefore: number;
  utilizationAfter: number;
  remainingCapacity: number;
  risk: RiskLevel;
}

export interface SimulationResult {
  populationBefore: number;
  populationAfter: number;
  newPopulation: number;
  densityBefore: number;
  densityAfter: number;
  densityChange: number;
  developmentIntensity: number;
  additionalTrips: number;
  tripsAfter: number;
  road: DomainMetrics;
  water: DomainMetrics;
  electricity: DomainMetrics;
  overallRisk: RiskLevel;
  assumptions: { label: string; value: string }[];
}

export interface AlternativeVariant {
  strategy: "original" | "reduced-density" | "transit-oriented" | "infrastructure-first";
  label: string;
  note: string;
  input: ScenarioInput;
  result: SimulationResult;
}

export interface SpatialFinding {
  layer: string;
  label: string;
  status: "ready" | "not_loaded";
  count: number | null;
  nearestM: number | null;
  nearestName: string | null;
}

export interface EvidencePassage {
  documentTitle: string;
  caution: string;
  chunkIndex: number;
  content: string;
  score: number;
}

export interface ImpactDomain {
  domain: string;
  observation: string;
  canSay: string;
  cannotSay: string;
}

export interface DesignOption {
  name: string;
  intent: string;
  blocks: number;
  unitsPerBlock: number;
  greenShare: number;
  parkingShare: number;
  accessRoad: string | null;
  accessDistanceM: number | null;
  siteAreaM2: number;
  siteSideM: number;
  center: { lat: number; lng: number };
  reasons: string[];
}

export interface ParsedScenario {
  units: number | null;
  developmentType: DevelopmentType | null;
  zoneId: string | null;
  zoneName: string | null;
  locationPhrase: string | null;
  radiusM: number | null;
  transportIntervention: TransportIntervention | null;
  infrastructureIntervention: InfrastructureIntervention | null;
  notes: string[];
}

export interface AnalysisResult {
  simulation: SimulationResult;
  trace: string[];
  spatialContext: SpatialFinding[];
  evidence: EvidencePassage[];
  impacts: ImpactDomain[];
  designOptions: DesignOption[];
  alternatives: AlternativeVariant[];
}

export interface StoredScenarioRow {
  id: string;
  name: string;
  zone_id: string | null;
  zone_name: string | null;
  location_label: string | null;
  lat: number | null;
  lng: number | null;
  geocoded_from: string | null;
  radius_m: number | null;
  development_type: string;
  units: number;
  transport_intervention: string;
  infrastructure_intervention: string;
  description: string | null;
  created_at: string;
}

export interface StoredAnalysisRow {
  id: string;
  scenario_id: string;
  result: unknown;
  spatial_context: SpatialFinding[] | null;
  evidence: EvidencePassage[] | null;
  impact_interpretation: ImpactDomain[] | null;
  design_options: DesignOption[] | null;
  created_at: string;
  scenarios: StoredScenarioRow | null;
}
