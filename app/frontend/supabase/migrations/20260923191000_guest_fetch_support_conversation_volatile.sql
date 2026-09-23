-- guest_fetch_support_conversation was declared STABLE but UPDATEs
-- support_messages.read_at (marks admin replies read) -> every call failed
-- with 0A000 "UPDATE is not allowed in a non-volatile function". Guests
-- (devis / contact / réexpédition) could never reopen their conversation
-- from the stored guest token. Found 2026-09-23 while testing réexpédition.
alter function public.guest_fetch_support_conversation(uuid) volatile;
