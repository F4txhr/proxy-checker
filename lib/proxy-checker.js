import axios from 'axios';

export async function checkSingleProxy(proxy, timeout = 5000) {
  const { ip, port } = proxy;
  const startTime = Date.now();
  
  try {
    const response = await axios.get('https://httpbin.org/ip', {
      proxy: {
        host: ip,
        port: port,
      },
      timeout: timeout,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    return {
      ip,
      port,
      is_active: true,
      response_time: Date.now() - startTime,
      status_code: response.status,
      checked_at: new Date().toISOString()
    };
  } catch (error) {
    return {
      ip,
      port,
      is_active: false,
      response_time: null,
      error_message: error.message,
      error_type: getErrorType(error),
      checked_at: new Date().toISOString()
    };
  }
}

export async function checkMultipleProxies(proxies, options = {}) {
  const {
    timeout = 5000,
    concurrency = 10
  } = options;

  const results = [];
  
  for (let i = 0; i < proxies.length; i += concurrency) {
    const batch = proxies.slice(i, i + concurrency);
    const batchPromises = batch.map(proxy => checkSingleProxy(proxy, timeout));
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
  }
  
  return results;
}

function getErrorType(error) {
  if (error.code === 'ECONNABORTED') return 'timeout';
  if (error.code === 'ECONNREFUSED') return 'connection_refused';
  if (error.code === 'ENOTFOUND') return 'host_not_found';
  return 'unknown';
}
