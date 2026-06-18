// ===================================================================
//  Astro Hodiny — iOS widget pre appku Scriptable
//  Ukazuje aktuálnu tattvu (+ smajlík/kvalita) a planetárnu hodinu.
//  Veľkosť widgetu: zvoľ "Medium" (stredný).
// ===================================================================

const FALLBACK = { lat: 48.3079, lon: 18.0836 }; // Nitra

// ---------- SunCalc (orezaná verzia: východ/západ slnka) ----------
const PI = Math.PI, rad = PI / 180, dayMs = 864e5, J1970 = 2440588, J2000 = 2451545;
const eObl = rad * 23.4397;
const toJulian = d => d.valueOf() / dayMs - 0.5 + J1970;
const fromJulian = j => new Date((j + 0.5 - J1970) * dayMs);
const toDays = d => toJulian(d) - J2000;
const solarMeanAnomaly = d => rad * (357.5291 + 0.98560028 * d);
const eclipticLongitude = M => {
  const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  return M + C + rad * 102.9372 + PI;
};
const declination = (l, b) => Math.asin(Math.sin(b) * Math.cos(eObl) + Math.cos(b) * Math.sin(eObl) * Math.sin(l));
const julianCycle = (d, lw) => Math.round(d - 0.0009 - lw / (2 * PI));
const approxTransit = (Ht, lw, n) => 0.0009 + (Ht + lw) / (2 * PI) + n;
const solarTransitJ = (ds, M, L) => J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
const hourAngle = (h, phi, d) => Math.acos((Math.sin(h) - Math.sin(phi) * Math.sin(d)) / (Math.cos(phi) * Math.cos(d)));
function sunTimes(date, lat, lng) {
  const lw = rad * -lng, phi = rad * lat, d = toDays(date),
        n = julianCycle(d, lw), ds = approxTransit(0, lw, n),
        M = solarMeanAnomaly(ds), L = eclipticLongitude(M), dec = declination(L, 0),
        Jnoon = solarTransitJ(ds, M, L),
        Jset = solarTransitJ(approxTransit(hourAngle(-0.833 * rad, phi, dec), lw, n), M, L),
        Jrise = Jnoon - (Jset - Jnoon);
  return { sunrise: fromJulian(Jrise), sunset: fromJulian(Jset) };
}

// ---------- Dáta ----------
const TATTVAS = [
  { name: "Akasha",   el: "Éter",   mood: "😔", q: "negatívna", c: "#8b8b96" },
  { name: "Vayu",     el: "Vzduch", mood: "😐", q: "neutrálna", c: "#7fafc9" },
  { name: "Tejas",    el: "Oheň",   mood: "😟", q: "negatívna", c: "#d98b73" },
  { name: "Prithivi", el: "Zem",    mood: "🙂", q: "pozitívna", c: "#cdb37a" },
  { name: "Apas",     el: "Voda",   mood: "😁", q: "pozitívna", c: "#8fb8a8" },
];
const CHALDEAN = ["Saturn", "Jupiter", "Mars", "Sun", "Venus", "Mercury", "Moon"];
const RULERS   = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn"]; // nedeľa=0
const PL_SK = { Saturn:"Saturn", Jupiter:"Jupiter", Mars:"Mars", Sun:"Slnko", Venus:"Venuša", Mercury:"Merkúr", Moon:"Mesiac" };
const PL_GL = { Saturn:"♄", Jupiter:"♃", Mars:"♂", Sun:"☉", Venus:"♀", Mercury:"☿", Moon:"☾" };

// ---------- Pomocné ----------
const pad = n => String(n).padStart(2, "0");
const fmt = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const minsLeft = (end, now) => `${Math.max(0, Math.round((end - now) / 60000))} min`;

// Zvolí správny cyklus (rieši aj čas pred východom slnka)
function refDays(now, lat, lon) {
  const today = sunTimes(now, lat, lon);
  if (now < today.sunrise) {
    const y = new Date(now); y.setDate(now.getDate() - 1);
    const yt = sunTimes(y, lat, lon);
    return { sr: yt.sunrise, ss: yt.sunset, srNext: today.sunrise };
  }
  const t = new Date(now); t.setDate(now.getDate() + 1);
  const tt = sunTimes(t, lat, lon);
  return { sr: today.sunrise, ss: today.sunset, srNext: tt.sunrise };
}

