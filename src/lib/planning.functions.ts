import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import {
  analyzeSpatial,
  buildAnalysis,
  copilotReply,
  DEV_TYPE_LABELS,
  INFRA_LABELS,
  parseScenarioText,
  retrieveEvidence,
  TRANSPORT_LABELS,
} from "./planning.server";
import type {
  AnalysisResult,
  DevelopmentType,
  InfrastructureIntervention,
  ScenarioInput,
  TransportIntervention,
  ZoneLike,
} from "./planning-types";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";

const BENGALURU_BOUNDS = { minLat: 12.6, maxLat: 13.35, minLng: 77.2, maxLng: 78.0 };

async function geocodeInBengaluru(query: string): Promise<{ lat: number; lng: number; formattedAddress: string; source: string }> {
  const LOVABLE_API_KEY = process.env["LOVABLE_API_KEY"];
  const GOOGLE_MAPS_API_KEY = process.env["GOOGLE_MAPS_API_KEY"];
  if (!LOVABLE_API_KEY || !GOOGLE_MAPS_API_KEY) {
    throw new Error("Google Maps integration is not configured for this project.");
  }
  const url = `${GATEWAY_URL}/maps/api/geocode/json?address=${encodeURIComponent(
    `${query}, Bengaluru, Karnataka, India`,
  )}&components=country:IN&region=in`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": GOOGLE_MAPS_API_KEY,
    },
  });
  if (response.status === 403) {
    const details: Array<{ reason?: string }> = (await response.json().catch(() => ({})))?.error?.details ?? [];
    const reason = details.find((d) => d.reason)?.reason;
    if (reason === "API_KEY_HTTP_REFERRER_BLOCKED") {
      throw new Error("Google Maps server key is referrer-restricted. Set the server key's application restrictions to \"None\" or \"IP addresses\" in Google Cloud Console.");
    }
    if (reason === "API_KEY_SERVICE_BLOCKED") {
      throw new Error("Google Maps server key does not allow the Geocoding API. Add it to the server key's allowed-APIs list in Google Cloud Console.");
    }
    throw new Error("Google Maps request was denied (403). Check the server key's restrictions in Google Cloud Console.");
  }
  if (!response.ok) {
    const body = await response.text();
    console.error(`Geocoding request failed [${response.status}]: ${body}`);
    throw new Error(`Google Maps request failed [${response.status}]`);
  }
  const json = (await response.json()) as {
    results?: Array<{ formatted_address: string; geometry: { location: { lat: number; lng: number } } }>;
  };
  const first = json.results?.[0];
  if (!first) {
    throw new Error(`Could not find "${query}" within Bengaluru. Try a nearby landmark or a zone name.`);
  }
  const { lat, lng } = first.geometry.location;
  if (lat < BENGALURU_BOUNDS.minLat || lat > BENGALURU_BOUNDS.maxLat || lng < BENGALURU_BOUNDS.minLng || lng > BENGALURU_BOUNDS.maxLng) {
    throw new Error(`"${first.formatted_address}" resolved outside Bengaluru. Please pick a location inside Bengaluru.`);
  }
  return { lat, lng, formattedAddress: first.formatted_address, source: query };
}

function num(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  const p = parseFloat(String(v));
  return Number.isFinite(p) ? p : 0;
}

function toZone(row: Partial<ZoneLike>): ZoneLike {
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    area_km2: num(row.area_km2),
    population: num(row.population),
    road_capacity: num(row.road_capacity),
    baseline_traffic: num(row.baseline_traffic),
    water_capacity: num(row.water_capacity),
    water_demand: num(row.water_demand),
    electricity_capacity: num(row.electricity_capacity),
    electricity_demand: num(row.electricity_demand),
    land_use: String(row.land_use ?? ""),
    lat: num(row.lat),
    lng: num(row.lng),
    color: String(row.color ?? ""),
  };
}

export const getZones = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("zones").select("*");
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => toZone(row));
  });

