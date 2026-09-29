-- TransDoc Gabon — registre national des documents de transport et contrôle routier (Supabase).
-- Principes :
--   • un véhicule par plaque (clé primaire) : une plaque déjà inscrite est refusée par le serveur ;
--   • le propriétaire DÉCLARE ses pièces ; seul le serveur (paiement, assureur, DGTT) ou un administrateur les marque VÉRIFIÉES ;
--   • un propriétaire ne voit que ses véhicules : personne ne télécharge le registre ;
--   • l'agent n'accède au registre que par controler(), qui journalise chaque recherche ;
--   • les rôles (agent, administrateur) sont attribués par un administrateur, jamais par l'application ;
--   • le tableau de bord ne renvoie que des chiffres agrégés.

-- =====================================================================
-- 0. Fondations : schéma privé, aucune exposition implicite
-- =====================================================================
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

alter default privileges for role postgres in schema public revoke select, insert, update, delete on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke usage, select on sequences from anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

-- =====================================================================
-- 1. Tables
-- =====================================================================
create table public.provinces (nom text primary key, ordre smallint not null);
insert into public.provinces (nom, ordre) values
  ('Estuaire', 1), ('Haut-Ogooué', 2), ('Moyen-Ogooué', 3), ('Ngounié', 4), ('Nyanga', 5),
  ('Ogooué-Ivindo', 6), ('Ogooué-Lolo', 7), ('Ogooué-Maritime', 8), ('Woleu-Ntem', 9);

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  nom text check (char_length(nom) <= 80),
  tel text check (char_length(tel) <= 20),
  sms boolean not null default true,
  role text not null default 'proprietaire' check (role in ('proprietaire', 'agent', 'admin')),
  created_at timestamptz not null default now()
);

-- Code TD : 8 caractères sans ambiguïté (pas de 0/O, 1/I), tirés des octets aléatoires d'un UUID v4.
create or replace function private.nouveau_code() returns text language sql volatile set search_path = '' as $$
  select 'TD' || string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + (get_byte(b, i) % 32), 1), '' order by i)
  from (select decode(replace(gen_random_uuid()::text, '-', ''), 'hex') b) r, generate_series(0, 7) i
$$;

create table public.vehicles (
  plaque text primary key check (plaque ~ '^[A-Z0-9]{4,12}$'),         -- normalisée : lettres et chiffres
  plaque_affichee text not null check (char_length(plaque_affichee) between 4 and 16),
  owner_id uuid references public.profiles on delete set null,        -- vide pour les véhicules de démonstration
  code text not null unique default private.nouveau_code(),
  categorie text not null check (categorie in ('Véhicule particulier', 'Taxi', 'Clando / transport en commun', 'Camion / poids lourd', 'Bus', 'Moto')),
  marque text not null check (char_length(marque) between 1 and 40),
  modele text check (char_length(modele) <= 40),
  titulaire text not null check (char_length(titulaire) between 2 and 80),
  province text not null references public.provinces,
  carte_grise text not null check (char_length(carte_grise) between 2 and 30),
  demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index vehicles_owner_idx on public.vehicles (owner_id);
create index vehicles_province_idx on public.vehicles (province);

create table public.vehicle_documents (
  plaque text not null references public.vehicles on delete cascade,
  piece text not null check (piece in ('assurance', 'visite', 'vignette')),
  expire_le date not null,
  statut text not null default 'declare' check (statut in ('declare', 'verifie')),
  source text not null default 'proprietaire',   -- proprietaire, paiement, assureur, dgtt, admin, demo
  verifie_le timestamptz,
  updated_at timestamptz not null default now(),
  primary key (plaque, piece)
);

create table public.controles (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.profiles on delete cascade,
  plaque text,                         -- vide si introuvable ; pas de clé étrangère : l'historique survit au véhicule
  saisie text not null check (char_length(saisie) <= 60),
  province text,
  resultat text not null check (resultat in ('ok', 'warn', 'ko', 'introuvable')),
  source text not null check (source in ('qr', 'saisie')),
  created_at timestamptz not null default now()
);
create index controles_agent_idx on public.controles (agent_id, created_at desc);
create index controles_date_idx on public.controles (created_at);

alter table public.provinces enable row level security;
alter table public.profiles enable row level security;
alter table public.vehicles enable row level security;
alter table public.vehicle_documents enable row level security;
alter table public.controles enable row level security;

-- =====================================================================
-- 2. Fonctions internes
-- =====================================================================
create or replace function private.role_de(uid uuid) returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select role from public.profiles where id = uid), 'aucun')
$$;
create or replace function private.est_agent() returns boolean language sql stable security definer set search_path = '' as $$
  select private.role_de((select auth.uid())) in ('agent', 'admin')
