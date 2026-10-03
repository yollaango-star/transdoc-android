-- TransDoc — correctifs P1 et P2 de la revue avant mise en production (3 octobre 2026).
--   DEV-3 : le journal des contrôles survit à la suppression du compte de l'agent (agent_id passe à vide).
--   DEV-5 : les échéances sont calculées sur la date de Libreville (UTC+1), pas sur la date UTC du serveur ;
--           la recherche de comptes de l'administration traite « % » et « _ » comme des caractères ordinaires.

-- =====================================================================
-- DEV-3. Journal des contrôles conservé
-- =====================================================================
alter table public.controles alter column agent_id drop not null;
alter table public.controles drop constraint controles_agent_id_fkey;
alter table public.controles add constraint controles_agent_id_fkey
  foreign key (agent_id) references public.profiles (id) on delete set null;

-- =====================================================================
-- DEV-5. Date de référence : Libreville
-- =====================================================================
create or replace function private.aujourdhui() returns date language sql stable set search_path = '' as $$
  select (now() at time zone 'Africa/Libreville')::date
$$;

create or replace function private.etat_piece(d date) returns text language sql stable set search_path = '' as $$
  select case when d < private.aujourdhui() then 'ko' when d <= private.aujourdhui() + 30 then 'warn' else 'ok' end
$$;

create or replace function public.stats_controles() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_debut timestamptz := private.aujourdhui()::timestamp at time zone 'Africa/Libreville';
begin
  if not private.est_agent() then raise exception 'Réservé aux agents et administrateurs'; end if;
  return (select jsonb_build_object('total', count(*), 'agents', count(distinct agent_id),
    'aujourdhui', count(*) filter (where created_at >= v_debut), 'non_conformes', count(*) filter (where resultat = 'ko'),
    'non_verifies', count(*) filter (where resultat = 'non_verifie'),
    'par_qr', count(*) filter (where source = 'qr')) from public.controles);
end $$;

-- Recherche de comptes : les jokers de ILIKE saisis par l'administrateur sont échappés.
create or replace function public.admin_rechercher(p_q text) returns table (id uuid, nom text, email text, role text)
language plpgsql stable security definer set search_path = '' as $$
declare v_motif text := '%' || replace(replace(replace(coalesce(p_q, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';
begin
  if not private.est_admin() then raise exception 'Réservé aux administrateurs'; end if;
  return query select p.id, p.nom, u.email::text, p.role from public.profiles p join auth.users u on u.id = p.id
   where char_length(coalesce(p_q, '')) >= 2 and (p.nom ilike v_motif or u.email ilike v_motif)
   order by p.nom limit 20;
end $$;

revoke execute on function private.aujourdhui() from public, anon, authenticated;
