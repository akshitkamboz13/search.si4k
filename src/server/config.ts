import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export interface Config {
  port: number;
  nodeEnv: string;
  kiwixUrl: string;
  kiwixPublicUrl: string;
}

export const config: Config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  // Internal URL used by backend server to contact Kiwix API/HTTP
  kiwixUrl: (process.env.KIWIX_URL || 'http://si4k-server.local:8080').replace(/\/$/, ''),
  // Public URL returned in search results for user browser to open
  kiwixPublicUrl: (process.env.KIWIX_PUBLIC_URL || process.env.KIWIX_URL || 'http://si4k-server.local:8080').replace(/\/$/, ''),
};
