export interface ConnectionInfo {
  ip: string;
  isp: string;
  pop: string;
  country: string;
  http: string;
  tls: string;
  warp: 'on' | 'off';
  browser: string;
  os: string;
  cfRay: string;
  timestamp: string;
}

type CfProperties = IncomingRequestCfProperties & {
  warp?: 'on' | 'off';
};

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g;

export function safeText(value: unknown, fallback = 'Unknown', maxLength = 128): string {
  if (typeof value !== 'string') return fallback;

  const cleaned = value.replace(CONTROL_CHARACTERS, ' ').replace(/\s+/g, ' ').trim();
  return cleaned ? cleaned.slice(0, maxLength) : fallback;
}

export function safeIp(value: unknown): string {
  if (typeof value !== 'string') return 'Unknown';

  const ip = value.trim();
  if (!ip || ip.length > 64) return 'Unknown';

  return /^[0-9a-fA-F:.]+$/.test(ip) ? ip : 'Unknown';
}

export function parseUserAgent(value: string): { browser: string; os: string } {
  const ua = safeText(value, '', 512);
  let browser = 'Unknown';
  let os = 'Unknown';

  if (ua.includes('Edg/')) {
    browser = 'Edge';
  } else if (ua.includes('OPR/') || ua.includes('Opera/')) {
    browser = 'Opera';
  } else if (ua.includes('Firefox/')) {
    browser = 'Firefox';
  } else if (ua.includes('Chrome/')) {
    browser = 'Chrome';
  } else if (ua.includes('Safari/')) {
    browser = 'Safari';
  }

  if (ua.includes('iPhone') || ua.includes('iPad') || ua.includes('iPod')) {
    os = 'iOS';
  } else if (ua.includes('Android')) {
    os = 'Android';
  } else if (ua.includes('Windows NT 10.0')) {
    os = 'Windows 10/11';
  } else if (ua.includes('Windows NT')) {
    os = 'Windows';
  } else if (ua.includes('Mac OS X') || ua.includes('macOS')) {
    os = 'macOS';
  } else if (ua.includes('Linux')) {
    os = 'Linux';
  }

  return { browser, os };
}

export function buildConnectionInfo(request: Request): ConnectionInfo {
  const cf = request.cf as CfProperties | undefined;
  const userAgent = request.headers.get('User-Agent') ?? '';
  const { browser, os } = parseUserAgent(userAgent);

  return {
    ip: safeIp(request.headers.get('CF-Connecting-IP')),
    isp: safeText(cf?.asOrganization),
    pop: safeText(cf?.colo),
    country: safeText(cf?.country),
    http: safeText(cf?.httpProtocol),
    tls: safeText(cf?.tlsVersion),
    warp: cf?.warp === 'on' ? 'on' : 'off',
    browser,
    os,
    cfRay: safeText(request.headers.get('CF-Ray'), 'Unknown', 64),
    timestamp: new Date().toISOString(),
  };
}
