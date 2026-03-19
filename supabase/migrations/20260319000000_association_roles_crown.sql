-- Add crown flag to association roles
ALTER TABLE public.association_roles
    ADD COLUMN has_crown BOOLEAN NOT NULL DEFAULT false;
