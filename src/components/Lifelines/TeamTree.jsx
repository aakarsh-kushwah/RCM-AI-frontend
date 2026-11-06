import React, { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import {
  ArrowLeft, Search, ChevronUp, ChevronsUp, Info, X, Phone, MessageCircle,
  Network, LayoutGrid, SlidersHorizontal, Download, Crosshair, ChevronRight
} from 'lucide-react';
import { getTreeChildren, getMemberFullProfile, searchLifelines } from '../../services/lifelinesApiClient';
import BrandLogo from '../BrandLogo/BrandLogo'; // adjust path if your BrandLogo lives elsewhere
import './TeamTree.css';

/**
 * TreestructureUI - full screen downline tree (separate from LifelinesPage).
 *
 * Props (unchanged)
 *  buyerId       : logged-in leader id (string)
 *  rootInfo      : { name, photo_url, max_pin, curr_pin, self_pv, total_group_pv, children_count }
 *  startNode     : optional leg head node to open directly (from "Direct leg heads")
 *  crawlRunning  : bool, true while the backend is still syncing the team
 *  refreshToken  : number; change it to clear the cache and reload (after re-sync / refresh)
 *  onClose       : go back to the Lifelines page
 *  onUnauthorized: optional, called on 401 (token expired)
 *
 * How big teams stay easy
 *  1. Tree view   - used automatically when the legs fit on screen.
 *  2. Legs view   - used automatically when they do not (10, 50, 200 legs). One tidy card per
 *                   leg (A, B, C...), filter / sort them, tap a leg to open ITS tree.
 *  3. Find members- scans a whole team or one leg in the background (low priority, 4 requests at a
 *                   time, never blocks the tree) and lets you filter by PV (= / >= / <=), name, ID
 *                   and status. Results are virtualised, so 20,000 rows scroll smoothly.
 *                   "Locate" jumps the tree straight to that member.
 *
 * Colours: green = bought (PV > 0), grey = no purchase (0 PV), red = terminated.
 */

const COLORS = { green: '#12A35E', red: '#E03655', slate: '#9AA3BD', mu: '#6B7296' };
const SOFT = { g: 'rgba(18,163,94,.16)', n: 'rgba(154,163,189,.22)', r: 'rgba(224,54,85,.16)' };

const TREE_PAGE = 40;      // direct children shown per "page" under the focused member
const LEG_PAGE = 48;       // leg cards shown per page in Legs view
const CAP = 4;             // children shown per node on deeper levels (rest = "+N")
const MAX_DEPTH = 6;       // levels auto-opened under the focused member
const MAX_PARALLEL = 4;    // simultaneous tree requests from one browser
const CRAWL_WORKERS = 6;   // background scan workers (they share the 4 request slots, low priority)
const MAX_CRAWL = 20000;   // safety cap for one background scan
const ROW_H = 76;          // fixed row height of the virtual member list
const EMPTY = [];
const PHOTO_ORIGIN = 'https://www.rcmworld.com'; // host that serves relative photo paths

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const numberFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const formatNumber = (v) => numberFmt.format(Number(v || 0));
const nid = (n) => String(n?.buyer_id ?? n?.buyerId ?? n?.distno ?? n?.id ?? '');
const photoOf = (n) => n?.photo_url ?? n?.photoUrl ?? null;
const getPv = (n) => Number(n?.self_pv ?? n?.selfPv ?? n?.current_pv ?? 0) || 0;

const cleanUrl = (u) => {
  if (!u) return null;
  let s = String(u).trim();
  const md = s.match(/\((https?:\/\/[^)\s]+)\)/);
  if (md) s = md[1];
  s = s.replace(/^\[|\]$/g, '').trim();
  if (s.startsWith('//')) s = `https:${s}`;
  else if (s.startsWith('http://')) s = `https://${s.slice(7)}`;
  else if (s.startsWith('/')) s = `${PHOTO_ORIGIN}${s}`;
  return /^https:\/\//.test(s) ? s : null;
};

const getInitials = (v) => {
  const t = String(v || '').trim();
  if (!t) return 'TD';
  if (/^\d+$/.test(t)) return t.slice(0, 2);
  const p = t.split(/\s+/).filter(Boolean);
  return p.length === 1 ? p[0].slice(0, 2).toUpperCase() : (p[0][0] + p[1][0]).toUpperCase();
};