$$;
create or replace function private.est_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select private.role_de((select auth.uid())) = 'admin'
$$;
create or replace function private.possede(p_plaque text) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.vehicles where plaque = p_plaque and owner_id = (select auth.uid()))
$$;

-- État d'une pièce à une date donnée : ko (expirée), warn (sous 30 jours), ok.
create or replace function private.etat_piece(d date) returns text language sql stable set search_path = '' as $$
  select case when d < current_date then 'ko' when d <= current_date + 30 then 'warn' else 'ok' end
$$;

-- Toute écriture venue de l'application (propriétaire) est une DÉCLARATION, quoi qu'envoie le téléphone.
-- Seuls le serveur (service_role, éditeur SQL) et un administrateur peuvent marquer une pièce vérifiée.
-- SECURITY INVOKER volontairement : current_user doit être l'appelant (authenticated, service_role…),
-- alors qu'en SECURITY DEFINER il vaudrait toujours le propriétaire de la fonction.
create or replace function private.pieces_declarees() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  -- Conditions imbriquées : SQL ne garantit pas l'ordre d'évaluation d'un « and ».
  if current_user not in ('service_role', 'postgres', 'supabase_admin') then
    if not private.est_admin() then
      new.statut := 'declare'; new.source := 'proprietaire'; new.verifie_le := null;
    end if;
  end if;
  if new.statut = 'verifie' and new.verifie_le is null then new.verifie_le := now(); end if;
  if new.statut = 'declare' then new.verifie_le := null; end if;
  new.updated_at := now();
  return new;
end $$;
create trigger vehicle_documents_declarees before insert or update on public.vehicle_documents
  for each row execute function private.pieces_declarees();

create or replace function private.maj_vehicule() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
create trigger vehicles_maj before update on public.vehicles for each row execute function private.maj_vehicule();

-- Un nouveau compte a un profil de propriétaire.
create or replace function private.nouveau_profil() returns trigger language plpgsql security definer set search_path = '' as $$
begin insert into public.profiles (id) values (new.id) on conflict do nothing; return new; end $$;
create trigger auth_nouveau_profil after insert on auth.users for each row execute function private.nouveau_profil();

-- =====================================================================
-- 3. Règles d'accès
-- =====================================================================
create policy "provinces publiques" on public.provinces for select using (true);

create policy "son profil" on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "modifier son profil" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "ses véhicules" on public.vehicles for select to authenticated using (owner_id = (select auth.uid()));
create policy "inscrire son véhicule" on public.vehicles for insert to authenticated with check (owner_id = (select auth.uid()) and not demo);
create policy "modifier son véhicule" on public.vehicles for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "retirer son véhicule" on public.vehicles for delete to authenticated using (owner_id = (select auth.uid()));

create policy "pièces de ses véhicules" on public.vehicle_documents for select to authenticated using (private.possede(plaque));
create policy "déclarer une pièce" on public.vehicle_documents for insert to authenticated with check (private.possede(plaque));
create policy "modifier une pièce" on public.vehicle_documents for update to authenticated
  using (private.possede(plaque)) with check (private.possede(plaque));
