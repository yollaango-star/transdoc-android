-- TransDoc — correctifs bloquants avant la mise en production (revue du 3 octobre 2026).
--   DEV-1 : un profil anonyme (ouvert automatiquement par l'application) ne peut plus inscrire de véhicule :
--           il faut un compte dont l'e-mail est confirmé. Une plaque inscrite à tort est réattribuée par la DGTT.
--   DEV-2 : le contrôle ne répond « conforme » que si les trois pièces sont VÉRIFIÉES ; des dates seulement
--           déclarées par le propriétaire donnent le verdict « non_verifie ».
--   OPS-2 : les véhicules de démonstration portent une plaque préfixée DEMO, qu'aucun véhicule réel ne peut avoir :
--           exécuter seed.sql par erreur ne bloque donc aucune vraie plaque.

-- =====================================================================
-- DEV-1. Inscription réservée aux comptes identifiés
-- =====================================================================
-- Supabase place is_anonymous dans le jeton de chaque session ; il passe à false une fois l'e-mail confirmé.
create or replace function private.est_identifie() returns boolean language sql stable set search_path = '' as $$
  select (select auth.uid()) is not null
     and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
$$;
grant execute on function private.est_identifie() to authenticated, service_role;

alter policy "inscrire son véhicule" on public.vehicles
  with check (owner_id = (select auth.uid()) and not demo and private.est_identifie());

-- Réclamation de plaque : après contrôle de la carte grise, l'administration réattribue le véhicule
-- au compte de son vrai propriétaire. Les pièces redeviennent de simples déclarations.
create or replace function public.admin_reattribuer_vehicule(p_plaque text, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_plaque text := upper(regexp_replace(coalesce(p_plaque, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  if not private.est_admin() then raise exception 'Réservé aux administrateurs'; end if;
  if not exists (select 1 from public.profiles where id = p_user) then raise exception 'Compte introuvable'; end if;
  update public.vehicles set owner_id = p_user where plaque = v_plaque and not demo;
  if not found then raise exception 'Véhicule introuvable'; end if;
  update public.vehicle_documents set statut = 'declare', source = 'proprietaire' where plaque = v_plaque;
end $$;
revoke execute on function public.admin_reattribuer_vehicule(text, uuid) from public, anon;
grant execute on function public.admin_reattribuer_vehicule(text, uuid) to authenticated;

-- =====================================================================
-- DEV-2. Verdict « conforme » réservé aux pièces vérifiées
-- =====================================================================
alter table public.controles drop constraint controles_resultat_check;
alter table public.controles add constraint controles_resultat_check
  check (resultat in ('ok', 'warn', 'non_verifie', 'ko', 'introuvable'));

-- Ordre des verdicts : ko (pièce manquante ou expirée) > non_verifie (une pièce seulement déclarée)
-- > warn (vérifiée, expire sous 30 jours) > ok.
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
    when exists (select 1 from public.vehicle_documents d where d.plaque = v.plaque and d.statut <> 'verifie') then 'non_verifie'
    when exists (select 1 from public.vehicle_documents d where d.plaque = v.plaque and private.etat_piece(d.expire_le) = 'warn') then 'warn'
    else 'ok' end;
  insert into public.controles (agent_id, plaque, saisie, province, resultat, source) values (v_uid, v.plaque, left(p_saisie, 60), v.province, v_res, p_source);
  return jsonb_build_object('trouve', true, 'resultat', v_res, 'plaque', v.plaque_affichee, 'code', v.code, 'categorie', v.categorie,
    'marque', v.marque, 'modele', v.modele, 'titulaire', v.titulaire, 'province', v.province, 'pieces', v_pieces,
    'toutes_verifiees', not exists (select 1 from public.vehicle_documents d where d.plaque = v.plaque and d.statut <> 'verifie'));
end $$;

create or replace function public.stats_controles() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.est_agent() then raise exception 'Réservé aux agents et administrateurs'; end if;
  return (select jsonb_build_object('total', count(*), 'agents', count(distinct agent_id),
    'aujourdhui', count(*) filter (where created_at >= current_date), 'non_conformes', count(*) filter (where resultat = 'ko'),
    'non_verifies', count(*) filter (where resultat = 'non_verifie'),
    'par_qr', count(*) filter (where source = 'qr')) from public.controles);
end $$;

-- =====================================================================
-- OPS-2. Démonstration isolée des vraies plaques
-- =====================================================================
-- Anciennes données de démonstration (plaques au format réel) : retirées, pièces comprises (cascade).
-- seed.sql les recrée avec le préfixe DEMO.
delete from public.vehicles where demo and plaque !~ '^DEMO';
alter table public.vehicles add constraint vehicles_demo_prefixe check (demo = (plaque ~ '^DEMO'));
