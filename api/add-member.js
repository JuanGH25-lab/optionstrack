// /api/add-member.js
// Called by Systeme.io webhook on new purchase
// Adds the buyer's email to the allowed_members table in Supabase

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET; // optional security token

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Optional: verify webhook secret to ensure request comes from Systeme.io
  const secret = req.headers['x-webhook-secret'] || req.query.secret;
  if (WEBHOOK_SECRET && secret !== WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const body = req.body;

    // Systeme.io sends contact email in different fields depending on event type
    const email = (
      body?.contact?.email ||
      body?.email ||
      body?.buyer_email ||
      body?.customer?.email
    )?.toLowerCase()?.trim();

    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Invalid or missing email', received: body });
    }

    // Insert into Supabase allowed_members table
    const response = await fetch(`${SUPABASE_URL}/rest/v1/allowed_members`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Prefer': 'resolution=ignore-duplicates', // don't fail if email already exists
      },
      body: JSON.stringify({ email, has_account: false }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Supabase error:', err);
      return res.status(500).json({ error: 'Failed to add member', details: err });
    }

    console.log(`✅ Member added: ${email}`);
    return res.status(200).json({ success: true, email });

  } catch (err) {
    console.error('add-member error:', err);
    return res.status(500).json({ error: err.message });
  }
}
