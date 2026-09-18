CREATE POLICY request_attachments_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'request-attachments'
    AND (
      public.is_staff(auth.uid())
      OR (storage.foldername(name))[1] = public.current_client_id()::text
    )
  );

CREATE POLICY request_attachments_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'request-attachments'
    AND owner = auth.uid()
    AND (
      public.is_staff(auth.uid())
      OR (storage.foldername(name))[1] = public.current_client_id()::text
    )
  );

CREATE POLICY request_attachments_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'request-attachments'
    AND (owner = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
  );
