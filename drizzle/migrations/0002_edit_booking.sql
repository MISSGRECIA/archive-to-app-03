CREATE OR REPLACE FUNCTION public.edit_booking(_id text,_service text,_branch text,_date text,_time text,_name text,_new_phone text,_owner_phone text,_cap int)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(_branch||_date||_time));
  IF (SELECT count(*) FROM public.bookings WHERE branch=_branch AND date=_date AND time=_time AND id <> _id) >= _cap THEN RETURN false; END IF;
  UPDATE public.bookings SET service=_service, branch=_branch, date=_date, time=_time, name=_name, phone=_new_phone WHERE id=_id AND phone=_owner_phone;
  RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.edit_booking FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.edit_booking TO service_role;