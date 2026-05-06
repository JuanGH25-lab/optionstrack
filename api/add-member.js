// /api/add-member.js
// Called by Systeme.io webhook when tag "Membre Programme OLT" is added to a contact

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
const REQUIRED_TAG = 'Membre Programme OLT';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify webhook secret
  const signature = req.headers['x-webhook-signature'] || req.headers['x-webhook-secret'];
  if (WEBHOOK_SECRET && signature !== WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const body = req.body;

    // Verify this is the right tag
    const tagName = body?.tag?.name;
    if (tagName !== REQUIRED_TAG) {
      return res.status(200).json({ skipped: true, reason: `Tag "${tagName}" ignored` });
    }

    const email = body?.contact?.email?.toLowerCase()?.trim();
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Invalid or missing email' });
    }

    // Insert into Supabase allowed_members table
    const response = await fetch(`${SUPABASE_URL}/rest/v1/allowed_members`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Prefer': 'resolution=ignore-duplicates',
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
