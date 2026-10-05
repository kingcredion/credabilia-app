import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite/vector';

const MIGRATIONS = ['202609100001_foundation.sql','202609100002_certificates.sql','202609100003_credibility.sql','202609100004_media.sql','202609100005_extraction_quota.sql','202609110006_listing_edits.sql','202609150007_listing_details.sql','202609180010_collection_and_settings.sql','202609190011_listing_history.sql','202609200012_stripe_connect_payments.sql','202609210013_storefronts_and_dashboard.sql','202609220014_shipping.sql','202609230015_messaging.sql','202609240016_fees_shipping_rewards.sql','202609250018_escrow_and_insurance.sql','202609260021_support_chat.sql','202609270022_refund_requests.sql','202609280024_refund_partial_and_return.sql','202609290025_notifications.sql','202609300027_credibility_low_default.sql','202609300029_background_removal_png_uploads.sql','202609300030_require_background_removed_main_photo.sql','202609300031_fix_browse_listings_media_regression.sql','202609300032_push_notifications.sql','202609300033_buy_availability_confirmation.sql','202609300034_seller_ratings.sql','202609300035_auctions.sql','202609300038_klaviyo_events.sql','202609300039_klaviyo_content_type_fix.sql','202609300040_admin_operators.sql','202609300041_admin_disputes.sql','202609300042_admin_support_and_users.sql','202609300043_reports_and_blocks.sql','202609300044_account_deletion.sql','202609300045_admin_alerts.sql','202609300046_signature_media_kind.sql','202609300047_signature_analysis_quota.sql','202609300048_signature_credibility_blend.sql','202609300049_background_removal_retry.sql','202609300054_signature_reference_library.sql','202609300056_auto_signature_opinion.sql','202609300057_delete_listing.sql','202609300058_pickup_stations.sql','202609300059_pickup_checkout.sql','202609300060_pickup_escrow.sql','202609300061_fix_pickup_sales_purchases_regression.sql','202609300062_pickup_confirmation_reminders.sql','202609300063_browse_pagination.sql','202609300064_conversations.sql','202609300065_clear_conversation.sql','202609300066_purchases_signature_opinion.sql','202609300067_purchases_parcel_dims.sql','202609300068_king_collection.sql','202609300069_raise_seller_quotas.sql','202609300070_unsigned_and_suitability.sql','202609300071_conversation_pickup_safety.sql','202609300072_listing_preview.sql','202609300073_sms_notifications.sql','202609300074_operator_callback.sql','202610010075_edit_listing_subject.sql','202610020080_edit_listing_keep_media.sql','202610020081_listing_is_king_collection.sql','202610020082_sold_listing_view.sql','202610020083_klaviyo_email_properties.sql','202610030084_reserve_sell_slug.sql','202610040085_db_performance_fixes.sql','202610040086_notify_klaviyo_content_type.sql','202610040087_buy_request_email.sql','202610040088_request_confirmed_email.sql','202610040089_request_declined_email.sql','202610040090_transactional_emails.sql','202610040093_admin_alert_new_user.sql','202610050094_operator_alerts.sql'];

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


