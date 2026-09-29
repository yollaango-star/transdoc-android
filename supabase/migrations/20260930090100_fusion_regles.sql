-- TransDoc — une seule règle par table et par action (contrôle « multiple permissive policies » de Supabase) :
-- « le propriétaire ou un administrateur », au lieu de deux règles évaluées l'une après l'autre. Mêmes droits qu'avant.
drop policy "administration : voir les véhicules" on public.vehicles;
alter policy "ses véhicules" on public.vehicles using (owner_id = (select auth.uid()) or private.est_admin());

drop policy "administration : voir les pièces" on public.vehicle_documents;
alter policy "pièces de ses véhicules" on public.vehicle_documents using (private.possede(plaque) or private.est_admin());

drop policy "administration : vérifier une pièce" on public.vehicle_documents;
alter policy "modifier une pièce" on public.vehicle_documents
  using (private.possede(plaque) or private.est_admin()) with check (private.possede(plaque) or private.est_admin());
