-- Allow authenticated users to insert their own profile row.
-- Needed for upsert in updateProfile (e.g. when the trigger didn't create it).
CREATE POLICY "Users can insert own profile"
    ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
