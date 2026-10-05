import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite/vector';

const MIGRATIONS = ['202609100001_foundation.sql','202609100002_certificates.sql','202609100003_credibility.sql','202609100004_media.sql','202609100005_extraction_quota.sql','202609110006_listing_edits.sql','202609150007_listing_details.sql','202609180010_collection_and_settings.sql','202609190011_listing_history.sql','202609200012_stripe_connect_payments.sql','202609210013_storefronts_and_dashboard.sql','202609220014_shipping.sql','202609230015_messaging.sql','202609240016_fees_shipping_rewards.sql','202609250018_escrow_and_insurance.sql','202609260021_support_chat.sql','202609270022_refund_requests.sql','202609280024_refund_partial_and_return.sql','202609290025_notifications.sql','202609300027_credibility_low_default.sql','202609300029_background_removal_png_uploads.sql','202609300030_require_background_removed_main_photo.sql','202609300031_fix_browse_listings_media_regression.sql','202609300032_push_notifications.sql','202609300033_buy_availability_confirmation.sql','202609300034_seller_ratings.sql','202609300035_auctions.sql','202609300038_klaviyo_events.sql','202609300039_klaviyo_content_type_fix.sql','202609300040_admin_operators.sql','202609300041_admin_disputes.sql','202609300042_admin_support_and_users.sql','202609300043_reports_and_blocks.sql','202609300044_account_deletion.sql','202609300045_admin_alerts.sql','202609300046_signature_media_kind.sql','202609300047_signature_analysis_quota.sql','202609300048_signature_credibility_blend.sql','202609300049_background_removal_retry.sql','202609300054_signature_reference_library.sql','202609300056_auto_signature_opinion.sql','202609300057_delete_listing.sql','202609300058_pickup_stations.sql','202609300059_pickup_checkout.sql','202609300060_pickup_escrow.sql','202609300061_fix_pickup_sales_purchases_regression.sql','202609300062_pickup_confirmation_reminders.sql','202609300063_browse_pagination.sql','202609300064_conversations.sql','202609300065_clear_conversation.sql','202609300066_purchases_signature_opinion.sql','202609300067_purchases_parcel_dims.sql','202609300068_king_collection.sql','202609300069_raise_seller_quotas.sql','202609300070_unsigned_and_suitability.sql','202609300071_conversation_pickup_safety.sql','202609300072_listing_preview.sql','202609300073_sms_notifications.sql','202609300074_operator_callback.sql','202610010075_edit_listing_subject.sql','202610020080_edit_listing_keep_media.sql','202610020081_listing_is_king_collection.sql','202610020082_sold_listing_view.sql','202610020083_klaviyo_email_properties.sql','202610030084_reserve_sell_slug.sql','202610040085_db_performance_fixes.sql','202610040086_notify_klaviyo_content_type.sql','202610040087_buy_request_email.sql','202610040088_request_confirmed_email.sql','202610040089_request_declined_email.sql','202610040090_transactional_emails.sql','202610040093_admin_alert_new_user.sql','202610050094_operator_alerts.sql','202610050095_payout_holds_and_handoff.sql','202610050097_ban_and_fingerprints.sql','202610050098_inspection_acceptance.sql','202610050100_purchase_emails_and_pickup_meetup.sql','202610050101_admin_alert_new_order.sql','202610050102_ship_pending_notification.sql','202610050103_buyer_chosen_shipping.sql','202610050104_seller_pays_shipping_charge.sql','202610050105_bug_reports.sql'];

