-- Reproduction minimale de l'environnement Supabase pour tester les migrations en local (PGlite).
-- Sur Supabase, tout ceci existe déjà : ce fichier n'est jamais appliqué en production.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
grant anon, authenticated, service_role to postgres;

create schema auth;
create table auth.users (id uuid primary key, email varchar(255));
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
