ALTER TABLE public.files DROP CONSTRAINT files_target_check;
ALTER TABLE public.files ADD CONSTRAINT files_target_check CHECK (project_id IS NOT NULL OR task_id IS NOT NULL OR request_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS files_request_id_idx ON public.files(request_id);