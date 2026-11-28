/**
 * podBeam (alpha 0.3): real audio files for Social Justice Radio on the
 * client test platform. Put .mp3, .wav or .m4a files, or the .zip files
 * the SJR site hands out, in media/podBeam/ (git ignores it), and
 * `npm run clients` brings them in as the station's own uploads:
 *
 *   - zips are opened on the fly and every audio file inside is taken;
 *   - each file is stored like an upload and listed in Listen → Studio →
 *     Audio files (origin "import"), so it shows in Assets as Studio audio;
 *   - an episode whose original file name matches (episode.audio.name, the
 *     name on the SJR server) plays the uploaded file from then on; the
 *     old link is kept as audio.linkedUrl;
 *   - a file already brought in (same name and size) is skipped, so
 *     running it again only picks up what's new.
 */
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { randomBytes } from 'node:crypto';
import { seedSampleSlides } from '../src/podcasts/studio/slides.js';

const AUDIO = /\.(mp3|wav|m4a)$/i;
export const mimetypeOf = (name) => (/\.wav$/i.test(name) ? 'audio/wav' : /\.m4a$/i.test(name) ? 'audio/mp4' : 'audio/mpeg');

/** Match file names loosely: case, spaces, dashes and the extension don't count. */
export const nameKey = (name) => basename(String(name ?? '')).replace(/\.[a-z0-9]+$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '');

/**
 * The files in a .zip, read from its central directory: [{ name, bytes }].
 * Stored and deflated entries (what every zip tool makes); folders,
 * macOS "__MACOSX" extras and anything encrypted are left out.
 */
export function unzipEntries(buf, keep = () => true) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a zip file');
  let count = buf.readUInt16LE(eocd + 10);
  let at = buf.readUInt32LE(eocd + 16);
  // Zip64: a large archive keeps the real numbers in its zip64 end record.
  if (at === 0xffffffff || count === 0xffff) {
    const loc = eocd - 20;
    if (loc >= 0 && buf.readUInt32LE(loc) === 0x07064b50) {
      const rec = Number(buf.readBigUInt64LE(loc + 8));
      count = Number(buf.readBigUInt64LE(rec + 32));
      at = Number(buf.readBigUInt64LE(rec + 48));
    }
  }
  const out = [];
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(at) !== 0x02014b50) throw new Error('damaged zip directory');
    const flags = buf.readUInt16LE(at + 8);
    const method = buf.readUInt16LE(at + 10);
    let csize = buf.readUInt32LE(at + 20);
    let usize = buf.readUInt32LE(at + 24);
    const nlen = buf.readUInt16LE(at + 28), xlen = buf.readUInt16LE(at + 30), clen = buf.readUInt16LE(at + 32);
    let local = buf.readUInt32LE(at + 42);
    const name = buf.toString(flags & 0x800 ? 'utf8' : 'latin1', at + 46, at + 46 + nlen);
    // Zip64 sizes and offsets live in the extra field.
    if (csize === 0xffffffff || usize === 0xffffffff || local === 0xffffffff) {
      let x = at + 46 + nlen;
      const end = x + xlen;
      while (x + 4 <= end) {
        const id = buf.readUInt16LE(x), len = buf.readUInt16LE(x + 2);
        if (id === 0x0001) {
          let p = x + 4;
          if (usize === 0xffffffff) { usize = Number(buf.readBigUInt64LE(p)); p += 8; }
          if (csize === 0xffffffff) { csize = Number(buf.readBigUInt64LE(p)); p += 8; }
          if (local === 0xffffffff) { local = Number(buf.readBigUInt64LE(p)); }
        }
        x += 4 + len;
      }
    }
    at += 46 + nlen + xlen + clen;
    if (name.endsWith('/') || name.startsWith('__MACOSX/') || basename(name).startsWith('._') || flags & 1 || !keep(name)) continue;
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + csize);
    if (method === 0) out.push({ name, bytes: Buffer.from(raw) });
    else if (method === 8) out.push({ name, bytes: inflateRawSync(raw, { finishFlush: 2 }) });
    // Other methods (bzip2, LZMA) are rare: skipped.
  }
  return out;
}

/** About how long an mp3 is, in seconds, from its first frame (exact for constant bit rates, close for most others). */
export function mp3Duration(buf) {
  let i = 0;
  if (buf.toString('latin1', 0, 3) === 'ID3') i = 10 + ((buf[6] & 0x7f) << 21 | (buf[7] & 0x7f) << 14 | (buf[8] & 0x7f) << 7 | (buf[9] & 0x7f));
  const RATES = { 3: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320], 2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160] };
  const SAMPLE = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };
  for (const end = Math.min(buf.length - 4, i + 65_536); i < end; i++) {
    if (buf[i] !== 0xff || (buf[i + 1] & 0xe0) !== 0xe0) continue;
    const ver = (buf[i + 1] >> 3) & 3, layer = (buf[i + 1] >> 1) & 3;
    const br = (buf[i + 2] >> 4) & 15, sr = (buf[i + 2] >> 2) & 3;
    if (ver === 1 || layer !== 1 || br === 0 || br === 15 || sr === 3) continue;
    const kbps = RATES[ver === 3 ? 3 : 2][br];
    const rate = SAMPLE[ver][sr];
    const perFrame = ver === 3 ? 1152 : 576;
    // A Xing or Info header (variable bit rate) holds the frame count.
    const mono = ((buf[i + 3] >> 6) & 3) === 3;
    const side = ver === 3 ? (mono ? 17 : 32) : (mono ? 9 : 17);
    const x = i + 4 + side;
    const tag = buf.toString('latin1', x, x + 4);
    if ((tag === 'Xing' || tag === 'Info') && buf.readUInt32BE(x + 4) & 1) return Math.round(buf.readUInt32BE(x + 8) * perFrame / rate);
    return Math.round(((buf.length - i) * 8) / (kbps * 1000));
  }
  return null;
}

