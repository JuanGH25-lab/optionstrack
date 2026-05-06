// /api/remove-member.js
// Called by Systeme.io webhook when tag "Membre Programme OLT" is removed OR sale is cancelled

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
const REQUIRED_TAG = 'Membre Programme OLT';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const signature = req.headers['x-webhook-signature'] || req.headers['x-webhook-secret'];
  if (WEBHOOK_SECRET && signature !== WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const body = req.body;

    // For tag removal: verify it's the right tag
    const eventType = req.headers['x-webhook-event'];
    if (eventType === 'CONTACT_TAG_REMOVED') {
      const tagName = body?.tag?.name;
      if (tagName !== REQUIRED_TAG) {
        return res.status(200).json({ skipped: true, reason: `Tag "${tagName}" ignored` });
      }
    }

    const email = body?.contact?.email?.toLowerCase()?.trim();
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Invalid or missing email' });
    }

    // Delete from Supabase allowed_members table
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/allowed_members?email=eq.${encodeURIComponent(email)}`,
      {
        method: 'DELETE',
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        },
      }
    );

    if (!response.ok) {
      const err = await response.text();
      console.error('Supabase error:', err);
      return res.status(500).json({ error: 'Failed to remove member', details: err });
    }

    console.log(`🗑 Member removed: ${email}`);
    return res.status(200).json({ success: true, email });

  } catch (err) {
    console.error('remove-member error:', err);
    return res.status(500).json({ error: err.message });
  }
}
