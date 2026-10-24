-- Smart Urban Planning Assistant / UrbanTwin AI schema
create type public.app_role as enum ('admin','planner','analyst','viewer');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role public.app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
create policy "Users can view own roles" on public.user_roles
  for select to authenticated using (auth.uid() = user_id);

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.user_roles (user_id, role) values (new.id, 'planner') on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Modeled Bengaluru planning zones (illustrative prototype values)
create table public.zones (
  id text primary key,
  name text not null,
  area_km2 numeric not null,
  population integer not null,
  road_capacity integer not null,
  baseline_traffic integer not null,
  water_capacity numeric not null,
  water_demand numeric not null,
  electricity_capacity numeric not null,
  electricity_demand numeric not null,
  land_use text not null,
  lat numeric not null,
  lng numeric not null,
  color text not null
);
grant select on public.zones to anon, authenticated;
grant all on public.zones to service_role;
alter table public.zones enable row level security;
create policy "Public read zones" on public.zones for select using (true);
insert into public.zones (id,name,area_km2,population,road_capacity,baseline_traffic,water_capacity,water_demand,electricity_capacity,electricity_demand,land_use,lat,lng,color) values
('electronic-city','Electronic City',18.3,260000,300000,225000,36000000,30600000,2200000,1860000,'Commercial / industrial',12.8452,77.6602,'#3b82f6'),
('whitefield','Whitefield',18.0,290000,310000,240000,39000000,34000000,2400000,2050000,'Mixed use',12.9698,77.7500,'#22c55e'),
('koramangala','Koramangala',8.7,210000,220000,185000,28000000,25500000,1800000,1600000,'Commercial / residential',12.9352,77.6245,'#f59e0b'),
('hebbal','Hebbal',12.1,180000,240000,168000,25000000,21000000,1600000,1380000,'Residential / industrial',13.0358,77.5970,'#a855f7'),
('yelahanka','Yelahanka',17.5,150000,230000,150000,21000000,18000000,1400000,1190000,'Residential / commercial',13.1007,77.5963,'#ec4899');

-- User scenarios
create table public.scenarios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  zone_id text,
  zone_name text,
  location_label text,
  lat numeric,
  lng numeric,
  geocoded_from text,
  radius_m integer,
  development_type text not null,
  units integer not null,
  transport_intervention text not null default 'none',
  infrastructure_intervention text not null default 'none',
  description text,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.scenarios to authenticated;
grant all on public.scenarios to service_role;
alter table public.scenarios enable row level security;
create policy "Owner CRUD scenarios" on public.scenarios
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table public.simulation_results (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid references public.scenarios(id) on delete cascade not null,
  user_id uuid not null,
  result jsonb not null,
  spatial_context jsonb,
  evidence jsonb,
  impact_interpretation jsonb,
  design_options jsonb,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.simulation_results to authenticated;
grant all on public.simulation_results to service_role;
alter table public.simulation_results enable row level security;
create policy "Owner CRUD simulation_results" on public.simulation_results
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  user_email text,
  event text not null,
  details jsonb,
  created_at timestamptz not null default now()
);
grant select, insert on public.audit_logs to authenticated;
grant all on public.audit_logs to service_role;
alter table public.audit_logs enable row level security;
create policy "Insert own audit logs" on public.audit_logs
  for insert to authenticated with check (auth.uid() = user_id);
create policy "Read own audit logs" on public.audit_logs
  for select to authenticated using (auth.uid() = user_id);

create table public.copilot_messages (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid references public.scenarios(id) on delete cascade,
  user_id uuid not null,
  role text not null check (role in ('user','assistant')),
  content text not null,
  created_at timestamptz not null default now()
);
grant select, insert on public.copilot_messages to authenticated;
grant all on public.copilot_messages to service_role;
alter table public.copilot_messages enable row level security;
create policy "Owner read copilot_messages" on public.copilot_messages
  for select to authenticated using (auth.uid() = user_id);
create policy "Owner insert copilot_messages" on public.copilot_messages
  for insert to authenticated with check (auth.uid() = user_id);

