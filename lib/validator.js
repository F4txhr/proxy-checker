import Joi from 'joi';

export const proxySchema = Joi.object({
  ip: Joi.string()
    .ip({ version: ['ipv4'] })
    .required(),
  port: Joi.number()
    .integer()
    .min(1)
    .max(65535)
    .required()
});

export const proxyListSchema = Joi.array()
  .items(Joi.string().pattern(/^(\d{1,3}\.){3}\d{1,3}:\d{1,5}$/))
  .min(1)
  .max(1000);

export const checkProxyDirectSchema = Joi.object({
  proxies: proxyListSchema.required(),
  options: Joi.object({
    timeout: Joi.number().min(1000).max(30000).default(5000),
    concurrency: Joi.number().min(1).max(50).default(10),
    include_geoip: Joi.boolean().default(true)
  }).optional()
});

export function parseProxyString(proxyString) {
  const [ip, port] = proxyString.split(':');
  return {
    ip: ip.trim(),
    port: parseInt(port.trim())
  };
}

export function validateProxy(proxy) {
  const { error, value } = proxySchema.validate(proxy);
  return { isValid: !error, error: error?.message, value };
}
