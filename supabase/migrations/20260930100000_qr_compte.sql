-- TransDoc — codes QR signés et suppression du compte.
--   1. qr_cles : paire de clés ECDSA P-256 qui signe les codes QR. Créée par l'Edge Function « qr » à son premier appel,
--      jamais saisie à la main. Aucune règle et aucun droit pour les applications : seule l'Edge Function (service_role)
--      la lit. La clé publique est distribuée aux agents, qui vérifient les QR sans réseau.
--   2. supprimer_mon_compte() : efface le compte, ses véhicules (la plaque redevient libre) et son profil.
--      L'historique des contrôles est conservé (sans lien vers le véhicule).

create table public.qr_cles (
  id smallint primary key check (id = 1),     -- une seule clé active
  kid text not null,
  prive jsonb not null,
  publique jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.qr_cles enable row level security;
revoke all on public.qr_cles from anon, authenticated;
grant select, insert on public.qr_cles to service_role;

create or replace function public.supprimer_mon_compte() returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'Connexion requise'; end if;
  delete from public.vehicles where owner_id = v_uid;
  delete from auth.users where id = v_uid;
end $$;
revoke execute on function public.supprimer_mon_compte() from public, anon;
grant execute on function public.supprimer_mon_compte() to authenticated;
