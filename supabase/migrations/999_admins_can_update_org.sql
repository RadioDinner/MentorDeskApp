-- Allow admins to update their own organization's settings.

create policy "admins can update own org"
  on public.organizations for update
  to authenticated
  using (
    id = public.my_organization_id()
    and public.my_staff_role() = 'admin'
  )
  with check (
    id = public.my_organization_id()
    and public.my_staff_role() = 'admin'
  );
