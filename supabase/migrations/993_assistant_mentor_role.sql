-- Add assistant_mentor to the staff_role enum

alter type public.staff_role add value if not exists 'assistant_mentor';
