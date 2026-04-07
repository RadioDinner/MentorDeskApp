-- Add staff_id column to profiles so we can link auth users to staff records,
-- just like mentor_id links to mentors and mentee_id links to mentees.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS staff_id uuid REFERENCES staff(id);
