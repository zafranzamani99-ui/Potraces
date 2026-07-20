/**
 * Google Maps / Waze link parsing (Collectz venue preview card). Pure module.
 * Run: npm run test:maplink
 */
import { parseMapCoords, isGoogleMapsUrl, isWazeUrl, isMapsLink, googleMapsUrl, wazeUrl } from '../src/utils/mapLink';

const failures: string[] = [];
let passed = 0;
const check = (name: string, cond: boolean) => { if (cond) passed++; else failures.push(name); };

// ── Google place pages (@lat,lon) ──
check('google @lat,lon', JSON.stringify(parseMapCoords('https://www.google.com/maps/place/Stadium+Shah+Alam/@3.0738,101.5183,17z/')) === JSON.stringify({ lat: 3.0738, lon: 101.5183 }));
check('google @ with negative lat', parseMapCoords('https://www.google.com/maps/@-6.2,106.816,15z')?.lat === -6.2);

// ── Google params ──
check('google ?q=lat,lon', parseMapCoords('https://www.google.com/maps/search/?api=1&query=3.0738,101.5183')?.lon === 101.5183);
check('google ?q=name (no coords) → null', parseMapCoords('https://www.google.com/maps/search/?api=1&query=Stadium+Melawati') === null);
check('google ?daddr=', parseMapCoords('https://www.google.com/maps/dir/?api=1&daddr=3.1579,101.7116')?.lat === 3.1579);

// ── Waze ──
check('waze ?ll=', parseMapCoords('https://www.waze.com/ul?ll=3.0738%2C101.5183&navigate=yes')?.lat === 3.0738);
check('waze live-map ll raw comma', parseMapCoords('https://www.waze.com/en-GB/live-map/directions?ll=3.15,101.70')?.lon === 101.7);
check('waze without coords → null', parseMapCoords('https://www.waze.com/ul?favorite=home') === null);

// ── Guards ──
check('empty string → null', parseMapCoords('') === null);
check('random url → null', parseMapCoords('https://example.com/foo') === null);
check('out-of-range lat rejected', parseMapCoords('https://www.google.com/maps/@999,101.5') === null);
check('short link → null (but still openable)', parseMapCoords('https://maps.app.goo.gl/AbCdEfGh') === null);

// ── Type detectors ──
check('isGoogleMapsUrl', isGoogleMapsUrl('https://www.google.com/maps/place/x/@3,101') && isGoogleMapsUrl('https://maps.app.goo.gl/AbC'));
check('isWazeUrl', isWazeUrl('https://www.waze.com/ul?ll=3,101'));
check('isMapsLink rejects non-map', !isMapsLink('https://example.com'));

// ── Builders ──
check('googleMapsUrl builder', googleMapsUrl({ lat: 3.07, lon: 101.51 }) === 'https://www.google.com/maps/search/?api=1&query=3.07,101.51');
check('wazeUrl builder', wazeUrl({ lat: 3.07, lon: 101.51 }).includes('ll=3.07,101.51'));

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error('FAILED:\n - ' + failures.join('\n - '));
  process.exit(1);
}
