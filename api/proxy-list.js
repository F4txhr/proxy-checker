import { supabase } from '../lib/supabase.js';

export default async function handler(req, res) {
  try {
    const {
      format = 'txt',
      limit = 1000,
      country,
      user_id,
      sort = 'checked_at',
      order = 'desc'
    } = req.query;

    // Build query for active proxies
    let query = supabase
      .from('proxy_checks')
      .select('ip, port, country_code, city, response_time, checked_at')
      .eq('is_active', true)
      .gte('checked_at', new Date(Date.now() - 60 * 60 * 1000).toISOString()); // Last hour

    // Filter by country
    if (country) {
      query = query.eq('country_code', country.toUpperCase());
    }

    // Filter by user
    if (user_id) {
      query = query.eq('user_id', user_id);
    }

    // Sorting
    query = query.order(sort, { ascending: order === 'asc' });

    // Limit
    query = query.limit(Math.min(parseInt(limit) || 1000, 10000));

    const { data, error } = await query;

    if (error) throw error;

    // Format response based on requested format
    switch (format.toLowerCase()) {
      case 'json':
        return res.status(200).json({
          metadata: {
            generated_at: new Date().toISOString(),
            total_proxies: data.length,
            format: 'ip:port:country_code',
            last_check_within: '1 hour'
          },
          proxies: data.map(p => `${p.ip}:${p.port}:${p.country_code || ''}`)
        });

      case 'csv':
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="active-proxies.csv"');
        
        const csvHeader = 'ip,port,country_code,city,response_time_ms,last_checked\n';
        const csvData = data.map(p => 
          `${p.ip},${p.port},${p.country_code || ''},${p.city || ''},${p.response_time || ''},${p.checked_at || ''}`
        ).join('\n');
        
        return res.status(200).send(csvHeader + csvData);

      case 'txt':
      default:
        res.setHeader('Content-Type', 'text/plain');
        
        const txtHeader = `# Active Proxies - Generated: ${new Date().toISOString()}
# Total: ${data.length} proxies
# Format: ip:port:country_code
# Last Check: Within 1 hour

`;
        
        const txtData = data.map(p => 
          `${p.ip}:${p.port}:${p.country_code || ''}`
        ).join('\n');
        
        return res.status(200).send(txtHeader + txtData);
    }

  } catch (error) {
    console.error('Error fetching proxy list:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
