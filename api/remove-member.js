// /api/remove-member.js
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const REQUIRED_TAG = 'Membre Programme OLT';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body;
    const eventType = req.headers['x-webhook-event'];

    // For tag removal: verify it's the right tag
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
      return res.status(500).json({ error: 'Failed to remove member', details: err });
    }

    console.log(`🗑 Member removed: ${email}`);
    return res.status(200).json({ success: true, email });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
