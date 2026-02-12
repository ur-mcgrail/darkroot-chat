/**
 * Darkroot Configuration
 *
 * Centralized configuration using environment variables.
 * Environment variables must be prefixed with PUBLIC_ to be exposed to the browser.
 */

import { env } from '$env/dynamic/public';

/**
 * Matrix Homeserver URL
 *
 * Development: http://192.168.1.161:8008
 * Production: https://chat.warrenmcgrail.com
 */
export const HOMESERVER_URL = env.PUBLIC_HOMESERVER_URL || 'http://192.168.1.161:8008';

/**
 * Application name
 */
export const APP_NAME = env.PUBLIC_APP_NAME || 'Darkroot Chat';

/**
 * Application version
 */
export const APP_VERSION = env.PUBLIC_APP_VERSION || '0.1.0';

/**
 * Default theme
 */
export const DEFAULT_THEME = env.PUBLIC_DEFAULT_THEME || 'darkroot';

/**
 * Environment detection
 */
export const IS_PRODUCTION = import.meta.env.PROD;
export const IS_DEVELOPMENT = import.meta.env.DEV;
