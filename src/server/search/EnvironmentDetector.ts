import { Request } from 'express';
import { config } from '../config.js';
import { SearchMode } from '../../shared/types.js';

export interface EnvironmentDetectionResult {
  environment: 'local' | 'internet';
  mode: SearchMode;
  publicUrl: string;
  clientIp: string;
  isDevOverride: boolean;
}

export class EnvironmentDetector {
  /**
   * Automatically detect whether incoming request is from local LAN network or internet
   */
  public detectEnvironment(req: Request): EnvironmentDetectionResult {
    // 1. Check development override flag
    if (config.environment.override === 'local') {
      return {
        environment: 'local',
        mode: 'local',
        publicUrl: config.kiwix.localPublicUrl,
        clientIp: '127.0.0.1',
        isDevOverride: true,
      };
    }

    if (config.environment.override === 'internet') {
      return {
        environment: 'internet',
        mode: 'online',
        publicUrl: config.kiwix.onlinePublicUrl,
        clientIp: '8.8.8.8',
        isDevOverride: true,
      };
    }

    // 2. Inspect Cloudflare Tunnel / Public Proxy headers
    const cfConnectingIp = req.headers['cf-connecting-ip'] as string;
    const cdnLoop = req.headers['cdn-loop'] as string;
    const isCloudflare = Boolean(cfConnectingIp || (cdnLoop && cdnLoop.includes('cloudflare')));

    if (isCloudflare) {
      return {
        environment: 'internet',
        mode: 'online',
        publicUrl: config.kiwix.onlinePublicUrl,
        clientIp: cfConnectingIp || 'cloudflare-proxy',
        isDevOverride: false,
      };
    }

    // 3. Extract actual client IP accounting for trusted Express proxy settings
    let clientIp = req.ip || req.socket.remoteAddress || '127.0.0.1';
    
    // Clean IPv6-mapped IPv4 addresses (e.g. ::ffff:192.168.1.50 -> 192.168.1.50)
    if (clientIp.startsWith('::ffff:')) {
      clientIp = clientIp.replace('::ffff:', '');
    }

    // 4. Check if clientIp is a private LAN IP
    const isLan = this.isPrivateIp(clientIp);

    if (isLan) {
      return {
        environment: 'local',
        mode: 'local',
        publicUrl: config.kiwix.localPublicUrl,
        clientIp,
        isDevOverride: false,
      };
    }

    // 5. Default to internet/online mode for external public IP addresses
    return {
      environment: 'internet',
      mode: 'online',
      publicUrl: config.kiwix.onlinePublicUrl,
      clientIp,
      isDevOverride: false,
    };
  }

  /**
   * Helper method to check if an IP address belongs to RFC 1918 / IPv6 private local networks
   */
  public isPrivateIp(ip: string): boolean {
    if (!ip) return false;

    // Loopback
    if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') {
      return true;
    }

    // IPv4 RFC 1918 Private Ranges
    // 10.0.0.0 – 10.255.255.255
    if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) {
      return true;
    }

    // 172.16.0.0 – 172.31.255.255
    const match172 = ip.match(/^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
    if (match172) {
      const secondOctet = parseInt(match172[1], 10);
      if (secondOctet >= 16 && secondOctet <= 31) {
        return true;
      }
    }

    // 192.168.0.0 – 192.168.255.255
    if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(ip)) {
      return true;
    }

    return false;
  }
}
