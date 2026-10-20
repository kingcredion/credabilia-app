-- Kept separate from 202610200159_founding_100.sql because the PGlite test suite never loads pg_cron. Once a day, deletes the invitations (and the contact details
-- in them) that were never claimed, after the campaign window has ended. It does nothing before then, and never touches an account or a claimed entitlement.
select cron.schedule('founding-invitations-purge', '30 9 * * *', $$ select public.purge_expired_founding_invitations(); $$);
