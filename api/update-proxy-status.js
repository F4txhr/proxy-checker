import { checkMultipleProxies } from '../lib/proxy-checker.js';
import { getGeoIP } from '../lib/geoip.js';
import { validateProxy, parseProxyString } from '../lib/validator.js';
import { supabase } from '../lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { user_id, proxies: proxyStrings, options = {} } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    if (!Array.isArray(proxyStrings) || proxyStrings.length === 0) {
      return res.status(400).json({ error: 'Proxies array is required' });
    }

    // Parse and validate proxies
    const proxies = proxyStrings.map(proxyString => parseProxyString(proxyString));
    const validationResults = proxies.map(proxy => validateProxy(proxy));
    
    const invalidProxies = validationResults.filter(r => !r.isValid);
    if (invalidProxies.length > 0) {
      return res.status(400).json({ 
        error: 'Invalid proxy format',
        invalid_proxies: invalidProxies.map(r => r.error)
      });
    }

    // Check current status of proxies
    let results = await checkMultipleProxies(proxies, options);

    // Add GeoIP data for active proxies
    if (options.include_geoip !== false) {
      for (let i = 0; i < results.length; i++) {
        if (results[i].is_active) {
          const geoData = await getGeoIP(results[i].ip);
          results[i] = { ...results[i], ...geoData };
        }
      }
    }

    // Update existing records and create new ones
    const updateResults = await updateProxyStatuses(user_id, results);

    return res.status(200).json({
      message: 'Proxy statuses updated',
      summary: updateResults.summary,
      results: updateResults.details
    });

  } catch (error) {
    console.error('Error updating proxy statuses:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function updateProxyStatuses(user_id, results) {
  const summary = {
    total_proxies: results.length,
    updated_existing: 0,
    created_new: 0,
    failed_updates: 0
  };

  const details = [];

  for (const result of results) {
    try {
      // Check if proxy already exists
      const { data: existingRecord, error: fetchError } = await supabase
        .from('proxy_checks')
        .select('id')
        .eq('user_id', user_id)
        .eq('ip', result.ip)
        .eq('port', result.port)
        .single();

      if (existingRecord) {
        // Update existing record
        const { error: updateError } = await supabase
          .from('proxy_checks')
          .update({
            is_active: result.is_active,
            response_time: result.response_time,
            error_message: result.is_active ? null : result.error_message,
            country_code: result.country_code,
            country_name: result.country_name,
            city: result.city,
            region: result.region,
            isp: result.isp,
            latitude: result.latitude,
            longitude: result.longitude,
            checked_at: result.checked_at,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingRecord.id);

        if (updateError) throw updateError;

        summary.updated_existing++;
        details.push({
          ...result,
          action: 'updated'
        });
      } else {
        // Create new record
        const { error: insertError } = await supabase
          .from('proxy_checks')
          .insert({
            user_id,
            ip: result.ip,
            port: result.port,
            is_active: result.is_active,
            response_time: result.response_time,
            error_message: result.is_active ? null : result.error_message,
            country_code: result.country_code,
            country_name: result.country_name,
            city: result.city,
            region: result.region,
            isp: result.isp,
            latitude: result.latitude,
            longitude: result.longitude,
            checked_at: result.checked_at,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });

        if (insertError) throw insertError;

        summary.created_new++;
        details.push({
          ...result,
          action: 'created'
        });
      }
    } catch (error) {
      console.error(`Failed to update proxy ${result.ip}:${result.port}:`, error);
      summary.failed_updates++;
      details.push({
        ip: result.ip,
        port: result.port,
        error: error.message,
        action: 'failed'
      });
    }
  }

  return { summary, details };
}
