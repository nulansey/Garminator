-- Owner-only access to meals, gated on the specific uid (same owner as the
-- skeleton's weights/daily_metrics policies). Run in the Supabase SQL editor.

create policy "owner reads meals"
  on meals for select
  using (auth.uid() = '3ddda5ba-7228-483f-bcc7-1404eab54a2e');

create policy "owner inserts meals"
  on meals for insert
  with check (auth.uid() = '3ddda5ba-7228-483f-bcc7-1404eab54a2e');

create policy "owner deletes meals"
  on meals for delete
  using (auth.uid() = '3ddda5ba-7228-483f-bcc7-1404eab54a2e');
