import dotenv from 'dotenv';

dotenv.config();

export interface Config {
  port: number;
  nodeEnv: string;
  kiwixLocalUrl: string;
  kiwixLocalPublicUrl: string;
  kiwixOnlineUrl: string;
  kiwixOnlinePublicUrl: string;
}

const defaultLocalUrl = process.env.KIWIX_LOCAL_URL || process.env.KIWIX_URL || 'http://192.168.31.250:8080';
const defaultLocalPublicUrl = process.env.KIWIX_LOCAL_PUBLIC_URL || process.env.KIWIX_PUBLIC_URL || 'http://si4k-server.local:8080';

const defaultOnlineUrl = process.env.KIWIX_ONLINE_URL || process.env.KIWIX_URL || 'http://192.168.31.250:8080';
const defaultOnlinePublicUrl = process.env.KIWIX_ONLINE_PUBLIC_URL || process.env.KIWIX_PUBLIC_URL || 'https://wiki.si4k.online';

export const config: Config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  kiwixLocalUrl: defaultLocalUrl.replace(/\/$/, ''),
  kiwixLocalPublicUrl: defaultLocalPublicUrl.replace(/\/$/, ''),
  kiwixOnlineUrl: defaultOnlineUrl.replace(/\/$/, ''),
  kiwixOnlinePublicUrl: defaultOnlinePublicUrl.replace(/\/$/, ''),
};
