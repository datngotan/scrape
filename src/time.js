function isValidDateTime(y, mo, d, h, mi, s) {
  if (y < 2000 || y > 2100) return false;
  if (mo < 1 || mo > 12) return false;
  if (d < 1 || d > 31) return false;
  if (h < 0 || h > 23) return false;
  if (mi < 0 || mi > 59) return false;
  if (s < 0 || s > 59) return false;
  return true;
}

const pad2 = (n) => String(n).padStart(2, "0");

function toIsoWithOffset(y, mo, d, h, mi, s, offset) {
  return `${y}-${pad2(mo)}-${pad2(d)}T${pad2(h)}:${pad2(mi)}:${pad2(s)}${offset}`;
}

export function parseVnToIso(text) {
  const t = String(text || "").trim();

  let m = t.match(
    /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s+(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
  );
  if (m) {
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    const ss = Number(m[3] ?? "0");
    const dd = Number(m[4]);
    const mo = Number(m[5]);
    const yyyy = Number(m[6]);
    if (!isValidDateTime(yyyy, mo, dd, hh, mm, ss)) return null;
    return toIsoWithOffset(yyyy, mo, dd, hh, mm, ss, "+07:00");
  }

  m = t.match(/^(\d{2}):(\d{2}):(\d{2}),\s*(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) {
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    const ss = Number(m[3]);
    const dd = Number(m[4]);
    const mo = Number(m[5]);
    const yyyy = Number(m[6]);
    if (!isValidDateTime(yyyy, mo, dd, hh, mm, ss)) return null;
    return toIsoWithOffset(yyyy, mo, dd, hh, mm, ss, "+07:00");
  }

  m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (m) {
    const dd = Number(m[1]);
    const mo = Number(m[2]);
    const yyyy = Number(m[3]);
    const hh = Number(m[4]);
    const mm = Number(m[5]);
    const ss = Number(m[6]);
    if (!isValidDateTime(yyyy, mo, dd, hh, mm, ss)) return null;
    return toIsoWithOffset(yyyy, mo, dd, hh, mm, ss, "+07:00");
  }

  return null;
}