create table public.dataset_registry (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  status text not null check (status in ('connected','not_connected')),
  source text not null,
  description text not null,
  created_at timestamptz not null default now()
);
grant select on public.dataset_registry to anon, authenticated;
grant all on public.dataset_registry to service_role;
alter table public.dataset_registry enable row level security;
create policy "Public read dataset_registry" on public.dataset_registry for select using (true);
insert into public.dataset_registry (name,category,status,source,description) values
('OpenStreetMap road network (processed extract)','Geographic context','connected','OSM / OpenMapTiles','Road geometry, labels and building footprints derived from OpenStreetMap.'),
('OpenFreeMap vector tiles','Geographic context','connected','OpenFreeMap','Public vector-tile delivery service used for the MapLibre basemap.'),
('Traffic-event observations','Mobility','connected','Project CSV sample','Sample of recorded congestion and junction observations.'),
('BWSSB water supply lines','Utilities','not_connected','BWSSB','Official water supply network data; registered for future integration.'),
('BWSSB sewerage lines','Utilities','not_connected','BWSSB','Official sewerage network data; registered for future integration.'),
('BWSSB sewage treatment plants','Utilities','not_connected','BWSSB','STP locations and capacities; registered for future integration.'),
('BESCOM high-tension lines','Utilities','not_connected','BESCOM','HT network geometry; registered for future integration.'),
('BESCOM low-tension lines','Utilities','not_connected','BESCOM','LT network geometry; registered for future integration.'),
('BESCOM consumption datasets','Utilities','not_connected','BESCOM','Area consumption data; registered for future integration.');

create table public.planning_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  caution text not null,
  created_at timestamptz not null default now()
);
grant select on public.planning_documents to anon, authenticated;
grant all on public.planning_documents to service_role;
alter table public.planning_documents enable row level security;
create policy "Public read planning_documents" on public.planning_documents for select using (true);

