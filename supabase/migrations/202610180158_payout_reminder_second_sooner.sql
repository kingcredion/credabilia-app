-- A seller who publishes and then stops partway through Stripe is warmest in the first day or two. The first notice goes out when they publish;
-- the second now follows 24 hours later instead of 3 days later. Later reminders keep the 3-day spacing and the cap of 4 messages in total.
do $patch$
declare def text;
begin
  def:=pg_get_functiondef('public.send_payout_setup_reminders()'::regprocedure);
  if position('n.last_sent_at>now()-interval ''3 days''' in def)=0 then raise exception 'send_payout_setup_reminders: spacing clause not found'; end if;
  def:=replace(def,'n.last_sent_at>now()-interval ''3 days''','n.last_sent_at>now()-case when n.sent_count=1 then interval ''24 hours'' else interval ''3 days'' end');
  execute def;
end;$patch$;
