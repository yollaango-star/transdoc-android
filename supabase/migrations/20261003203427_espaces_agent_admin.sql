-- TransDoc — deux espaces distincts après connexion :
--   • l'AGENT contrôle (controler) et ne voit que son propre journal ; il n'a plus accès aux statistiques ;
--   • l'ADMINISTRATEUR (DGTT) consulte tout le registre, vérifie les pièces, lit le journal de tous les contrôles
--     et les statistiques nationales.

-- =====================================================================
-- 1. Statistiques réservées à l'administration
-- =====================================================================
create or replace function public.stats_provinces(p_categorie text default null, p_demo boolean default true)
returns table (province text, total int, ok int, warn int, ko int, exp_assurance int, exp_visite int, exp_vignette int)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.est_admin() then raise exception 'Réservé aux administrateurs'; end if;
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
declare v_debut timestamptz := private.aujourdhui()::timestamp at time zone 'Africa/Libreville';
begin
  if not private.est_admin() then raise exception 'Réservé aux administrateurs'; end if;
  return (select jsonb_build_object('total', count(*), 'agents', count(distinct agent_id),
    'aujourdhui', count(*) filter (where created_at >= v_debut), 'non_conformes', count(*) filter (where resultat = 'ko'),
    'non_verifies', count(*) filter (where resultat = 'non_verifie'),
    'par_qr', count(*) filter (where source = 'qr')) from public.controles);
end $$;

-- =====================================================================
-- 2. Consultation du registre par l'administration
-- =====================================================================
-- Recherche par plaque ou code TD (lettres et chiffres), ou par titulaire ; filtres province et « pièces à vérifier ».
-- Renvoie { total, vehicules: [...] } avec l'état de chaque pièce ; au plus 200 véhicules par page.
create or replace function public.admin_vehicules(p_q text default null, p_province text default null,
  p_a_verifier boolean default false, p_demo boolean default false, p_limite int default 50) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_code text := upper(regexp_replace(coalesce(p_q, ''), '[^A-Za-z0-9]', '', 'g'));
  v_motif text := '%' || replace(replace(replace(trim(coalesce(p_q, '')), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  v_res jsonb;
begin
  if not private.est_admin() then raise exception 'Réservé aux administrateurs'; end if;
  with v as (
    select x.* from public.vehicles x
     where (p_demo or not x.demo)
       and (p_province is null or x.province = p_province)
       and (trim(coalesce(p_q, '')) = '' or (v_code <> '' and (x.plaque like '%' || v_code || '%' or x.code = v_code)) or x.titulaire ilike v_motif)
       and (not p_a_verifier or exists (select 1 from public.vehicle_documents d where d.plaque = x.plaque and d.statut <> 'verifie'))
  ), page as (select * from v order by plaque limit least(greatest(coalesce(p_limite, 50), 1), 200))
  select jsonb_build_object('total', (select count(*) from v), 'vehicules', coalesce(jsonb_agg(jsonb_build_object(
      'plaque', p.plaque_affichee, 'cle', p.plaque, 'code', p.code, 'categorie', p.categorie, 'marque', p.marque, 'modele', p.modele,
      'titulaire', p.titulaire, 'province', p.province, 'carte_grise', p.carte_grise, 'demo', p.demo, 'inscrit_le', p.created_at,
      'pieces', (select coalesce(jsonb_object_agg(d.piece, jsonb_build_object('expire_le', d.expire_le, 'statut', d.statut,
                   'source', d.source, 'etat', private.etat_piece(d.expire_le))), '{}'::jsonb)
                 from public.vehicle_documents d where d.plaque = p.plaque)) order by p.plaque), '[]'::jsonb))
    into v_res from page p;
  return v_res;
end $$;

-- Journal de tous les contrôles, avec le nom de l'agent (« Compte supprimé » si l'agent a quitté le service).
create or replace function public.admin_controles(p_resultat text default null, p_province text default null, p_limite int default 100)
returns table (le timestamptz, agent text, saisie text, plaque text, province text, resultat text, source text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.est_admin() then raise exception 'Réservé aux administrateurs'; end if;
  return query
  select c.created_at, coalesce(nullif(p.nom, ''), u.email::text, 'Compte supprimé'), c.saisie, c.plaque, c.province, c.resultat, c.source
    from public.controles c left join public.profiles p on p.id = c.agent_id left join auth.users u on u.id = c.agent_id
   where (p_resultat is null or c.resultat = p_resultat) and (p_province is null or c.province = p_province)
   order by c.created_at desc limit least(greatest(coalesce(p_limite, 100), 1), 500);
end $$;

revoke execute on function public.admin_vehicules(text, text, boolean, boolean, int), public.admin_controles(text, text, int) from public, anon;
grant execute on function public.admin_vehicules(text, text, boolean, boolean, int), public.admin_controles(text, text, int) to authenticated;
