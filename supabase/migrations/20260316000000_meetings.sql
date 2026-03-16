-- ─────────────────────────────────────────────────────────────────────────────
-- Meetings – scheduling, notes, follow-up tasks, and notifications
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Add module_meetings flag to mandators ───────────────────────────────────
ALTER TABLE public.mandators
    ADD COLUMN module_meetings BOOLEAN NOT NULL DEFAULT true;

UPDATE public.mandators SET module_meetings = true;

-- ── Helper: get mandator_id for current user ────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_mandator_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT mandator_id FROM public.profiles WHERE id = auth.uid();
$$;

-- ── Meetings table ──────────────────────────────────────────────────────────
CREATE TABLE public.meetings (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    title         TEXT        NOT NULL,
    description   TEXT,
    scheduled_at  TIMESTAMPTZ NOT NULL,
    mandator_id   UUID        NOT NULL REFERENCES public.mandators(id) ON DELETE CASCADE,
    created_by    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER meetings_updated_at
    BEFORE UPDATE ON public.meetings
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view meetings in their mandator"
    ON public.meetings FOR SELECT TO authenticated
    USING (mandator_id = public.get_my_mandator_id());

CREATE POLICY "Users can create meetings in their mandator"
    ON public.meetings FOR INSERT TO authenticated
    WITH CHECK (mandator_id = public.get_my_mandator_id() AND auth.uid() = created_by);

CREATE POLICY "Users can update meetings in their mandator"
    ON public.meetings FOR UPDATE TO authenticated
    USING (mandator_id = public.get_my_mandator_id());

CREATE POLICY "Users can delete meetings in their mandator"
    ON public.meetings FOR DELETE TO authenticated
    USING (mandator_id = public.get_my_mandator_id());

-- ── Meeting members (join table) ────────────────────────────────────────────
CREATE TABLE public.meeting_members (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id  UUID        NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
    user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (meeting_id, user_id)
);

ALTER TABLE public.meeting_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view meeting members in their mandator"
    ON public.meeting_members FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.meetings WHERE id = meeting_id
        AND mandator_id = public.get_my_mandator_id()
    ));

CREATE POLICY "Users can add meeting members in their mandator"
    ON public.meeting_members FOR INSERT TO authenticated
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.meetings WHERE id = meeting_id
        AND mandator_id = public.get_my_mandator_id()
    ));

CREATE POLICY "Users can remove meeting members in their mandator"
    ON public.meeting_members FOR DELETE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.meetings WHERE id = meeting_id
        AND mandator_id = public.get_my_mandator_id()
    ));

-- ── Meeting notes ───────────────────────────────────────────────────────────
CREATE TABLE public.meeting_notes (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id  UUID        NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
    content     TEXT        NOT NULL,
    created_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER meeting_notes_updated_at
    BEFORE UPDATE ON public.meeting_notes
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.meeting_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view meeting notes in their mandator"
    ON public.meeting_notes FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.meetings WHERE id = meeting_id
        AND mandator_id = public.get_my_mandator_id()
    ));

CREATE POLICY "Users can create meeting notes in their mandator"
    ON public.meeting_notes FOR INSERT TO authenticated
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.meetings WHERE id = meeting_id
        AND mandator_id = public.get_my_mandator_id()
    ));

CREATE POLICY "Users can update meeting notes in their mandator"
    ON public.meeting_notes FOR UPDATE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.meetings WHERE id = meeting_id
        AND mandator_id = public.get_my_mandator_id()
    ));

CREATE POLICY "Users can delete meeting notes in their mandator"
    ON public.meeting_notes FOR DELETE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.meetings WHERE id = meeting_id
        AND mandator_id = public.get_my_mandator_id()
    ));

-- ── Meeting tasks (follow-ups) ──────────────────────────────────────────────
CREATE TABLE public.meeting_tasks (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id  UUID        NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
    title       TEXT        NOT NULL,
    deadline    TIMESTAMPTZ,
    assigned_to UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    completed   BOOLEAN     NOT NULL DEFAULT false,
    created_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER meeting_tasks_updated_at
    BEFORE UPDATE ON public.meeting_tasks
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.meeting_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view meeting tasks in their mandator"
    ON public.meeting_tasks FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.meetings WHERE id = meeting_id
        AND mandator_id = public.get_my_mandator_id()
    ));

CREATE POLICY "Users can create meeting tasks in their mandator"
    ON public.meeting_tasks FOR INSERT TO authenticated
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.meetings WHERE id = meeting_id
        AND mandator_id = public.get_my_mandator_id()
    ));

CREATE POLICY "Users can update meeting tasks in their mandator"
    ON public.meeting_tasks FOR UPDATE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.meetings WHERE id = meeting_id
        AND mandator_id = public.get_my_mandator_id()
    ));

CREATE POLICY "Users can delete meeting tasks in their mandator"
    ON public.meeting_tasks FOR DELETE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.meetings WHERE id = meeting_id
        AND mandator_id = public.get_my_mandator_id()
    ));

-- ── Notifications ───────────────────────────────────────────────────────────
CREATE TABLE public.notifications (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title       TEXT        NOT NULL,
    message     TEXT,
    link        TEXT,
    read        BOOLEAN     NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
    ON public.notifications FOR SELECT TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "Users can update own notifications"
    ON public.notifications FOR UPDATE TO authenticated
    USING (user_id = auth.uid());

-- Service role / triggers can insert notifications
CREATE POLICY "System can insert notifications"
    ON public.notifications FOR INSERT TO authenticated
    WITH CHECK (true);

-- ── Deadline notification trigger ───────────────────────────────────────────
-- Fires when a meeting task gets a deadline or assigned_to set/updated.
-- Creates a notification if the deadline is within 24 hours or already passed.
CREATE OR REPLACE FUNCTION public.notify_task_deadline()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_meeting_title TEXT;
    v_meeting_id UUID;
BEGIN
    -- Only act if there is a deadline and an assignee
    IF NEW.deadline IS NULL OR NEW.assigned_to IS NULL THEN
        RETURN NEW;
    END IF;

    -- Only notify if deadline is within 24h from now or already passed (but task not completed)
    IF NEW.completed THEN
        RETURN NEW;
    END IF;

    IF NEW.deadline > NOW() + INTERVAL '24 hours' THEN
        RETURN NEW;
    END IF;

    -- Avoid duplicate: don't re-notify on simple updates if values unchanged
    IF TG_OP = 'UPDATE'
        AND OLD.deadline = NEW.deadline
        AND OLD.assigned_to = NEW.assigned_to
        AND OLD.completed = NEW.completed
    THEN
        RETURN NEW;
    END IF;

    SELECT title, id INTO v_meeting_title, v_meeting_id
    FROM public.meetings WHERE id = NEW.meeting_id;

    INSERT INTO public.notifications (user_id, title, message, link)
    VALUES (
        NEW.assigned_to,
        'Task deadline: ' || NEW.title,
        'Your task in meeting "' || v_meeting_title || '" is due ' ||
            CASE
                WHEN NEW.deadline <= NOW() THEN 'now'
                ELSE 'soon (' || TO_CHAR(NEW.deadline AT TIME ZONE 'UTC', 'Mon DD, HH24:MI') || ')'
            END,
        '/meetings?id=' || v_meeting_id::TEXT
    );

    RETURN NEW;
END;
$$;

CREATE TRIGGER meeting_tasks_deadline_notify
    AFTER INSERT OR UPDATE ON public.meeting_tasks
    FOR EACH ROW EXECUTE FUNCTION public.notify_task_deadline();
