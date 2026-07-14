// Geofence configuration — stored in data/geofence.json so it persists
// across restarts and can be updated live from the admin UI without
// restarting the server.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(__dirname, '..', 'data', 'geofence.json');

let _fence = null;

// Load from disk on startup
try {
  if (fs.existsSync(FILE)) {
    _fence = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  }
} catch { _fence = null; }

export function getFence() { return _fence; }

export function setFence(lat, lng, radiusM) {
  _fence = { lat, lng, radiusM };
  fs.writeFileSync(FILE, JSON.stringify(_fence, null, 2));
}

export function clearFence() {
  _fence = null;
  if (fs.existsSync(FILE)) fs.unlinkSync(FILE);
}

// Haversine distance in metres between two decimal-degree coordinates
export function distMetres(lat1, lon1, lat2, lon2) {
  const R = 6_371_000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Returns null if within zone (or no fence configured), or an error string if rejected
export function checkFence(lat, lng) {
  if (!_fence) return null;                  // no fence — always allow
  if (lat == null || lng == null) return null; // no GPS — allow (employee in basement etc.)
  const dist = distMetres(_fence.lat, _fence.lng, lat, lng);
  if (dist <= _fence.radiusM) return null;
  return `You are ${Math.round(dist)}m from the office. Punch-in is only allowed within ${_fence.radiusM}m of the office.`;
}