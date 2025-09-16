import axios from 'axios';

const geoipCache = new Map();
const CACHE_TTL = process.env.GEOIP_CACHE_TTL || 86400000; // 24 hours

export async function getGeoIP(ip) {
  // Check cache first
  const cached = geoipCache.get(ip);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  try {
    // Try ip-api.com first
    const response = await axios.get(`http://ip-api.com/json/${ip}`, {
      timeout: 3000
    });

    const geoData = {
      country_code: response.data.countryCode,
      country_name: response.data.country,
      city: response.data.city,
      region: response.data.regionName,
      isp: response.data.isp,
      org: response.data.org,
      latitude: response.data.lat,
      longitude: response.data.lon
    };

    // Cache the result
    geoipCache.set(ip, {
      data: geoData,
      timestamp: Date.now()
    });

    return geoData;
  } catch (error) {
    // Fallback to ipinfo.io
    try {
      const response = await axios.get(`https://ipinfo.io/${ip}/json`, {
        timeout: 3000
      });

      const geoData = {
        country_code: response.data.country,
        country_name: response.data.country,
        city: response.data.city,
        region: response.data.region,
        isp: response.data.org,
        org: response.data.org,
        latitude: response.data.loc ? parseFloat(response.data.loc.split(',')[0]) : null,
        longitude: response.data.loc ? parseFloat(response.data.loc.split(',')[1]) : null
      };

      geoipCache.set(ip, {
        data: geoData,
        timestamp: Date.now()
      });

      return geoData;
    } catch (fallbackError) {
      return {
        country_code: null,
        country_name: null,
        city: null,
        region: null,
        isp: null,
        org: null,
        latitude: null,
        longitude: null
      };
    }
  }
}