-- L'administration (DGTT) consulte le registre pour vérifier les pièces. Une modification exige une règle de lecture :
-- sans elle, l'UPDATE ne toucherait aucune ligne, sans erreur.
create policy "administration : voir les véhicules" on public.vehicles for select to authenticated using (private.est_admin());
create policy "administration : voir les pièces" on public.vehicle_documents for select to authenticated using (private.est_admin());
create policy "administration : vérifier une pièce" on public.vehicle_documents for update to authenticated
  using (private.est_admin()) with check (private.est_admin());

create policy "ses contrôles" on public.controles for select to authenticated using (agent_id = (select auth.uid()));

-- =====================================================================
-- 4. Fonctions appelables par l'application
-- =====================================================================
-- Contrôle routier : recherche par plaque ou code TD, journalisée à chaque appel.
create or replace function public.controler(p_saisie text, p_source text default 'saisie') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_q text := upper(regexp_replace(coalesce(p_saisie, ''), '[^A-Za-z0-9]', '', 'g'));
  v public.vehicles%rowtype;
  v_pieces jsonb; v_res text;
begin
  if not private.est_agent() then raise exception 'Réservé aux agents de contrôle habilités'; end if;
  if char_length(v_q) < 4 then raise exception 'Saisissez une immatriculation ou un code TD'; end if;
  if p_source not in ('qr', 'saisie') then p_source := 'saisie'; end if;
  select * into v from public.vehicles where plaque = v_q or code = v_q limit 1;
  if not found then
    insert into public.controles (agent_id, plaque, saisie, resultat, source) values (v_uid, null, left(p_saisie, 60), 'introuvable', p_source);
    return jsonb_build_object('trouve', false, 'saisie', p_saisie);
  end if;
  select jsonb_object_agg(d.piece, jsonb_build_object('expire_le', d.expire_le, 'statut', d.statut, 'etat', private.etat_piece(d.expire_le)))
    into v_pieces from public.vehicle_documents d where d.plaque = v.plaque;
  v_pieces := coalesce(v_pieces, '{}'::jsonb);
  v_res := case
    when (select count(*) from public.vehicle_documents d where d.plaque = v.plaque) < 3 then 'ko'
    when exists (select 1 from public.vehicle_documents d where d.plaque = v.plaque and private.etat_piece(d.expire_le) = 'ko') then 'ko'
    when exists (select 1 from public.vehicle_documents d where d.plaque = v.plaque and private.etat_piece(d.expire_le) = 'warn') then 'warn'
    else 'ok' end;
  insert into public.controles (agent_id, plaque, saisie, province, resultat, source) values (v_uid, v.plaque, left(p_saisie, 60), v.province, v_res, p_source);
  return jsonb_build_object('trouve', true, 'resultat', v_res, 'plaque', v.plaque_affichee, 'code', v.code, 'categorie', v.categorie,
    'marque', v.marque, 'modele', v.modele, 'titulaire', v.titulaire, 'province', v.province, 'pieces', v_pieces,
    'toutes_verifiees', not exists (select 1 from public.vehicle_documents d where d.plaque = v.plaque and d.statut <> 'verifie'));
end $$;

-- Tableau de bord : chiffres par province, sans aucune donnée personnelle.
create or replace function public.stats_provinces(p_categorie text default null, p_demo boolean default true)
returns table (province text, total int, ok int, warn int, ko int, exp_assurance int, exp_visite int, exp_vignette int)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.est_agent() then raise exception 'Réservé aux agents et administrateurs'; end if;
  return query
  with v as (
    select x.plaque, x.province from public.vehicles x
     where (p_categorie is null or x.categorie = p_categorie) and (p_demo or not x.demo)
  ), e as (
    select v.plaque, v.province,
      coalesce(bool_or(private.etat_piece(d.expire_le) = 'ko'), true) or count(d.piece) < 3 as ko,
      coalesce(bool_or(private.etat_piece(d.expire_le) = 'warn'), false) as warn,
      count(*) filter (where d.piece = 'assurance' and private.etat_piece(d.expire_le) = 'ko') ea,
      count(*) filter (where d.piece = 'visite' and private.etat_piece(d.expire_le) = 'ko') ev,
      count(*) filter (where d.piece = 'vignette' and private.etat_piece(d.expire_le) = 'ko') eg
    from v left join public.vehicle_documents d on d.plaque = v.plaque group by v.plaque, v.province
  )
  select p.nom, count(e.plaque)::int, count(*) filter (where e.plaque is not null and not e.ko and not e.warn)::int,
    count(*) filter (where e.plaque is not null and not e.ko and e.warn)::int, count(*) filter (where e.ko)::int,
    coalesce(sum(e.ea), 0)::int, coalesce(sum(e.ev), 0)::int, coalesce(sum(e.eg), 0)::int
  from public.provinces p left join e on e.province = p.nom group by p.nom, p.ordre order by p.ordre;
