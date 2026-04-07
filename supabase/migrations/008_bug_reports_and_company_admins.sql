-- Bug reports table — stores reports submitted via the in-app bug reporter
CREATE TABLE IF NOT EXISTS bug_reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  screen      text,
  trying      text,
  happened    text,
  browser     text,
  submitted_by uuid REFERENCES auth.users(id),
  submitted_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE bug_reports ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can insert a bug report
CREATE POLICY "Authenticated users can insert bug reports"
  ON bug_reports FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Only admins can read bug reports (role checked via profiles)
CREATE POLICY "Admins can read bug reports"
  ON bug_reports FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );
