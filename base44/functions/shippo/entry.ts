import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const SHIPPO_API_URL = "https://api.goshippo.com";

// ─── Helper ─────────────────────────────────────────────────────────────────

function shippoFetch(apiKey, path, method = "GET", body = null) {
  const opts = {
    method,
    headers: {
      "Authorization": `ShippoToken ${apiKey}`,
      "Content-Type": "application/json"
    }
  };
  if (body) opts.body = JSON.stringify(body);
  return fetch(`${SHIPPO_API_URL}${path}`, opts);
}

// Normalize Shippo tracking status → our internal Shipment.status
function normalizeStatus(shippoStatus) {
  const map = {
    DELIVERED: "delivered",
    TRANSIT: "shipped",
    RETURNED: "returned",
    FAILURE: "failed",
    UNKNOWN: "label_created",
    PRE_TRANSIT: "label_created",
  };
  return map[shippoStatus] || "label_created";
}

// Map Shipment.status → Transaction.shipping_status and Transaction.status
// Drives the unified lifecycle: paid → shipped → delivered → completed
async function propagateShipmentStatusToTransaction(base44, transactionId, shipmentStatus, deliveredAt) {
  if (!transactionId) return;
  const txs = await base44.asServiceRole.entities.Transaction.filter({ id: transactionId });
  if (!txs.length) return;
  const tx = txs[0];

  const shippingStatusMap = {
    label_created: "label_created",
    shipped: "shipped",
    delivered: "delivered",
    returned: "returned",
    failed: "failed",
  };

  const updates = { shipping_status: shippingStatusMap[shipmentStatus] || tx.shipping_status };

  // Advance the main transaction lifecycle status
  // paid or escrow → shipped (escrow flows: service may ship physical items too)
  if (shipmentStatus === "shipped" && (tx.status === "paid" || tx.status === "escrow")) {
    updates.status = "shipped";
  } else if (shipmentStatus === "delivered" && (tx.status === "shipped" || tx.status === "paid" || tx.status === "escrow")) {
    updates.status = "delivered";
    updates.delivered_at = deliveredAt || new Date().toISOString();
    // Auto-complete direct item sales on delivery (escrow flows are released manually by admin/vendor)
    if (!tx.framing_request_id && !tx.commission_request_id) {
      updates.status = "completed";
      updates.completed_at = new Date().toISOString();
    }
  }

  await base44.asServiceRole.entities.Transaction.update(transactionId, updates);
  console.log(`[shippo] Transaction ${transactionId} updated: status=${updates.status || tx.status} shipping_status=${updates.shipping_status}`);
}

// ─── Main Handler ────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const SHIPPO_API_KEY = Deno.env.get("SHIPPO_API_KEY");
  if (!SHIPPO_API_KEY) {
    return Response.json({ error: 'Shippo API Key not configured' }, { status: 500 });
  }

  if (req.method !== "POST") {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  // Read body once
  let parsed = null;
  try {
    parsed = await req.json();
  } catch (_) {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // ── Shippo webhook: detected by top-level `event` field, no auth needed ──────
  if (parsed && typeof parsed.event === "string") {
    console.log("[shippo] Webhook received:", parsed.event);
    return await handleWebhookBody(parsed, SHIPPO_API_KEY);
  }

  // ── Authenticated app action ──────────────────────────────────────────────────
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      console.log("[shippo] Unauthenticated request rejected");
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { action, payload } = parsed || {};
    console.log("[shippo] Authenticated action:", action);

    if (action === 'get_rates')        return await getRates(SHIPPO_API_KEY, payload);
    if (action === 'create_label')     return await createLabel(SHIPPO_API_KEY, payload, base44);
    if (action === 'validate_address') return await validateAddress(SHIPPO_API_KEY, payload);
    if (action === 'get_tracking')     return await getTracking(SHIPPO_API_KEY, payload, base44);
    if (action === 'void_label')       return await voidLabel(SHIPPO_API_KEY, payload, base44);

    console.log("[shippo] Invalid action:", action);
    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error("[shippo] Action error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// ─── Actions ────────────────────────────────────────────────────────────────

async function getRates(apiKey, { address_from, address_to, parcels }) {
  const res = await shippoFetch(apiKey, "/shipments", "POST", {
    address_from,
    address_to,
    parcels,
    async: false
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return Response.json(data);
}

async function createLabel(apiKey, { rate_object_id, recipient_email, recipient_name, transaction_id, item_id, vendor_email, buyer_email }, base44) {
  const res = await shippoFetch(apiKey, "/transactions", "POST", {
    rate: rate_object_id,
    label_file_type: "PDF",
    async: false
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));

  if (data.status === "SUCCESS" && transaction_id && item_id) {
    // Fetch the rate to get shipment_id, carrier, servicelevel, eta
    let shipmentId = null;
    let carrier = data.rate?.provider || "";
    let servicelevel = data.rate?.servicelevel?.name || "";
    let eta = data.eta || null;

    // Try fetching the transaction detail to get shipment_object_id
    try {
      const txRes = await shippoFetch(apiKey, `/transactions/${data.object_id}`);
      const txData = await txRes.json();
      shipmentId = txData.rate?.shipment || null;
      carrier = txData.rate?.provider || carrier;
      servicelevel = txData.rate?.servicelevel?.name || servicelevel;
      eta = txData.eta || eta;
    } catch (e) {
      console.warn("Could not fetch transaction detail:", e.message);
    }

    const shipmentRecord = {
      transaction_id,
      item_id,
      vendor_email: vendor_email || "",
      buyer_email: buyer_email || "",
      carrier,
      service_level: servicelevel,
      tracking_number: data.tracking_number,
      tracking_url: data.tracking_url_provider || `https://tools.usps.com/go/TrackConfirmAction?tLabels=${data.tracking_number}`,
      tracking_url_provider: data.tracking_url_provider || "",
      label_url: data.label_url,
      shippo_transaction_id: data.object_id,
      shippo_shipment_id: shipmentId,
      shipment_status: "label_created",
      status: "label_created",
      eta: eta ? new Date(eta).toISOString() : null,
      last_tracking_sync_at: new Date().toISOString(),
      is_label_refunded: false,
    };

    // Upsert Shipment record and link back to Transaction
    try {
      const existing = await base44.asServiceRole.entities.Shipment.filter({ transaction_id });
      let shipmentDbId;
      if (existing.length > 0) {
        await base44.asServiceRole.entities.Shipment.update(existing[0].id, shipmentRecord);
        shipmentDbId = existing[0].id;
      } else {
        const created = await base44.asServiceRole.entities.Shipment.create(shipmentRecord);
        shipmentDbId = created.id;
      }

      // Link shipment_id on transaction and set shipping_status = label_created.
      // status stays "paid" until carrier first scans — track_updated advances it to "shipped".
      await base44.asServiceRole.entities.Transaction.update(transaction_id, {
        shipment_id: shipmentDbId,
        shipping_status: "label_created",
      });
    } catch (dbErr) {
      console.error("DB write error after label creation:", dbErr);
    }

    // Klaviyo notification
    if (recipient_email) {
      await notifyShippingUpdate(data, recipient_email, recipient_name, data.tracking_number, carrier);
    }
  }

  return Response.json(data);
}

async function getTracking(apiKey, { carrier, tracking_number, shipment_id }, base44) {
  // Fetch from Shippo
  const endpoint = carrier && tracking_number
    ? `/tracks/${carrier}/${tracking_number}`
    : null;

  if (!endpoint) return Response.json({ error: "carrier and tracking_number required" }, { status: 400 });

  const res = await shippoFetch(apiKey, endpoint);
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));

  const normalizedStatus = normalizeStatus(data.tracking_status?.status);
  const trackingHistory = (data.tracking_history || []).map(h => ({
    status: normalizeStatus(h.status),
    status_details: h.status_details,
    status_date: h.status_date,
    location: h.location?.city ? `${h.location.city}, ${h.location.state}` : null,
  }));

  // Mirror into our Shipment record and propagate to Transaction lifecycle
  if (base44) {
    try {
      const shipments = await base44.asServiceRole.entities.Shipment.filter({ tracking_number });
      if (shipments.length > 0) {
        const shipment = shipments[0];
        const deliveredAt = normalizedStatus === "delivered" ? new Date().toISOString() : null;
        await base44.asServiceRole.entities.Shipment.update(shipment.id, {
          status: normalizedStatus,
          tracking_history: trackingHistory,
          last_tracking_sync_at: new Date().toISOString(),
          eta: data.eta ? new Date(data.eta).toISOString() : shipment.eta,
          ...(normalizedStatus === "shipped" && !shipment.shipped_at ? { shipped_at: new Date().toISOString() } : {}),
          ...(normalizedStatus === "delivered" ? { delivered_at: deliveredAt } : {}),
        });
        if (shipment.transaction_id) {
          await propagateShipmentStatusToTransaction(base44, shipment.transaction_id, normalizedStatus, deliveredAt);
        }
      }
    } catch (e) {
      console.warn("Could not sync tracking to DB:", e.message);
    }
  }

  return Response.json({
    status: normalizedStatus,
    tracking_history: trackingHistory,
    eta: data.eta,
    carrier: data.carrier,
    tracking_number: data.tracking_number,
  });
}

async function voidLabel(apiKey, { shippo_transaction_id, shipment_db_id }, base44) {
  const res = await shippoFetch(apiKey, `/refunds`, "POST", {
    transaction: shippo_transaction_id,
    async: false
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));

  // Mark our record as refunded
  if (shipment_db_id && base44) {
    try {
      await base44.asServiceRole.entities.Shipment.update(shipment_db_id, {
        is_label_refunded: true,
        status: "voided",
      });
    } catch (e) {
      console.warn("Could not update refund status:", e.message);
    }
  }

  return Response.json(data);
}

async function validateAddress(apiKey, address) {
  const res = await shippoFetch(apiKey, "/addresses", "POST", { ...address, validate: true });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return Response.json(data);
}

// ─── Webhook Handler ─────────────────────────────────────────────────────────

async function handleWebhookBody(body, apiKey) {
  const eventId = body?.id || `${body?.event}-${Date.now()}`;
  console.log(`[webhook] Event: ${body?.event} | ID: ${eventId}`);

  // Return 200 immediately — process async in background
  const response = Response.json({ received: true, event_id: eventId }, { status: 200 });

  // Fire async processing without blocking response
  processWebhookAsync(body, apiKey, eventId).catch(e => {
    console.error(`[webhook] Async error for ${eventId}:`, e.message);
  });

  return response;
}

// Background async webhook processor (non-blocking)
async function processWebhookAsync(body, apiKey, eventId) {
  try {
    const { event, data, id: shippoEventId } = body;
    const webhookEventId = shippoEventId || eventId;

    if (!event || !data) {
      console.warn(`[webhook] ${webhookEventId} - Missing event or data`);
      return;
    }

    const { createClient } = await import('npm:@base44/sdk@0.8.23');
    const base44 = createClient({ appId: Deno.env.get("BASE44_APP_ID") });

    // Check for duplicate processing (idempotent)
    const processed = await checkAndMarkWebhookProcessed(base44, webhookEventId, event);
    if (processed) {
      console.log(`[webhook] ${webhookEventId} - Already processed, skipping`);
      return;
    }

    if (event === "track_updated") {
      await handleTrackUpdated(data, base44, webhookEventId);
    } else if (event === "transaction_created") {
      await handleTransactionCreated(data, base44, apiKey, webhookEventId);
    } else if (event === "transaction_updated") {
      await handleTransactionUpdated(data, base44, webhookEventId);
    } else {
      console.log(`[webhook] ${webhookEventId} - Unhandled event type: ${event}`);
    }
  } catch (e) {
    console.error(`[webhook] ${eventId} - Processing failed:`, e.message);
    // Don't re-throw; we already returned 200 to Shippo
  }
}

// Check if webhook was already processed (idempotent guard)
async function checkAndMarkWebhookProcessed(base44, eventId, eventType) {
  if (!eventId) return false;

  try {
    const existing = await base44.asServiceRole.entities.ActivityEvent.filter({
      external_id: eventId,
      action_type: `shippo_${eventType}`
    });

    if (existing.length > 0) {
      return true; // Already processed
    }

    // Mark as processed
    await base44.asServiceRole.entities.ActivityEvent.create({
      external_id: eventId,
      action_type: `shippo_${eventType}`,
      metadata: { processed_at: new Date().toISOString() }
    });

    return false; // First time
  } catch (e) {
    console.warn("[webhook] Could not check duplicate:", e.message);
    return false; // Allow processing if check fails
  }
}

// Handle track_updated webhook
async function handleTrackUpdated(data, base44, eventId) {
  const trackingNumber = data?.tracking_number;
  const shippoStatus = data?.tracking_status?.status;

  if (!trackingNumber) {
    console.warn(`[webhook] ${eventId} - track_updated: No tracking number`);
    return;
  }

  console.log(`[webhook] ${eventId} - track_updated: ${trackingNumber} → ${shippoStatus}`);

  const normalizedStatus = normalizeStatus(shippoStatus || "UNKNOWN");
  const trackingHistory = (data?.tracking_history || []).map(h => ({
    status: normalizeStatus(h.status),
    status_details: h.status_details,
    status_date: h.status_date,
    location: h.location?.city ? `${h.location.city}, ${h.location.state}` : null,
  }));

  try {
    // Find shipment by tracking number
    const shipments = await base44.asServiceRole.entities.Shipment.filter({
      tracking_number: trackingNumber
    });

    if (shipments.length === 0) {
      console.warn(`[webhook] ${eventId} - No shipment found for tracking: ${trackingNumber}`);
      return;
    }

    for (const shipment of shipments) {
      const deliveredAt = normalizedStatus === "delivered"
        ? (data?.tracking_status?.status_date || new Date().toISOString())
        : null;

      await base44.asServiceRole.entities.Shipment.update(shipment.id, {
        status: normalizedStatus,
        tracking_history: trackingHistory,
        last_tracking_sync_at: new Date().toISOString(),
        eta: data.eta ? new Date(data.eta).toISOString() : shipment.eta,
        ...(normalizedStatus === "shipped" && !shipment.shipped_at ? { shipped_at: new Date().toISOString() } : {}),
        ...(normalizedStatus === "delivered" ? { delivered_at: deliveredAt } : {}),
      });

      console.log(`[webhook] ${eventId} - Updated Shipment ${shipment.id} → ${normalizedStatus}`);

      if (shipment.transaction_id) {
        await propagateShipmentStatusToTransaction(base44, shipment.transaction_id, normalizedStatus, deliveredAt);

        // In-app notifications for key status transitions
        if (normalizedStatus === "shipped" && shipment.buyer_email) {
          await base44.asServiceRole.entities.Notification.create({
            user_email: shipment.buyer_email,
            type: 'item_shipped',
            title: '📦 Item Shipped',
            message: `Your order is on its way! Tracking: ${shipment.tracking_number || 'see Track Packages'}.`,
            read: false,
            related_item_id: shipment.item_id,
            link_url: '/TrackPackages',
          }).catch(() => {});
        }
        if (normalizedStatus === "delivered" && shipment.buyer_email) {
          await base44.asServiceRole.entities.Notification.create({
            user_email: shipment.buyer_email,
            type: 'item_delivered',
            title: '✅ Item Delivered',
            message: `Your order has been delivered. Enjoy your item!`,
            read: false,
            related_item_id: shipment.item_id,
            link_url: '/TrackPackages',
          }).catch(() => {});
        }
      }
    }
  } catch (e) {
    console.error(`[webhook] ${eventId} - track_updated failed:`, e.message);
  }
}

// Handle transaction_created webhook
async function handleTransactionCreated(data, base44, apiKey, eventId) {
  const transactionId = data?.object_id;
  const trackingNumber = data?.tracking_number;
  const labelUrl = data?.label_url;
  const carrier = data?.rate?.provider;

  if (!transactionId || !trackingNumber) {
    console.warn(`[webhook] ${eventId} - transaction_created: Missing transaction ID or tracking number`);
    return;
  }

  console.log(`[webhook] ${eventId} - transaction_created: ${transactionId} | Tracking: ${trackingNumber}`);

  try {
    // Find related Transaction record by matching external identifiers
    // Try multiple strategies: shippo_transaction_id, or through pending sales
    const existingShipments = await base44.asServiceRole.entities.Shipment.filter({
      shippo_transaction_id: transactionId
    });

    if (existingShipments.length > 0) {
      // Shipment already created by the createLabel action — nothing to do.
      console.log(`[webhook] ${eventId} - Shipment already exists for Shippo txn ${transactionId} — skipping`);
      return;
    }

    // No fallback guessing. All labels created via the UI pass transaction_id explicitly
    // through the createLabel action, which writes the Shipment record before this webhook fires.
    // If we reach here it means the webhook arrived before the DB write completed (race condition)
    // or the label was created outside the platform — log and skip.
    console.warn(`[webhook] ${eventId} - No Shipment found for Shippo txn ${transactionId}. Label may have been created outside the platform or DB write is still in-flight. Skipping fallback to avoid incorrect transaction linking.`);
  } catch (e) {
    console.error(`[webhook] ${eventId} - transaction_created failed:`, e.message);
  }
}

// Handle transaction_updated webhook
async function handleTransactionUpdated(data, base44, eventId) {
  const transactionId = data?.object_id;
  const trackingNumber = data?.tracking_number;
  const transactionStatus = data?.status; // "SUCCESS", "ERROR", "REFUNDED", etc.

  if (!transactionId) {
    console.warn(`[webhook] ${eventId} - transaction_updated: No transaction ID`);
    return;
  }

  console.log(`[webhook] ${eventId} - transaction_updated: ${transactionId} | Status: ${transactionStatus}`);

  try {
    // Find shipment by shippo_transaction_id
    const shipments = await base44.asServiceRole.entities.Shipment.filter({
      shippo_transaction_id: transactionId
    });

    if (shipments.length === 0) {
      console.warn(`[webhook] ${eventId} - No shipment found for transaction: ${transactionId}`);
      return;
    }

    for (const shipment of shipments) {
      const updates = {};

      // Handle transaction status changes
      if (transactionStatus === "ERROR" || transactionStatus === "REFUNDED") {
        updates.shipment_status = "failed";
        updates.status = "failed";
        console.log(`[webhook] ${eventId} - Marked Shipment ${shipment.id} as failed (${transactionStatus})`);
      } else if (transactionStatus === "SUCCESS" && trackingNumber && !shipment.tracking_number) {
        // Backfill tracking number if not already set
        updates.tracking_number = trackingNumber;
        updates.last_tracking_sync_at = new Date().toISOString();
        console.log(`[webhook] ${eventId} - Updated Shipment ${shipment.id} tracking: ${trackingNumber}`);
      }

      if (Object.keys(updates).length > 0) {
        await base44.asServiceRole.entities.Shipment.update(shipment.id, updates);

        // Propagate to Transaction using unified lifecycle helper
        if (updates.status && shipment.transaction_id) {
          await propagateShipmentStatusToTransaction(base44, shipment.transaction_id, updates.status, null);
        }
      }
    }
  } catch (e) {
    console.error(`[webhook] ${eventId} - transaction_updated failed:`, e.message);
  }
}

// ─── Klaviyo Notification ────────────────────────────────────────────────────

async function notifyShippingUpdate(labelData, email, name, trackingNumber, carrier) {
  try {
    const KLAVIYO_PRIVATE_KEY = Deno.env.get("KLAVIYO_PRIVATE_API_KEY");
    if (!KLAVIYO_PRIVATE_KEY) return;

    await fetch("https://a.klaviyo.com/api/events", {
      method: 'POST',
      headers: {
        'Authorization': `Klaviyo-API-Key ${KLAVIYO_PRIVATE_KEY}`,
        'Content-Type': 'application/json',
        'revision': '2024-02-15'
      },
      body: JSON.stringify({
        data: {
          type: 'event',
          attributes: {
            properties: {
              tracking_number: trackingNumber,
              carrier,
              label_url: labelData.label_url,
              eta: labelData.eta || "3-5 days"
            },
            metric: { data: { type: 'metric', attributes: { name: "Package Shipped" } } },
            profile: { data: { type: 'profile', attributes: { email, first_name: name } } }
          }
        }
      })
    });
  } catch (e) {
    console.error("Failed to trigger Klaviyo notification:", e);
  }
}