const formatJoinDate = (d) => {
  if (!d) return '—';
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return String(d);
  return x.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatKyc = (s) => {
  if (s === null || s === undefined || s === '') return '—';
  if (s === 1 || s === 'A') return 'Active';
  if (s === 0 || s === 'T') return 'Terminated';
  return String(s);
};

const toWhatsappNumber = (m) => {
  const d = String(m || '').replace(/\D/g, '');
  if (d.length === 10) return `91${d}`;
  return d.length >= 11 ? d : '';
};

// Leg names: A, B, C ... Z, AA, AB ...
const legLabel = (i) => {
  let s = '';
  let n = i;
  do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return s;
};

// Leg names for a list of sibling legs. If the API tags every sibling with its own distinct
// letter (leg / leg_type = "A", "Leg B" ...) we show those, otherwise we count A, B, C by position.
const apiLeg = (n) => {
  const t = String(n?.leg ?? n?.leg_type ?? '').replace(/^leg\s*/i, '').trim().toUpperCase();
  return /^[A-Z]{1,2}$/.test(t) ? t : '';
};
const legNamesFor = (list) => {
  const api = list.map(apiLeg);
  if (api.length && api.every(Boolean) && new Set(api).size === api.length) return api;
  return list.map((_, i) => legLabel(i));
};

// colour + tag of a member: red = terminated, green = has PV, grey = 0 PV
const getStatus = (n) => {
  if (Number(n.status ?? 1) === 0) return { key: 'r', cls: 'r', color: COLORS.red, soft: SOFT.r, tag: 'Terminated' };
  const pv = getPv(n);
  return pv > 0
    ? { key: 'g', cls: 'g', color: COLORS.green, soft: SOFT.g, tag: `${formatNumber(pv)} PV` }
    : { key: 'n', cls: '', color: COLORS.slate, soft: SOFT.n, tag: '0 PV' };
};

/**
 * "1500", "pv 1500", "pv>=1500", ">1500", "1500pv" ...
 * only:true  -> clearly a PV query (has "pv" or an operator)
 * only:false -> plain digits, could also be a buyer ID (we offer both)
 */
const parsePvQuery = (raw) => {
  const s = String(raw || '').trim().toLowerCase();
  const m = s.match(/^(?:pv\s*)?(>=|<=|=|>|<)?\s*(\d+)\s*(?:pv)?$/);
  if (!m) return null;
  const hasPvWord = s.includes('pv');
  const sym = m[1] || '';
  if (!sym && !hasPvWord && m[2].length < 2) return null;
  let value = Number(m[2]);
  let op = 'eq';
  if (sym === '>=') op = 'ge';
  else if (sym === '>') { op = 'ge'; value += 1; }
  else if (sym === '<=') op = 'le';
  else if (sym === '<') { op = 'le'; value = Math.max(0, value - 1); }
  return { op, pv: String(value), only: Boolean(sym) || hasPvWord };
};

const OP_TEXT = { eq: 'exactly', ge: 'at least', le: 'at most' };

const useDebounced = (value, ms) => {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
};

// Request limiter with two lanes. The tree UI ("hi") always goes first; the background scan
// ("lo") may use every slot except the last one, so tapping a node never waits behind a scan.
const makeLimiter = (max) => {
  let active = 0;
  const hi = [];
  const lo = [];
  const next = () => {
    while (true) { // eslint-disable-line no-constant-condition
      let job = null;
      if (hi.length && active < max) job = hi.shift();
      else if (lo.length && active < max - 1) job = lo.shift();
      if (!job) return;
      active += 1;
      job.fn().then(job.res, job.rej).finally(() => { active -= 1; next(); });
    }
  };
  return (fn, prio = 'hi') => new Promise((res, rej) => {
    (prio === 'lo' ? lo : hi).push({ fn, res, rej });
    next();
  });
};
const limitTreeCalls = makeLimiter(MAX_PARALLEL);

// ---------------------------------------------------------------------------
// Background scanner (powers "Find members")
// ---------------------------------------------------------------------------
function useCrawler(kidsRef, ensureKids, sessionRef) {
  const [state, setState] = useState({ running: false, count: 0, level: 0, truncated: false, failed: 0, version: 0 });
  const membersRef = useRef([]);
  const indexRef = useRef(new Map());
  const tokenRef = useRef(0);
  const timerRef = useRef(null);
  const verRef = useRef(0);
  const ensureRef = useRef(ensureKids);
  ensureRef.current = ensureKids;

  const stop = useCallback(() => {
    tokenRef.current += 1;
    clearTimeout(timerRef.current);
    timerRef.current = null;
    setState((s) => (s.running ? { ...s, running: false } : s));
  }, []);

  const start = useCallback((head, markLegs) => {
    tokenRef.current += 1;
    const token = tokenRef.current;
    const sid = sessionRef.current;
    clearTimeout(timerRef.current);
    timerRef.current = null;

    const members = [];
    const index = new Map();
    membersRef.current = members;
    indexRef.current = index;

    const queue = [{ node: head, depth: 0, leg: -1 }];
    let active = 0;
    let failed = 0;
    let maxLevel = 0;
    let truncated = false;
    let done = false;

    const alive = () => token === tokenRef.current && sid === sessionRef.current;
    const publish = (running) => {
      verRef.current += 1;
      setState({ running, count: members.length, level: maxLevel, truncated, failed, version: verRef.current });
    };
    const schedule = () => {
      if (timerRef.current) return;
      timerRef.current = setTimeout(() => { timerRef.current = null; if (alive() && !done) publish(true); }, 180);
    };
    // only open nodes that say they have children (or do not say anything while the backend is syncing)
    const expandable = (n) => n.has_children || Number(n.children_count) > 0
      || (n.has_children === undefined && n.children_count === undefined);

    const run = async (item) => {
      const pid = nid(item.node);
      let kids = kidsRef.current.get(pid);
      if (!kids) kids = await ensureRef.current(pid, 'lo');
      if (!alive()) return;
      if (!kids) { failed += 1; return; }
      for (let i = 0; i < kids.length; i += 1) {
        if (members.length >= MAX_CRAWL) { truncated = true; break; }
        const k = kids[i];
        const id = nid(k);
        if (!id || index.has(id)) continue;
        const st = getStatus(k);
        const depth = item.depth + 1;
        const leg = item.depth === 0 && markLegs ? i : item.leg;
        const entry = { id, node: k, parentId: pid, depth, leg, pv: getPv(k), key: st.key, nameLc: String(k.name || '').toLowerCase() };
        members.push(entry);
        index.set(id, entry);
        if (depth > maxLevel) maxLevel = depth;
        if (expandable(k)) queue.push({ node: k, depth, leg });
      }
    };

    const pump = () => {
      if (!alive() || done) return;
      while (active < CRAWL_WORKERS && queue.length && !truncated) {
        const item = queue.shift();
        active += 1;
        run(item)
          .catch(() => { failed += 1; })
          .finally(() => { active -= 1; schedule(); pump(); });
      }
      if (!active && (!queue.length || truncated)) {
        done = true;
        clearTimeout(timerRef.current);
        timerRef.current = null;
        publish(false);
      }
    };

    publish(true);
    pump();
  }, [kidsRef, sessionRef]);

  useEffect(() => () => { tokenRef.current += 1; clearTimeout(timerRef.current); }, []);

  return { state, membersRef, indexRef, start, stop };
}

// ---------------------------------------------------------------------------
// Avatar + small pieces
// ---------------------------------------------------------------------------
const Avatar = memo(function Avatar({ name, id, photoUrl, color, size = 56, fontSize = 16 }) {
  const [failed, setFailed] = useState(false);
  const src = useMemo(() => cleanUrl(photoUrl), [photoUrl]);
  useEffect(() => setFailed(false), [src]);
  return (
    <div className="tdt-av" style={{ width: size, height: size, border: `${size < 44 ? 2 : 3}px solid ${color}`, color, fontSize }}>
      {src && !failed
        ? <img src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
        : <span>{getInitials(name || id)}</span>}
    </div>
  );
});

const Legend = memo(function Legend() {
  return (
    <div className="tdt-legend" aria-label="Colour guide">
      <span><i style={{ background: COLORS.green }} />Bought</span>
      <span><i style={{ background: COLORS.slate }} />No purchase</span>
      <span><i style={{ background: COLORS.red }} />Terminated</span>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Tree pieces
// ---------------------------------------------------------------------------
const Branch = ({ index, count }) => (
  <>
    {count > 1 && <div className={`tdt-hl${index === 0 ? ' f' : ''}${index === count - 1 ? ' l' : ''}`} />}
    <div className="tdt-st" />
  </>
);

// Decides how many levels fit on screen and which parents still need their children fetched.
function buildPlan(focus, getKids, availW, slot, visible, crawl) {
  const need = [];
  let level = [focus];
  let maxLevel = 0;
  let widest = 1;
  for (let d = 1; d <= MAX_DEPTH; d += 1) {
    const cap = d === 1 ? visible : CAP;
    const next = [];
    let slots = 0;
    let unknown = false;
    for (let i = 0; i < level.length; i += 1) {
      const n = level[i];
      const id = nid(n);
      const kids = getKids(id);
      if (kids === undefined) {
        // while the backend crawls we also probe nodes without a child hint, but only 2 levels deep
        if (d === 1 || n.has_children || Number(n.children_count) > 0 || (crawl && d <= 2)) { need.push(id); unknown = true; }
      } else {
        const take = Math.min(kids.length, cap);
        for (let j = 0; j < take; j += 1) next.push(kids[j]);
        slots += take + (d > 1 && kids.length > cap ? 1 : 0);
      }
    }
    if (d > 2 && unknown) break;
    if (slots === 0) break;
    if (d > 2 && slots * slot > availW) break;
    maxLevel = d;
    widest = Math.max(widest, slots);
    level = next;
  }
  return { maxLevel, widest, need };
}

function Subtree({ node, chain, index, count, level, plan, getKids, onPick }) {
  const id = nid(node);
  const st = getStatus(node);
  const showKids = level + 1 <= plan.maxLevel;
  const kids = showKids ? getKids(id) : undefined;
  const shown = kids ? kids.slice(0, CAP) : [];
  const extra = kids ? kids.length - shown.length : 0;
  const kc = Number(node.children_count) || 0;
  const slots = shown.length + (extra > 0 ? 1 : 0);

  return (
    <div className="tdt-col">
      <Branch index={index} count={count} />
      <div className={`tdt-node${st.cls === 'r' ? ' t' : ''}`} style={{ '--fc': st.color, '--fs': st.soft }} role="button" tabIndex={0}
        onClick={() => onPick(chain)} onKeyDown={(e) => { if (e.key === 'Enter') onPick(chain); }}>
        <Avatar name={node.name} id={id} photoUrl={photoOf(node)} color={st.color} size={36} fontSize={11} />
        <div className="nm">{node.name || `#${id}`}</div>
        <div className="id">{id}</div>
        <span className={`tdt-tag ${st.cls}`}>{st.tag}</span>
        {!showKids && kc > 0 && <span className="tdt-kidhint">↓ {kc}</span>}
      </div>
      {slots > 0 && (
        <>
          <div className="tdt-vline" style={{ '--h': '12px' }} />
          <div className="tdt-row">
            {shown.map((k, i) => (
              <Subtree key={nid(k)} node={k} chain={chain.concat(k)} index={i} count={slots}
                level={level + 1} plan={plan} getKids={getKids} onPick={onPick} />
            ))}
            {extra > 0 && (
              <div className="tdt-col">
                <Branch index={shown.length} count={slots} />
                <button type="button" className="tdt-more" onClick={() => onPick(chain)} aria-label={`${extra} more`}>+{extra}</button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function DepthRail({ trail, idx, onChange }) {
  const trackRef = useRef(null);
  const draggingRef = useRef(false);
  const [drag, setDrag] = useState(null);
  const n = trail.length;
  const ratio = drag !== null ? drag : (n > 1 ? idx / (n - 1) : 0);

  const pick = useCallback((clientY) => {
    const el = trackRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (clientY - r.top) / r.height));
    setDrag(x);
    onChange(Math.round(x * (n - 1)));
  }, [n, onChange]);

  const stop = useCallback(() => { draggingRef.current = false; setDrag(null); }, []);

  return (
    <div className="tdt-rail" aria-label="Tree depth"
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); draggingRef.current = true; pick(e.clientY); }}
      onPointerMove={(e) => { if (draggingRef.current) pick(e.clientY); }}
      onPointerUp={stop} onPointerCancel={stop}>
      <div className="tdt-rtrack" ref={trackRef}>
        <div className="tdt-rfill" style={{ height: `${ratio * 100}%` }} />
        {n <= 30 && trail.map((t, i) => (
          <div key={nid(t) + i} className={`tdt-tick${i <= idx ? ' on' : ''}`} style={{ top: `${n > 1 ? (i / (n - 1)) * 100 : 0}%` }} />
        ))}
        <div className={`tdt-thumb${drag === null ? ' s' : ''}`} style={{ top: `${ratio * 100}%` }} />
        {drag !== null && (
          <div className="tdt-bubble" style={{ top: `${ratio * 100}%` }}>
            L{idx} • {trail[idx]?.name || nid(trail[idx])}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Legs view: one clean card per leg, for focus nodes with many direct children
// ---------------------------------------------------------------------------
const STATUS_CHIPS = [
  { key: 'g', label: 'Bought', color: COLORS.green },
  { key: 'n', label: 'No purchase', color: COLORS.slate },
  { key: 'r', label: 'Terminated', color: COLORS.red }
];

const LegsGallery = memo(function LegsGallery({ kids, onOpen, onExplore }) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('order');
  const [stat, setStat] = useState({ g: true, n: true, r: true });
  const [limit, setLimit] = useState(LEG_PAGE);
  const names = useMemo(() => legNamesFor(kids), [kids]);

  const { items, counts } = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const c = { g: 0, n: 0, r: 0 };
    const list = [];
    kids.forEach((k, index) => {
      const st = getStatus(k);
      c[st.key] += 1;
      if (!stat[st.key]) return;
      if (ql && !(String(k.name || '').toLowerCase().includes(ql) || nid(k).includes(ql))) return;
      list.push({ k, index, st, pv: getPv(k), kc: Number(k.children_count) || 0 });
    });
    if (sort === 'pv') list.sort((a, b) => b.pv - a.pv || a.index - b.index);
    else if (sort === 'name') list.sort((a, b) => String(a.k.name || '').localeCompare(String(b.k.name || '')));
    else if (sort === 'team') list.sort((a, b) => b.kc - a.kc || a.index - b.index);
    return { items: list, counts: c };
  }, [kids, q, sort, stat]);

  useEffect(() => { setLimit(LEG_PAGE); }, [q, sort, stat]);

  const toggle = (key) => setStat((s) => ({ ...s, [key]: !s[key] }));

  return (
    <section className="tdt-legs" aria-label="Choose a leg">
      <div className="tdt-legs-head">
        <div>
          <h3>Choose a leg</h3>
          <p>{formatNumber(kids.length)} legs · tap one to open its tree</p>
        </div>
      </div>

      <div className="tdt-legs-tools">
        <div className="tdt-field">
          <Search size={15} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a leg by name or ID" aria-label="Find a leg" />
        </div>
        <select className="tdt-select" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort legs">
          <option value="order">Leg order (A, B, C)</option>
          <option value="pv">Highest PV</option>
          <option value="team">Biggest team</option>
          <option value="name">Name A–Z</option>
        </select>
      </div>

      <div className="tdt-chips">
        {STATUS_CHIPS.map((c) => (
          <button key={c.key} type="button" className={`tdt-fchip${stat[c.key] ? ' on' : ''}`} onClick={() => toggle(c.key)} aria-pressed={stat[c.key]}>
            <i style={{ background: c.color }} />{c.label}<b>{formatNumber(counts[c.key])}</b>
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="tdt-empty">No leg matches these filters.</div>
      ) : (
        <div className="tdt-legs-grid">
          {items.slice(0, limit).map(({ k, index, st, kc }) => {
            const id = nid(k);
            const gv = k.total_group_pv;
            return (
              <div key={id} className={`tdt-leg${st.cls === 'r' ? ' t' : ''}`} style={{ '--fc': st.color, '--fs': st.soft }}>
                <button type="button" className="tdt-leg-main" onClick={() => onOpen(k)} aria-label={`Open leg ${names[index]}, ${k.name || id}`}>
                  <span className="tdt-leg-badge">{names[index]}</span>
                  <Avatar name={k.name} id={id} photoUrl={photoOf(k)} color={st.color} size={50} fontSize={15} />
                  <span className="tdt-leg-name">{k.name || `#${id}`}</span>
                  <span className="tdt-leg-id">ID {id}</span>
                  <span className={`tdt-tag ${st.cls}`}>{st.tag}</span>
                  <span className="tdt-leg-meta">
                    {kc > 0 ? `${formatNumber(kc)} direct` : 'No downline'}
                    {gv !== undefined && gv !== null ? ` · GV ${formatNumber(gv)}` : ''}
                  </span>
                </button>
                <button type="button" className="tdt-leg-find" onClick={() => onExplore(index)} aria-label={`Find members in leg ${names[index]}`} title="Find members in this leg">
                  <SlidersHorizontal size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {items.length > limit && (
        <button type="button" className="tdt-btn" style={{ margin: '16px auto 0' }} onClick={() => setLimit((v) => v + LEG_PAGE)}>
          Show more ({formatNumber(items.length - limit)} left)
        </button>
      )}
    </section>
  );
});

// ---------------------------------------------------------------------------
// Find members: background scan + PV / name / ID / status filters + virtual list
// ---------------------------------------------------------------------------
const PV_PRESETS = [
  { label: 'Any', op: 'eq', pv: '' },
  { label: 'Bought', op: 'ge', pv: '1' },
  { label: '≥ 500', op: 'ge', pv: '500' },
  { label: '≥ 1,000', op: 'ge', pv: '1000' },
  { label: '≥ 1,500', op: 'ge', pv: '1500' },
  { label: '≥ 3,000', op: 'ge', pv: '3000' },
  { label: '≥ 5,000', op: 'ge', pv: '5000' }
];

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

const MemberRow = memo(function MemberRow({ entry, top, parentName, legText, onProfile, onLocate }) {
  const st = getStatus(entry.node);
  return (
    <div className={`tdt-xrow${st.cls === 'r' ? ' t' : ''}`} style={{ top, '--fc': st.color, '--fs': st.soft }}
      role="button" tabIndex={0} onClick={() => onProfile(entry.node)}
      onKeyDown={(e) => { if (e.key === 'Enter') onProfile(entry.node); }}>
      <Avatar name={entry.node.name} id={entry.id} photoUrl={photoOf(entry.node)} color={st.color} size={42} fontSize={13} />
      <div className="tdt-xmain">
        <div className="tdt-xname">{entry.node.name || `#${entry.id}`}</div>
        <div className="tdt-xsub">
          ID {entry.id} · L{entry.depth}
          {legText ? ` · Leg ${legText}` : ''}
          {parentName ? ` · via ${parentName}` : ''}
        </div>
      </div>
      <span className={`tdt-xpv ${st.cls}`}>{st.cls === 'r' ? 'Terminated' : `${formatNumber(entry.pv)} PV`}</span>
      <button type="button" className="tdt-xloc" aria-label="Show in tree" title="Show in tree"
        onClick={(e) => { e.stopPropagation(); onLocate(entry); }}>
        <Crosshair size={16} />
      </button>
    </div>
  );
});

// Filters + sorts the scanned members. `version` only tells React "the scan added more rows".
function buildView(all, { dq, dpv, op, stat, sort }) {
  const ql = dq.trim().toLowerCase();
  const pvn = dpv === '' ? null : Number(dpv);
  const counts = { g: 0, n: 0, r: 0 };
  const list = [];
  let sum = 0;
  for (let i = 0; i < all.length; i += 1) {
    const e = all[i];
    counts[e.key] += 1;
    if (!stat[e.key]) continue;
    if (ql && !(e.nameLc.includes(ql) || e.id.includes(ql))) continue;
    if (pvn !== null && !Number.isNaN(pvn)) {
      if (op === 'eq' && e.pv !== pvn) continue;
      if (op === 'ge' && e.pv < pvn) continue;
      if (op === 'le' && e.pv > pvn) continue;
    }
    list.push(e);
    sum += e.pv;
  }
  if (sort === 'pv_desc') list.sort((x, y) => y.pv - x.pv || x.depth - y.depth);
  else if (sort === 'pv_asc') list.sort((x, y) => x.pv - y.pv || x.depth - y.depth);
  else if (sort === 'name') list.sort((x, y) => x.nameLc.localeCompare(y.nameLc));
  else list.sort((x, y) => x.depth - y.depth || y.pv - x.pv);
  return { list, counts, sum, total: all.length };
}

function LegExplorer({ focus, legs, initial, crawler, onClose, onLocate, onProfile }) {
  const { state, membersRef, indexRef, start, stop } = crawler;
  const legNames = useMemo(() => legNamesFor(legs), [legs]);
  const focusRef = useRef(focus);
  const legsRef = useRef(legs);
  focusRef.current = focus;
  legsRef.current = legs;

  const [scope, setScope] = useState(initial.scope ?? 'all'); // 'all' | leg index
  const [q, setQ] = useState('');
  const [op, setOp] = useState(initial.op || 'eq');
  const [pv, setPv] = useState(initial.pv || '');
  const [stat, setStat] = useState({ g: true, n: true, r: true });
  const [sort, setSort] = useState('pv_desc');
  const [collapsed, setCollapsed] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewH, setViewH] = useState(() => Math.max(320, window.innerHeight - 320));

  const listRef = useRef(null);
  const rafRef = useRef(0);
  const dq = useDebounced(q, 150);
  const dpv = useDebounced(pv, 150);

  // (re)start the scan when the scope changes; cached branches are reused, so this is cheap
  useEffect(() => {
    const head = scope === 'all' ? focusRef.current : legsRef.current[scope];
    if (head) start(head, scope === 'all');
    return stop;
  }, [scope, start, stop]);

  // list height for virtualisation
  useEffect(() => {
    const el = listRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([entry]) => setViewH(entry.contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const onScroll = useCallback((e) => {
    const el = e.currentTarget;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => setScrollTop(el.scrollTop));
  }, []);

  const view = useMemo(
    () => buildView(membersRef.current, { version: state.version, dq, dpv, op, stat, sort }),
    [membersRef, state.version, dq, dpv, op, stat, sort]
  );

  // new filters -> back to the top of the list
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = 0;
    setScrollTop(0);
  }, [dq, dpv, op, stat, sort, scope]);

  const total = view.list.length;
  const first = Math.max(0, Math.floor(scrollTop / ROW_H) - 6);
  const last = Math.min(total, Math.ceil((scrollTop + viewH) / ROW_H) + 6);
  const rows = view.list.slice(first, last);

  const focusName = focus.name || `#${nid(focus)}`;
  const scopeText = scope === 'all' ? `${focusName}'s whole team` : `Leg ${legNames[scope]} · ${legs[scope]?.name || nid(legs[scope] || {})}`;
  const pvActive = dpv !== '';
  const filterText = [
    pvActive ? `${OP_TEXT[op]} ${formatNumber(dpv)} PV` : 'Any PV',
    dq.trim() ? `“${dq.trim()}”` : null
  ].filter(Boolean).join(' · ');

  const parentNameOf = (e) => {
    const p = indexRef.current.get(e.parentId);
    if (p) return p.node.name || `#${p.id}`;
    return scope === 'all' ? '' : (legs[scope]?.name || '');
  };

  const locate = useCallback((entry) => {
    onLocate(entry, scope === 'all' ? [] : [legs[scope]].filter(Boolean));
  }, [onLocate, scope, legs]);

  const clearFilters = () => { setQ(''); setPv(''); setOp('eq'); setStat({ g: true, n: true, r: true }); };

  const exportCsv = () => {
    const head = ['Name', 'ID', 'Level', 'Leg', 'PV', 'Status'];
    const lines = [head.map(csvCell).join(',')];
    view.list.forEach((e) => {
      const st = getStatus(e.node);
      const status = st.key === 'g' ? 'Bought' : st.key === 'r' ? 'Terminated' : 'No purchase';
      lines.push([e.node.name, e.id, e.depth, e.leg >= 0 ? (legNames[e.leg] || legLabel(e.leg)) : '', e.pv, status].map(csvCell).join(','));
    });
    const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `team-members-${nid(focus)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="tdt-xov" onClick={onClose}>
      <section className="tdt-xp" role="dialog" aria-label="Find members" onClick={(e) => e.stopPropagation()}>
        <header className="tdt-xhead">
          <div className="tdt-xtitle">
            <h3>Find members</h3>
            <p>{scopeText}</p>
          </div>
          <button type="button" className="tdt-btn" onClick={exportCsv} disabled={total === 0} aria-label="Export list as CSV">
            <Download size={15} /><span className="t">Export</span>
          </button>
          <button type="button" className="tdt-btn ic" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>

        {/* scan progress */}
        <div className={`tdt-xprog${state.running ? ' run' : ''}`}>
          <span className="tdt-xbar" aria-hidden="true" />
          <span className="tdt-xmsg">
            {state.running
              ? `Scanning level ${state.level || 1} · ${formatNumber(state.count)} members found`
              : `${formatNumber(state.count)} members scanned · ${state.level} levels deep`}
            {state.truncated && ` · stopped at ${formatNumber(MAX_CRAWL)}`}
            {!state.running && state.failed > 0 && ` · ${state.failed} branches did not load`}
          </span>
          {state.running
            ? <button type="button" className="tdt-link" onClick={stop}>Stop</button>
            : <button type="button" className="tdt-link" onClick={() => start(scope === 'all' ? focus : legs[scope], scope === 'all')}>Scan again</button>}
        </div>

        {!collapsed && (
          <div className="tdt-xfilters">
            <div className="tdt-xrow2">
              <div className="tdt-field">
                <Search size={15} />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or ID" aria-label="Filter by name or ID" />
              </div>
              <select className="tdt-select" value={String(scope)} onChange={(e) => setScope(e.target.value === 'all' ? 'all' : Number(e.target.value))} aria-label="Search in">
                <option value="all">Whole team</option>
                {legs.map((l, i) => (
                  <option key={nid(l)} value={i}>{`Leg ${legNames[i]} · ${l.name || nid(l)}`}</option>
                ))}
              </select>
            </div>

            <div className="tdt-xrow2">
              <div className="tdt-seg" role="radiogroup" aria-label="PV match">
                {[['eq', 'Exactly'], ['ge', 'At least'], ['le', 'At most']].map(([v, label]) => (
                  <button key={v} type="button" role="radio" aria-checked={op === v} className={op === v ? 'on' : ''} onClick={() => setOp(v)}>{label}</button>
                ))}
              </div>
              <div className="tdt-field tdt-pvfield">
                <input inputMode="numeric" value={pv} placeholder="PV e.g. 1500" aria-label="PV value"
                  onChange={(e) => setPv(e.target.value.replace(/\D/g, '').slice(0, 9))} />
                <em>PV</em>
              </div>
            </div>

            <div className="tdt-chips scroll">
              {PV_PRESETS.map((p) => (
                <button key={p.label} type="button" className={`tdt-fchip${pv === p.pv && (p.pv === '' || op === p.op) ? ' on' : ''}`}
                  onClick={() => { setOp(p.op); setPv(p.pv); }}>{p.label}</button>
              ))}
            </div>

            <div className="tdt-xrow2">
              <div className="tdt-chips">
                {STATUS_CHIPS.map((c) => (
                  <button key={c.key} type="button" className={`tdt-fchip${stat[c.key] ? ' on' : ''}`} aria-pressed={stat[c.key]}
                    onClick={() => setStat((s) => ({ ...s, [c.key]: !s[c.key] }))}>
                    <i style={{ background: c.color }} />{c.label}<b>{formatNumber(view.counts[c.key])}</b>
                  </button>
                ))}
              </div>
              <select className="tdt-select" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort members">
                <option value="pv_desc">Highest PV first</option>
                <option value="pv_asc">Lowest PV first</option>
                <option value="level">Nearest first</option>
                <option value="name">Name A–Z</option>
              </select>
            </div>
          </div>
        )}

        <div className="tdt-xsum">
          <div className="tdt-xsum-text">
            <strong>{formatNumber(total)}</strong> of {formatNumber(view.total)} members
            <span> · {formatNumber(view.sum)} PV total</span>
            {collapsed && <em>{filterText}</em>}
          </div>
          <button type="button" className="tdt-link" onClick={() => setCollapsed((v) => !v)}>
            {collapsed ? 'Show filters' : 'Hide filters'}
          </button>
        </div>

        <div className="tdt-xlist" ref={listRef} onScroll={onScroll}>
          {total > 0 && (
            <div className="tdt-xspacer" style={{ height: total * ROW_H }}>
              {rows.map((e, i) => (
                <MemberRow key={e.id} entry={e} top={(first + i) * ROW_H} parentName={parentNameOf(e)}
                  legText={scope === 'all' && e.leg >= 0 ? (legNames[e.leg] || legLabel(e.leg)) : ''} onProfile={onProfile} onLocate={locate} />
              ))}
            </div>
          )}
          {total === 0 && (
            <div className="tdt-empty">
              {state.running
                ? 'Scanning the team… matching members appear here as they are found.'
                : view.total === 0 ? 'No members found under this selection.' : 'No members match these filters.'}
              {!state.running && view.total > 0 && (
                <button type="button" className="tdt-btn" style={{ margin: '12px auto 0' }} onClick={clearFilters}>Clear filters</button>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Member profile (drawer on desktop, bottom sheet on mobile)
// ---------------------------------------------------------------------------
function MemberSheet({ member, onClose }) {
  const phone = toWhatsappNumber(member.mobile || member.mobile_no);
  const terminated = Number(member.status) === 0;
  const ring = terminated ? COLORS.red : Number(member.self_pv) > 0 ? COLORS.green : COLORS.slate;
  const items = [
    { k: 'Current Pin', v: member.curr_pin || '—' },
    { k: 'Highest Pin', v: member.max_pin || '—' },
    { k: 'KYC Status', v: formatKyc(member.kyc_status) },
    { k: 'Join date', v: formatJoinDate(member.join_date) },
    { k: 'Self purchase', v: `${formatNumber(member.self_pv)} PV` },
    { k: 'Re-purchase amount', v: `₹${formatNumber(member.repurchase_amt)}` },
    { k: 'Group volume', v: `${formatNumber(member.total_group_pv)} PV` },
    { k: 'Direct downlines', v: formatNumber(member.children_count) },
    { k: 'District / State', v: [member.district, member.state].filter(Boolean).join(', ') || '—' }
  ];
  return (
    <div className="tdt-ov" onClick={onClose}>
      <div className="tdt-dr" role="dialog" aria-label="Member profile" onClick={(e) => e.stopPropagation()}>
        <div className="tdt-dr-top">
          <div className="tdt-dr-title">Member profile</div>
          <button type="button" className="tdt-btn ic" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="tdt-dr-who">
          <Avatar name={member.name} id={member.buyer_id} photoUrl={photoOf(member)} color={ring} size={80} fontSize={26} />
          <div className="tdt-dr-name">{member.name}</div>
          <div className="tdt-dr-id">Buyer ID {member.buyer_id}</div>
          <span className={`tdt-chip ${terminated ? 'r' : 'g'}`}>{terminated ? 'Terminated' : formatKyc(member.kyc_status)}</span>
        </div>
        <div className="tdt-grid2">
          {items.map((it) => <div key={it.k} className="tdt-kv"><div className="k">{it.k}</div><div className="v">{it.v}</div></div>)}
        </div>
        {phone ? (
          <div className="tdt-dr-actions">
            <a className="tdt-btn big" href={`tel:+${phone}`}><Phone size={16} />Call</a>
            <a className="tdt-btn big wa" target="_blank" rel="noopener noreferrer"
              href={`https://wa.me/${phone}?text=${encodeURIComponent(`Namaste ${member.name} ji! Connecting regarding your business updates.`)}`}>
              <MessageCircle size={16} />WhatsApp
            </a>
          </div>
        ) : <div className="tdt-dr-note">Mobile number not available for this member.</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
export default function TreestructureUI({
  buyerId, rootInfo, startNode = null, crawlRunning = false, refreshToken = 0, onClose, onUnauthorized
}) {
  const [nav, setNav] = useState(() => (startNode ? { path: [startNode], idx: 1 } : { path: [], idx: 0 }));
  const [, setVer] = useState(0);
  const [visible, setVisible] = useState(TREE_PAGE);
  const [winW, setWinW] = useState(() => window.innerWidth);
  const [search, setSearch] = useState('');
  const [searchFocus, setSearchFocus] = useState(false);
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [member, setMember] = useState(null);
  const [notice, setNotice] = useState('');
  const [viewPref, setViewPref] = useState({ fid: '', mode: 'auto' });
  const [explorer, setExplorer] = useState(null);

  const kidsRef = useRef(new Map());
  const inflightRef = useRef(new Map());
  const failedRef = useRef(new Set());
  const sessionRef = useRef(0);
  const buyerRef = useRef(buyerId);
  const bumpRef = useRef(null);
  const stageRef = useRef(null);
  const crumbsRef = useRef(null);
  const dirRef = useRef('');
  const firstRefresh = useRef(true);

  useEffect(() => { buyerRef.current = buyerId; }, [buyerId]);

  const scheduleRender = useCallback(() => {
    if (bumpRef.current) return;
    bumpRef.current = setTimeout(() => { bumpRef.current = null; setVer((v) => v + 1); }, 60);
  }, []);
  useEffect(() => () => clearTimeout(bumpRef.current), []);

  const getKids = useCallback((id) => kidsRef.current.get(String(id)), []);
  const isLoading = useCallback((id) => inflightRef.current.has(String(id)), []);
  const isFailed = useCallback((id) => failedRef.current.has(String(id)), []);

  const ensureKids = useCallback((parentId, prio = 'hi') => {
    const pid = String(parentId);
    if (!pid || !buyerRef.current) return Promise.resolve(null);
    if (kidsRef.current.has(pid)) return Promise.resolve(kidsRef.current.get(pid));
    if (inflightRef.current.has(pid)) {
      const existing = inflightRef.current.get(pid);
      if (prio === 'hi') existing.then(scheduleRender);
      return existing;
    }
    const sid = sessionRef.current;
    failedRef.current.delete(pid);
    const p = limitTreeCalls(() => getTreeChildren(buyerRef.current, pid), prio)
      .then((json) => {
        if (sid !== sessionRef.current) return null;
        if (json?.success && Array.isArray(json.data)) { kidsRef.current.set(pid, json.data); return json.data; }
        failedRef.current.add(pid);
        return null;
      })
      .catch((e) => {
        if (sid === sessionRef.current) {
          failedRef.current.add(pid);
          if (e?.status === 401 && onUnauthorized) onUnauthorized();
        }
        return null;
      })
      .finally(() => {
        inflightRef.current.delete(pid);
        if (sid === sessionRef.current && prio === 'hi') scheduleRender();
      });
    inflightRef.current.set(pid, p);
    if (prio === 'hi') scheduleRender();
    return p;
  }, [scheduleRender, onUnauthorized]);

  const retry = useCallback((id) => { failedRef.current.delete(String(id)); ensureKids(id); }, [ensureKids]);

  const crawler = useCrawler(kidsRef, ensureKids, sessionRef);

  // Parent asked for a fresh load (Refresh / Re-sync finished): drop cache and refetch what is on screen
  useEffect(() => {
    if (firstRefresh.current) { firstRefresh.current = false; return; }
    sessionRef.current += 1;
    kidsRef.current = new Map();
    inflightRef.current = new Map();
    failedRef.current = new Set();
    setExplorer(null);
    scheduleRender();
  }, [refreshToken, scheduleRender]);

  // root node (the logged in leader)
  const rootNode = useMemo(() => ({
    buyer_id: buyerId,
    name: rootInfo?.name || `Leader #${buyerId}`,
    photo_url: rootInfo?.photo_url || null,
    max_pin: rootInfo?.max_pin,
    curr_pin: rootInfo?.curr_pin,
    self_pv: rootInfo?.self_pv || 0,
    total_group_pv: rootInfo?.total_group_pv || 0,
    children_count: rootInfo?.children_count || 0,
    status: 1
  }), [buyerId, rootInfo?.name, rootInfo?.photo_url, rootInfo?.max_pin, rootInfo?.curr_pin, rootInfo?.self_pv, rootInfo?.total_group_pv, rootInfo?.children_count]);

  const trail = useMemo(() => [rootNode, ...nav.path], [rootNode, nav.path]);
  const idx = Math.min(nav.idx, trail.length - 1);
  const focus = trail[idx];
  const fid = nid(focus);
  const kids = getKids(fid);

  const onPick = useCallback((chain) => {
    setNav((n) => ({ path: n.path.slice(0, n.idx).concat(chain), idx: n.idx + chain.length }));
  }, []);
  const setIdx = useCallback((i) => setNav((n) => (n.idx === i ? n : { ...n, idx: i })), []);
  const openLeg = useCallback((k) => onPick([k]), [onPick]);

  // animation direction (grow when going deeper, shrink when going up)
  const lastRef = useRef({ fid, idx });
  if (lastRef.current.fid !== fid) {
    dirRef.current = idx > lastRef.current.idx ? 'grow' : 'shrink';
    lastRef.current = { fid, idx };
  }

  // resize (throttled with rAF)
  useEffect(() => {
    let raf = 0;
    const f = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => setWinW(window.innerWidth)); };
    window.addEventListener('resize', f);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', f); };
  }, []);

  // lock page scroll behind the tree
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    setVisible(TREE_PAGE);
    if (stageRef.current) stageRef.current.scrollTo(0, 0);
  }, [fid]);

  const slot = winW < 761 ? 84 : 112;
  const upW = winW < 761 ? 156 : 204;
  const availW = winW - 68;

  // Tree when the legs fit on screen, Legs view when they do not (user can switch any time)
  const kidsTotal = kids ? kids.length : (Number(focus.children_count) || 0);
  const pref = viewPref.fid === fid ? viewPref.mode : 'auto';
  const mode = pref === 'auto' ? (kidsTotal * slot <= availW ? 'tree' : 'legs') : pref;
  const canToggle = kidsTotal > 1;

  const plan = mode === 'legs'
    ? { maxLevel: 0, widest: 1, need: kids === undefined ? [fid] : [] }
    : buildPlan(focus, getKids, availW, slot, visible, crawlRunning);
  const needKey = plan.need.join(',');

  useEffect(() => {
    if (needKey) needKey.split(',').forEach((id) => ensureKids(id));
  }, [needKey, ensureKids]);

  useEffect(() => {
    const active = crumbsRef.current?.querySelector('[data-active="1"]');
    if (active?.scrollIntoView) active.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [idx, trail.length]);

  // search (debounced). Pure PV queries ("pv>=1500") never hit the server, they open Find members.
  const pvIntent = useMemo(() => parsePvQuery(search), [search]);
  useEffect(() => {
    const q = search.trim();
    if (q.length < 2 || !buyerId || (pvIntent && pvIntent.only)) { setResults([]); setSearching(false); return undefined; }
    const sid = sessionRef.current;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const json = await searchLifelines(buyerId, q);
        if (sid !== sessionRef.current) return;
        const list = Array.isArray(json?.data) ? json.data : json?.data?.results || [];
        setResults(list.slice(0, 20));
      } catch (e) {
        if (sid === sessionRef.current) setResults([]);
      } finally {
        if (sid === sessionRef.current) setSearching(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [search, buyerId, pvIntent]);

  const openProfile = useCallback(async (node) => {
    const memberId = nid(node);
    if (!memberId || !buyerRef.current) return;
    const sid = sessionRef.current;
    try {
      const json = await getMemberFullProfile(buyerRef.current, memberId);
      if (sid !== sessionRef.current) return;
      if (json?.success) setMember(json.data);
    } catch (e) {
      if (e?.status === 401 && onUnauthorized) onUnauthorized();
      else setNotice(e?.message || 'Could not open member profile.');
    }
  }, [onUnauthorized]);

  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  // Esc: profile first, then Find members, then the tree
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (member) setMember(null);
      else if (explorer) setExplorer(null);
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [member, explorer, onClose]);

  const openExplorer = useCallback((init) => setExplorer({ id: Date.now(), init }), []);
  const closeExplorer = useCallback(() => setExplorer(null), []);
  const closeMember = useCallback(() => setMember(null), []);

  // jump the tree to a member found in Find members (path is rebuilt from the scan's parent links)
  const locate = useCallback((entry, headPath) => {
    const index = crawler.indexRef.current;
    const chain = [];
    let cur = entry;
    let guard = 0;
    while (cur && guard < 300) { chain.push(cur.node); cur = index.get(cur.parentId); guard += 1; }
    chain.reverse();
    const add = headPath.concat(chain);
    setNav((n) => ({ path: n.path.slice(0, n.idx).concat(add), idx: n.idx + add.length }));
    setExplorer(null);
  }, [crawler.indexRef]);

  const st = getStatus(focus);
  const shownKids = kids ? kids.slice(0, visible) : [];
  const leftMode = mode === 'tree' && plan.widest * slot > availW;
  const ancestors = trail.slice(Math.max(0, idx - 2), idx);
  const hiddenAbove = Math.max(0, idx - 2);
  const selfPv = getPv(focus);
  const pinText = focus.max_pin || focus.pin || focus.curr_pin || '';
  const groupPv = focus.total_group_pv;
  const focusLegs = kids || EMPTY;

  return (
    <div className="tdt" style={{ '--slot': `${slot}px`, '--upw': `${upW}px` }}>
      <header className="tdt-top">
        <button type="button" className="tdt-btn ic" onClick={onClose} aria-label="Close tree"><ArrowLeft size={18} /></button>
        <div className="tdt-brand"><BrandLogo tagline={false} /></div>
        <h2 className="tdt-title">Team Tree</h2>
        <div className="tdt-sbox">
          <Search size={16} />
          <input className="tdt-in" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, ID or PV"
            aria-label="Search members" onFocus={() => setSearchFocus(true)} onBlur={() => setTimeout(() => setSearchFocus(false), 150)} />
          {searchFocus && search.trim().length >= 2 && (
            <div className="tdt-sres" onPointerDown={(e) => e.preventDefault()}>
              {pvIntent && (
                <div className="it pv" role="button" tabIndex={0}
                  onClick={() => { setSearch(''); setResults([]); openExplorer({ scope: 'all', op: pvIntent.op, pv: pvIntent.pv }); }}>
                  <span className="ico"><SlidersHorizontal size={15} /></span>
                  <span>
                    <b>Members with {OP_TEXT[pvIntent.op]} {formatNumber(pvIntent.pv)} PV</b>
                    <small>in {focus.name || `#${fid}`}'s team · scan and list</small>
                  </span>
                  <ChevronRight size={16} />
                </div>
              )}
              {searching && <div className="msg">Searching...</div>}
              {!searching && results.length === 0 && !(pvIntent && pvIntent.only) && <div className="msg">No members found.</div>}
              {results.map((r) => (
                <div key={nid(r)} className="it" role="button" tabIndex={0} onClick={() => { setSearch(''); setResults([]); openProfile(r); }}>
                  <span>
                    <b>{r.name || `Associate #${nid(r)}`}</b>
                    <small>ID {nid(r)}</small>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </header>

      {notice && (
        <div className="tdt-toast" role="alert">
          <span>{notice}</span>
          <button type="button" aria-label="Dismiss" onClick={() => setNotice('')}><X size={14} /></button>
        </div>
      )}

      <div className="tdt-crumbbar">
        <button type="button" className="tdt-btn" disabled={idx === 0} onClick={() => setIdx(idx - 1)}><ChevronUp size={15} /><span className="t">Back</span></button>
        <button type="button" className="tdt-btn" disabled={idx === 0} onClick={() => setIdx(0)}><ChevronsUp size={15} /><span className="t">Top</span></button>
        <div className="tdt-crumbs" ref={crumbsRef}>
          {trail.map((t, i) => (
            <React.Fragment key={nid(t) + i}>
              {i > 0 && <span className="tdt-sep">›</span>}
              <button type="button" data-active={i === idx ? '1' : '0'}
                className={`tdt-crumb${i === idx ? ' on' : ''}${i > idx ? ' fw' : ''}`} onClick={() => setIdx(i)}>
                {i === 0 ? 'You' : (t.name || nid(t))}
              </button>
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className="tdt-tools">
        <Legend />
        <div className="tdt-tools-right">
          {canToggle && (
            <div className="tdt-seg compact" role="radiogroup" aria-label="View">
              <button type="button" role="radio" aria-checked={mode === 'tree'} className={mode === 'tree' ? 'on' : ''}
                onClick={() => setViewPref({ fid, mode: 'tree' })}><Network size={14} /><span className="t">Tree</span></button>
              <button type="button" role="radio" aria-checked={mode === 'legs'} className={mode === 'legs' ? 'on' : ''}
                onClick={() => setViewPref({ fid, mode: 'legs' })}><LayoutGrid size={14} /><span className="t">Legs</span></button>
            </div>
          )}
          <button type="button" className="tdt-btn p" onClick={() => openExplorer({ scope: 'all' })} disabled={kidsTotal === 0 && !kids}>
            <SlidersHorizontal size={15} /><span>Find members</span>
          </button>
        </div>
      </div>

      <div className="tdt-stage" ref={stageRef}>
        <div className={`tdt-inner ${mode === 'legs' ? 'legs' : leftMode ? 'left' : ''} ${dirRef.current}`} key={fid}>
          <div className="tdt-up">
            {hiddenAbove > 0 && (
              <>
                <button type="button" className="tdt-more" onClick={() => setIdx(Math.max(0, idx - 3))}>+{hiddenAbove} above</button>
                <div className="tdt-vline" style={{ '--h': '8px' }} />
              </>
            )}
            {ancestors.map((a, i) => {
              const as = getStatus(a);
              const pos = idx - ancestors.length + i;
              return (
                <React.Fragment key={nid(a) + pos}>
                  <button type="button" className={`tdt-apill${as.cls === 'r' ? ' t' : ''}`} style={{ '--fc': as.color }} onClick={() => setIdx(pos)}>
                    <Avatar name={a.name} id={nid(a)} photoUrl={photoOf(a)} color={as.color} size={24} fontSize={8} />
                    <span className="n">{pos === 0 ? 'You' : (a.name || nid(a))}</span>
                  </button>
                  <div className="tdt-vline" style={{ '--h': '10px' }} />
                </React.Fragment>
              );
            })}

            <div className={`tdt-fcard${st.cls === 'r' ? ' t' : ''}`} style={{ '--fc': st.color, '--fs': st.soft }}>
              <button type="button" className="inf" aria-label="View profile" onClick={() => openProfile(focus)}><Info size={14} /></button>
              <Avatar name={focus.name} id={fid} photoUrl={photoOf(focus)} color={st.color} size={52} fontSize={16} />
              <div className="nm">{focus.name || `Associate #${fid}`}{idx === 0 ? ' (You)' : ''}</div>
              <div className="id">ID {fid}{pinText ? ` • ${pinText}` : ''}</div>
              <div className="tdt-stats">
                <span className={`tdt-tag ${st.cls}`}>{st.cls === 'r' ? 'Terminated' : `Self ${formatNumber(selfPv)} PV`}</span>
                {groupPv !== undefined && groupPv !== null && Number(groupPv) > 0 && <span className="tdt-tag">GV {formatNumber(groupPv)}</span>}
                {kids && <span className="tdt-tag">{formatNumber(kids.length)} direct</span>}
              </div>
            </div>
            {mode === 'tree' && kids && kids.length > 0 && <div className="tdt-vline" style={{ '--h': '18px' }} />}
          </div>

          {!kids && isLoading(fid) && <div className="tdt-loading"><span className="tdt-spin" />Loading downline...</div>}
          {!kids && !isLoading(fid) && isFailed(fid) && (
            <div className="tdt-fail">
              <div>Could not load this downline.</div>
              <button type="button" className="tdt-btn p" onClick={() => retry(fid)}>Try again</button>
            </div>
          )}
          {kids && kids.length === 0 && (
            <div className="tdt-note">{crawlRunning ? 'Team is still syncing...' : 'No downline enrolled yet'}</div>
          )}

          {mode === 'legs' && kids && kids.length > 0 && (
            <LegsGallery key={fid} kids={kids} onOpen={openLeg}
              onExplore={(i) => openExplorer({ scope: i })} />
          )}

          {mode === 'tree' && shownKids.length > 0 && (
            <div className="tdt-row">
              {leftMode && upW / 2 > slot / 2 && (
                <div className="tdt-spine" style={{ left: slot / 2, width: upW / 2 - slot / 2 }} />
              )}
              {shownKids.map((k, i) => (
                <Subtree key={nid(k)} node={k} chain={[k]} index={i} count={shownKids.length}
                  level={1} plan={plan} getKids={getKids} onPick={onPick} />
              ))}
            </div>
          )}

          {mode === 'tree' && kids && kids.length > visible && (
            <button type="button" className="tdt-btn" style={{ marginTop: 16 }} onClick={() => setVisible((v) => v + TREE_PAGE)}>
              Show more ({kids.length - visible} left)
            </button>
          )}
        </div>
      </div>

      {trail.length > 1 && <DepthRail trail={trail} idx={idx} onChange={setIdx} />}
      {explorer && (
        <LegExplorer key={explorer.id} focus={focus} legs={focusLegs} initial={explorer.init} crawler={crawler}
          onClose={closeExplorer} onLocate={locate} onProfile={openProfile} />
      )}
      {member && <MemberSheet member={member} onClose={closeMember} />}
    </div>
  );
}