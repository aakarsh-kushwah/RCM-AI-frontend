import React, { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import {
  ShieldCheck, Activity, TreePine, Sparkles, RefreshCw, LogOut, Phone,
  MessageCircle, X, ArrowUpRight, Users, TrendingUp, UserCheck, Wallet, UserPlus
} from 'lucide-react';
import socketService from '../../services/socketService';
import {
  syncLifelines, logoutLifelines, getLifelinesOverview,
  getAssistantQuery, getSyncStatus, getNewJoinings
} from '../../services/lifelinesApiClient';
import BrandLogo from '../BrandLogo/BrandLogo';
import TeamTree from './TeamTree';

const ACTIVE_ID_KEY = 'rcm_active_buyer_id';
const COLORS = { green: '#16A34A', red: '#DC2626', slate: '#94A3B8', mu: '#64748B' };
const MATRIX_PAGE = 50;     // report table rows rendered per page
const JOIN_PAGE = 30;       // joining cards rendered per "show more"
const RCM_ORIGIN = 'https://www.rcmworld.com';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const numberFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const formatNumber = (v) => numberFmt.format(Number(v || 0));

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

const getActiveSocket = () => {
  if (typeof socketService?.on === 'function') return socketService;
  return socketService?.getSocket?.() || socketService?.socket || null;
};

// ---- New Joinings request ----
const requestNewJoinings = (id) => getNewJoinings(id);

// ---- Payload normalisers ----
const normalizeLeg = (l, i) => {
  const rawId = l.distno ?? l.head_id ?? l.buyer_id ?? l.buyerId;
  const letter = l.leg || String(l.leg_type || '').replace(/^leg\s*/i, '') || String.fromCharCode(65 + i);
  return {
    ...l,
    head_id: rawId ? String(rawId) : '',
    head_name: l.head_name ?? l.name ?? '',
    leg: String(letter).toUpperCase(),
    photo_url: cleanUrl(l.photo_url ?? l.photoUrl),
    pin: l.pin_level ?? l.pinLevel ?? l.highest_pin ?? l.max_pin ?? l.curr_pin ?? null,
    pv: Number(l.pv ?? l.total_leg_subtree_pv ?? 0),
    repurchase_amt: Number(l.repurchase_amt ?? l.total_leg_repurchase_amt ?? 0),
    self_pv: Number(l.self_pv ?? 0)
  };
};

const normalizeOverview = (d) => {
  if (!d) return null;
  const idn = d.identity || {};
  const t = d.totals || {};
  const pin = d.pinLevel ?? idn.max_pin ?? idn.highest_pin ?? idn.curr_pin ?? null;
  const legsRaw = d.directLegs || d.legs || [];
  return {
    ...d,
    identity: {
      name: d.name ?? idn.name ?? '',
      photo_url: cleanUrl(d.photoUrl ?? idn.photo_url),
      max_pin: pin,
      curr_pin: idn.curr_pin ?? pin,
      kyc_status: idn.kyc_status,
      join_date: idn.join_date
    },
    totalPv: Number(d.totalPv ?? d.total_pv ?? t.totalPv ?? 0),
    selfPv: Number(d.selfPv ?? d.self_pv ?? t.selfPv ?? 0),
    selfRepurchaseAmt: Number(d.selfRepurchaseAmt ?? d.self_repurchase_amt ?? d.repurchase_amt ?? 0),
    totalTeamRepurchaseAmt: Number(
      d.totalTeamRepurchaseAmt ?? d.total_team_repurchase_amt ?? d.total_repurchase_amt ?? t.totalRepurchaseAmt ?? 0
    ),
    totalTeam: Number(d.total_team ?? t.totalMembers ?? 0),
    activeCount: Number(d.active_purchasers ?? t.activePurchasers ?? t.active ?? 0),
    inactiveCount: Number(d.inactive_members ?? t.inactive ?? t.zeroPv ?? 0),
    terminatedCount: Number(d.terminated_members ?? t.terminated ?? 0),
    directLegs: legsRaw.map(normalizeLeg)
  };
};

const normalizeJoinings = (json) => {
  const data = Array.isArray(json?.data) ? json.data : [];
  const months = Array.isArray(json?.months) ? json.months : [];
  const counts = { ...(json?.monthCounts || {}) };
  if (Object.keys(counts).length === 0) {
    data.forEach((m) => { counts[m.month_label] = (counts[m.month_label] || 0) + 1; });
  }
  return {
    data,
    months,
    monthCounts: counts,
    total: Number(json?.totalNewJoinings ?? data.length),
    error: false
  };
};

const EMPTY_JOININGS = { data: [], months: [], monthCounts: {}, total: 0, error: true };

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const CSS = `
.ll{--bg:#F5F7FB;--bd:#E7EBF2;--tx:#0F172A;--mu:#64748B;--pri:#111827;--gr:#16A34A;--rd:#DC2626;--sl:#94A3B8;
  background:var(--bg);color:var(--tx);min-height:100vh;font-family:Inter,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;-webkit-tap-highlight-color:transparent}
.ll,.ll *{box-sizing:border-box}
.ll button{font-family:inherit}
.ll-nav{position:sticky;top:0;z-index:40;background:#fff;border-bottom:1px solid var(--bd);height:60px;display:flex;align-items:center;padding:0 20px}
.ll-nav .tdlogo{font-size:13px}
.ll-body{padding:20px}
.ll-wrap{max-width:1240px;margin:0 auto}
.ll-card{background:#fff;border:1px solid var(--bd);border-radius:18px;box-shadow:0 1px 2px rgba(16,24,40,.04)}
.ll-head{padding:16px 20px;display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:16px}
.ll-who{display:flex;align-items:center;gap:14px;min-width:0}
.ll-h1{font-size:20px;font-weight:800;margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ll-sub{font-size:12.5px;color:var(--mu);margin-top:3px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.ll-chip{display:inline-flex;align-items:center;padding:3px 9px;border-radius:999px;font-size:11px;font-weight:700;background:#F1F5F9;color:var(--mu);white-space:nowrap}
.ll-chip.g{background:#DCFCE7;color:#15803D}.ll-chip.r{background:#FEE2E2;color:#B91C1C}.ll-chip.t{background:#E0F2FE;color:#0369A1}.ll-chip.a{background:#FEF3C7;color:#B45309}
.ll-acts{display:flex;gap:8px;flex-wrap:wrap}
.ll-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;height:40px;padding:0 16px;border-radius:12px;border:1px solid var(--bd);background:#fff;color:var(--tx);font-weight:700;font-size:13px;cursor:pointer;text-decoration:none;transition:background .15s}
.ll-btn:hover{background:#F8FAFC}.ll-btn:disabled{opacity:.45;cursor:not-allowed}
.ll-btn.p{background:var(--pri);color:#fff;border-color:var(--pri)}.ll-btn.p:hover{background:#1F2937}
.ll-btn.d{color:var(--rd);border-color:#FECACA;background:#FEF2F2}
.ll-btn.ic{width:40px;padding:0}
.ll-btn:focus-visible,.ll-tab:focus-visible,.ll-leg:focus-visible{outline:2px solid #6366F1;outline-offset:2px}
.ll-tabs{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;padding:6px;margin-bottom:16px}
.ll-tab{height:44px;border:0;border-radius:12px;background:transparent;color:var(--mu);font-weight:700;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;padding:0 4px}
.ll-tab.on{background:var(--pri);color:#fff}
.ll-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px}
.ll-stat{padding:18px;display:flex;flex-direction:column;gap:4px}
.ll-stat .ico{width:38px;height:38px;border-radius:11px;background:#F1F5F9;display:grid;place-items:center;color:var(--pri);margin-bottom:6px}
.ll-stat .v{font-size:26px;font-weight:800;letter-spacing:-.5px}
.ll-stat .l{font-size:13px;color:var(--mu);font-weight:600}
.ll-stat .n{font-size:11.5px;color:var(--mu)}
.ll-stat .sub-v{font-size:17px;font-weight:800;color:var(--gr);margin-top:6px}
.ll-stat .badges{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;padding-top:8px;border-top:1px solid #F1F5F9}
.ll-sec{padding:20px;margin-top:16px}
.ll-sec h3{margin:0;font-size:18px}.ll-sec p{margin:3px 0 0;color:var(--mu);font-size:13px}
.ll-sechd{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:16px}
.ll-treebtn{width:100%;display:flex;align-items:center;justify-content:space-between;gap:14px;padding:18px 20px;margin-top:16px;cursor:pointer;text-align:left;background:#fff;border:1px solid var(--bd);border-radius:18px}
.ll-treebtn:hover{background:#F8FAFC}
.ll-treebtn:disabled{opacity:.5;cursor:not-allowed}
.ll-treebtn .ico{width:44px;height:44px;border-radius:13px;background:var(--pri);color:#fff;display:grid;place-items:center;flex:none}
.ll-legs{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,340px),1fr));gap:12px}
.ll-leg{border:1px solid var(--bd);border-radius:14px;padding:14px 16px;display:flex;justify-content:space-between;align-items:center;gap:10px;cursor:pointer;background:#fff;text-align:left;width:100%}
.ll-leg:hover{background:#F8FAFC}
.ll-legav{width:44px;height:44px;border-radius:50%;background:#DCFCE7;color:#15803D;border:2px solid var(--gr);display:grid;place-items:center;font-weight:800;font-size:18px;flex:none}
.ll-empty{padding:22px;text-align:center;color:var(--mu);font-size:14px}
.ll-av{border-radius:50%;background:#F1F5F9;display:flex;align-items:center;justify-content:center;overflow:hidden;flex:none;font-weight:800}
.ll-av img{width:100%;height:100%;object-fit:cover}
.ll-chips{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}
.ll-fchip{border:1px solid var(--bd);background:#fff;border-radius:999px;padding:8px 14px;font-size:13px;font-weight:700;cursor:pointer;color:var(--tx)}
.ll-fchip.on{background:var(--pri);color:#fff;border-color:var(--pri)}
.ll-tw{overflow:auto;border:1px solid var(--bd);border-radius:14px;max-height:70vh;background:#fff}
.ll-tbl{width:100%;border-collapse:separate;border-spacing:0;font-size:13px;white-space:nowrap}
.ll-tbl th{position:sticky;top:0;background:#F8FAFC;color:var(--mu);text-align:left;padding:12px 14px;font-weight:700;z-index:2;border-bottom:1px solid var(--bd)}
.ll-tbl td{padding:12px 14px;background:#fff;border-bottom:1px solid #F1F5F9}
.ll-tbl tr:nth-child(even) td{background:#FAFBFD}
.ll-tbl .sl{position:sticky;left:0;z-index:1;min-width:200px;box-shadow:2px 0 6px rgba(15,23,42,.05)}
.ll-tbl th.sl{z-index:3}
.ll-tbl .sr{position:sticky;right:0;z-index:1;box-shadow:-2px 0 6px rgba(15,23,42,.05)}
.ll-tbl th.sr{z-index:3}
.ll-tbl .num{text-align:right}
.ll-round{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;text-decoration:none;background:#F1F5F9;color:var(--gr);flex:none}
.ll-round.wa{background:var(--gr);color:#fff}.ll-round.off{opacity:.35;color:var(--mu)}
.ll-pager{display:flex;justify-content:space-between;align-items:center;margin-top:12px;font-size:13px;color:var(--mu);gap:10px;flex-wrap:wrap}
.ll-ov{position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:100;display:flex;justify-content:flex-end}
.ll-ov.c{align-items:center;justify-content:center;z-index:110;padding:16px;background:rgba(245,247,251,.92)}
.ll-modal{width:min(440px,100%);background:#fff;border:1px solid var(--bd);border-radius:22px;padding:28px;box-shadow:0 24px 60px rgba(15,23,42,.18);position:relative}
.ll-in{width:100%;height:46px;border:1px solid var(--bd);border-radius:12px;padding:0 14px;font-size:14px;background:#fff;color:var(--tx);outline:none}
.ll-in:focus{border-color:#6366F1;box-shadow:0 0 0 3px rgba(99,102,241,.15)}
.ll-err{background:#FEF2F2;border:1px solid #FECACA;color:#B91C1C;border-radius:12px;padding:10px 14px;font-size:13px}
.ll-pill{position:fixed;left:50%;transform:translateX(-50%);bottom:18px;background:#fff;border:1.5px solid var(--bd);border-radius:16px;padding:12px 18px;z-index:120;box-shadow:0 12px 32px rgba(15,23,42,.18);display:flex;gap:12px;align-items:center;max-width:92vw}
.ll-dot{width:10px;height:10px;border-radius:50%;flex:none}
.ll-toast{background:#FEF2F2;border:1px solid #FECACA;color:#B91C1C;border-radius:12px;padding:10px 14px;margin-bottom:14px;font-size:13px;display:flex;justify-content:space-between;gap:10px}
.ll-sumbar{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;padding:16px 20px;margin-bottom:14px;background:linear-gradient(135deg,#ECFDF5,#F0F9FF);border:1px solid #BBF7D0;border-radius:18px}
.ll-sumbar .big{font-size:26px;font-weight:800;color:#15803D;letter-spacing:-.5px}
.ll-joins{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,360px),1fr));gap:12px}
.ll-join{border:1px solid var(--bd);border-radius:16px;padding:14px 16px;background:#fff;display:flex;flex-direction:column;gap:10px;content-visibility:auto;contain-intrinsic-size:190px}
.ll-join-top{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}
.ll-join-badges{display:flex;gap:6px;flex-wrap:wrap}
.ll-rel{background:#F8FAFC;border:1px solid #F1F5F9;border-radius:12px;padding:9px 12px;font-size:12.5px;line-height:1.45}
.ll-rel .k{color:var(--mu);font-size:11px;font-weight:700;display:block}
.ll-rel .vv{font-weight:700;color:var(--tx);word-break:break-word}
.ll-join-acts{display:flex;gap:8px;align-items:center}
.ll-wabtn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:36px;padding:0 14px;border-radius:12px;background:var(--gr);color:#fff;font-weight:700;font-size:12.5px;text-decoration:none;flex:1}
.ll-wabtn.off{background:#E2E8F0;color:#94A3B8;pointer-events:none}
@keyframes llSpin{to{transform:rotate(360deg)}}
@keyframes llPulse{0%,100%{opacity:1}50%{opacity:.35}}
@media (max-width:760px){
  .ll-nav{padding:0 12px;height:56px}
  .ll-body{padding:12px}
  .ll-head{padding:14px}
  .ll-btn .t{display:none}.ll-btn{padding:0;width:40px}
  .ll-tab .t{font-size:12px}
  .ll-tab{gap:5px;font-size:12px}
  .ll-stats{grid-template-columns:1fr 1fr;gap:10px}
  .ll-stat{padding:14px}.ll-stat .v{font-size:20px}
  .ll-sec{padding:14px}
  .ll-sumbar{padding:14px}.ll-sumbar .big{font-size:22px}
}
@media (max-width:480px){
  .ll-tab svg{display:none}
  .ll-tab .t{font-size:11.5px;line-height:1.15}
  .ll-stats{grid-template-columns:1fr}
}
`;

// ---------------------------------------------------------------------------
// Avatar (no-referrer so RCM CDN images load, clean initials fallback on error)
// ---------------------------------------------------------------------------
const Avatar = memo(function Avatar({ name, id, photoUrl, color, size = 56, fontSize = 16 }) {
  const [failed, setFailed] = useState(false);
  const src = useMemo(() => cleanUrl(photoUrl), [photoUrl]);
  useEffect(() => { setFailed(false); }, [src]);
  return (
    <div className="ll-av" style={{ width: size, height: size, border: `${size < 44 ? 2 : 3}px solid ${color}`, color, fontSize }}>
      {src && !failed
        ? <img src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
        : <span>{getInitials(name || id)}</span>}
    </div>
  );
});

// ---------------------------------------------------------------------------
// Live sync pill
// ---------------------------------------------------------------------------
function SyncPill({ buyerId, onComplete }) {
  const [t, setT] = useState(null);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  useEffect(() => {
    const socket = getActiveSocket();
    if (!socket || !buyerId) return undefined;
    let hideTimer;
    let flushTimer;
    let latest = null;
    const handle = (data) => {
      if (!data || String(data.buyerId) !== String(buyerId)) return;
      latest = data;
      if (data.isComplete) {
        clearTimeout(flushTimer); flushTimer = null;
        setT(data);
        if (onCompleteRef.current) onCompleteRef.current(data);
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => setT(null), data.status === 'error' ? 6000 : 4000);
        return;
      }
      if (!flushTimer) {
        flushTimer = setTimeout(() => { flushTimer = null; setT(latest); }, 400);
      }
    };
    socket.on('LIFELINES_SYNC_PROGRESS', handle);
    return () => {
      clearTimeout(hideTimer); clearTimeout(flushTimer);
      if (socket.off) socket.off('LIFELINES_SYNC_PROGRESS', handle);
    };
  }, [buyerId]);

  if (!t) return null;
  const isError = t.status === 'error';
  const done = t.isComplete && !isError;
  return (
    <div className="ll-pill" style={{ borderColor: isError ? '#FECACA' : '#BBF7D0' }}>
      <div className="ll-dot" style={{ background: isError ? COLORS.red : COLORS.green, animation: t.isComplete ? 'none' : 'llPulse 1.2s infinite' }} />
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 800 }}>
          {isError ? (t.message || 'Sync failed')
            : done ? `Sync complete: ${formatNumber(t.totalParsed)} members`
              : `Syncing team: ${formatNumber(t.totalParsed)} members found`}
        </div>
        {!isError && (
          <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
            {formatNumber(t.activePurchasers)} active, {formatNumber(t.terminatedCount)} terminated
            {!done && ` • ${t.latestMemberName || 'Processing...'}`}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Report table row
// ---------------------------------------------------------------------------
const MatrixRow = memo(function MatrixRow({ row, months }) {
  const wa = toWhatsappNumber(row.mobile_no);
  const dial = String(row.mobile_no || '').replace(/\D/g, '');
  return (
    <tr>
      <td className="sl">
        <div style={{ fontWeight: 800 }}>{row.name}</div>
        <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>ID {row.buyer_id}{row.leg_type ? ` • ${row.leg_type}` : ''}</div>
        <div style={{ fontSize: 10, color: '#0369A1', marginTop: 1 }}>KYC: {formatKyc(row.kyc_status)}</div>
      </td>
      <td style={{ color: '#64748B' }}>{row.district || '—'}</td>
      {months.map((m, i) => {
        const pv = row.monthly_pv?.[m] ?? (i === 0 ? row.current_month_pv || 0 : 0);
        const amt = row.monthly_purchase_amt?.[m] ?? (i === 0 ? row.repurchase_amt || 0 : 0);
        return (
          <td key={m} className="num">
            <div style={{ fontWeight: i === 0 ? 800 : 600, color: i === 0 ? COLORS.green : '#0F172A' }}>₹ {formatNumber(amt)}</div>
            <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>{formatNumber(pv)} PV</div>
          </td>
        );
      })}
      <td className="sr">
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          {dial.length >= 10
            ? <a className="ll-round" href={`tel:+${wa || dial}`} title="Call"><Phone size={14} /></a>
            : <span className="ll-round off"><Phone size={14} /></span>}
          {wa
            ? <a className="ll-round wa" target="_blank" rel="noreferrer" title="WhatsApp"
              href={`https://wa.me/${wa}?text=${encodeURIComponent(`Namaste ${row.name} ji! RCM team business update.`)}`}><MessageCircle size={14} /></a>
            : <span className="ll-round off"><MessageCircle size={14} /></span>}
        </div>
      </td>
    </tr>
  );
});

// ---------------------------------------------------------------------------
// New joining card
// ---------------------------------------------------------------------------
const JoinCard = memo(function JoinCard({ member }) {
  const wa = toWhatsappNumber(member.mobile_no);
  const dial = String(member.mobile_no || '').replace(/\D/g, '');
  const callable = dial.length >= 10;
  const welcome = `Namaste ${member.name} ji! RCM family me aapka hardik swagat hai. Business shuru karne me kisi bhi help ki zarurat ho to mujhe zaroor batayein.`;
  return (
    <div className="ll-join">
      <div className="ll-join-top">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <Avatar name={member.name} id={member.buyer_id} photoUrl={member.photo_url} color={COLORS.green} size={42} fontSize={14} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis' }}>{member.name}</div>
            <div style={{ fontSize: 11.5, color: COLORS.mu, marginTop: 1 }}>ID {member.buyer_id}</div>
          </div>
        </div>
      </div>
      <div className="ll-join-badges">
        {member.leg_type && <span className="ll-chip t">{member.leg_type}</span>}
        <span className="ll-chip g">Joined: {formatJoinDate(member.join_date)}</span>
        {member.status === 0 && <span className="ll-chip r">Terminated</span>}
      </div>
      <div className="ll-rel">
        <span className="k">Proposer (ID Lagayi)</span>
        <span className="vv">{member.proposer_name || '—'} ({member.proposer_id || '—'})</span>
      </div>
      <div className="ll-rel">
        <span className="k">Sponsor (Kiske Niche)</span>
        <span className="vv">{member.sponsor_name || '—'} ({member.sponsor_id || '—'})</span>
      </div>
      <div className="ll-join-acts">
        {callable
          ? <a className="ll-round" href={`tel:+${wa || dial}`} title="Call"><Phone size={15} /></a>
          : <span className="ll-round off"><Phone size={15} /></span>}
        {wa
          ? <a className="ll-wabtn" target="_blank" rel="noreferrer"
            href={`https://wa.me/${wa}?text=${encodeURIComponent(welcome)}`}><MessageCircle size={15} />WhatsApp Welcome</a>
          : <span className="ll-wabtn off"><MessageCircle size={15} />WhatsApp Welcome</span>}
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------
export default function LifelinesPage() {
  const [initialId] = useState(() => localStorage.getItem(ACTIVE_ID_KEY) || localStorage.getItem('rcm_buyer_id') || '');

  const [activeBuyerId, setActiveBuyerId] = useState(initialId);
  const [loginId, setLoginId] = useState(initialId);
  const [password, setPassword] = useState('');
  const [showSyncModal, setShowSyncModal] = useState(!initialId);
  const [formError, setFormError] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [booting, setBooting] = useState(Boolean(initialId));
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');

  const [overview, setOverview] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  // tree screen (lives in Treestructureui.jsx)
  const [treeStart, setTreeStart] = useState(null);
  const [treeRefresh, setTreeRefresh] = useState(0);

  // reports
  const [assistantQuery, setAssistantQuery] = useState('');
  const [reportSearch, setReportSearch] = useState('');
  const [matrixData, setMatrixData] = useState([]);
  const [matrixMonths, setMatrixMonths] = useState([]);
  const [loadingAssistant, setLoadingAssistant] = useState(false);
  const [matrixPage, setMatrixPage] = useState(0);
  const [selectedYear, setSelectedYear] = useState(() => String(new Date().getFullYear()));
  const [selectedMonth, setSelectedMonth] = useState(() => String(new Date().getMonth() + 1).padStart(2, '0'));
  const [selectedLegFilter, setSelectedLegFilter] = useState('all');

  // new joinings
  const [joinings, setJoinings] = useState(null);       // null = not loaded yet
  const [loadingJoinings, setLoadingJoinings] = useState(false);
  const [joinFilter, setJoinFilter] = useState('all');  // 'all' | 0 | 1 | 2 (month index)
  const [joinVisible, setJoinVisible] = useState(JOIN_PAGE);

  const monthKey = `${selectedYear}${selectedMonth}`;

  const sessionRef = useRef(0);
  const activeIdRef = useRef(activeBuyerId);
  const assistantQueryRef = useRef('');
  const assistantReqRef = useRef(0);
  const joinReqRef = useRef(0);
  const lastCompleteRef = useRef(0);
  const syncCompleteRef = useRef(null);
  const reportTimerRef = useRef(null);

  useEffect(() => { activeIdRef.current = activeBuyerId; }, [activeBuyerId]);
  useEffect(() => { assistantQueryRef.current = assistantQuery; }, [assistantQuery]);
  useEffect(() => () => clearTimeout(reportTimerRef.current), []);

  const resetSessionState = useCallback(() => {
    sessionRef.current += 1;
    setOverview(null);
    setMatrixData([]);
    setJoinings(null);
    setJoinFilter('all');
    setTreeStart(null);
    setAssistantQuery('');
    setReportSearch('');
    setSelectedLegFilter('all');
    setSyncing(false);
    setLoadError('');
    setActiveBuyerId('');
  }, []);

  const loadOverview = useCallback(async (id, sid) => {
    try {
      const json = await getLifelinesOverview(id);
      if (sid !== sessionRef.current) return;
      if (json?.success && json.data) {
        setOverview(normalizeOverview(json.data));
        if (json.data?.crawl?.running) setSyncing(true);
      } else {
        setOverview(null);
      }
    } catch (e) {
      if (sid === sessionRef.current) {
        setOverview(null);
        if (e.status === 401) setShowSyncModal(true);
      }
    }
  }, []);

  const loadAssistant = useCallback(async (id, queryStr, mKey, sid) => {
    if (!id) return;
    assistantReqRef.current += 1;
    const req = assistantReqRef.current;
    setLoadingAssistant(true);
    try {
      const json = await getAssistantQuery(id, queryStr, mKey);
      if (sid !== sessionRef.current || req !== assistantReqRef.current) return;
      if (json?.success && Array.isArray(json.data)) {
        setMatrixData(json.data);
        setMatrixPage(0);
        if (Array.isArray(json.months) && json.months.length) setMatrixMonths(json.months);
      } else {
        setMatrixData([]);
      }
    } catch (e) {
      if (sid === sessionRef.current && req === assistantReqRef.current) setMatrixData([]);
    } finally {
      if (sid === sessionRef.current && req === assistantReqRef.current) setLoadingAssistant(false);
    }
  }, []);

  const loadJoinings = useCallback(async (id, sid) => {
    if (!id) return;
    joinReqRef.current += 1;
    const req = joinReqRef.current;
    setLoadingJoinings(true);
    try {
      const json = await requestNewJoinings(id);
      if (sid !== sessionRef.current || req !== joinReqRef.current) return;
      setJoinings(json?.success ? normalizeJoinings(json) : EMPTY_JOININGS);
    } catch (e) {
      if (sid !== sessionRef.current || req !== joinReqRef.current) return;
      setJoinings(EMPTY_JOININGS);
      if (e.status === 401) setShowSyncModal(true);
    } finally {
      if (sid === sessionRef.current && req === joinReqRef.current) setLoadingJoinings(false);
    }
  }, []);

  // Overview first (instant), reports in parallel. Joinings are fetched lazily when that tab opens.
  const loadAll = useCallback(async (id) => {
    if (!id) return;
    const sid = sessionRef.current;
    setLoadError('');
    setTreeRefresh((v) => v + 1);
    setJoinings(null); // stale -> re-fetched automatically if the joinings tab is open / opened later
    try {
      await Promise.allSettled([
        loadOverview(id, sid),
        loadAssistant(id, assistantQueryRef.current, `${selectedYear}${selectedMonth}`, sid)
      ]);
    } finally {
      if (sid === sessionRef.current) setBooting(false);
    }
  }, [loadOverview, loadAssistant, selectedYear, selectedMonth]);

  // Page mount: go straight to the overview API (password modal only if there is no saved account)
  useEffect(() => {
    if (initialId) loadAll(initialId); else setShowSyncModal(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lazy-load joinings when its tab is opened
  useEffect(() => {
    if (activeTab === 'joinings' && activeBuyerId && joinings === null && !loadingJoinings) {
      loadJoinings(activeBuyerId, sessionRef.current);
    }
  }, [activeTab, activeBuyerId, joinings, loadingJoinings, loadJoinings]);

  const handleSyncComplete = useCallback(() => {
    const now = Date.now();
    if (now - lastCompleteRef.current < 3000) return;
    lastCompleteRef.current = now;
    setSyncing(false);
    if (activeIdRef.current) loadAll(activeIdRef.current);
  }, [loadAll]);
  useEffect(() => { syncCompleteRef.current = handleSyncComplete; }, [handleSyncComplete]);

  useEffect(() => {
    if (!syncing || !activeBuyerId) return undefined;
    const sid = sessionRef.current;
    let ticks = 0;
    const timer = setInterval(async () => {
      if (document.hidden) return;
      ticks += 1;
      if (ticks > 450) { setSyncing(false); return; }
      try {
        const json = await getSyncStatus(activeBuyerId);
        if (sid !== sessionRef.current) return;
        const crawl = json?.data?.crawl;
        if (!crawl || (!crawl.running && crawl.finishedAt)) syncCompleteRef.current?.();
      } catch (e) { /* ignore transient errors */ }
    }, 8000);
    return () => clearInterval(timer);
  }, [syncing, activeBuyerId]);

  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  const handleSyncConnect = async () => {
    const id = loginId.trim();
    if (!/^\d{6,10}$/.test(id)) { setFormError('Enter a valid RCM Buyer ID (digits only).'); return; }
    if (!password) { setFormError('Enter your RCM password.'); return; }
    setIsConnecting(true);
    setFormError('');
    try {
      const json = await syncLifelines(id, password);
      const token = json?.lifelinesToken || json?.token;
      if (!json?.success || !token) throw new Error(json?.message || 'RCM connection failed.');

      if (id !== activeIdRef.current) resetSessionState();
      localStorage.setItem(ACTIVE_ID_KEY, id);
      localStorage.setItem('rcm_buyer_id', id);
      setActiveBuyerId(id);
      activeIdRef.current = id;
      setPassword('');
      setShowSyncModal(false);
      setSyncing(true);
      setBooting(true);
      await loadAll(id);
    } catch (e) {
      setFormError(e.message || 'Unable to reach the server. Please try again.');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try { await logoutLifelines(); } catch (e) { /* best effort */ }
    ['rcm_active_buyer_id', 'rcm_buyer_id', 'lifelines_token', 'rcm_lifelines_token'].forEach((k) => localStorage.removeItem(k));
    resetSessionState();
    setLoginId(''); setPassword(''); setFormError('');
    setActiveTab('overview');
    setShowSyncModal(true);
  };

  // token expired while inside the tree: close it and ask for login again
  const handleTreeUnauthorized = useCallback(() => {
    setActiveTab('overview');
    setShowSyncModal(true);
  }, []);

  // ----- derived metrics -----
  const ov = overview || {};
  const totalNetworkPv = ov.totalPv ?? 0;
  const selfPurchasePv = ov.selfPv ?? 0;
  const activeCount = ov.activeCount ?? 0;
  const inactiveCount = ov.inactiveCount ?? 0;
  const terminatedCount = ov.terminatedCount ?? 0;
  const totalTeamCount = ov.totalTeam ?? 0;
  const directLegs = ov.directLegs || [];
  const rootIdentity = ov.identity || {};
  const photoUrl = rootIdentity.photo_url || null;
  const crawlRunning = Boolean(syncing || ov.crawl?.running);

  const legA = directLegs.find((l) => l.leg === 'A') || directLegs[0];
  const legB = directLegs.find((l) => l.leg === 'B') || directLegs[1];

  const treeRootInfo = useMemo(() => ({
    name: rootIdentity.name,
    photo_url: photoUrl,
    max_pin: rootIdentity.max_pin,
    curr_pin: rootIdentity.curr_pin,
    self_pv: selfPurchasePv,
    total_group_pv: totalNetworkPv,
    children_count: directLegs.length
  }), [rootIdentity.name, rootIdentity.max_pin, rootIdentity.curr_pin, photoUrl, selfPurchasePv, totalNetworkPv, directLegs.length]);

  const openTree = (startLeg) => {
    if (!activeBuyerId) { setShowSyncModal(true); return; }
    setTreeStart(startLeg && startLeg.head_id ? {
      buyer_id: startLeg.head_id, name: startLeg.head_name, photo_url: startLeg.photo_url, pin: startLeg.pin,
      status: 1, self_pv: startLeg.self_pv, total_group_pv: startLeg.pv
    } : null);
    setActiveTab('tree');
  };

  // Reports: filter first, paginate after
  const filteredRows = useMemo(() => {
    if (selectedLegFilter === 'all') return matrixData;
    const want = selectedLegFilter.toLowerCase();
    return matrixData.filter((r) => String(r.leg_type || '').trim().toLowerCase().replace(/^leg\s*/, '') === want);
  }, [matrixData, selectedLegFilter]);

  const pagedRows = useMemo(
    () => filteredRows.slice(matrixPage * MATRIX_PAGE, (matrixPage + 1) * MATRIX_PAGE),
    [filteredRows, matrixPage]
  );

  const onReportSearch = (value) => {
    setReportSearch(value);
    setAssistantQuery(value);
    assistantQueryRef.current = value;
    clearTimeout(reportTimerRef.current);
    reportTimerRef.current = setTimeout(() => {
      loadAssistant(activeIdRef.current, value, `${selectedYear}${selectedMonth}`, sessionRef.current);
    }, 400);
  };

  // New Joinings: month filter (All / Current / Prev / 2 Months Ago)
  const joinMonths = useMemo(() => joinings?.months || [], [joinings]);
  const joinTabs = useMemo(() => {
    const names = ['Current Month', 'Prev Month', '2 Months Ago'];
    const tabs = [{ key: 'all', label: 'All', count: joinings?.total || 0 }];
    names.forEach((name, i) => {
      if (joinMonths[i]) {
        tabs.push({ key: i, label: name, sub: joinMonths[i], count: joinings?.monthCounts?.[joinMonths[i]] || 0 });
      }
    });
    return tabs;
  }, [joinings, joinMonths]);

  const joinList = useMemo(() => {
    if (!joinings) return [];
    if (joinFilter === 'all') return joinings.data;
    const label = joinMonths[joinFilter];
    return label ? joinings.data.filter((m) => m.month_label === label) : [];
  }, [joinings, joinFilter, joinMonths]);

  const visibleJoinings = useMemo(() => joinList.slice(0, joinVisible), [joinList, joinVisible]);

  const yearNow = new Date().getFullYear();
  const monthNow = new Date().getMonth() + 1;
  // never offer future months in the report picker
  const monthOptions = Array.from({ length: 12 }, (_, i) => 12 - i)
    .filter((m) => Number(selectedYear) < yearNow || m <= monthNow);

  const rangeLabel = matrixMonths.length
    ? `${matrixMonths[matrixMonths.length - 1]?.split(' ').slice(0, 2).join(' ')} to ${matrixMonths[0]?.split(' ').slice(0, 2).join(' ')}`
    : '';

  const showOverview = activeTab === 'overview' || activeTab === 'tree';

  return (
    <div className="ll">
      <style>{CSS}</style>

      {/* NAVBAR: only the Team Dekho logo */}
      <header className="ll-nav">
        <BrandLogo tagline={false} />
      </header>

      <div className="ll-body">
        <div className="ll-wrap">
          {(loadError || notice) && (
            <div className="ll-toast">
              <span>{notice || loadError}</span>
              <button type="button" aria-label="Dismiss" onClick={() => { setNotice(''); setLoadError(''); }} style={{ background: 'transparent', border: 0, color: '#B91C1C', cursor: 'pointer' }}><X size={16} /></button>
            </div>
          )}

          {/* HEADER */}
          <div className="ll-card ll-head">
            <div className="ll-who">
              <Avatar name={rootIdentity.name} id={activeBuyerId} photoUrl={photoUrl} color={COLORS.green} size={52} fontSize={18} />
              <div style={{ minWidth: 0 }}>
                <h1 className="ll-h1">{booting ? 'Loading...' : rootIdentity.name || (activeBuyerId ? `Leader #${activeBuyerId}` : 'Not connected')}</h1>
                {activeBuyerId && (
                  <div className="ll-sub">
                    <span>ID {activeBuyerId}</span>
                    {rootIdentity.max_pin && <span className="ll-chip g">{rootIdentity.max_pin}</span>}
                    {rootIdentity.kyc_status && <span className="ll-chip t">KYC {formatKyc(rootIdentity.kyc_status)}</span>}
                    {rootIdentity.curr_pin && rootIdentity.curr_pin !== rootIdentity.max_pin && (
                      <span className="ll-chip t">Current Pin: {rootIdentity.curr_pin}</span>
                    )}
                    {rootIdentity.join_date && <span className="ll-chip t">Joined: {formatJoinDate(rootIdentity.join_date)}</span>}
                  </div>
                )}
              </div>
            </div>
            <div className="ll-acts">
              <button type="button" className="ll-btn" disabled={!activeBuyerId} onClick={() => loadAll(activeBuyerId)}>
                <RefreshCw size={16} /><span className="t">Refresh</span>
              </button>
              <button type="button" className="ll-btn p" disabled={!activeBuyerId}
                onClick={() => { setLoginId(activeBuyerId); setFormError(''); setShowSyncModal(true); }}>
                <ShieldCheck size={16} /><span className="t">Re-sync from RCM</span>
              </button>
              <button type="button" className="ll-btn d" onClick={handleDisconnect}>
                <LogOut size={16} /><span className="t">Disconnect</span>
              </button>
            </div>
          </div>

          {/* TABS */}
          <div className="ll-card ll-tabs" role="tablist">
            {[
              { key: 'overview', label: 'Overview', icon: <Activity size={17} /> },
              { key: 'tree', label: 'Team Tree', icon: <TreePine size={17} /> },
              { key: 'assistant', label: 'Reports', icon: <Sparkles size={17} /> },
              { key: 'joinings', label: 'New Joinings 🆕', icon: <UserPlus size={17} /> }
            ].map((tab) => (
              <button key={tab.key} type="button" role="tab" aria-selected={activeTab === tab.key}
                className={`ll-tab${activeTab === tab.key ? ' on' : ''}`}
                onClick={() => (tab.key === 'tree' ? openTree(null) : setActiveTab(tab.key))}>
                {tab.icon}<span className="t">{tab.label}</span>
              </button>
            ))}
          </div>

          {/* OVERVIEW */}
          {showOverview && (
            <div>
              {(!overview || overview.synced === false) && !booting && (
                <div className="ll-card ll-empty" style={{ marginBottom: 14 }}>
                  {activeBuyerId ? 'No data synced yet. Tap "Re-sync from RCM" to fetch live data.' : 'Connect your RCM account to see live metrics.'}
                </div>
              )}

              <div className="ll-stats">
                {/* Card 1: Total Network Turnover */}
                <div className="ll-card ll-stat">
                  <div className="ico"><TrendingUp size={19} /></div>
                  <div className="l">Total Network Turnover</div>
                  <div className="v">₹ {Number(overview?.totalTeamRepurchaseAmt || overview?.total_team_repurchase_amt || 0).toLocaleString('en-IN')}</div>
                  <div className="sub-v">{Number(overview?.totalPv || 0).toLocaleString('en-IN')} PV</div>
                </div>

                {/* Card 2: Your Self Purchase */}
                <div className="ll-card ll-stat">
                  <div className="ico"><Wallet size={19} /></div>
                  <div className="l">Your Self Purchase</div>
                  <div className="v">₹ {Number(overview?.selfRepurchaseAmt || overview?.self_repurchase_amt || 0).toLocaleString('en-IN')}</div>
                  <div className="sub-v">{Number(overview?.selfPv || overview?.self_pv || 0).toLocaleString('en-IN')} PV</div>
                </div>

                {/* Card 3: Active Purchasers */}
                <div className="ll-card ll-stat">
                  <div className="ico"><UserCheck size={19} /></div>
                  <div className="l">Active Purchasers</div>
                  <div className="v" style={{ color: COLORS.green }}>{formatNumber(overview?.active_purchasers ?? activeCount)} Members Active</div>
                  <div className="badges">
                    <span className="ll-chip a">{formatNumber(overview?.inactive_members ?? inactiveCount)} Inactive (0 PV)</span>
                    <span className="ll-chip r">{formatNumber(overview?.terminated_members ?? terminatedCount)} Terminated</span>
                  </div>
                </div>

                {/* Card 4: Total Downline Team */}
                <div className="ll-card ll-stat">
                  <div className="ico"><Users size={19} /></div>
                  <div className="l">Total Downline Team</div>
                  <div className="v">{Number(overview?.total_team || totalTeamCount || 0).toLocaleString('en-IN')} Members</div>
                  {crawlRunning && <div className="n">Deep sync in progress...</div>}
                </div>
              </div>

              {/* TREE BUTTON */}
              <button type="button" className="ll-treebtn" disabled={!activeBuyerId} onClick={() => openTree(null)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
                  <div className="ico"><TreePine size={22} /></div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 800 }}>Team Tree</div>
                    <div style={{ fontSize: 12.5, color: COLORS.mu, marginTop: 2 }}>See your full downline structure on a separate screen</div>
                  </div>
                </div>
                <ArrowUpRight size={20} color={COLORS.mu} />
              </button>

              {/* DIRECT LEG HEADS (clean) */}
              <div className="ll-card ll-sec">
                <div className="ll-sechd">
                  <div>
                    <h3>Direct leg heads</h3>
                    <p>Team volume of each direct leg. Tap a leg to open its tree.</p>
                  </div>
                </div>
                <div className="ll-legs">
                  {directLegs.length > 0 ? directLegs.map((leg, i) => (
                    <button type="button" key={leg.head_id || i} className="ll-leg" onClick={() => openTree(leg)}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                        <div className="ll-legav">{leg.leg}</div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 15, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis' }}>{leg.head_name || `Leg ${leg.leg}`}</div>
                          <div style={{ fontSize: 11.5, color: COLORS.mu, marginTop: 2 }}>ID {leg.head_id || '—'}</div>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div style={{ fontSize: 12.5, color: COLORS.mu, fontWeight: 700 }}>
                          Team PV: <span style={{ color: COLORS.green, fontWeight: 800 }}>{Number(leg.pv || 0).toLocaleString('en-IN')} PV</span>
                        </div>
                        <div style={{ fontSize: 12.5, color: COLORS.mu, fontWeight: 700, marginTop: 4 }}>
                          Team Purchase: <span style={{ color: '#0F172A', fontWeight: 800 }}>₹ {Number(leg.repurchase_amt || 0).toLocaleString('en-IN')}</span>
                        </div>
                      </div>
                    </button>
                  )) : <div className="ll-empty" style={{ gridColumn: '1 / -1' }}>{booting ? 'Loading...' : 'No direct leg volume yet.'}</div>}
                </div>
              </div>
            </div>
          )}

          {/* REPORTS */}
          {activeTab === 'assistant' && (
            <div className="ll-card ll-sec" style={{ marginTop: 0 }}>
              <div className="ll-sechd">
                <div>
                  <h3>Team Performance Reports</h3>
                  <p>Dynamic 3-month window or historical snapshot from TiDB.</p>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  {rangeLabel && <span className="ll-chip t">{rangeLabel}</span>}
                  <select className="ll-in" aria-label="Year" style={{ width: 100, height: 36, fontSize: 13 }}
                    value={selectedYear} onChange={(e) => {
                      const y = e.target.value;
                      const m = Number(y) === yearNow && Number(selectedMonth) > monthNow ? String(monthNow).padStart(2, '0') : selectedMonth;
                      setSelectedYear(y);
                      setSelectedMonth(m);
                      loadAssistant(activeBuyerId, assistantQueryRef.current, `${y}${m}`, sessionRef.current);
                    }}>
                    {Array.from({ length: 5 }, (_, i) => String(yearNow - i)).map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                  <select className="ll-in" aria-label="Month" style={{ width: 120, height: 36, fontSize: 13 }}
                    value={selectedMonth} onChange={(e) => {
                      setSelectedMonth(e.target.value);
                      loadAssistant(activeBuyerId, assistantQueryRef.current, `${selectedYear}${e.target.value}`, sessionRef.current);
                    }}>
                    {monthOptions.map((m) => (
                      <option key={m} value={String(m).padStart(2, '0')}>
                        {new Date(2000, m - 1, 1).toLocaleString('en-IN', { month: 'long' })}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <input
                type="text"
                className="ll-in"
                value={reportSearch}
                onChange={(e) => onReportSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    clearTimeout(reportTimerRef.current);
                    loadAssistant(activeBuyerId, assistantQueryRef.current, monthKey, sessionRef.current);
                  }
                }}
                placeholder="Ask AI or search by Name, ID, or query (e.g. 'Gourav leg > 1000 PV', 'inactive members', 'Ajaybhai')..."
                style={{ width: '100%', height: 44, fontSize: 14, marginBottom: 16 }}
              />

              <div className="ll-chips">
                {[
                  { label: 'All Members', q: 'all', leg: 'all', text: `(${formatNumber(totalTeamCount)})` },
                  { label: `Leg A: ${legA?.head_name || 'N/A'}`, q: 'leg A', leg: 'A', text: `(${formatNumber(legA?.pv || 0)} PV)` },
                  { label: `Leg B: ${legB?.head_name || 'N/A'}`, q: 'leg B', leg: 'B', text: `(${formatNumber(legB?.pv || 0)} PV)` }
                ].map((c) => (
                  <button key={c.label} type="button" className={`ll-fchip${selectedLegFilter === c.leg ? ' on' : ''}`}
                    onClick={() => {
                      setSelectedLegFilter(c.leg);
                      setAssistantQuery(c.q);
                      assistantQueryRef.current = c.q;
                      setReportSearch('');
                      loadAssistant(activeBuyerId, c.q, monthKey, sessionRef.current);
                    }}>
                    {c.label} {c.text}
                  </button>
                ))}
              </div>

              <div className="ll-tw">
                <table className="ll-tbl">
                  <thead>
                    <tr>
                      <th className="sl">Member Info</th>
                      <th>District</th>
                      {matrixMonths.map((m) => (
                        <th key={m} className="num" style={{ minWidth: 150 }}>
                          <div>{m.includes('(') ? m.split(' (')[0] : m}</div>
                          {m.includes('(') && <div style={{ fontSize: 11, fontWeight: 500, color: COLORS.mu }}>({m.split(' (')[1].replace(')', '')})</div>}
                        </th>
                      ))}
                      <th className="sr" style={{ textAlign: 'center' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingAssistant ? (
                      <tr><td colSpan={matrixMonths.length + 3} className="ll-empty">
                        <div style={{ display: 'inline-block', width: 22, height: 22, border: `3px solid ${COLORS.green}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'llSpin .8s linear infinite' }} />
                        <div style={{ marginTop: 10 }}>Loading records...</div>
                      </td></tr>
                    ) : pagedRows.length > 0 ? (
                      pagedRows.map((row) => <MatrixRow key={row.buyer_id} row={row} months={matrixMonths} />)
                    ) : (
                      <tr><td colSpan={matrixMonths.length + 3} className="ll-empty">
                        {crawlRunning ? 'Team is still syncing...' : 'No records match this filter.'}
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {filteredRows.length > MATRIX_PAGE && (
                <div className="ll-pager">
                  <span>{matrixPage * MATRIX_PAGE + 1}-{Math.min((matrixPage + 1) * MATRIX_PAGE, filteredRows.length)} of {formatNumber(filteredRows.length)}</span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" className="ll-btn" disabled={matrixPage === 0} onClick={() => setMatrixPage((p) => p - 1)}>Previous</button>
                    <button type="button" className="ll-btn" disabled={(matrixPage + 1) * MATRIX_PAGE >= filteredRows.length} onClick={() => setMatrixPage((p) => p + 1)}>Next</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* NEW JOININGS */}
          {activeTab === 'joinings' && (
            <div>
              <div className="ll-sumbar">
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.mu }}>New Associates in Last 3 Months</div>
                  <div className="big">{loadingJoinings && !joinings ? '...' : formatNumber(joinings?.total || 0)}</div>
                </div>
                <button type="button" className="ll-btn" disabled={!activeBuyerId || loadingJoinings}
                  onClick={() => { setJoinings(null); }}>
                  <RefreshCw size={16} /><span className="t">Reload</span>
                </button>
              </div>

              <div className="ll-chips">
                {joinTabs.map((tb) => (
                  <button key={String(tb.key)} type="button"
                    className={`ll-fchip${joinFilter === tb.key ? ' on' : ''}`}
                    onClick={() => { setJoinFilter(tb.key); setJoinVisible(JOIN_PAGE); }}>
                    {tb.label}{tb.sub ? ` (${tb.sub})` : ''} • {formatNumber(tb.count)}
                  </button>
                ))}
              </div>

              {loadingJoinings && !joinings ? (
                <div className="ll-card ll-empty">
                  <div style={{ display: 'inline-block', width: 22, height: 22, border: `3px solid ${COLORS.green}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'llSpin .8s linear infinite' }} />
                  <div style={{ marginTop: 10 }}>Loading new joinings...</div>
                </div>
              ) : joinList.length > 0 ? (
                <>
                  <div className="ll-joins">
                    {visibleJoinings.map((m) => <JoinCard key={m.buyer_id} member={m} />)}
                  </div>
                  {joinList.length > joinVisible && (
                    <div className="ll-pager" style={{ justifyContent: 'center' }}>
                      <button type="button" className="ll-btn" onClick={() => setJoinVisible((v) => v + JOIN_PAGE)}>
                        Show more ({formatNumber(joinList.length - joinVisible)} left)
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="ll-card ll-empty">
                  {joinings?.error
                    ? 'Could not load new joinings. Please tap Reload.'
                    : crawlRunning
                      ? 'Team is still syncing. New joinings will appear shortly.'
                      : 'No new joinings found for this period.'}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* SEPARATE FULL-SCREEN TREE (Treestructureui.jsx) */}
      {activeTab === 'tree' && activeBuyerId && (
        <TeamTree
          buyerId={activeBuyerId}
          rootInfo={treeRootInfo}
          startNode={treeStart}
          crawlRunning={crawlRunning}
          refreshToken={treeRefresh}
          onClose={() => setActiveTab('overview')}
          onUnauthorized={handleTreeUnauthorized}
        />
      )}

      {/* CONNECT MODAL (only when there is no saved session, or token expired / re-sync tapped) */}
      {showSyncModal && (
        <div className="ll-ov c">
          <div className="ll-modal">
            {activeBuyerId && (
              <button type="button" className="ll-btn ic" aria-label="Close" onClick={() => setShowSyncModal(false)} style={{ position: 'absolute', top: 14, right: 14, border: 0 }}>
                <X size={18} />
              </button>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 22 }}>
              <div style={{ width: 46, height: 46, borderRadius: 14, background: '#111827', display: 'grid', placeItems: 'center', color: '#fff' }}>
                <ShieldCheck size={24} />
              </div>
              <div>
                <div style={{ fontSize: 19, fontWeight: 800 }}>Connect RCM account</div>
                <div style={{ fontSize: 13, color: '#64748B' }}>Use your own RCM login</div>
              </div>
            </div>
            <div style={{ display: 'grid', gap: 14 }}>
              <div>
                <label htmlFor="ll-buyer" style={{ display: 'block', fontSize: 12, color: '#64748B', marginBottom: 6, fontWeight: 700 }}>RCM Buyer ID</label>
                <input id="ll-buyer" className="ll-in" value={loginId} onChange={(e) => setLoginId(e.target.value.replace(/\D/g, ''))}
                  inputMode="numeric" autoComplete="username" placeholder="Enter your Buyer ID" />
              </div>
              <div>
                <label htmlFor="ll-pass" style={{ display: 'block', fontSize: 12, color: '#64748B', marginBottom: 6, fontWeight: 700 }}>RCM Password</label>
                <input id="ll-pass" className="ll-in" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password" placeholder="Enter your password"
                  onKeyDown={(e) => { if (e.key === 'Enter' && !isConnecting) handleSyncConnect(); }} />
              </div>
              {formError && <div className="ll-err">{formError}</div>}
              <button type="button" className="ll-btn p" style={{ height: 48, fontSize: 14 }} onClick={handleSyncConnect} disabled={isConnecting}>
                {isConnecting ? 'Verifying...' : 'Connect and sync'}
              </button>
              <div style={{ fontSize: 11, color: '#64748B', textAlign: 'center' }}>
                Your password is only used to log in to RCM and is never stored.
              </div>
            </div>
          </div>
        </div>
      )}

      {activeBuyerId && <SyncPill buyerId={activeBuyerId} onComplete={handleSyncComplete} />}
    </div>
  );
}