test('the operator is alerted to new listings, held listings, refund requests, first buy requests and (via the service-role helper) payment problems', async () => {
  const { db, as, raw } = await freshDb();
  const seller = '11111111-1111-4111-8111-111111111111';
  const buyer = '33333333-3333-4333-8333-333333333333';
  const buyer2 = '44444444-4444-4444-8444-444444444444';
  try {
    for (const [id, email, name] of [[seller, 'seller@example.test', 'Sam Seller'], [buyer, 'buyer@example.test', 'Bea Buyer'], [buyer2, 'buyer2@example.test', 'Bo Buyer']]) {
      await raw('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)', [id, email, JSON.stringify({ full_name: name })]);
    }
    await raw("insert into vault.secrets(name,secret) values('klaviyo_private_api_key','pk_test')");
    let n = 0;
    const events = async () => {
      const rows = (await raw("select body from net._http_calls where url like '%klaviyo%' order by id")).rows;
      await raw('delete from net._http_calls');
      return rows.map(r => ({ name: r.body.data.attributes.metric.data.attributes.name, email: r.body.data.attributes.profile.data.attributes.email, props: r.body.data.attributes.properties }));
    };
    const alerts = async (name) => (await events()).filter(e => e.name === name);
    const mkListing = async (held) => {
      n += 1;
      const path = seller + '/bbbbbbbbbbb' + n + '-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png';
      await raw("insert into storage.objects(bucket_id,name) values('listing-media',$1)", [path]);
      await as(seller);
      return (await db.query("select public.create_listing_with_details('Signed Ball','A fictional listing for testing.','Sports',12345,'',null,null,null,$1,'{}','[]',8,8,6,4,false,'fixed',null,p_needs_review=>$2,p_needs_review_reason=>$3) as id",
        [JSON.stringify([{ path, kind: 'item' }]), held, held ? 'Looks like a reproduction' : null])).rows[0].id;
    };

    await raw('delete from net._http_calls');
    const listing = await mkListing(false);
    let ev = await events();
    const newListing = ev.filter(e => e.name === 'Admin Alert: New Listing');
    assert.equal(newListing.length, 1, 'a published listing alerts once');
    assert.equal(ev.filter(e => e.name === 'Admin Alert: Listing Review').length, 0);
    assert.equal(newListing[0].email, 'kingcredion@credabilia.com');
    assert.equal(newListing[0].props.title, 'Signed Ball'); assert.equal(newListing[0].props.seller_name, 'Sam Seller');
    assert.equal(newListing[0].props.price_display, '$123.45'); assert.equal(newListing[0].props.listing_id, listing);
    assert.ok(newListing[0].props.image_url.endsWith('/img/item/' + listing));

    const held = await mkListing(true);
    ev = await events();
    assert.equal(ev.filter(e => e.name === 'Admin Alert: New Listing').length, 0, 'a held listing is not announced as a normal new listing');
    const review = ev.filter(e => e.name === 'Admin Alert: Listing Review');
    assert.equal(review.length, 1); assert.equal(review[0].props.reason, 'Looks like a reproduction'); assert.equal(review[0].props.listing_id, held);

    // editing a listing does not alert again
    await raw("update public.listings set title='Signed Ball 2' where id=$1", [listing]);
    assert.equal((await events()).length, 0);

    // buy request: first one alerts, a later one on the same listing does not
    await as(buyer); await db.query('select public.request_to_buy($1)', [listing]);
    let buy = await alerts('Admin Alert: Buy Request');
    assert.equal(buy.length, 1); assert.equal(buy[0].props.buyer_name, 'Bea Buyer'); assert.equal(buy[0].props.seller_name, 'Sam Seller');
    await raw("update public.availability_requests set status='declined' where listing_id=$1", [listing]);
    await events();
    await as(buyer2); await db.query('select public.request_to_buy($1)', [listing]);
    assert.equal((await alerts('Admin Alert: Buy Request')).length, 0, 'only the first request on a listing alerts');

    // refund request
    await as(buyer); const conv = (await db.query('select public.get_or_create_conversation($1) as c', [listing])).rows[0].c.id;
    const purchase = (await raw("insert into public.purchases(listing_id,buyer_id,seller_id,price_cents,platform_fee_cents,conversation_id) values($1,$2,$3,12345,1000,$4) returning id", [listing, buyer, seller, conv])).rows[0].id;
    await events();
    await as(buyer); await db.query("select public.request_refund($1,'It arrived broken')", [purchase]);
    const refund = await alerts('Admin Alert: Refund Request');
    assert.equal(refund.length, 1); assert.equal(refund[0].props.reason, 'It arrived broken'); assert.equal(refund[0].props.title, 'Signed Ball 2');
    assert.equal(refund[0].props.buyer_name, 'Bea Buyer'); assert.equal(refund[0].props.price_display, '$123.45');

    // payment-problem helper: service_role only, operator events only
    await as(buyer);
    await assert.rejects(db.query("select public.notify_operator_alert('Admin Alert: Payment Problem','{}')"));
    await as(seller, 'service_role');
    await db.query("select public.notify_operator_alert('Admin Alert: Payment Problem', $1)", [JSON.stringify({ summary: 'Could not record payment', reference: 'cs_test_1' })]);
    const pay = await alerts('Admin Alert: Payment Problem');
    assert.equal(pay.length, 1); assert.equal(pay[0].email, 'kingcredion@credabilia.com'); assert.equal(pay[0].props.reference, 'cs_test_1');
    await assert.rejects(db.query("select public.notify_operator_alert('Welcome Everyone','{}')"), /operator alert/);
  } finally { await db.close(); }
});