export const getDatasetRegistry = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("dataset_registry")
      .select("name,category,status,source,description")
      .order("category");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const parseInput = z.object({ query: z.string().min(3).max(600) });

export const parseScenarioQuery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => parseInput.parse(input))
  .handler(async ({ data, context }) => {
    const parsed = parseScenarioText(data.query);
    let geocode: { lat: number; lng: number; formattedAddress: string; source: string } | null = null;
    let geocodeError: string | null = null;
    if (parsed.locationPhrase) {
      try {
        geocode = await geocodeInBengaluru(parsed.locationPhrase);
      } catch (e) {
        geocodeError = e instanceof Error ? e.message : "Geocoding failed";
      }
    }
    await context.supabase.from("audit_logs").insert({
      user_id: context.userId,
      user_email: context.claims?.email ?? null,
      event: "scenario_parsed",
      details: { query: data.query, zone: parsed.zoneName, location: parsed.locationPhrase },
    });
    return { parsed, geocode, geocodeError };
  });

const scenarioInputSchema = z.object({
  name: z.string().min(1).max(160),
  zoneId: z.string().min(1),
  locationLabel: z.string().nullable().optional(),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
  radiusM: z.number().int().min(100).max(5000).default(500),
  developmentType: z.enum(["residential", "commercial", "industrial", "mixed"]),
  units: z.number().int().min(1).max(200000),
  transportIntervention: z.enum(["none", "road-expansion", "public-transport", "tod"]),
  infrastructureIntervention: z.enum(["none", "water", "electricity", "both"]),
  description: z.string().nullable().optional(),
});

export const runScenarioAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => scenarioInputSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ scenarioId: string; analysis: AnalysisResult; zone: ZoneLike }> => {
    const input: ScenarioInput = {
      ...data,
      zoneId: data.zoneId || null,
      locationLabel: data.locationLabel ?? null,
      lat: data.lat ?? null,
      lng: data.lng ?? null,
      description: data.description ?? null,
    };

    if (!input.zoneId) throw new Error("Choose a Bengaluru zone before running the analysis.");

    const { data: zoneRow, error: zoneError } = await context.supabase
      .from("zones")
      .select("*")
      .eq("id", input.zoneId)
      .single();
    if (zoneError || !zoneRow) throw new Error("Zone not found");
    const zone = toZone(zoneRow);

    const center = { lat: input.lat ?? zone.lat, lng: input.lng ?? zone.lng };

    const { data: features } = await context.supabase
      .from("gis_features")
      .select("layer,name,lat,lng");
    const spatial = analyzeSpatial(
      (features ?? []).map((f) => ({ layer: f.layer, name: f.name, lat: num(f.lat), lng: num(f.lng) })),
      center,
      input.radiusM,
    );

    const { data: chunkRows } = await context.supabase
      .from("planning_document_chunks")
      .select("chunk_index,content,planning_documents(title,caution)");
    const evidenceQuery = [
      DEV_TYPE_LABELS[input.developmentType],
      `${input.units} units`,
      input.transportIntervention !== "none" ? TRANSPORT_LABELS[input.transportIntervention] : "",
      input.infrastructureIntervention !== "none" ? INFRA_LABELS[input.infrastructureIntervention] : "",
      "far setbacks parking road width zoning height land use",
    ].join(" ");
    const evidence = retrieveEvidence(
      (chunkRows ?? []).map((c) => {
        const doc = c.planning_documents as unknown as { title: string; caution: string } | null;
        return {
          documentTitle: doc?.title ?? "Unknown document",
          caution: doc?.caution ?? "",
          chunkIndex: c.chunk_index,
          content: c.content,
        };
      }),
      evidenceQuery,
    );

    const analysis = buildAnalysis({ zone, input, spatial, evidence });

    const { data: scenario, error: insertError } = await context.supabase
      .from("scenarios")
      .insert({
        user_id: context.userId,
        name: input.name,
        zone_id: zone.id,
        zone_name: zone.name,
        location_label: input.locationLabel ?? null,
        lat: input.lat,
        lng: input.lng,
        geocoded_from: input.locationLabel,
        radius_m: input.radiusM,
        development_type: input.developmentType,
        units: input.units,
        transport_intervention: input.transportIntervention,
        infrastructure_intervention: input.infrastructureIntervention,
        description: input.description ?? null,
      })
      .select("id")
      .single();
    if (insertError || !scenario) throw new Error(insertError?.message ?? "Could not save scenario");

    await context.supabase.from("simulation_results").insert({
      scenario_id: scenario.id,
      user_id: context.userId,
      result: analysis as unknown as Database["public"]["Tables"]["simulation_results"]["Insert"]["result"],
      spatial_context: spatial as unknown as Database["public"]["Tables"]["simulation_results"]["Insert"]["spatial_context"],
      evidence: evidence as unknown as Database["public"]["Tables"]["simulation_results"]["Insert"]["evidence"],
      impact_interpretation: analysis.impacts as unknown as Database["public"]["Tables"]["simulation_results"]["Insert"]["impact_interpretation"],
      design_options: analysis.designOptions as unknown as Database["public"]["Tables"]["simulation_results"]["Insert"]["design_options"],
    });

    await context.supabase.from("audit_logs").insert([
      {
        user_id: context.userId,
        user_email: context.claims?.email ?? null,
        event: "simulation_started",
        details: { scenarioId: scenario.id, zone: zone.name, units: input.units },
      },
      {
        user_id: context.userId,
        user_email: context.claims?.email ?? null,
        event: "simulation_completed",
        details: {
          scenarioId: scenario.id,
          overallRisk: analysis.simulation.overallRisk,
          roadUtilization: analysis.simulation.road.utilizationAfter,
        },
      },
    ]);

    return { scenarioId: scenario.id, analysis, zone };
  });

