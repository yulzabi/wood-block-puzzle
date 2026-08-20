/**
 * Entry point: register the service worker (progressive enhancement) and boot
 * the app. Service-worker registration failure is non-fatal — the game still
 * runs online.
 */

import { registerSW } from 'virtual:pwa-register';
import { mountApp } from './app';

registerSW({ immediate: true });

mountApp('app');
