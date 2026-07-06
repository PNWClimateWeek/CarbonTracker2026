const { get } = require('@vercel/blob');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { key, url } = req.query;
  if (!process.env.DASHBOARD_SECRET || key !== process.env.DASHBOARD_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!url) return res.status(400).json({ error: 'url is required' });

  try {
    const result = await get(url, { access: 'private' });
    if (!result || result.statusCode !== 200) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${result.blob.pathname.split('/').pop()}"`);

    const reader = result.stream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();
  } catch (err) {
    console.error('csv-download failed:', err.message);
    return res.status(500).json({ error: 'Download failed', detail: err.message });
  }
};
