-- Add gradient_aggressive mode type to lightshow_modes CHECK constraint
ALTER TABLE public.lightshow_modes
    DROP CONSTRAINT IF EXISTS lightshow_modes_type_check;

ALTER TABLE public.lightshow_modes
    ADD CONSTRAINT lightshow_modes_type_check
    CHECK (type IN ('gradient', 'gradient_aggressive', 'buildup', 'text'));