/** A wav file's length from its header. */
function wavDuration(buf) {
  if (buf.toString('latin1', 0, 4) !== 'RIFF') return null;
  let byteRate = 0;
  for (let i = 12; i + 8 <= buf.length;) {
    const id = buf.toString('latin1', i, i + 4), len = buf.readUInt32LE(i + 4);
    if (id === 'fmt ') byteRate = buf.readUInt32LE(i + 16);
    if (id === 'data' && byteRate) return Math.round(len / byteRate);
    i += 8 + len + (len & 1);
  }
  return null;
}
const durationOf = (name, buf) => (/\.mp3$/i.test(name) ? mp3Duration(buf) : /\.wav$/i.test(name) ? wavDuration(buf) : null);

/** The audio files waiting in the folder, zips opened: [{ name, from, bytes }], read one source at a time. */
function* waiting(dir, log) {
  for (const file of readdirSync(dir).sort()) {
    const path = join(dir, file);
    if (!statSync(path).isFile()) continue;
    if (AUDIO.test(file)) yield { name: file, from: file, bytes: readFileSync(path) };
    else if (/\.zip$/i.test(file)) {
      let entries;
      try { entries = unzipEntries(readFileSync(path), (n) => AUDIO.test(n)); } catch (err) { log(`podBeam: couldn’t open ${file} (${err.message}).`); continue; }
      if (!entries.length) log(`podBeam: ${file} has no audio files in it.`);
      for (const e of entries) yield { name: basename(e.name), from: `${file} → ${e.name}`, bytes: e.bytes };
    }
  }
}

/**
 * Bring the podBeam folder's audio into an org. Returns a short summary
 * line, or '' when there was nothing new.
 */
export function importPodBeam(db, { dir, orgId, dataDir, log = () => {} }) {
  if (!existsSync(dir) || !db.prepare('SELECT 1 FROM orgs WHERE id = ?').get(orgId)) return '';
  const row = db.prepare("SELECT json FROM docs WHERE org_id = ? AND name = 'podcasts'").get(orgId);
  if (!row) return '';
  const doc = JSON.parse(row.json);
  doc.files ??= {};
  const byKey = {};
  for (const e of Object.values(doc.episodes ?? {})) {
    for (const n of [e.audio?.name, e.audio?.url && decodeURIComponent(e.audio.url.split('/').pop())]) if (n) byKey[nameKey(n)] ??= e;
  }
  const mediaDir = join(dataDir, 'media', orgId);
  mkdirSync(mediaDir, { recursive: true });
  const stamp = new Date().toISOString();
  let added = 0, matched = 0, linked = 0;
  for (const f of waiting(dir, log)) {
    const filename = f.name.replace(/[^\w.\- ]+/g, '_').slice(0, 120);
    const known = db.prepare('SELECT id FROM media WHERE org_id = ? AND filename = ? AND size = ?').get(orgId, filename, f.bytes.length);
    let mediaId = known?.id;
    const fresh = !mediaId;
    if (fresh) {
      mediaId = `media_${randomBytes(9).toString('base64url')}`;
      writeFileSync(join(mediaDir, mediaId), f.bytes);
      db.prepare('INSERT INTO media (id, org_id, filename, mimetype, size, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, NULL)').run(mediaId, orgId, filename, mimetypeOf(f.name), f.bytes.length, stamp);
      added++;
    }
    const duration = durationOf(f.name, f.bytes);
    if (!Object.values(doc.files).some((x) => x.mediaId === mediaId)) {
      const id = `aud_${randomBytes(6).toString('base64url')}`;
      doc.files[id] = { id, name: f.name.replace(/\.[a-z0-9]+$/i, ''), mediaId, duration: duration ?? 0, size: f.bytes.length, type: mimetypeOf(f.name), origin: 'import', tags: ['podBeam'], createdAt: stamp, createdBy: null };
    }
    const ep = byKey[nameKey(f.name)];
    if (ep) {
      matched++;
      if (ep.audio?.mediaId !== mediaId) {
        const { url, ...rest } = ep.audio ?? {};
        ep.audio = { ...rest, mediaId, name: f.name, mimetype: mimetypeOf(f.name), size: f.bytes.length, duration: duration ?? rest.duration ?? null, ...(url ? { linkedUrl: url } : {}) };
        linked++;
      }
    } else if (fresh) log(`podBeam: ${f.from} doesn’t match an episode; it’s in Audio files.`);
  }
  // Alpha 0.3 PR 17: the longest podBeam file carries a sample slide show, so the studio's
  // slide track can be seen without making one first.
  const slid = seedSampleSlides(doc, { title: doc.station?.name || 'Social Justice Radio' });
  if (!added && !linked && !slid) return '';
  db.prepare(`UPDATE docs SET json = ?, version = version + 1, updated_at = ?, updated_by = NULL WHERE org_id = ? AND name = 'podcasts'`).run(JSON.stringify(doc), stamp, orgId);
  return `podBeam: ${added} new audio file${added === 1 ? '' : 's'}, ${matched} matched to episodes${linked ? ` (${linked} now play the uploaded file)` : ''}${slid ? ', and a sample slide show on the longest one' : ''}.`;
}
