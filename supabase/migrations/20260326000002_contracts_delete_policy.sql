-- Allow deletion of voided contracts within the user's mandator
CREATE POLICY "Users can delete voided contracts in their mandator"
    ON public.contracts FOR DELETE TO authenticated
    USING (mandator_id = public.get_my_mandator_id() AND status = 'voided');
