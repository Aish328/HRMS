import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const uploadsDir = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// Persist a base64 data-URL selfie as a JPEG file. Rejects anything that is not
// a JPEG/PNG data URL (blocks arbitrary file uploads) and enforces a size cap.
export function saveSelfie(dataUrl) {
  const match = /^data:image\/(jpeg|png);base64,(.+)$/.exec(dataUrl || '');
  if (!match) throw new Error('Selfie must be captured with the camera.');
  const buf = Buffer.from(match[2], 'base64');
  if (buf.length < 4000) throw new Error('Selfie image looks empty. Try again.');
  if (buf.length > 6000000) throw new Error('Selfie image is too large.');
  const name = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}.jpg`;
  fs.writeFileSync(path.join(uploadsDir, name), buf);
  return name;
}

// Lightweight identity heuristic: average-hash style similarity between two
// image files based on coarse byte-luminance sampling. This is NOT biometric
// face recognition — it flags obviously different images for admin review.
// Swap with a real face-embedding service in production (docs/SECURITY.md).
export function imageSimilarity(fileA, fileB) {
  try {
    const a = fs.readFileSync(path.join(uploadsDir, fileA));
    const b = fs.readFileSync(path.join(uploadsDir, fileB));
    const sig = (buf) => {
      const step = Math.max(1, Math.floor(buf.length / 256));
      const vals = [];
      for (let i = 0; i < 256; i++) vals.push(buf[Math.min(i * step, buf.length - 1)]);
      const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
      return vals.map((v) => (v > mean ? 1 : 0));
    };
    const sa = sig(a), sb = sig(b);
    let same = 0;
    for (let i = 0; i < 256; i++) if (sa[i] === sb[i]) same++;
    return Number((same / 256).toFixed(3));
  } catch {
    return null;
  }
}

export function daysBetweenInclusive(start, end) {
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  return Math.round((e - s) / 86400000) + 1;
}

export function toCsv(rows, columns) {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = columns.map((c) => esc(c.label)).join(',');
  const body = rows.map((r) => columns.map((c) => esc(r[c.key])).join(',')).join('\n');
  return header + '\n' + body;
}