end $$;

create or replace function public.stats_controles() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.est_agent() then raise exception 'Réservé aux agents et administrateurs'; end if;
  return (select jsonb_build_object('total', count(*), 'agents', count(distinct agent_id),
    'aujourdhui', count(*) filter (where created_at >= current_date), 'non_conformes', count(*) filter (where resultat = 'ko'),
    'par_qr', count(*) filter (where source = 'qr')) from public.controles);
end $$;

-- Administration des rôles
create or replace function public.admin_rechercher(p_q text) returns table (id uuid, nom text, email text, role text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.est_admin() then raise exception 'Réservé aux administrateurs'; end if;
  return query select p.id, p.nom, u.email::text, p.role from public.profiles p join auth.users u on u.id = p.id
   where char_length(coalesce(p_q, '')) >= 2 and (p.nom ilike '%' || p_q || '%' or u.email ilike '%' || p_q || '%')
   order by p.nom limit 20;
end $$;

create or replace function public.admin_agents() returns table (id uuid, nom text, email text, role text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.est_admin() then raise exception 'Réservé aux administrateurs'; end if;
  return query select p.id, p.nom, u.email::text, p.role from public.profiles p join auth.users u on u.id = p.id
   where p.role in ('agent', 'admin') order by p.role, p.nom;
end $$;

create or replace function public.admin_definir_role(p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.est_admin() then raise exception 'Réservé aux administrateurs'; end if;
  if p_role not in ('proprietaire', 'agent', 'admin') then raise exception 'Rôle inconnu'; end if;
  if p_user = (select auth.uid()) and p_role <> 'admin' then raise exception 'Vous ne pouvez pas retirer votre propre rôle d’administrateur'; end if;
  update public.profiles set role = p_role where id = p_user;
  if not found then raise exception 'Compte introuvable'; end if;
end $$;

-- =====================================================================
-- 5. Droits d'accès à l'API, au plus juste
-- =====================================================================
grant select on public.provinces to anon, authenticated;
grant select, update (nom, tel, sms) on public.profiles to authenticated;
grant select, delete on public.vehicles to authenticated;
grant insert (plaque, plaque_affichee, owner_id, categorie, marque, modele, titulaire, province, carte_grise) on public.vehicles to authenticated;
grant update (categorie, marque, modele, titulaire, province, carte_grise) on public.vehicles to authenticated;
grant select, insert (plaque, piece, expire_le, statut), update (expire_le, statut, source) on public.vehicle_documents to authenticated;
grant select on public.controles to authenticated;
grant all on all tables in schema public to service_role;

revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.possede(text), private.est_admin(), private.est_agent(), private.role_de(uuid) to authenticated, service_role;
-- Valeur par défaut de vehicles.code, évaluée avec les droits de celui qui inscrit le véhicule (tirage aléatoire, sans risque).
grant execute on function private.nouveau_code() to authenticated;
grant execute on function public.controler(text, text), public.stats_provinces(text, boolean), public.stats_controles(),
  public.admin_rechercher(text), public.admin_agents(), public.admin_definir_role(uuid, text) to authenticated;
