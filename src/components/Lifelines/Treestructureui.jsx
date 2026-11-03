import React, { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import { ArrowLeft, Search, ChevronUp, ChevronsUp, Info, X, Phone, MessageCircle } from 'lucide-react';
import { getTreeChildren, getMemberFullProfile, searchLifelines } from '../../services/lifelinesApiClient';
import BrandLogo from '../BrandLogo/BrandLogo'; // adjust path if your BrandLogo lives elsewhere

/**
 * TreestructureUI - full screen downline tree (separate from LifelinesPage).
 *
 * Props
 *  buyerId       : logged-in leader id (string)
 *  rootInfo      : { name, photo_url, max_pin, curr_pin, self_pv, total_group_pv, children_count }
 *  startNode     : optional leg head node to open directly (from "Direct leg heads")
 *  crawlRunning  : bool, true while the backend is still syncing the team
 *  refreshToken  : number; change it to clear the cache and reload (after re-sync / refresh)
 *  onClose       : go back to the Lifelines page
 *  onUnauthorized: optional, called on 401 (token expired)
 */

const COLORS = { green: '#16A34A', red: '#DC2626', slate: '#94A3B8', mu: '#64748B' };
const TREE_PAGE = 40;   // direct children shown per "page" under the focused member
const CAP = 4;          // children shown per node on deeper levels (rest = "+N")
const MAX_DEPTH = 6;    // levels auto-opened under the focused member
const MAX_PARALLEL = 4; // simultaneous tree requests from one browser
const RCM_ORIGIN = 'https://www.rcmworld.com';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const numberFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const formatNumber = (v) => numberFmt.format(Number(v || 0));
const nid = (n) => String(n?.buyer_id ?? n?.buyerId ?? n?.distno ?? n?.id ?? '');
const photoOf = (n) => n?.photo_url ?? n?.photoUrl ?? null;

const cleanUrl = (u) => {
  if (!u) return null;
  let s = String(u).trim();
  const md = s.match(/\((https?:\/\/[^)\s]+)\)/);
  if (md) s = md[1];
  s = s.replace(/^\[|\]$/g, '').trim();
  if (s.startsWith('//')) s = `https:${s}`;
  else if (s.startsWith('http://')) s = `https://${s.slice(7)}`;
  else if (s.startsWith('/')) s = `${RCM_ORIGIN}${s}`;
  return /^https:\/\//.test(s) ? s : null;
};

const getInitials = (v) => {
  const t = String(v || '').trim();
  if (!t) return 'RC';
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

// colour + tag of a member: red = terminated, green = has PV, grey = 0 PV
const getStatus = (n) => {
  if (Number(n.status ?? 1) === 0) return { color: COLORS.red, cls: 'r', tag: 'Terminated' };
  const pv = Number(n.self_pv ?? n.selfPv ?? n.current_pv ?? 0);
  return pv > 0
    ? { color: COLORS.green, cls: 'g', tag: `${formatNumber(pv)} PV` }
    : { color: COLORS.slate, cls: '', tag: '0 PV' };
};

const makeLimiter = (max) => {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= max || !queue.length) return;
    active += 1;
    const { fn, res, rej } = queue.shift();
    fn().then(res, rej).finally(() => { active -= 1; next(); });
  };
  return (fn) => new Promise((res, rej) => { queue.push({ fn, res, rej }); next(); });
};
const limitTreeCalls = makeLimiter(MAX_PARALLEL);