function currentTattva(now, sr, srNext) {
  const dur = (srNext - sr) / 60;
  let t = sr.getTime();
  for (let i = 0; i < 60; i++) {
    if (now >= t && now < t + dur) return { ...TATTVAS[i % 5], end: new Date(t + dur) };
    t += dur;
  }
  return null;
}

function currentPlanet(now, sr, ss, srNext) {
  let idx = CHALDEAN.indexOf(RULERS[sr.getDay()]);
  const mk = (p, s, e, type) => ({ planet: p, start: new Date(s), end: new Date(e), type });
  const dl = (ss - sr) / 12; let t = sr.getTime();
  for (let i = 0; i < 12; i++) { if (now >= t && now < t + dl) return mk(CHALDEAN[idx % 7], t, t + dl, "deň"); t += dl; idx++; }
  const nl = (srNext - ss) / 12; t = ss.getTime();
  for (let i = 0; i < 12; i++) { if (now >= t && now < t + nl) return mk(CHALDEAN[idx % 7], t, t + nl, "noc"); t += nl; idx++; }
  return null;
}

async function getLoc() {
  try {
    Location.setAccuracyToThreeKilometers();
    const l = await Location.current();
    return { lat: l.latitude, lon: l.longitude };
  } catch (e) {
    return FALLBACK;
  }
}

// ---------- Widget ----------
async function build() {
  const now = new Date();
  const loc = await getLoc();
  const { sr, ss, srNext } = refDays(now, loc.lat, loc.lon);
  const tt = currentTattva(now, sr, srNext);
  const pl = currentPlanet(now, sr, ss, srNext);

  const w = new ListWidget();
  w.backgroundColor = Color.dynamic(new Color("#f7f5f1"), new Color("#16151a"));
  w.setPadding(15, 17, 15, 17);

  const ink  = Color.dynamic(new Color("#21201d"), new Color("#ece9e3"));
  const soft = Color.dynamic(new Color("#6b6660"), new Color("#a39e96"));

  // hlavička
  const head = w.addStack(); head.centerAlignContent();
  const h = head.addText("ASTRO HODINY"); h.font = Font.mediumSystemFont(9); h.textColor = soft;
  head.addSpacer();
  const c = head.addText(fmt(now)); c.font = Font.mediumSystemFont(10); c.textColor = soft;

  w.addSpacer(9);

  if (tt) {
    const row = w.addStack(); row.centerAlignContent();
    const em = row.addText(tt.mood); em.font = Font.systemFont(36);
    row.addSpacer(11);
    const col = row.addStack(); col.layoutVertically();
    const nm = col.addText(tt.name); nm.font = Font.boldSystemFont(23); nm.textColor = ink;
    const sub = col.addText(`${tt.el} · ${tt.q}`); sub.font = Font.systemFont(11); sub.textColor = soft;

    w.addSpacer(5);
    const rem = w.addText(`zmena o ${fmt(tt.end)} (${minsLeft(tt.end, now)})`);
    rem.font = Font.systemFont(10); rem.textColor = soft;
  } else {
    const nm = w.addText("—"); nm.font = Font.boldSystemFont(22); nm.textColor = ink;
  }

  w.addSpacer();

  if (pl) {
    const pr = w.addStack(); pr.centerAlignContent();
    const g = pr.addText(PL_GL[pl.planet]); g.font = Font.systemFont(16); g.textColor = soft;
    pr.addSpacer(6);
    const pn = pr.addText(PL_SK[pl.planet]); pn.font = Font.semiboldSystemFont(13); pn.textColor = ink;
    pr.addSpacer();
    const pt = pr.addText(`${fmt(pl.start)}–${fmt(pl.end)}`); pt.font = Font.systemFont(11); pt.textColor = soft;
  }

  // nech sa iOS pokúsi obnoviť widget po skončení tejto tattvy (max ~15 min)
  const next = tt ? tt.end.getTime() : Date.now() + 15 * 60000;
  w.refreshAfterDate = new Date(Math.min(next, Date.now() + 15 * 60000));
  return w;
}

const widget = await build();
if (config.runsInWidget) Script.setWidget(widget);
else await widget.presentMedium();
Script.complete();