create table public.planning_document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references public.planning_documents(id) on delete cascade not null,
  chunk_index integer not null,
  content text not null
);
grant select on public.planning_document_chunks to anon, authenticated;
grant all on public.planning_document_chunks to service_role;
alter table public.planning_document_chunks enable row level security;
create policy "Public read planning_document_chunks" on public.planning_document_chunks for select using (true);
insert into public.planning_documents (title,caution) values
('RMP 2031 Vision Document (Draft)','Draft vision/planning-background source. Do not present the draft as final binding regulation.'),
('Bengaluru Zonal Regulations Amendment 2025 (Premium FAR)','Government notification source with Premium FAR provisions. Verify the applicable planning authority and effective status for a real parcel.'),
('Greater Bengaluru Zonal Regulations (search text)','Searchable OCR/transcription from scanned zonal-regulation material. Verify any retrieved value against the original.');
insert into public.planning_document_chunks (document_id,chunk_index,content) values
((SELECT id FROM public.planning_documents WHERE title = 'RMP 2031 Vision Document (Draft)'),0,'The draft Revised Master Plan 2031 emphasises Transit-Oriented Development (TOD) along identified mass-transit corridors, encouraging higher densities and mixed land use within walking distance of transit nodes.'),
((SELECT id FROM public.planning_documents WHERE title = 'RMP 2031 Vision Document (Draft)'),1,'RMP 2031 discusses transferable development rights (TDR) as an instrument to accommodate additional built density in designated receiving areas, subject to road width and zonal regulations in force at the time of approval.'),
((SELECT id FROM public.planning_documents WHERE title = 'RMP 2031 Vision Document (Draft)'),2,'The vision document proposes consolidation of commercial activity along major corridors while protecting green and water bodies as ecological networks across the planning area.'),
((SELECT id FROM public.planning_documents WHERE title = 'RMP 2031 Vision Document (Draft)'),3,'RMP 2031 is a draft document; its land-use proposals do not confer development rights and remain subject to statutory approval and subsequent amendments.'),
((SELECT id FROM public.planning_documents WHERE title = 'Bengaluru Zonal Regulations Amendment 2025 (Premium FAR)'),0,'Premium FAR table (excerpt): for abutting road width greater than 9 m and up to 12 m, maximum additional FAR is 0.2, all of it as Premium FAR; the DRC/TDR component is NIL.'),
((SELECT id FROM public.planning_documents WHERE title = 'Bengaluru Zonal Regulations Amendment 2025 (Premium FAR)'),1,'Premium FAR table (excerpt): for abutting road width greater than 12 m and up to 18 m, maximum additional FAR is 0.4, of which 0.3 is Premium FAR and 0.1 is DRC/TDR.'),
((SELECT id FROM public.planning_documents WHERE title = 'Bengaluru Zonal Regulations Amendment 2025 (Premium FAR)'),2,'Premium FAR table (excerpt): for abutting road width greater than 18 m, maximum additional FAR is 0.6, of which 0.4 is Premium FAR and 0.2 is DRC/TDR.'),
((SELECT id FROM public.planning_documents WHERE title = 'Bengaluru Zonal Regulations Amendment 2025 (Premium FAR)'),3,'Premium FAR eligibility depends on the parcel''s abutting-road width, base FAR under the applicable zonal regulations, and the approving authority. A mapped road geometry does not establish surveyed right-of-way width; verify before drawing a compliance conclusion.'),
((SELECT id FROM public.planning_documents WHERE title = 'Bengaluru Zonal Regulations Amendment 2025 (Premium FAR)'),4,'The 2025 amendment notification applies within the jurisdiction stated in the notification; parcels outside that jurisdiction follow the zonal regulations otherwise in force.'),
((SELECT id FROM public.planning_documents WHERE title = 'Greater Bengaluru Zonal Regulations (search text)'),0,'Zonal land-use categories restrict the uses permissible on any site; residential use is generally permitted in residential and mixed-use zones but may require conversion in industrial zones.'),
((SELECT id FROM public.planning_documents WHERE title = 'Greater Bengaluru Zonal Regulations (search text)'),1,'Setback requirements scale with building height and road width; front, side and rear setbacks must be maintained as per the schedule in the applicable regulations.'),
((SELECT id FROM public.planning_documents WHERE title = 'Greater Bengaluru Zonal Regulations (search text)'),2,'Off-street parking shall be provided for every use as prescribed; the number of car spaces is computed on the built-up area of the development.'),
((SELECT id FROM public.planning_documents WHERE title = 'Greater Bengaluru Zonal Regulations (search text)'),3,'Buildings abutting roads below the prescribed width may face height restrictions; fire-access requirements apply to buildings above specified heights.');

