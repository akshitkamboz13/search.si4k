import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export interface KiwixConfig {
  dataDir: string;
  libraryXml: string;
  localUrl: string;
  localPublicUrl: string;
  onlineUrl: string;
  onlinePublicUrl: string;
  maxConcurrentSearches: number;
}

export interface Config {
  port: number;
  nodeEnv: string;
  kiwix: KiwixConfig;
}

const dataDir = process.env.KIWIX_DATA_DIR || '/mnt/knowledge';
const libraryXml = process.env.KIWIX_LIBRARY_XML || path.join(dataDir, 'Metadata', 'library.xml');

const defaultLocalUrl = process.env.KIWIX_LOCAL_URL || process.env.KIWIX_URL || 'http://192.168.31.250:8080';
const defaultLocalPublicUrl = process.env.KIWIX_LOCAL_PUBLIC_URL || process.env.KIWIX_PUBLIC_URL || 'http://si4k-server.local:8080';

const defaultOnlineUrl = process.env.KIWIX_ONLINE_URL || process.env.KIWIX_URL || 'http://192.168.31.250:8080';
const defaultOnlinePublicUrl = process.env.KIWIX_ONLINE_PUBLIC_URL || process.env.KIWIX_PUBLIC_URL || 'https://wiki.si4k.online';

export const config: Config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  kiwix: {
    dataDir: dataDir.replace(/\/$/, ''),
    libraryXml,
    localUrl: defaultLocalUrl.replace(/\/$/, ''),
    localPublicUrl: defaultLocalPublicUrl.replace(/\/$/, ''),
    onlineUrl: defaultOnlineUrl.replace(/\/$/, ''),
    onlinePublicUrl: defaultOnlinePublicUrl.replace(/\/$/, ''),
    maxConcurrentSearches: parseInt(process.env.MAX_CONCURRENT_ZIM_SEARCHES || '8', 10),
  },
};