// ---------------------------------------------------------------------------
// Styles (all classes start with td- so they never clash with the Lifelines page)
// ---------------------------------------------------------------------------
const CSS = `
.td-tree{--bd:#E7EBF2;--tx:#0F172A;--mu:#64748B;--pri:#111827;--gr:#16A34A;--rd:#DC2626;--sl:#94A3B8;--line:#CBD5E1;--slot:84px;--upw:144px;
  position:fixed;inset:0;z-index:50;background:#fff;display:flex;flex-direction:column;color:var(--tx);
  font-family:Inter,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;-webkit-tap-highlight-color:transparent}
.td-tree,.td-tree *{box-sizing:border-box}
.td-tree button{font-family:inherit}
.td-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:36px;padding:0 12px;border-radius:12px;border:1px solid var(--bd);background:#fff;color:var(--tx);font-weight:700;font-size:13px;cursor:pointer;text-decoration:none}
.td-btn:hover{background:#F8FAFC}.td-btn:disabled{opacity:.45;cursor:not-allowed}
.td-btn.p{background:var(--pri);color:#fff;border-color:var(--pri)}
.td-btn.ic{width:38px;padding:0;height:38px}
.td-btn:focus-visible,.td-node:focus-visible,.td-crumb:focus-visible,.td-more:focus-visible,.td-apill:focus-visible{outline:2px solid #6366F1;outline-offset:2px}
.td-in{width:100%;height:38px;border:1px solid var(--bd);border-radius:12px;padding:0 14px 0 34px;font-size:13px;background:#fff;color:var(--tx);outline:none}
.td-in:focus{border-color:#6366F1;box-shadow:0 0 0 3px rgba(99,102,241,.15)}
.td-av{border-radius:50%;background:#F1F5F9;display:flex;align-items:center;justify-content:center;overflow:hidden;flex:none;font-weight:800}
.td-av img{width:100%;height:100%;object-fit:cover}
.td-chip{display:inline-flex;align-items:center;padding:3px 9px;border-radius:999px;font-size:11px;font-weight:700;background:#F1F5F9;color:var(--mu)}
.td-chip.g{background:#DCFCE7;color:#15803D}.td-chip.r{background:#FEE2E2;color:#B91C1C}
.td-tag{margin-top:3px;font-size:9px;font-weight:800;padding:1px 6px;border-radius:999px;background:#F1F5F9;color:var(--mu);white-space:nowrap}
.td-tag.g{background:#DCFCE7;color:#15803D}.td-tag.r{background:#FEE2E2;color:#B91C1C}

.td-tbar{display:flex;align-items:center;gap:10px;padding:8px 12px;border-bottom:1px solid var(--bd);position:relative}
.td-tbar .tdlogo{font-size:11px;flex:none}
.td-tbar h2{margin:0;font-size:16px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.td-sbox{position:relative;width:min(300px,50vw)}
.td-sbox>svg{position:absolute;left:11px;top:11px;color:var(--mu);pointer-events:none}
.td-sres{position:absolute;top:calc(100% + 6px);right:0;width:min(340px,92vw);background:#fff;border:1px solid var(--bd);border-radius:14px;box-shadow:0 14px 34px rgba(15,23,42,.16);max-height:300px;overflow-y:auto;z-index:20}
.td-sres .it{padding:10px 14px;cursor:pointer;border-bottom:1px solid #F1F5F9}
.td-sres .it:hover{background:#F8FAFC}
.td-crumbbar{display:flex;align-items:center;gap:6px;padding:6px 10px;border-bottom:1px solid var(--bd);background:#FAFBFD}
.td-crumbbar .td-btn{height:32px;padding:0 10px}
.td-crumbs{display:flex;gap:5px;align-items:center;overflow-x:auto;flex:1;scrollbar-width:none;min-width:0}
.td-crumbs::-webkit-scrollbar{display:none}
.td-crumb{flex:none;border:1px solid var(--bd);background:#fff;border-radius:999px;padding:5px 10px;font-size:11.5px;font-weight:700;cursor:pointer;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--tx)}
.td-crumb.on{background:var(--pri);color:#fff;border-color:var(--pri)}
.td-crumb.fw{opacity:.45;border-style:dashed}
.td-sep{color:var(--sl);flex:none;font-size:12px}

.td-stage{flex:1;overflow:auto;padding:12px 60px 90px 8px;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}
.td-inner{width:max-content;margin:0 auto;display:flex;flex-direction:column;align-items:center}
.td-inner.left{margin:0;align-items:flex-start}
.td-inner.grow .td-row{transform-origin:50% 0;animation:tdGrow .18s ease-out}
.td-inner.shrink{transform-origin:50% 0;animation:tdShrink .18s ease-out}
.td-up{width:var(--upw);display:flex;flex-direction:column;align-items:center}
.td-vline{width:0;height:var(--h,18px);border-left:2px dashed var(--line)}
.td-apill{width:var(--upw);height:34px;display:flex;align-items:center;gap:6px;border:2px solid var(--fc,#94A3B8);border-radius:11px;padding:0 7px;background:#fff;cursor:pointer;font-size:11px;font-weight:800;text-align:left}
.td-apill.t{background:#FEF2F2}
.td-apill .n{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.td-fcard{width:var(--upw);border:2px solid var(--fc,#94A3B8);border-radius:14px;padding:8px 6px;display:flex;flex-direction:column;align-items:center;background:#fff;box-shadow:0 4px 14px rgba(15,23,42,.1);position:relative;text-align:center}
.td-fcard.t{background:#FEF2F2}
.td-fcard .nm{font-size:12.5px;font-weight:800;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:5px}
.td-fcard .id{font-size:10px;color:var(--mu);margin-top:1px}
.td-fcard .inf{position:absolute;top:5px;right:5px;width:26px;height:26px;border-radius:50%;border:0;background:#F1F5F9;color:var(--mu);display:grid;place-items:center;cursor:pointer;padding:0}
.td-row{display:flex;align-items:flex-start;position:relative}
.td-spine{position:absolute;top:0;height:0;border-top:2px dashed var(--line)}
.td-col{--stub:20px;position:relative;display:flex;flex-direction:column;align-items:center;padding:var(--stub) 4px 0}
.td-st{position:absolute;top:0;left:50%;height:var(--stub);border-left:2px dashed var(--line)}
.td-hl{position:absolute;top:0;left:0;right:0;border-top:2px dashed var(--line)}
.td-hl.f{left:50%}.td-hl.l{right:50%}
.td-node{width:calc(var(--slot) - 8px);border:2px solid var(--fc,#94A3B8);border-radius:12px;padding:5px 3px;background:#fff;display:flex;flex-direction:column;align-items:center;cursor:pointer;position:relative;z-index:1;text-align:center;transition:transform .1s}
.td-node:active{transform:scale(.95)}
.td-node.t{background:#FEF2F2}
.td-node .nm{font-size:10.5px;font-weight:800;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:4px}
.td-node .id{font-size:9px;color:var(--mu);line-height:1.2}
.td-kidhint{font-size:9px;color:#0369A1;font-weight:800;margin-top:2px}
.td-more{min-width:34px;height:34px;padding:0 8px;border-radius:17px;border:1.5px dashed #94A3B8;background:#fff;color:var(--mu);font-size:11px;font-weight:800;cursor:pointer;display:grid;place-items:center;position:relative;z-index:1}
.td-note{margin-top:14px;border:1px dashed #CBD5E1;border-radius:12px;padding:10px 16px;font-size:13px;color:var(--mu)}

.td-rail{position:fixed;right:2px;top:50%;transform:translateY(-50%);height:min(60vh,400px);width:54px;z-index:60;touch-action:none;cursor:ns-resize;user-select:none}
.td-rtrack{position:absolute;left:25px;top:16px;bottom:16px;width:4px;border-radius:4px;background:#E2E8F0}
.td-rfill{position:absolute;left:0;top:0;width:100%;border-radius:4px;background:var(--pri)}
.td-tick{position:absolute;left:-3px;width:10px;height:10px;border-radius:50%;background:#fff;border:2px solid #CBD5E1;transform:translateY(-50%)}
.td-tick.on{border-color:var(--pri)}
.td-thumb{position:absolute;left:-11px;width:26px;height:26px;border-radius:50%;background:var(--pri);border:3px solid #fff;box-shadow:0 2px 10px rgba(15,23,42,.4);transform:translateY(-50%)}
.td-thumb.s{transition:top .15s}
.td-bubble{position:absolute;right:30px;transform:translateY(-50%);background:var(--pri);color:#fff;font-size:12px;font-weight:700;padding:6px 10px;border-radius:10px;white-space:nowrap;max-width:60vw;overflow:hidden;text-overflow:ellipsis;pointer-events:none}

.td-toast{position:absolute;top:58px;left:50%;transform:translateX(-50%);z-index:70;background:#FEF2F2;border:1px solid #FECACA;color:#B91C1C;border-radius:12px;padding:8px 14px;font-size:13px;display:flex;gap:10px;align-items:center}
.td-toast button{background:transparent;border:0;color:#B91C1C;cursor:pointer;display:grid;place-items:center;padding:0}

.td-ov{position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:100;display:flex;justify-content:flex-end}
.td-dr{width:min(420px,100%);background:#fff;height:100%;padding:22px;overflow-y:auto}
.td-grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:18px}
.td-kv{background:#F8FAFC;border:1px solid var(--bd);border-radius:12px;padding:12px}
.td-kv .k{font-size:11px;color:var(--mu)}.td-kv .v{font-size:15px;font-weight:800;margin-top:3px;word-break:break-word}

@keyframes tdGrow{from{opacity:0;transform:scaleY(.55) translateY(-6px)}to{opacity:1;transform:none}}
@keyframes tdShrink{from{opacity:.25;transform:scale(1.07)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.td-inner,.td-inner .td-row{animation:none!important}.td-node{transition:none}}
@media (min-width:761px){.td-tree{--slot:112px;--upw:176px}}
@media (max-width:520px){.td-title{display:none}.td-tbar .tdlogo-name{font-size:1.2em}}
@media (max-width:760px){
  .td-btn .t{display:none}
  .td-sbox{width:auto;flex:1}
  .td-ov{align-items:flex-end}
  .td-dr{width:100%;height:auto;max-height:90vh;border-radius:22px 22px 0 0}
}
`;

