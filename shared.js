/* Shared logic: used by the service worker (importScripts) and the popup (<script>). */

/* ---------- Functions injected into web pages (must be self-contained) ---------- */

function tmFillForm(args) {
  const { email, identity: id, fillIdentity, fillPassword } = args;
  const SKIP = ['hidden', 'submit', 'button', 'checkbox', 'image', 'reset', 'range', 'color', 'file'];
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  const collect = (root, out) => {
    root.querySelectorAll('input,textarea,select').forEach(e => out.push(e));
    root.querySelectorAll('*').forEach(e => { if (e.shadowRoot) collect(e.shadowRoot, out); });
    return out;
  };
  const visible = el => {
    if (!el.getClientRects().length) return false;
    const s = getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none';
  };
  const labelText = el => {
    let t = '';
    try { if (el.labels) t += [...el.labels].map(l => l.textContent).join(' '); } catch (_) {}
    const ll = el.getAttribute('aria-labelledby');
    if (ll) {
      const root = el.getRootNode();
      t += ' ' + ll.split(/\s+/).map(i => {
        const n = root.getElementById ? root.getElementById(i) : null;
        return n ? n.textContent : '';
      }).join(' ');
    }
    return t;
  };
  const clean = s => String(s || '').toLowerCase().replace(/[_\-.\[\]]+/g, ' ');
  const metaOf = el => clean([el.name, el.id, el.placeholder, el.getAttribute('aria-label'),
    el.getAttribute('data-testid'), labelText(el), el.getAttribute('autocomplete')].filter(Boolean).join(' '));
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  const radioKind = el => {
    const grp = el.closest('fieldset,[role=radiogroup]');
    const g = clean([el.name, el.id, el.getAttribute('aria-label'), grp ? grp.textContent.slice(0, 60) : ''].join(' '));
    return /gender|\bsex\b/.test(g) ? 'gender-radio' : null;
  };

  const kindOf = el => {
    const tag = el.tagName, type = (el.type || 'text').toLowerCase();
    if (type === 'radio') return radioKind(el);
    if (SKIP.includes(type)) return null;
    if (type === 'password') return 'password';
    if (type === 'email') return 'email';
    const m = metaOf(el);
    const ac = (el.getAttribute('autocomplete') || '').toLowerCase();
    if (/e ?mail/.test(m)) return 'email';
    if (type === 'tel' || /phone|mobile|\btel\b|\bcell\b|contact (no|num)/.test(m)) return tag === 'SELECT' ? null : 'phone';
    if (/birth|\bdob\b/.test(m)) {
      if (type === 'date') return 'dob';
      if (/(dd|mm|yyyy).*(dd|mm|yyyy)/.test((el.placeholder || '').toLowerCase())) return 'dobtext';
      if (/year|yyyy|\byy\b/.test(m)) return 'byear';
      if (/month|\bmm\b/.test(m)) return 'bmonth';
      if (/\bday\b|\bdd\b/.test(m)) return 'bday';
      return 'dobtext';
    }
    if (/\bzip\b|postal|post ?code|pin ?code|pincode/.test(m) || ac === 'postal-code') return 'zip';
    if (/\bcity\b|\btown\b|locality/.test(m) || ac === 'address-level2') return 'city';
    if (/country/.test(m)) return 'country';
    if (/\bstate\b|province|region|county/.test(m) || ac === 'address-level1') return 'state';
    if (/company|employer|organiz|organisation|place of work|workplace|\bbusiness\b|\bfirm\b/.test(m)) return 'company';
    if (/\bage\b/.test(m)) return 'age';
    if (/gender|\bsex\b/.test(m)) return 'gender';
    if (/address|street|\baddr\b/.test(m) || ac === 'address-line1' || ac === 'street-address') {
      return /line ?2|address ?2|\bapt\b|suite|\bunit\b|\bflat\b/.test(m) ? null : 'street';
    }
    if (/given name|first ?name|fname|forename/.test(m)) return 'first';
    if (/family name|last ?name|lname|surname/.test(m)) return 'last';
    if (ac === 'username' || /user ?name|login|handle|nick|screen ?name/.test(m)) return 'username';
    if (/full ?name|your name|\bname\b/.test(m) && !/company|business|organi|card|domain|display|team|project/.test(m)) return 'full';
    return null;
  };

  const flash = el => {
    const old = el.style.boxShadow;
    el.style.boxShadow = '0 0 0 2px #22c55e';
    setTimeout(() => { el.style.boxShadow = old; }, 1400);
  };
  const fire = el => {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const setVal = (el, v) => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const d = Object.getOwnPropertyDescriptor(proto, 'value');
    el.focus();
    if (d && d.set) d.set.call(el, v); else el.value = v;
    fire(el);
    el.dispatchEvent(new Event('blur', { bubbles: true }));
    flash(el);
  };
  const pickOption = (sel, cands) => {
    const opts = [...sel.options];
    const cs = cands.map(norm).filter(Boolean);
    for (const c of cs) { const o = opts.find(o => norm(o.value) === c || norm(o.text) === c); if (o) return o; }
    for (const c of cs) {
      if (!/^\d+$/.test(c)) continue;
      const o = opts.find(o => /^\d+$/.test(norm(o.value)) && +norm(o.value) === +c);
      if (o) return o;
    }
    for (const c of cs) {
      if (c.length < 4) continue;
      const o = opts.find(o => norm(o.text).startsWith(c));
      if (o) return o;
    }
    return null;
  };
  const two = n => String(n).padStart(2, '0');
  const dobText = el => {
    const ph = (el.placeholder || '').toLowerCase();
    const sep = (ph.match(/[\/\-.]/) || ['-'])[0];
    if (/mm.?dd/.test(ph)) return [two(id.dobM), two(id.dobD), id.dobY].join(sep);
    if (/dd.?mm/.test(ph)) return [two(id.dobD), two(id.dobM), id.dobY].join(sep);
    return `${id.dobY}-${two(id.dobM)}-${two(id.dobD)}`;
  };
  const genderLabel = id.gender === 'female' ? 'Female' : 'Male';

  let count = 0;
  for (const el of collect(document, [])) {
    if (el.disabled || el.readOnly || !visible(el)) continue;
    const k = kindOf(el);
    if (!k) continue;

    if (k === 'email') { setVal(el, email); count++; continue; }
    if (k === 'password') { if (fillPassword) { setVal(el, id.password); count++; } continue; }
    if (!fillIdentity) continue;

    if (k === 'gender-radio') {
      const t = (labelText(el) + ' ' + el.value + ' ' + (el.getAttribute('aria-label') || '')).toLowerCase();
      const female = /\b(female|woman|f)\b/.test(t), male = !female && /\b(male|man|m)\b/.test(t);
      if ((id.gender === 'female' && female) || (id.gender === 'male' && male)) {
        if (!el.checked) { el.click(); flash(el); count++; }
      }
      continue;
    }

    if (el.tagName === 'SELECT') {
      if (el.selectedIndex > 0 && el.value) continue;
      const cands = {
        country: [id.country, id.countryCode, ...(id.countryAliases || [])],
        state: [id.state, id.stateAbbr],
        gender: [genderLabel, id.gender === 'female' ? 'F' : 'M'],
        bmonth: [id.dobM, MONTHS[id.dobM - 1], MONTHS[id.dobM - 1].slice(0, 3)],
        bday: [id.dobD],
        byear: [id.dobY],
        age: [id.age]
      }[k];
      if (!cands) continue;
      const o = pickOption(el, cands);
      if (o) { el.value = o.value; fire(el); flash(el); count++; }
      continue;
    }

    if (el.value) continue;
    const intl = /^\+/.test(el.placeholder || '') || el.maxLength >= 13;
    const v = {
      first: id.first, last: id.last, username: id.username, full: id.full,
      company: id.company,
      phone: intl ? id.phoneIntl : id.phone,
      zip: id.zip, city: id.city, state: id.state, country: id.country,
      age: String(id.age), gender: genderLabel, street: id.street,
      dob: `${id.dobY}-${two(id.dobM)}-${two(id.dobD)}`, dobtext: dobText(el),
      byear: String(id.dobY), bmonth: two(id.dobM), bday: two(id.dobD)
    }[k];
    if (v) { setVal(el, v); count++; }
  }
  return count;
}

