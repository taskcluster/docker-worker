import assert from 'assert';
import statelessDNSServer from 'stateless-dns-server';

export default function getHostname(config, expires) {
  let statelessConfig = config.statelessHostname || {};
  if (!statelessConfig || !statelessConfig.enabled) {
    return config.host;
  }

  let secret = statelessConfig.secret || '1234';
  let domain = statelessConfig.domain || '';
  assert(secret, 'Must supply a secret for stateless dns server');
  assert(domain, 'Must supply a domain name used for stateless hostname');

  let hostname;
  let ip = config.publicIp || '127.0.0.1';
  ip = ip.split('.').map((octet) => { return parseInt(octet) });
  hostname  = statelessDNSServer.createHostname(
    ip,
    expires,
    secret,
    domain
  );

  return hostname;
}