create table public.gis_features (
  id uuid primary key default gen_random_uuid(),
  layer text not null,
  name text not null,
  lat numeric not null,
  lng numeric not null
);
grant select on public.gis_features to anon, authenticated;
grant all on public.gis_features to service_role;
alter table public.gis_features enable row level security;
create policy "Public read gis_features" on public.gis_features for select using (true);
create index gis_features_layer_idx on public.gis_features (layer);
insert into public.gis_features (layer,name,lat,lng) values
('schools','Government Higher Primary School, Electronic City',12.850219,77.6431),
('schools','St. Joseph''s School, Electronic City',12.837101,77.650236),
('schools','Kendriya Vidyalaya, Electronic City',12.853713,77.666561),
('hospitals','Apollo Hospital, Electronic City',12.859318,77.64533),
('hospitals','Manipal Hospital, Electronic City',12.842389,77.643273),
('police','Local Police Station, Electronic City',12.835071,77.660393),
('fire_stations','Fire & Emergency Station, Electronic City',12.828155,77.649358),
('bus_stops','Bus Stop, Electronic City',12.850596,77.661818),
('bus_stops','BMTC Bus Stand, Electronic City',12.835136,77.663414),
('bus_stops','Bus Terminal, Electronic City',12.856339,77.642434),
('bus_stops','Metro Station, Electronic City',12.856209,77.667333),
('bus_stops','Bus Stop, Electronic City',12.839449,77.647797),
('parks','Local Park, Electronic City',12.86166,77.654317),
('parks','Urban Park, Electronic City',12.830539,77.645682),
('water_bodies','Lake, Electronic City',12.85771,77.663934),
('traffic_events','Congestion hotspot (evening peak), Electronic City',12.856257,77.66847),
('traffic_events','Junction bottleneck, Electronic City',12.846504,77.677232),
('landuse','Mixed-use zone, Electronic City',12.840827,77.662073),
('pois','Market complex, Electronic City',12.857059,77.664467),
('pois','Shopping mall, Electronic City',12.858221,77.662985),
('pois','Office tech park, Electronic City',12.852565,77.64385),
('roads','Arterial road (approx. 24 m RoW), Electronic City',12.835404,77.652618),
('roads','Major road (approx. 18 m RoW), Electronic City',12.830073,77.65058),
('roads','Collector road (approx. 12 m RoW), Electronic City',12.830836,77.652207),
('schools','Government Higher Primary School, Whitefield',12.974685,77.745134),
('schools','St. Joseph''s School, Whitefield',12.965127,77.739542),
('schools','Kendriya Vidyalaya, Whitefield',12.961411,77.76572),
('hospitals','Apollo Hospital, Whitefield',12.975129,77.753929),
('hospitals','Manipal Hospital, Whitefield',12.957961,77.758249),
('police','Local Police Station, Whitefield',12.957682,77.74566),
('fire_stations','Fire & Emergency Station, Whitefield',12.987423,77.75504),
('bus_stops','Bus Stop, Whitefield',12.97185,77.756646),
('bus_stops','BMTC Bus Stand, Whitefield',12.982143,77.759936),
('bus_stops','Bus Terminal, Whitefield',12.960046,77.733156),
('bus_stops','Metro Station, Whitefield',12.963156,77.741639),
('bus_stops','Bus Stop, Whitefield',12.959395,77.765945),
('parks','Local Park, Whitefield',12.983349,77.743328),
('parks','Urban Park, Whitefield',12.975396,77.746243),
('water_bodies','Lake, Whitefield',12.984724,77.748519),
('traffic_events','Congestion hotspot (evening peak), Whitefield',12.961336,77.740879),
('traffic_events','Junction bottleneck, Whitefield',12.972009,77.741459),
('landuse','Mixed-use zone, Whitefield',12.972845,77.764322),
('pois','Market complex, Whitefield',12.966178,77.739896),
('pois','Shopping mall, Whitefield',12.987711,77.750343),
('pois','Office tech park, Whitefield',12.955073,77.733696),
('roads','Arterial road (approx. 24 m RoW), Whitefield',12.955747,77.754588),
('roads','Major road (approx. 18 m RoW), Whitefield',12.980315,77.747198),
('roads','Collector road (approx. 12 m RoW), Whitefield',12.954087,77.745738),
('schools','Government Higher Primary School, Koramangala',12.95306,77.625548),
('schools','St. Joseph''s School, Koramangala',12.952159,77.637488),
('schools','Kendriya Vidyalaya, Koramangala',12.917613,77.632446),
('hospitals','Apollo Hospital, Koramangala',12.941742,77.625831),
('hospitals','Manipal Hospital, Koramangala',12.926806,77.629575),
('police','Local Police Station, Koramangala',12.921216,77.622152),
('fire_stations','Fire & Emergency Station, Koramangala',12.933534,77.640837),
('bus_stops','Bus Stop, Koramangala',12.948731,77.615982),
('bus_stops','BMTC Bus Stand, Koramangala',12.935221,77.612931),
('bus_stops','Bus Terminal, Koramangala',12.950055,77.637839),
('bus_stops','Metro Station, Koramangala',12.927944,77.629502),
('bus_stops','Bus Stop, Koramangala',12.939123,77.612002),
('parks','Local Park, Koramangala',12.94465,77.625918),
('parks','Urban Park, Koramangala',12.945231,77.625593),
('water_bodies','Lake, Koramangala',12.917221,77.61817),
('traffic_events','Congestion hotspot (evening peak), Koramangala',12.917901,77.639948),
('traffic_events','Junction bottleneck, Koramangala',12.948834,77.63644),
('landuse','Mixed-use zone, Koramangala',12.928271,77.608585),
('pois','Market complex, Koramangala',12.948808,77.64059),
('pois','Shopping mall, Koramangala',12.920284,77.623996),
('pois','Office tech park, Koramangala',12.919692,77.633882),
('roads','Arterial road (approx. 24 m RoW), Koramangala',12.94477,77.611122),
('roads','Major road (approx. 18 m RoW), Koramangala',12.93431,77.626293),
('roads','Collector road (approx. 12 m RoW), Koramangala',12.926742,77.637908),
('schools','Government Higher Primary School, Hebbal',13.033033,77.586625),
('schools','St. Joseph''s School, Hebbal',13.037215,77.605278),
('schools','Kendriya Vidyalaya, Hebbal',13.025041,77.590222),
('hospitals','Apollo Hospital, Hebbal',13.053625,77.602396),
('hospitals','Manipal Hospital, Hebbal',13.033572,77.597633),
('police','Local Police Station, Hebbal',13.022156,77.587089),
('fire_stations','Fire & Emergency Station, Hebbal',13.029971,77.600179),
('bus_stops','Bus Stop, Hebbal',13.026084,77.586928),
('bus_stops','BMTC Bus Stand, Hebbal',13.020356,77.60172),
('bus_stops','Bus Terminal, Hebbal',13.026042,77.611595),
('bus_stops','Metro Station, Hebbal',13.048747,77.581551),
('bus_stops','Bus Stop, Hebbal',13.026368,77.603083),
('parks','Local Park, Hebbal',13.025513,77.583763),
('parks','Urban Park, Hebbal',13.051479,77.599558),
('water_bodies','Lake, Hebbal',13.034816,77.607246),
('traffic_events','Congestion hotspot (evening peak), Hebbal',13.04687,77.585855),
('traffic_events','Junction bottleneck, Hebbal',13.02129,77.594518),
('landuse','Mixed-use zone, Hebbal',13.033049,77.595813),
('pois','Market complex, Hebbal',13.044047,77.603241),
('pois','Shopping mall, Hebbal',13.05323,77.582543),
('pois','Office tech park, Hebbal',13.032294,77.591215),
('roads','Arterial road (approx. 24 m RoW), Hebbal',13.04882,77.587952),
('roads','Major road (approx. 18 m RoW), Hebbal',13.024648,77.59515),
('roads','Collector road (approx. 12 m RoW), Hebbal',13.032988,77.589028),
('schools','Government Higher Primary School, Yelahanka',13.091693,77.611538),
('schools','St. Joseph''s School, Yelahanka',13.098653,77.609309),
('schools','Kendriya Vidyalaya, Yelahanka',13.102512,77.580121),
('hospitals','Apollo Hospital, Yelahanka',13.118674,77.608397),
('hospitals','Manipal Hospital, Yelahanka',13.117584,77.611649),
('police','Local Police Station, Yelahanka',13.113253,77.584287),
('fire_stations','Fire & Emergency Station, Yelahanka',13.100183,77.585995),
('bus_stops','Bus Stop, Yelahanka',13.097137,77.580411),
('bus_stops','BMTC Bus Stand, Yelahanka',13.096343,77.613771),
('bus_stops','Bus Terminal, Yelahanka',13.092247,77.606527),
('bus_stops','Metro Station, Yelahanka',13.09908,77.593528),
('bus_stops','Bus Stop, Yelahanka',13.117163,77.614135),
('parks','Local Park, Yelahanka',13.102708,77.604163),
('parks','Urban Park, Yelahanka',13.088273,77.588981),
('water_bodies','Lake, Yelahanka',13.117574,77.59915),
('traffic_events','Congestion hotspot (evening peak), Yelahanka',13.102219,77.605227),
('traffic_events','Junction bottleneck, Yelahanka',13.084758,77.59933),
('landuse','Mixed-use zone, Yelahanka',13.100803,77.608998),
('pois','Market complex, Yelahanka',13.088368,77.612888),
('pois','Shopping mall, Yelahanka',13.085584,77.58499),
('pois','Office tech park, Yelahanka',13.104121,77.602608),
('roads','Arterial road (approx. 24 m RoW), Yelahanka',13.091167,77.582616),
('roads','Major road (approx. 18 m RoW), Yelahanka',13.11475,77.587164),
('roads','Collector road (approx. 12 m RoW), Yelahanka',13.104103,77.600598);
