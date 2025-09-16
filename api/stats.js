import { supabase } from '../lib/supabase.js';

export default async function handler(req, res) {
  try {
    const { user_id, period = '24h' } = req.query;

    // Calculate time range
    const now = new Date();
    let startTime;
    
    switch (period) {
      case '1h':
        startTime = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case '24h':
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      default:
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    // Build base query
    let query = supabase
      .from('proxy_checks')
      .select('*', { count: 'exact' });

    // Filter by time range
    query = query.gte('checked_at', startTime.toISOString());

    // Filter by user if specified
    if (user_id) {
      query = query.eq('user_id', user_id);
    }

    const { data, count, error } = await query;

    if (error) throw error;

    // Calculate statistics
    const totalProxies = count || 0;
    const activeProxies = data.filter(p => p.is_active).length;
    const inactiveProxies = totalProxies - activeProxies;
    const successRate = totalProxies > 0 ? Math.round((activeProxies / totalProxies) * 10000) / 100 : 0;

    // Calculate average response time
    const responseTimes = data
      .filter(p => p.is_active && p.response_time)
      .map(p => p.response_time);
    
    const avgResponseTime = responseTimes.length > 0 
      ? Math.round(responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length)
      : 0;

    // Top countries
    const countryCount = {};
    data.forEach(p => {
      if (p.country_code) {
        countryCount[p.country_code] = (countryCount[p.country_code] || 0) + 1;
      }
    });

    const topCountries = Object.entries(countryCount)
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const stats = {
      period: period,
      generated_at: new Date().toISOString(),
      total_proxies: totalProxies,
      active_proxies: activeProxies,
      inactive_proxies: inactiveProxies,
      success_rate: `${successRate}%`,
      average_response_time: avgResponseTime,
      top_countries: topCountries,
      checked_in_period: data.length
    };

    return res.status(200).json(stats);

  } catch (error) {
    console.error('Error fetching stats:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
