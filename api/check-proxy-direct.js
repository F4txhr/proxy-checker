import { checkMultipleProxies, checkSingleProxy } from '../lib/proxy-checker.js';
import { getGeoIP } from '../lib/geoip.js';
import { validateProxy, parseProxyString, checkProxyDirectSchema } from '../lib/validator.js';
import { supabase } from '../lib/supabase.js';

export default async function handler(req, res) {
  // Handle GET request for single proxy
  if (req.method === 'GET') {
    return handleGetRequest(req, res);
  }
  
  // Handle POST request for multiple proxies
  if (req.method === 'POST') {
    return handlePostRequest(req, res);
  }
  
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleGetRequest(req, res) {
  try {
    let proxy;
    
    // Parse from path parameter
    if (req.query.proxy) {
      proxy = parseProxyString(req.query.proxy);
    } 
    // Parse from query parameters
    else if (req.query.ip && req.query.port) {
      proxy = {
        ip: req.query.ip,
        port: parseInt(req.query.port)
      };
    } 
    // Parse from path segments
    else {
      const pathSegments = req.url.split('/');
      const proxyString = pathSegments[pathSegments.length - 1];
      if (proxyString.includes(':')) {
        proxy = parseProxyString(proxyString);
      } else {
        return res.status(400).json({ error: 'Invalid proxy format' });
      }
    }

    // Validate proxy
    const { isValid, error } = validateProxy(proxy);
    if (!isValid) {
      return res.status(400).json({ error: error });
    }

    // Check proxy
    let result = await checkSingleProxy(proxy);
    
    // Add GeoIP data if active
    if (result.is_active) {
      const geoData = await getGeoIP(result.ip);
      result = { ...result, ...geoData };
    }

    // Save to database
    await saveProxyResult(result, req.query.user_id || 'anonymous');

    return res.status(200).json(result);

  } catch (error) {
    console.error('Error in GET request:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function handlePostRequest(req, res) {
  try {
    // Validate request body
    const { error: validationError } = checkProxyDirectSchema.validate(req.body);
    if (validationError) {
      return res.status(400).json({ 
        error: 'Invalid request format',
        details: validationError.message 
      });
    }

    const { proxies: proxyStrings, options = {} } = req.body;
    const user_id = req.body.user_id || 'anonymous';

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

    // Check proxies
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

    // Save to database
    await saveProxyResults(results, user_id);

    // Prepare response
    const activeCount = results.filter(r => r.is_active).length;
    const inactiveCount = results.length - activeCount;

    return res.status(200).json({
      message: 'Proxy check completed',
      total_checked: results.length,
      active_proxies: activeCount,
      inactive_proxies: inactiveCount,
      results
    });

  } catch (error) {
    console.error('Error in POST request:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function saveProxyResult(result, user_id) {
  try {
    await supabase
      .from('proxy_checks')
      .insert({
        user_id,
        ip: result.ip,
        port: result.port,
        is_active: result.is_active,
        response_time: result.response_time,
        error_message: result.error_message,
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
  } catch (error) {
    console.error('Failed to save proxy result:', error);
  }
}

async function saveProxyResults(results, user_id) {
  try {
    const dataToInsert = results.map(result => ({
      user_id,
      ip: result.ip,
      port: result.port,
      is_active: result.is_active,
      response_time: result.response_time,
      error_message: result.error_message,
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
    }));

    // Insert in batches to avoid timeout
    const batchSize = 100;
    for (let i = 0; i < dataToInsert.length; i += batchSize) {
      const batch = dataToInsert.slice(i, i + batchSize);
      await supabase.from('proxy_checks').insert(batch);
    }
  } catch (error) {
    console.error('Failed to save proxy results:', error);
  }
}