async function freshDb() {
  const db = new PGlite({extensions:{vector}});
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;create schema extensions;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',raw_app_meta_data jsonb default '{}',created_at timestamptz default now());
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,unique(bucket_id,name));
    alter table storage.objects enable row level security;
    grant usage on schema public,auth,storage to anon,authenticated;grant select,insert,delete,update on storage.objects to anon,authenticated;
    create schema vault;
    create table vault.secrets(id uuid primary key default gen_random_uuid(),name text unique,secret text,description text,created_at timestamptz not null default now());
    create view vault.decrypted_secrets as select id,name,secret as decrypted_secret from vault.secrets;
    create function vault.create_secret(p_secret text,p_name text,p_description text default null) returns uuid language plpgsql as $$
      declare new_id uuid; begin insert into vault.secrets(name,secret,description) values(p_name,p_secret,p_description) returning id into new_id; return new_id; end;$$;
    create function public.gen_random_bytes(p_len integer) returns bytea language sql as $$select decode(md5(random()::text||clock_timestamp()::text),'hex')$$;
    create schema net;
    create table net._http_calls(id serial primary key,url text,body jsonb,headers jsonb,called_at timestamptz default now());
    create function net.http_post(url text,body jsonb default null,headers jsonb default null,timeout_milliseconds integer default null) returns bigint
      language plpgsql as $$ declare new_id bigint; begin
        if coalesce(headers->>'Content-Type','application/json')<>'application/json' then raise exception 'Content-Type header must be "application/json"'; end if;
        insert into net._http_calls(url,body,headers) values(url,body,headers) returning id into new_id; return new_id; end; $$;`);
  for (const file of MIGRATIONS) await db.exec(await readFile(new URL('../supabase/migrations/'+file, import.meta.url), 'utf8'));
  async function as(actor, role = 'authenticated') { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [actor]); await db.exec('set role ' + role); }
  async function raw(sql, params) { await db.exec('reset role'); return db.query(sql, params); }
  return { db, as, raw };
}

const IDS = { member: '11111111-1111-4111-8111-111111111111', other: '22222222-2222-4222-8222-222222222222', operator: '55555555-5555-4555-8555-555555555555' };

async function setup(raw) {
  for (const id of Object.values(IDS)) await raw('insert into auth.users(id,email) values($1,$2)', [id, id.slice(0, 4) + '@example.test']);
  await raw('insert into public.operators(user_id) values($1)', [IDS.operator]);
}

test('a member can report a bug: it is tagged, the assistant answers with a fixed thank-you, and the operator sees the tag, page and browser', async () => {
  const { db, as, raw } = await freshDb();
  try {
    await setup(raw);
    await raw("insert into vault.secrets(name,secret) values('klaviyo_private_api_key','pk_test')");
    await raw('delete from net._http_calls');
    await as(IDS.member);
    const sent = (await db.query("select public.report_bug('The Buy button does nothing','I tapped Buy on a signed ball','https://credabilia.com/?listing=abc','Mozilla/5.0 Test') as r")).rows[0].r;
    assert.equal(sent.user_message.kind, 'bug');
    assert.match(sent.user_message.body, /Bug report: The Buy button does nothing/);
    assert.match(sent.user_message.body, /What I was doing: I tapped Buy/);
    assert.equal(sent.assistant_message.role, 'assistant');
    assert.match(sent.assistant_message.body, /a person will look at it/);

    // the member's own chat history carries the tag
    const mine = (await db.query('select public.get_support_messages() as m')).rows[0].m;
    assert.deepEqual(mine.map(m => [m.role, m.kind]), [['user', 'bug'], ['assistant', 'bug']]);

    // the operator is emailed (the existing support alert), marked as a bug report
    const events = (await raw("select body from net._http_calls where url like '%klaviyo%' order by id")).rows.map(r => ({ name: r.body.data.attributes.metric.data.attributes.name, props: r.body.data.attributes.properties }));
    const alert = events.find(e => e.name === 'Admin Alert: New Support Message');
    assert.ok(alert, 'the operator is alerted through the existing support alert');
    assert.match(alert.props.body, /^\[BUG REPORT\] The Buy button does nothing/);
    assert.match(alert.props.body, /Page: https:\/\/credabilia\.com\/\?listing=abc/);

    // the operator's list and thread show it; an ordinary member cannot read either
    await as(IDS.operator);
    const list = (await db.query('select public.admin_list_support_conversations() as l')).rows[0].l;
    assert.equal(list.length, 1); assert.equal(list[0].has_bug, true);
    const thread = (await db.query('select public.admin_get_support_thread($1) as t', [IDS.member])).rows[0].t;
    assert.equal(thread[0].page_url, 'https://credabilia.com/?listing=abc');
    assert.equal(thread[0].user_agent, 'Mozilla/5.0 Test');
    await as(IDS.other);
    await assert.rejects(db.query('select public.admin_get_support_thread($1)', [IDS.member]), /Not authorized/);
  } finally { await db.close(); }
});

test('bug reports need sign-in, a description, and are limited to five an hour', async () => {
  const { db, as, raw } = await freshDb();
  try {
    await setup(raw);
    await as(IDS.member, 'anon');
    await assert.rejects(db.query("select public.report_bug('x',null,null,null)"), /permission denied|Sign in/);
    await as(IDS.member);
    await assert.rejects(db.query("select public.report_bug('   ',null,null,null)"), /Tell us what went wrong/);
    await assert.rejects(db.query('select public.report_bug($1,null,null,null)', ['x'.repeat(2001)]), /Tell us what went wrong/);
    for (let i = 0; i < 5; i++) await db.query("select public.report_bug('It broke',null,null,null)");
    await assert.rejects(db.query("select public.report_bug('It broke again',null,null,null)"), /several reports/);
    // another member is not affected by the first member's limit
    await as(IDS.other);
    await db.query("select public.report_bug('Different problem',null,null,null)");
  } finally { await db.close(); }
});