function tmFillFocused(args) {
  let a = document.activeElement;
  while (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement;
  if (!a) return 0;
  const value = args.value;
  if (a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement) {
    const proto = a instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const d = Object.getOwnPropertyDescriptor(proto, 'value');
    if (d && d.set) d.set.call(a, value); else a.value = value;
    a.dispatchEvent(new Event('input', { bubbles: true }));
    a.dispatchEvent(new Event('change', { bubbles: true }));
    return 1;
  }
  if (a.isContentEditable) { document.execCommand('insertText', false, value); return 1; }
  return 0;
}

/* ---------- Main namespace ---------- */

const TM = (() => {
  const API = 'https://temp.tf/api';
  const store = chrome.storage.local;

  const DEFAULTS = {
    dot: true,
    plus: true,
    providers: { catchmail: true, gmail: true, outlook: false, hotmail: false, edu: false },
    provider: 'catchmail', // active provider: catchmail | temptf
    catchmailDomain: 'catchmail.io',
    eduToken: 'edu',
    showIcon: true,
    notify: true,
    fillIdentity: true,
    fillPassword: true,
    pollMinutes: 0.0833,
    country: 'US',
    gender: 'any',
    minAge: 22,
    maxAge: 45
  };

  const rnd = n => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; };
  const pick = arr => arr[rnd(arr.length)];

  function genPassword(len = 16) {
    const sets = ['abcdefghijkmnopqrstuvwxyz', 'ABCDEFGHJKLMNPQRSTUVWXYZ', '23456789', '!@#$%^&*-_+='];
    const all = sets.join('');
    const chars = sets.map(s => pick([...s]));
    while (chars.length < len) chars.push(pick([...all]));
    for (let i = chars.length - 1; i > 0; i--) { const j = rnd(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
    return chars.join('');
  }

  const NAMES = {
    male: ['James','Liam','Noah','Lucas','Ethan','Mason','Logan','Elijah','Oliver','Aiden','Jacob','Henry','Owen','Caleb','Ryan'],
    female: ['Mary','Olivia','Emma','Ava','Mia','Sophia','Amelia','Harper','Evelyn','Ella','Chloe','Grace','Lily','Zoe','Nora']
  };
  const LAST = ['Smith','Johnson','Brown','Taylor','Miller','Wilson','Moore','Clark','Walker','Hall','Allen','Young','King','Wright','Scott','Green','Baker','Adams','Nelson','Hill','Carter','Mitchell','Roberts','Turner','Parker','Evans'];

  const digits = n => Array.from({ length: n }, () => rnd(10)).join('');
  const range = (lo, hi) => lo + rnd(hi - lo + 1);
  const LET = 'ABCDEFGHJKLMNPRSTUVWXY';
  const letter = () => LET[rnd(LET.length)];
  const num = () => 1 + rnd(240);

  // city entry: [city, state, abbr, a, b, c]  (a/b = zip range or prefix data, c = area code)
  const COUNTRIES = {
    US: {
      name: 'United States', aliases: ['USA', 'United States of America'], dial: '1',
      cities: [['New York','New York','NY',10001,10282,'212'],['Los Angeles','California','CA',90001,90089,'213'],
               ['Chicago','Illinois','IL',60601,60661,'312'],['Houston','Texas','TX',77001,77099,'713'],
               ['Phoenix','Arizona','AZ',85001,85055,'602'],['Seattle','Washington','WA',98101,98199,'206'],
               ['Denver','Colorado','CO',80202,80299,'303'],['Miami','Florida','FL',33101,33199,'305']],
      zip: c => String(range(c[3], c[4])),
      phone: c => { const n = c[5] + '555' + '01' + digits(2); return [n, '+1' + n]; }, // 555-01xx = reserved fictional range
      street: () => `${num()} ${pick(['Maple','Oak','Cedar','Pine','Elm','Washington','Lake','Hill','Sunset','Park'])} ${pick(['St','Ave','Blvd','Rd','Ln'])}`
    },
    IN: {
      name: 'India', aliases: ['Bharat'], dial: '91',
      names: { male: ['Aarav','Vivaan','Arjun','Rohan','Aditya','Karan','Rahul','Vikram'], female: ['Ananya','Diya','Priya','Isha','Kavya','Neha','Pooja','Riya'] },
      last: ['Sharma','Verma','Singh','Gupta','Mehta','Iyer','Reddy','Khan','Patel','Mishra'],
      cities: [['Mumbai','Maharashtra','MH',400001,400104],['New Delhi','Delhi','DL',110001,110096],
               ['Bengaluru','Karnataka','KA',560001,560100],['Lucknow','Uttar Pradesh','UP',226001,226030],
               ['Hyderabad','Telangana','TG',500001,500100],['Chennai','Tamil Nadu','TN',600001,600100],
               ['Kolkata','West Bengal','WB',700001,700100],['Pune','Maharashtra','MH',411001,411060]],
      zip: c => String(range(c[3], c[4])),
      phone: () => { const n = pick(['6','7','8','9']) + digits(9); return [n, '+91' + n]; },
      street: () => `${num()}, ${pick(['MG Road','Gandhi Nagar','Nehru Street','Station Road','Civil Lines','Park Avenue','Lake View Colony'])}`
    },
    GB: {
      name: 'United Kingdom', aliases: ['UK', 'Great Britain', 'England'], dial: '44',
      cities: [['London','England','ENG','SW'],['Manchester','England','ENG','M'],['Birmingham','England','ENG','B'],
               ['Leeds','England','ENG','LS'],['Glasgow','Scotland','SCT','G'],['Bristol','England','ENG','BS']],
      zip: c => `${c[3]}${1 + rnd(9)} ${1 + rnd(9)}${letter()}${letter()}`,
      phone: () => { const n = '7' + digits(9); return ['0' + n, '+44' + n]; },
      street: () => `${num()} ${pick(['High Street','Station Road','Church Lane','Victoria Road','Park Road','Mill Lane'])}`
    },
    CA: {
      name: 'Canada', aliases: [], dial: '1',
      cities: [['Toronto','Ontario','ON','M','416'],['Vancouver','British Columbia','BC','V','604'],['Calgary','Alberta','AB','T','403'],
               ['Montreal','Quebec','QC','H','514'],['Ottawa','Ontario','ON','K','613']],
      zip: c => `${c[3]}${1 + rnd(9)}${letter()} ${1 + rnd(9)}${letter()}${rnd(10)}`,
      phone: c => { const n = c[4] + '555' + '01' + digits(2); return [n, '+1' + n]; },
      street: () => `${num()} ${pick(['Maple Ave','King St','Queen St','Yonge St','Elm Dr','Lakeshore Rd'])}`
    },
    AU: {
      name: 'Australia', aliases: [], dial: '61',
      cities: [['Sydney','New South Wales','NSW',2000,2234],['Melbourne','Victoria','VIC',3000,3207],
               ['Brisbane','Queensland','QLD',4000,4179],['Perth','Western Australia','WA',6000,6180]],
      zip: c => String(range(c[3], c[4])),
      phone: () => { const n = '4' + digits(8); return ['0' + n, '+61' + n]; },
      street: () => `${num()} ${pick(['George St','Collins St','Queen St','Hay St','Ocean Rd','Park Ave'])}`
    },
    DE: {
      name: 'Germany', aliases: ['Deutschland'], dial: '49',
      names: { male: ['Lukas','Felix','Jonas','Leon','Paul','Max'], female: ['Anna','Lena','Marie','Sophie','Hannah','Laura'] },
      last: ['Müller','Schmidt','Schneider','Fischer','Weber','Meyer','Wagner','Becker'],
      cities: [['Berlin','Berlin','BE',10115,10999],['Munich','Bavaria','BY',80331,81929],
               ['Hamburg','Hamburg','HH',20095,22769],['Cologne','North Rhine-Westphalia','NW',50667,51149]],
      zip: c => String(range(c[3], c[4])),
      phone: () => { const n = '151' + digits(8); return ['0' + n, '+49' + n]; },
      street: () => `${pick(['Haupt','Bahnhof','Schiller','Goethe','Garten','Linden'])}straße ${num()}`
    }
  };

  const ascii = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ß/g, 'ss').toLowerCase().replace(/[^a-z]/g, '');

  // fake company names — plausible, all fictional; legal suffix varies by country
  const COMPANY_BASE = ['Nimbus', 'Vertex', 'Quantum', 'Silverline', 'NorthPeak', 'BlueRiver', 'Solaris',
    'Ironwood', 'Cobalt', 'Lumen', 'Harborview', 'Redstone', 'Everline', 'Clearwater', 'Summit',
    'Anchor', 'Beacon', 'Kestrel', 'Marigold', 'Fablestone'];
  const COMPANY_SUFFIX = {
    US: ['Inc', 'LLC', 'Corp'],
    GB: ['Ltd', 'Group'],
    CA: ['Inc', 'Ltd'],
    AU: ['Pty Ltd', 'Group'],
    IN: ['Pvt Ltd', 'Industries'],
    DE: ['GmbH', 'AG']
  };
  const makeCompany = cc => `${pick(COMPANY_BASE)} ${pick(COMPANY_SUFFIX[cc] || ['Group'])}`;

  function makeIdentity(s = {}) {
    const ck = s.country && COUNTRIES[s.country] ? s.country : pick(Object.keys(COUNTRIES));
    const C = COUNTRIES[ck];
    const gender = s.gender === 'male' || s.gender === 'female' ? s.gender : pick(['male', 'female']);
    const first = pick((C.names && C.names[gender]) || NAMES[gender]);
    const last = pick(C.last || LAST);

    const minA = Math.max(13, Math.min(100, parseInt(s.minAge) || 22));
    const maxA = Math.max(minA, Math.min(100, parseInt(s.maxAge) || 45));
    const age = minA + rnd(maxA - minA + 1);
    const now = new Date(), dobM = 1 + rnd(12), dobD = 1 + rnd(28);
    let dobY = now.getFullYear() - age;
    if (dobM > now.getMonth() + 1 || (dobM === now.getMonth() + 1 && dobD > now.getDate())) dobY--;

    const c = pick(C.cities);
    const [phone, phoneIntl] = C.phone(c);
    return {
      gender, first, last, full: `${first} ${last}`,
      username: ascii(first + last) + (10 + rnd(990)),
      password: genPassword(),
      company: makeCompany(ck),
      age, dobY, dobM, dobD,
      phone, phoneIntl, dial: C.dial,
      street: C.street(), city: c[0], state: c[1], stateAbbr: c[2], zip: C.zip(c),
      country: C.name, countryCode: ck, countryAliases: C.aliases
    };
  }

  /* ----- settings ----- */
  let settingsCache = null; // avoids a storage read on every poll / call
  try { chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local' && ch.settings) settingsCache = null; }); } catch (_) {}
  async function getSettings() {
    if (!settingsCache) {
      const { settings } = await store.get('settings');
      settingsCache = { ...DEFAULTS, ...(settings || {}), providers: { ...DEFAULTS.providers, ...((settings && settings.providers) || {}) } };
    }
    return { ...settingsCache, providers: { ...settingsCache.providers } };
  }
  const saveSettings = async s => { await store.set({ settings: s }); settingsCache = null; };

  /* ----- pause ----- */
  let pausedCache = null;
  try { chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local' && ch.paused) pausedCache = !!ch.paused.newValue; }); } catch (_) {}
  async function isPaused() {
    if (pausedCache === null) pausedCache = !!(await store.get('paused')).paused;
    return pausedCache;
  }
  async function setPaused(v) {
    pausedCache = !!v;
    await store.set({ paused: !!v });
  }

  /* ----- API ----- */
  async function apiFetch(path, opts = {}) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    try {
      const r = await fetch(API + path, { ...opts, signal: ctrl.signal });
      if (!r.ok) {
        let msg = '';
        try { msg = (await r.json()).error; } catch (_) {}
        if (r.status === 429) msg = `Rate limited — retry in ${r.headers.get('Retry-After') || '60'}s`;
        const e = new Error(msg || `HTTP ${r.status}`);
        e.status = r.status;
        throw e;
      }
      return r;
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('Request timed out');
      throw e;
    } finally { clearTimeout(t); }
  }

  // The docs only list gmail/outlook/hotmail; the website also offers high.edu.pl, whose API name is undocumented.
  const EDU_TOKENS = ['edu', 'high.edu.pl'];
  const isEduAddr = e => /edu\.pl$/i.test(e || '');

  function accountQuery(s, eduToken) {
    if (!s.dot && !s.plus) throw new Error('Enable dot and/or plus aliases in Settings');
    let provs = ['gmail', 'outlook', 'hotmail', 'edu'].filter(k => s.providers[k]);
    if (!provs.length) throw new Error('Select at least one provider in Settings');
    let dot = s.dot, plus = s.plus;
    if (dot && !plus) { // API rule: dot-only is Gmail-only
      if (provs.includes('gmail')) provs = ['gmail'];
      else if (provs.length === 1 && provs[0] === 'edu') plus = true;
      else throw new Error('Dot-only aliases require Gmail');
    }
    const p = new URLSearchParams();
    if (dot) p.set('dot', '1');
    if (plus) p.set('plus', '1');
    if (provs.length < 4) p.set('providers', provs.map(k => (k === 'edu' ? eduToken : k)).join(','));
    return p.toString();
  }

  // Catchmail (catchmail.io): open API, any address works on catchmail.io or a
  // custom domain (MX -> smtp.catchmail.io). Mailboxes are create-only — there's
  // no endpoint to list an existing random address, so we generate a persistent
  // local address (saved to storage = stays constant until Change).
  const CM_API = 'https://api.catchmail.io/api/v1';
  const CM_DOMAINS = ['catchmail.io', 'mailistry.com', 'zeppost.com']; // public Catchmail domains
  const CM_DOMAIN_DEFAULT = CM_DOMAINS[0];
  // Catchmail allows 1 request/second/IP: serialise every call with a minimum gap
  // instead of firing bursts that get 429'd.
  let cmLast = 0, cmChain = Promise.resolve();
  const cmGate = fn => {
    const run = cmChain.then(async () => {
      const wait = cmLast + 1050 - Date.now();
      if (wait > 0) await new Promise(r => setTimeout(r, wait));
      cmLast = Date.now();
      return fn();
    });
    cmChain = run.catch(() => {});
    return run;
  };
  const cmApiFetch = (path, opts = {}) => cmGate(() => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    return fetch(CM_API + path, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(t));
  });
  const cmRandom = () => 'mx' + Array.from({ length: 10 }, () => 'abcdefghjkmnpqrstuvwxyz23456789'[rnd(31)]).join('') + Date.now().toString(36).slice(-4);

  async function requestAccount(s) {
    const active = s.provider === 'catchmail' ? 'catchmail' : 'temptf';
    if (active === 'catchmail') {
      const dom = (s.catchmailDomain || CM_DOMAIN_DEFAULT).trim().toLowerCase();
      if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(dom)) throw new Error('Invalid catchmail domain');
      return cmRandom() + '@' + dom;
    }
    return requestTemptf(s);
  }

  async function requestTemptf(s) {
    const wantsEdu = !!s.providers.edu;
    const onlyEdu = wantsEdu && !s.providers.gmail && !s.providers.outlook && !s.providers.hotmail;
    const tokens = wantsEdu ? [...new Set([s.eduToken, ...EDU_TOKENS].filter(Boolean))] : [null];
    let lastErr = null;
    for (const tok of tokens) {
      const q = accountQuery(s, tok); // throws config errors immediately
      try {
        const j = await (await apiFetch('/account?' + q)).json();
        if (!j.email) throw new Error('No address returned by temp.tf');
        if (onlyEdu && !isEduAddr(j.email)) { lastErr = new Error('temp.tf returned a non-edu address'); continue; }
        if (wantsEdu && tok && isEduAddr(j.email) && s.eduToken !== tok) { s.eduToken = tok; await saveSettings(s); }
        return j.email;
      } catch (e) {
        if (e.status === 400 || e.status === 404) { lastErr = e; continue; }
        throw e;
      }
    }
    throw new Error("Couldn't get a high.edu.pl address — the public API may not expose it yet (docs list only Gmail, Outlook, Hotmail). Untick it in Settings to continue." +
      (lastErr && lastErr.message ? ` [${lastErr.message}]` : ''));
  }

  /* ----- state ----- */
  async function prune() {
    const { current, history = [], seen = {}, notified = {} } = await store.get(['current', 'history', 'seen', 'notified']);
    if (history.length > 5) { history.length = 5; await store.set({ history }); }
    const keep = new Set([current && current.email, ...history.map(h => h.email)].filter(Boolean));
    for (const m of [seen, notified]) for (const k of Object.keys(m)) if (!keep.has(k)) delete m[k];
    await store.set({ seen, notified });
  }

  let pending = null;
  function newEmail() {
    if (pending) return pending;
    pending = (async () => {
      const s = await getSettings();
      const email = await requestAccount(s);
      const { current, history = [] } = await store.get(['current', 'history']);
      const cur = { email, createdAt: Date.now(), identity: makeIdentity(s) };
      let h = history.filter(x => x.email !== email);
      if (current) h = [current, ...h.filter(x => x.email !== current.email)];
      await store.set({ current: cur, history: h.slice(0, 5) });
      await chrome.storage.session.set({ inbox: null, inboxMeta: null });
      setBadge(0);
      await prune();
      return cur;
    })().finally(() => { pending = null; });
    return pending;
  }

  async function ensureEmail() {
    const { current } = await store.get('current');
    if (!current) return newEmail();
    if (!current.identity || !current.identity.street) { // upgrade identities saved by older versions
      const old = current.identity || {};
      current.identity = { ...makeIdentity(await getSettings()), ...(old.username ? { username: old.username } : {}), ...(old.password ? { password: old.password } : {}) };
      await store.set({ current });
    }
    return current;
  }

  async function useAddress(email) {
    const { current, history = [] } = await store.get(['current', 'history']);
    const entry = history.find(x => x.email === email);
    if (!entry) return null;
    const h = [current, ...history.filter(x => x.email !== email)].filter(Boolean).slice(0, 5);
    await store.set({ current: entry, history: h });
    await chrome.storage.session.set({ inbox: null, inboxMeta: null });
    return entry;
  }

  async function regenIdentity() {
    const { current } = await store.get('current');
    if (!current) return null;
    current.identity = makeIdentity(await getSettings());
    await store.set({ current });
    return current;
  }

  /* ----- inbox ----- */
  function setBadge(n) {
    chrome.action.setBadgeText({ text: n > 0 ? String(n > 99 ? '99+' : n) : '' });
    chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
  }

  function notifyMsg(m) {
    chrome.notifications.create('tm-' + m.id + '-' + Date.now(), {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'New mail — ' + String(m.from || 'unknown').slice(0, 60),
      message: m.subject || '(no subject)',
      priority: 1
    });
  }

  const isTempTfAddr = e => /@(gmail|outlook|hotmail)\.com$/i.test(e || '') || /@[\w.-]*edu\.pl$/i.test(e || '');
  const byNewest = (a, b) => new Date(b.date) - new Date(a.date);

  async function cmFetchDetail(email, id) {
    const r = await cmApiFetch('/message/' + encodeURIComponent(id) + '?mailbox=' + encodeURIComponent(email));
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    return {
      from: d.from, subject: d.subject, date: d.date,
      body: (d.body && (d.body.html || d.body.text)) || '',
      bodyContentType: d.body && d.body.html ? 'html' : 'text',
      attachments: (d.attachments || []).map(a => ({ id: a.id, name: a.filename, contentType: a.content_type, size: a.size, downloadUrl: a.download_url })),
      inlineCids: {}
    };
  }
  // Full body for a message that the list only returned metadata for (used by the popup on open)
  async function loadMessage(email, id) {
    return isTempTfAddr(email) ? null : cmFetchDetail(email, id);
  }

  const MIN_GAP_MS = 1500;   // popup + service worker + alarm share one result inside this window
  const DETAIL_BATCH = 3;    // new Catchmail bodies fetched per poll (newest first); the rest fill in on later polls
  let inflight = null;
  function refreshInbox(opts = {}) {
    if (!inflight) {
      inflight = (async () => {
        if (!opts.force && await isPaused()) return null; // paused: only an explicit (forced) refresh goes through
        return doRefresh(opts);
      })().finally(() => { inflight = null; });
    }
    return inflight;
  }

  async function doRefresh({ notify = false, force = false } = {}) {
    const cur = await ensureEmail();
    const ss = chrome.storage.session;
    const { inbox: prev, inboxMeta: meta } = await ss.get(['inbox', 'inboxMeta']);
    const prevOk = !!(prev && prev.email === cur.email);
    if (!force && prevOk && meta && meta.email === cur.email && !meta.error && Date.now() - meta.fetchedAt < MIN_GAP_MS) {
      return { messages: prev.messages, unread: null };
    }

    let list;
    try {
      if (isTempTfAddr(cur.email)) {
        const r = await apiFetch('/check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: cur.email })
        });
        list = ((await r.json()).data || []).map(m => ({ ...m, id: String(m.id) }));
      } else {
        const r = await cmApiFetch('/mailbox?address=' + encodeURIComponent(cur.email) + '&page_size=50');
        if (!r.ok) {
          let msg = '';
          try { msg = (await r.json()).error.message; } catch (_) {}
          throw new Error(msg || `HTTP ${r.status}`);
        }
        const old = new Map(prevOk ? prev.messages.map(m => [m.id, m]) : []);
        list = ((await r.json()).messages || []).map(m => {
          const id = String(m.id), o = old.get(id);
          if (o && !o.partial) return o; // already have the full message: no request
          return { id, from: m.from, subject: m.subject, date: m.date, body: '', bodyContentType: 'text', attachments: [], inlineCids: {}, partial: true };
        }).sort(byNewest);
        let budget = DETAIL_BATCH;
        for (const m of list) {
          if (!m.partial) continue;
          if (budget-- <= 0) break;
          try { Object.assign(m, await cmFetchDetail(cur.email, m.id), { partial: false }); }
          catch (e) { if (/429/.test(e.message)) break; }
        }
      }
    } catch (e) {
      await ss.set({ inboxMeta: { email: cur.email, fetchedAt: Date.now(), error: e.message } });
      throw e;
    }

    const messages = list.sort(byNewest);
    const { current } = await store.get('current');
    if (!current || current.email !== cur.email) return null; // address changed meanwhile

    const sig = messages.map(m => m.id + (m.partial ? 'p' : '')).join(',');
    const changed = !prevOk || prev.sig !== sig;
    // Small meta record every poll; the (potentially large) inbox only when something changed.
    if (changed) await ss.set({ inbox: { email: cur.email, messages, sig }, inboxMeta: { email: cur.email, fetchedAt: Date.now(), error: null } });
    else await ss.set({ inboxMeta: { email: cur.email, fetchedAt: Date.now(), error: null } });
    if (!changed) return { messages: prev.messages, unread: null };

    const { seen = {}, notified = {} } = await store.get(['seen', 'notified']);
    const seenIds = new Set(seen[cur.email] || []);
    const notIds = new Set(notified[cur.email] || []);
    const unread = messages.filter(m => !seenIds.has(m.id));
    const fresh = unread.filter(m => !notIds.has(m.id));
    if (fresh.length) {
      lastActivity = Date.now();
      if (IS_SW && !fastTimer) armFastLoop();
      if (notify && (await getSettings()).notify) fresh.slice(0, 3).forEach(notifyMsg);
      notified[cur.email] = [...notIds, ...fresh.map(m => m.id)];
      await store.set({ notified });
    }
    setBadge(unread.length);
    return { messages, unread: unread.length };
  }

  async function getSeen() {
    const { current, seen = {} } = await store.get(['current', 'seen']);
    return new Set((current && seen[current.email]) || []);
  }

  async function markRead(ids) {
    const { current, seen = {} } = await store.get(['current', 'seen']);
    if (!current) return;
    const set = new Set(seen[current.email] || []);
    ids.forEach(i => set.add(i));
    seen[current.email] = [...set];
    await store.set({ seen });
    const { inbox } = await chrome.storage.session.get('inbox');
    setBadge(inbox && inbox.email === current.email ? inbox.messages.filter(m => !set.has(m.id)).length : 0);
  }

  const attachmentUrl = (email, messageId, attachmentId) =>
    `${API}/attachment?email=${encodeURIComponent(email)}&messageId=${encodeURIComponent(messageId)}&attachmentId=${encodeURIComponent(attachmentId)}`;

  async function fetchAttachment(email, messageId, attachmentId) {
    // catchmail messages carry a relative download_url on the catchmail API
    const isCm = !/@(gmail|outlook|hotmail)\.com$/i.test(email) && !/@[\w.-]*edu\.pl$/i.test(email);
    if (isCm) {
      const r = await cmApiFetch(`/attachment/${encodeURIComponent(messageId)}/${encodeURIComponent(attachmentId)}?mailbox=${encodeURIComponent(email)}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.blob();
    }
    const r = await apiFetch(attachmentUrl(email, messageId, attachmentId).slice(API.length));
    return r.blob();
  }

  /* ----- page actions ----- */
  async function inject(tabId, func, args) {
    try {
      return await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, func, args: [args] });
    } catch (_) {
      return await chrome.scripting.executeScript({ target: { tabId }, func, args: [args] });
    }
  }

  async function autofill(tabId) {
    const cur = await ensureEmail();
    const s = await getSettings();
    const res = await inject(tabId, tmFillForm, {
      email: cur.email, identity: cur.identity,
      fillIdentity: s.fillIdentity, fillPassword: s.fillPassword
    });
    return res.reduce((n, r) => n + ((r && r.result) || 0), 0);
  }

  async function fillFocused(tabId, frameId, value) {
    const target = frameId ? { tabId, frameIds: [frameId] } : { tabId };
    const res = await chrome.scripting.executeScript({ target, func: tmFillFocused, args: [{ value }] });
    return res.reduce((n, r) => n + ((r && r.result) || 0), 0);
  }

  async function setupAlarm() {
    if (await isPaused()) { await chrome.alarms.clear('poll'); stopFastLoop(); return; }
    const s = await getSettings();
    const mins = Math.max(0.05, s.pollMinutes || 0.5);
    // Chrome clamps alarm periods below 30s — sub-30s settings also arm a fast in-SW loop
    await chrome.alarms.create('poll', { delayInMinutes: 0.1, periodInMinutes: Math.max(0.5, mins) });
    armFastLoop();
  }

  /* ----- fast polling for sub-30s intervals -----
     chrome.alarms bottoms out at 30s, so 3s/5s/10s/15s run as a chained timer
     inside the service worker. The SW is kept alive by the alarm wakes + any
     open popup; when it eventually idles out the 30s alarm re-arms the loop,
     so the effective interval drifts toward ~30s while fully idle. */
  const IS_SW = typeof ServiceWorkerGlobalScope !== 'undefined' && self instanceof ServiceWorkerGlobalScope;
  const IDLE_STOP_MS = 10 * 60 * 1000;
  let fastTimer = null, fastGen = 0, fastFails = 0, lastActivity = Date.now();
  function startFastLoop(sec) {
    if (fastTimer) clearTimeout(fastTimer);
    const gen = ++fastGen;
    fastFails = 0;
    const tick = () => {
      fastTimer = null;
      if (gen !== fastGen) return;
      // quiet for 10 min with nobody looking: stop; the 30 s alarm carries on until activity resumes
      if (Date.now() - lastActivity > IDLE_STOP_MS) return;
      refreshInbox({ notify: true }).then(() => { fastFails = 0; }).catch(() => { fastFails++; })
        .finally(() => {
          if (gen !== fastGen) return;
          // exponential backoff on errors (rate limit / offline), capped at 60 s
          fastTimer = setTimeout(tick, Math.min(60000, sec * 1000 * 2 ** Math.min(fastFails, 4)));
        });
    };
    fastTimer = setTimeout(tick, sec * 1000);
  }
  function armFastLoop() {
    if (!IS_SW) return; // only the service worker polls; the popup reads shared results
    isPaused().then(p => p ? null : getSettings()).then(s => {
      if (!s) return;
      const mins = s.pollMinutes || 0.5;
      if (mins < 0.5) startFastLoop(mins * 60);
    }).catch(() => {});
  }
  function stopFastLoop() {
    fastGen++;
    if (fastTimer) { clearTimeout(fastTimer); fastTimer = null; }
  }
  // Called when the popup opens: resume fast polling if it had gone quiet
  function boost() {
    lastActivity = Date.now();
    if (!fastTimer) armFastLoop();
  }

  return {
    DEFAULTS, CM_DOMAINS, getSettings, saveSettings, newEmail, ensureEmail, useAddress, regenIdentity,
    refreshInbox, loadMessage, boost, isPaused, setPaused, getSeen, markRead, setBadge, attachmentUrl, fetchAttachment,
    autofill, fillFocused, setupAlarm, armFastLoop, stopFastLoop, genPassword, makeIdentity
  };
})();