export const listAnalyses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("simulation_results")
      .select("id,scenario_id,created_at,result,scenarios(id,name,zone_name,location_label,development_type,units,transport_intervention,infrastructure_intervention,created_at,lat,lng,radius_m)")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const analysisInput = z.object({ scenarioId: z.string().uuid() });

export const getAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => analysisInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("simulation_results")
      .select("id,scenario_id,created_at,result,scenarios(*)")
      .eq("scenario_id", data.scenarioId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Analysis not found");
    return row;
  });

const copilotInput = z.object({ scenarioId: z.string().uuid(), question: z.string().min(2).max(500) });

export const askCopilot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => copilotInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("simulation_results")
      .select("result,scenarios(zone_name,development_type)")
      .eq("scenario_id", data.scenarioId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!row) throw new Error("Run a simulation first to ask the Planning Copilot about a scenario.");

    const analysis = row.result as unknown as AnalysisResult;
    const scenarioMeta = row.scenarios as unknown as { zone_name: string; development_type: DevelopmentType } | null;
    const reply = copilotReply(data.question, {
      zoneName: scenarioMeta?.zone_name ?? "the selected zone",
      developmentType: scenarioMeta?.development_type ?? "residential",
      result: analysis.simulation,
      spatial: analysis.spatialContext,
      evidence: analysis.evidence,
      alternatives: analysis.alternatives,
      impacts: analysis.impacts,
    });

    await context.supabase.from("copilot_messages").insert([
      { scenario_id: data.scenarioId, user_id: context.userId, role: "user", content: data.question },
      { scenario_id: data.scenarioId, user_id: context.userId, role: "assistant", content: reply },
    ]);
    return { reply };
  });

export const listAuditLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase
      .rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) return { isAdmin: false, logs: [] };
    const { data, error } = await context.supabase
      .from("audit_logs")
      .select("id,user_email,event,details,created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return { isAdmin: true, logs: data ?? [] };
  });

export const getMyRole = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const roles = (data ?? []).map((r) => r.role);
    return { roles, isAdmin: roles.includes("admin"), isViewerOnly: roles.length === 1 && roles[0] === "viewer" };
  });

export type { TransportIntervention, InfrastructureIntervention };