// ---------------------------------------------------------------------------
// Avatar
// ---------------------------------------------------------------------------
const Avatar = memo(function Avatar({ name, id, photoUrl, color, size = 56, fontSize = 16 }) {
  const [failed, setFailed] = useState(false);
  const src = useMemo(() => cleanUrl(photoUrl), [photoUrl]);
  useEffect(() => setFailed(false), [src]);
  return (
    <div className="td-av" style={{ width: size, height: size, border: `${size < 44 ? 2 : 3}px solid ${color}`, color, fontSize }}>
      {src && !failed
        ? <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
        : <span>{getInitials(name || id)}</span>}
    </div>
  );
});

// ---------------------------------------------------------------------------
// Tree pieces
// ---------------------------------------------------------------------------
const Branch = ({ index, count }) => (
  <>
    {count > 1 && <div className={`td-hl${index === 0 ? ' f' : ''}${index === count - 1 ? ' l' : ''}`} />}
    <div className="td-st" />
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
    <div className="td-col">
      <Branch index={index} count={count} />
      <div className={`td-node${st.cls === 'r' ? ' t' : ''}`} style={{ '--fc': st.color }} role="button" tabIndex={0}
        onClick={() => onPick(chain)} onKeyDown={(e) => { if (e.key === 'Enter') onPick(chain); }}>
        <Avatar name={node.name} id={id} photoUrl={photoOf(node)} color={st.color} size={34} fontSize={11} />
        <div className="nm">{node.name || `#${id}`}</div>
        <div className="id">{id}</div>
        <span className={`td-tag ${st.cls}`}>{st.tag}</span>
        {!showKids && kc > 0 && <span className="td-kidhint">↓ {kc}</span>}
      </div>
      {slots > 0 && (
        <>
          <div className="td-vline" style={{ '--h': '12px' }} />
          <div className="td-row">
            {shown.map((k, i) => (
              <Subtree key={nid(k)} node={k} chain={chain.concat(k)} index={i} count={slots}
                level={level + 1} plan={plan} getKids={getKids} onPick={onPick} />
            ))}
            {extra > 0 && (
              <div className="td-col">
                <Branch index={shown.length} count={slots} />
                <button type="button" className="td-more" onClick={() => onPick(chain)} aria-label={`${extra} more`}>+{extra}</button>
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
    <div className="td-rail" aria-label="Tree depth"
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); draggingRef.current = true; pick(e.clientY); }}
      onPointerMove={(e) => { if (draggingRef.current) pick(e.clientY); }}
      onPointerUp={stop} onPointerCancel={stop}>
      <div className="td-rtrack" ref={trackRef}>
        <div className="td-rfill" style={{ height: `${ratio * 100}%` }} />
        {n <= 30 && trail.map((t, i) => (
          <div key={nid(t) + i} className={`td-tick${i <= idx ? ' on' : ''}`} style={{ top: `${n > 1 ? (i / (n - 1)) * 100 : 0}%` }} />
        ))}
        <div className={`td-thumb${drag === null ? ' s' : ''}`} style={{ top: `${ratio * 100}%` }} />
        {drag !== null && (
          <div className="td-bubble" style={{ top: `${ratio * 100}%` }}>
            L{idx} • {trail[idx]?.name || nid(trail[idx])}
          </div>
        )}
      </div>
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
    <div className="td-ov" onClick={onClose}>
      <div className="td-dr" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>Member profile</div>
          <button type="button" className="td-btn ic" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: 18 }}>
          <Avatar name={member.name} id={member.buyer_id} photoUrl={photoOf(member)} color={ring} size={76} fontSize={24} />
          <div style={{ fontSize: 19, fontWeight: 800, marginTop: 10 }}>{member.name}</div>
          <div style={{ fontSize: 13, color: COLORS.mu, marginTop: 3 }}>Buyer ID {member.buyer_id}</div>
          <span className={`td-chip ${terminated ? 'r' : 'g'}`} style={{ marginTop: 8 }}>
            {terminated ? 'Terminated' : formatKyc(member.kyc_status)}
          </span>
        </div>
        <div className="td-grid2">
          {items.map((it) => <div key={it.k} className="td-kv"><div className="k">{it.k}</div><div className="v">{it.v}</div></div>)}
        </div>
        {phone ? (
          <div style={{ display: 'flex', gap: 10 }}>
            <a className="td-btn" style={{ flex: 1, height: 42 }} href={`tel:+${phone}`}><Phone size={16} />Call</a>
            <a className="td-btn p" style={{ flex: 1, height: 42, background: COLORS.green, borderColor: COLORS.green }} target="_blank" rel="noreferrer"
              href={`https://wa.me/${phone}?text=${encodeURIComponent(`Namaste ${member.name} ji! Connecting regarding your RCM business updates.`)}`}>
              <MessageCircle size={16} />WhatsApp
            </a>
          </div>
        ) : <div style={{ fontSize: 12, color: COLORS.mu, textAlign: 'center' }}>Mobile number not available for this member.</div>}
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

  const ensureKids = useCallback((parentId) => {
    const pid = String(parentId);
    if (!pid || !buyerRef.current) return Promise.resolve(null);
    if (kidsRef.current.has(pid)) return Promise.resolve(kidsRef.current.get(pid));
    if (inflightRef.current.has(pid)) return inflightRef.current.get(pid);
    const sid = sessionRef.current;
    failedRef.current.delete(pid);
    const p = limitTreeCalls(() => getTreeChildren(buyerRef.current, pid))
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
        if (sid === sessionRef.current) scheduleRender();
      });
    inflightRef.current.set(pid, p);
    scheduleRender();
    return p;
  }, [scheduleRender, onUnauthorized]);

  const retry = useCallback((id) => { failedRef.current.delete(String(id)); ensureKids(id); }, [ensureKids]);

  // Parent asked for a fresh load (Refresh / Re-sync finished): drop cache and refetch what is on screen
  useEffect(() => {
    if (firstRefresh.current) { firstRefresh.current = false; return; }
    sessionRef.current += 1;
    kidsRef.current = new Map();
    inflightRef.current = new Map();
    failedRef.current = new Set();
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
  const upW = winW < 761 ? 144 : 176;
  const availW = winW - 68;
  const plan = buildPlan(focus, getKids, availW, slot, visible, crawlRunning);
  const needKey = plan.need.join(',');

  useEffect(() => {
    if (needKey) needKey.split(',').forEach((id) => ensureKids(id));
  }, [needKey, ensureKids]);

  useEffect(() => {
    const active = crumbsRef.current?.querySelector('[data-active="1"]');
    if (active?.scrollIntoView) active.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [idx, trail.length]);

  // search (debounced)
  useEffect(() => {
    const q = search.trim();
    if (q.length < 2 || !buyerId) { setResults([]); return undefined; }
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
  }, [search, buyerId]);

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

  // Esc: close sheet first, then the tree
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (member) setMember(null); else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [member, onClose]);

  const st = getStatus(focus);
  const shownKids = kids ? kids.slice(0, visible) : [];
  const leftMode = plan.widest * slot > availW;
  const ancestors = trail.slice(Math.max(0, idx - 2), idx);
  const hiddenAbove = Math.max(0, idx - 2);
  const selfPv = Number(focus.self_pv ?? focus.selfPv ?? focus.current_pv ?? 0);
  const pinText = focus.max_pin || focus.pin || focus.curr_pin || '';

  return (
    <div className="td-tree" style={{ '--slot': `${slot}px`, '--upw': `${upW}px` }}>
      <style>{CSS}</style>

      <div className="td-tbar">
        <button type="button" className="td-btn ic" onClick={onClose} aria-label="Close tree"><ArrowLeft size={18} /></button>
        <BrandLogo tagline={false} />
        <h2 className="td-title">Team Tree</h2>
        <div className="td-sbox">
          <Search size={16} />
          <input className="td-in" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or ID"
            onFocus={() => setSearchFocus(true)} onBlur={() => setTimeout(() => setSearchFocus(false), 150)} />
          {searchFocus && search.trim().length >= 2 && (
            <div className="td-sres" onPointerDown={(e) => e.preventDefault()}>
              {searching && <div style={{ padding: 12, fontSize: 12, color: COLORS.mu }}>Searching...</div>}
              {!searching && results.length === 0 && <div style={{ padding: 12, fontSize: 12, color: COLORS.mu }}>No members found.</div>}
              {results.map((r) => (
                <div key={nid(r)} className="it" onClick={() => { setSearch(''); setResults([]); openProfile(r); }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{r.name || `Associate #${nid(r)}`}</div>
                  <div style={{ fontSize: 11, color: COLORS.mu }}>ID {nid(r)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {notice && (
        <div className="td-toast">
          <span>{notice}</span>
          <button type="button" aria-label="Dismiss" onClick={() => setNotice('')}><X size={14} /></button>
        </div>
      )}

      <div className="td-crumbbar">
        <button type="button" className="td-btn" disabled={idx === 0} onClick={() => setIdx(idx - 1)}><ChevronUp size={15} /><span>Back</span></button>
        <button type="button" className="td-btn" disabled={idx === 0} onClick={() => setIdx(0)}><ChevronsUp size={15} /><span>Top</span></button>
        <div className="td-crumbs" ref={crumbsRef}>
          {trail.map((t, i) => (
            <React.Fragment key={nid(t) + i}>
              {i > 0 && <span className="td-sep">›</span>}
              <button type="button" data-active={i === idx ? '1' : '0'}
                className={`td-crumb${i === idx ? ' on' : ''}${i > idx ? ' fw' : ''}`} onClick={() => setIdx(i)}>
                {i === 0 ? 'You' : (t.name || nid(t))}
              </button>
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className="td-stage" ref={stageRef}>
        <div className={`td-inner ${leftMode ? 'left' : ''} ${dirRef.current}`} key={fid}>
          <div className="td-up">
            {hiddenAbove > 0 && (
              <>
                <button type="button" className="td-more" onClick={() => setIdx(Math.max(0, idx - 3))}>+{hiddenAbove} above</button>
                <div className="td-vline" style={{ '--h': '8px' }} />
              </>
            )}
            {ancestors.map((a, i) => {
              const as = getStatus(a);
              const pos = idx - ancestors.length + i;
              return (
                <React.Fragment key={nid(a) + pos}>
                  <button type="button" className={`td-apill${as.cls === 'r' ? ' t' : ''}`} style={{ '--fc': as.color }} onClick={() => setIdx(pos)}>
                    <Avatar name={a.name} id={nid(a)} photoUrl={photoOf(a)} color={as.color} size={22} fontSize={8} />
                    <span className="n">{pos === 0 ? 'You' : (a.name || nid(a))}</span>
                  </button>
                  <div className="td-vline" style={{ '--h': '10px' }} />
                </React.Fragment>
              );
            })}

            <div className={`td-fcard${st.cls === 'r' ? ' t' : ''}`} style={{ '--fc': st.color }}>
              <button type="button" className="inf" aria-label="View profile" onClick={() => openProfile(focus)}><Info size={14} /></button>
              <Avatar name={focus.name} id={fid} photoUrl={photoOf(focus)} color={st.color} size={40} fontSize={13} />
              <div className="nm">{focus.name || `Associate #${fid}`}{idx === 0 ? ' (You)' : ''}</div>
              <div className="id">ID {fid}{pinText ? ` • ${pinText}` : ''}</div>
              <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
                <span className={`td-tag ${st.cls}`} style={{ marginTop: 0 }}>{st.cls === 'r' ? 'Terminated' : `Self ${formatNumber(selfPv)} PV`}</span>
                {kids && <span className="td-tag" style={{ marginTop: 0 }}>{kids.length} direct</span>}
              </div>
            </div>
            {kids && kids.length > 0 && <div className="td-vline" style={{ '--h': '18px' }} />}
          </div>

          {!kids && isLoading(fid) && <div style={{ padding: 24, color: COLORS.mu, fontSize: 13 }}>Loading downline...</div>}
          {!kids && !isLoading(fid) && isFailed(fid) && (
            <div style={{ padding: 20, textAlign: 'center' }}>
              <div style={{ color: '#B91C1C', fontSize: 13, marginBottom: 10 }}>Could not load this downline.</div>
              <button type="button" className="td-btn p" onClick={() => retry(fid)}>Try again</button>
            </div>
          )}
          {kids && kids.length === 0 && (
            <div className="td-note">{crawlRunning ? 'Team is still syncing...' : 'No downline enrolled yet'}</div>
          )}

          {shownKids.length > 0 && (
            <div className="td-row">
              {leftMode && upW / 2 > slot / 2 && (
                <div className="td-spine" style={{ left: slot / 2, width: upW / 2 - slot / 2 }} />
              )}
              {shownKids.map((k, i) => (
                <Subtree key={nid(k)} node={k} chain={[k]} index={i} count={shownKids.length}
                  level={1} plan={plan} getKids={getKids} onPick={onPick} />
              ))}
            </div>
          )}

          {kids && kids.length > visible && (
            <button type="button" className="td-btn" style={{ marginTop: 16 }} onClick={() => setVisible((v) => v + TREE_PAGE)}>
              Show more ({kids.length - visible} left)
            </button>
          )}
        </div>
      </div>

      {trail.length > 1 && <DepthRail trail={trail} idx={idx} onChange={setIdx} />}
      {member && <MemberSheet member={member} onClose={() => setMember(null)} />}
    </div>
  );
}