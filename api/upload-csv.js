const { put } = require('@vercel/blob');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(500).json({ error: 'BLOB_READ_WRITE_TOKEN not configured' });
  }

  const { filename, content, event_id } = req.body || {};
  if (!content) return res.status(400).json({ error: 'No CSV content provided' });

  const safeName = (filename || 'guests.csv').replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `luma-csv/${event_id || Date.now()}/${safeName}`;

  try {
    const { url } = await put(path, content, {
      access: 'public',
      contentType: 'text/csv',
    });
    return res.status(200).json({ url });
  } catch (err) {
    return res.status(500).json({ error: 'Upload failed', detail: err.message });
  }
};
