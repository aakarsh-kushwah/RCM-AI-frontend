import React, { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import {
  ShieldCheck, Activity, TreePine, Sparkles, RefreshCw, LogOut, Search, Phone,
  MessageCircle, X, ArrowUpRight, ArrowLeft, ChevronsUp, ChevronUp, Info,
  Users, TrendingUp, UserCheck, Wallet, Lock, Eye, EyeOff
} from 'lucide-react';
import socketService from '../../services/socketService';
import {
  syncLifelines, logoutLifelines, getLifelinesOverview, getTreeChildren,
  getMemberFullProfile, getAssistantQuery, getSyncStatus, searchLifelines
} from '../../services/lifelinesApiClient';

const ACTIVE_ID_KEY = 'rcm_active_buyer_id';
const COLORS = { green: '#16A34A', red: '#DC2626', slate: '#94A3B8' };
const TREE_PAGE = 40;      // direct children rendered per "page" inside the tree
const CAP = 4;              // children shown per node on deeper levels (rest = "+N")
const MAX_DEPTH = 6;        // max levels auto-opened under the focused member
const MATRIX_PAGE = 50;     // table rows rendered per page
const MAX_PARALLEL = 4;     // max simultaneous tree requests from one browser

// ---------------------------------------------------------------------------
// Helpers (module level: created once, never per render)
// ---------------------------------------------------------------------------
const numberFmt = new Intl.NumberFormat('en-IN');
const formatNumber = (v) => numberFmt.format(Number(v || 0));
const nid = (n) => String(n?.buyer_id ?? n?.id ?? '');

const getRolling12Months = () => {
  const out = [];
  const now = new Date();
  for (let i = 0; i < 12; i += 1) {
    out.push(new Date(now.getFullYear(), now.getMonth() - i, 1)
      .toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }));
  }
  return out;
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

const getRing = (n) => {
  if (Number(n.status ?? 1) === 0) return { color: COLORS.red, label: 'Terminated' };
  if (Number(n.self_pv ?? n.current_pv ?? 0) > 0) return { color: COLORS.green, label: 'Active' };
  return { color: COLORS.slate, label: '0 PV' };
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

// Small request limiter: thousands of taps can never open more than MAX_PARALLEL calls per browser.
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
// Styles: one CSS block (classes + media queries) instead of thousands of inline style objects
// ---------------------------------------------------------------------------
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700&family=Manrope:wght@400;500;600;700;800&display=swap');
.ll{--bg:#F5F7FB;--bd:#E7EBF2;--tx:#0F172A;--mu:#64748B;--pri:#111827;--gr:#16A34A;--rd:#DC2626;--sl:#94A3B8;--line:#CBD5E1;
  background:var(--bg);color:var(--tx);min-height:100vh;padding:20px;font-family:Inter,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;-webkit-tap-highlight-color:transparent}
.ll,.ll *{box-sizing:border-box}
.ll button{font-family:inherit}
.ll-wrap{max-width:1240px;margin:0 auto}
.ll-card{background:#fff;border:1px solid var(--bd);border-radius:18px;box-shadow:0 1px 2px rgba(16,24,40,.04)}
.ll-head{padding:16px 20px;display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:16px}
.ll-who{display:flex;align-items:center;gap:14px;min-width:0}
.ll-h1{font-size:20px;font-weight:800;margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ll-sub{font-size:12.5px;color:var(--mu);margin-top:3px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.ll-chip{display:inline-flex;align-items:center;padding:3px 9px;border-radius:999px;font-size:11px;font-weight:700;background:#F1F5F9;color:var(--mu)}
.ll-chip.g{background:#DCFCE7;color:#15803D}.ll-chip.r{background:#FEE2E2;color:#B91C1C}.ll-chip.t{background:#E0F2FE;color:#0369A1}
.ll-acts{display:flex;gap:8px;flex-wrap:wrap}
.ll-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;height:40px;padding:0 16px;border-radius:12px;border:1px solid var(--bd);background:#fff;color:var(--tx);font-weight:700;font-size:13px;cursor:pointer;text-decoration:none;transition:background .15s}
.ll-btn:hover{background:#F8FAFC}.ll-btn:disabled{opacity:.45;cursor:not-allowed}
.ll-btn.p{background:var(--pri);color:#fff;border-color:var(--pri)}.ll-btn.p:hover{background:#1F2937}
.ll-btn.d{color:var(--rd);border-color:#FECACA;background:#FEF2F2}
.ll-btn.ic{width:40px;padding:0}
.ll-btn:focus-visible,.ll-tab:focus-visible,.ll-node:focus-visible,.ll-mini:focus-visible{outline:2px solid #6366F1;outline-offset:2px}
.ll-tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;padding:6px;margin-bottom:16px}
.ll-tab{height:44px;border:0;border-radius:12px;background:transparent;color:var(--mu);font-weight:700;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px}
.ll-tab.on{background:var(--pri);color:#fff}
.ll-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px}
.ll-stat{padding:18px;display:flex;flex-direction:column;gap:4px}
.ll-stat .ico{width:38px;height:38px;border-radius:11px;background:#F1F5F9;display:grid;place-items:center;color:var(--pri);margin-bottom:6px}
.ll-stat .v{font-size:26px;font-weight:800;letter-spacing:-.5px}
.ll-stat .l{font-size:13px;color:var(--mu);font-weight:600}
.ll-stat .n{font-size:11.5px;color:var(--mu)}
.ll-stat .sub-v{font-size:17px;font-weight:800;color:var(--gr);margin-top:6px}
.ll-stat .split-row{display:flex;justify-content:space-between;align-items:center;margin-top:8px;padding-top:8px;border-top:1px solid #F1F5F9;font-size:11.5px;font-weight:700}
.ll-sec{padding:20px;margin-top:16px}
.ll-sec h3{margin:0;font-size:18px}.ll-sec p{margin:3px 0 0;color:var(--mu);font-size:13px}
.ll-sechd{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:16px}
.ll-legs{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr));gap:12px}
.ll-leg{border:1px solid var(--bd);border-radius:14px;padding:14px 16px;display:flex;justify-content:space-between;align-items:center;gap:10px;cursor:pointer;background:#fff;text-align:left;width:100%}
.ll-leg:hover{background:#F8FAFC}
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
.ll-round{width:32px;height:32px;border-radius:50%;display:grid;place-items:center;text-decoration:none;background:#F1F5F9;color:var(--gr)}
.ll-round.wa{background:var(--gr);color:#fff}.ll-round.off{opacity:.35;color:var(--mu)}
.ll-pager{display:flex;justify-content:space-between;align-items:center;margin-top:12px;font-size:13px;color:var(--mu);gap:10px;flex-wrap:wrap}
.ll-ov{position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:100;display:flex;justify-content:flex-end}
.ll-dr{width:min(420px,100%);background:#fff;height:100%;padding:22px;overflow-y:auto}
.ll-ov.c{align-items:center;justify-content:center;z-index:110;padding:16px;background:rgba(245,247,251,.92)}
.ll-modal{width:min(440px,100%);background:#fff;border:1px solid var(--bd);border-radius:22px;padding:28px;box-shadow:0 24px 60px rgba(15,23,42,.18);position:relative}
.ll-in{width:100%;height:46px;border:1px solid var(--bd);border-radius:12px;padding:0 14px;font-size:14px;background:#fff;color:var(--tx);outline:none}
.ll-in:focus{border-color:#6366F1;box-shadow:0 0 0 3px rgba(99,102,241,.15)}
.ll-err{background:#FEF2F2;border:1px solid #FECACA;color:#B91C1C;border-radius:12px;padding:10px 14px;font-size:13px}
.ll-grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.ll-kv{background:#F8FAFC;border:1px solid var(--bd);border-radius:12px;padding:12px}
.ll-kv .k{font-size:11px;color:var(--mu)}.ll-kv .v{font-size:15px;font-weight:800;margin-top:3px;word-break:break-word}
.ll-pill{position:fixed;left:50%;transform:translateX(-50%);bottom:18px;background:#fff;border:1.5px solid var(--bd);border-radius:16px;padding:12px 18px;z-index:90;box-shadow:0 12px 32px rgba(15,23,42,.18);display:flex;gap:12px;align-items:center;max-width:92vw}
.ll-dot{width:10px;height:10px;border-radius:50%;flex:none}
.ll-toast{background:#FEF2F2;border:1px solid #FECACA;color:#B91C1C;border-radius:12px;padding:10px 14px;margin-bottom:14px;font-size:13px;display:flex;justify-content:space-between;gap:10px}

/* ---------- Tree screen (full screen) ---------- */
.ll-tree{--slot:84px;--upw:144px;position:fixed;inset:0;z-index:50;background:#fff;display:flex;flex-direction:column;color:var(--tx)}
@media (min-width:761px){.ll-tree{--slot:112px;--upw:176px}}
.ll-tbar{display:flex;align-items:center;gap:10px;padding:8px 12px;border-bottom:1px solid var(--bd);position:relative}
.ll-tbar h2{margin:0;font-size:16px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ll-sbox{position:relative;width:min(300px,50vw)}
.ll-sbox .ll-in{height:38px;padding-left:34px;font-size:13px}
.ll-sbox svg{position:absolute;left:11px;top:11px;color:var(--mu)}
.ll-sres{position:absolute;top:calc(100% + 6px);right:0;width:min(340px,92vw);background:#fff;border:1px solid var(--bd);border-radius:14px;box-shadow:0 14px 34px rgba(15,23,42,.16);max-height:300px;overflow-y:auto;z-index:20}
.ll-sres div.it{padding:10px 14px;cursor:pointer;border-bottom:1px solid #F1F5F9}
.ll-sres div.it:hover{background:#F8FAFC}
.ll-crumbbar{display:flex;align-items:center;gap:6px;padding:6px 10px;border-bottom:1px solid var(--bd);background:#FAFBFD}
.ll-crumbs{display:flex;gap:5px;align-items:center;overflow-x:auto;flex:1;scrollbar-width:none;min-width:0}
.ll-crumbs::-webkit-scrollbar{display:none}
.ll-crumb{flex:none;border:1px solid var(--bd);background:#fff;border-radius:999px;padding:5px 10px;font-size:11.5px;font-weight:700;cursor:pointer;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--tx)}
.ll-crumb.on{background:var(--pri);color:#fff;border-color:var(--pri)}
.ll-crumb.fw{opacity:.45;border-style:dashed}
.ll-sep{color:var(--sl);flex:none;font-size:12px}
.ll-stage{flex:1;overflow:auto;padding:12px 60px 90px 8px;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}
.ll-inner{width:max-content;margin:0 auto;display:flex;flex-direction:column;align-items:center}
.ll-inner.left{margin:0;align-items:flex-start}
.ll-inner.grow .ll-row{transform-origin:50% 0;animation:llGrow .18s ease-out}
.ll-inner.shrink{transform-origin:50% 0;animation:llShrink .18s ease-out}
.ll-up{width:var(--upw);display:flex;flex-direction:column;align-items:center}
.ll-vline{width:0;height:var(--h,18px);border-left:2px dashed var(--line)}
.ll-apill{width:var(--upw);height:34px;display:flex;align-items:center;gap:6px;border:2px solid var(--fc,#94A3B8);border-radius:11px;padding:0 7px;background:#fff;cursor:pointer;font-size:11px;font-weight:800;text-align:left}
.ll-apill.t{background:#FEF2F2}
.ll-apill span.n{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ll-fcard{width:var(--upw);border:2px solid var(--fc,#94A3B8);border-radius:14px;padding:8px 6px;display:flex;flex-direction:column;align-items:center;background:#fff;box-shadow:0 4px 14px rgba(15,23,42,.1);position:relative;text-align:center}
.ll-fcard.t{background:#FEF2F2}
.ll-fcard .nm{font-size:12.5px;font-weight:800;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:5px}
.ll-fcard .id{font-size:10px;color:var(--mu);margin-top:1px}
.ll-fcard .inf{position:absolute;top:5px;right:5px;width:24px;height:24px;border-radius:50%;border:0;background:#F1F5F9;color:var(--mu);display:grid;place-items:center;cursor:pointer;padding:0}
.ll-row{display:flex;align-items:flex-start;position:relative}
.ll-spine{position:absolute;top:0;height:0;border-top:2px dashed var(--line)}
.ll-col{--stub:20px;position:relative;display:flex;flex-direction:column;align-items:center;padding:var(--stub) 4px 0}
.ll-st{position:absolute;top:0;left:50%;height:var(--stub);border-left:2px dashed var(--line)}
.ll-hl{position:absolute;top:0;left:0;right:0;border-top:2px dashed var(--line)}
.ll-hl.f{left:50%}.ll-hl.l{right:50%}
.ll-node{width:calc(var(--slot) - 8px);border:2px solid var(--fc,#94A3B8);border-radius:12px;padding:5px 3px;background:#fff;display:flex;flex-direction:column;align-items:center;cursor:pointer;position:relative;z-index:1;text-align:center;transition:transform .1s}
.ll-node:active{transform:scale(.95)}
.ll-node.t{background:#FEF2F2}
.ll-node .nm{font-size:10.5px;font-weight:800;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:4px}
.ll-node .id{font-size:9px;color:var(--mu);line-height:1.2}
.ll-tag{margin-top:3px;font-size:9px;font-weight:800;padding:1px 6px;border-radius:999px;background:#F1F5F9;color:var(--mu);white-space:nowrap}
.ll-tag.g{background:#DCFCE7;color:#15803D}.ll-tag.r{background:#FEE2E2;color:#B91C1C}
.ll-kidhint{font-size:9px;color:#0369A1;font-weight:800;margin-top:2px}
.ll-more{min-width:34px;height:34px;padding:0 8px;border-radius:17px;border:1.5px dashed #94A3B8;background:#fff;color:var(--mu);font-size:11px;font-weight:800;cursor:grid;place-items:center;position:relative;z-index:1}
.ll-rail{position:fixed;right:2px;top:50%;transform:translateY(-50%);height:min(60vh,400px);width:54px;z-index:60;touch-action:none;cursor:ns-resize;user-select:none}
.ll-rtrack{position:absolute;left:25px;top:16px;bottom:16px;width:4px;border-radius:4px;background:#E2E8F0}
.ll-rfill{position:absolute;left:0;top:0;width:100%;border-radius:4px;background:var(--pri)}
.ll-tick{position:absolute;left:-3px;width:10px;height:10px;border-radius:50%;background:#fff;border:2px solid #CBD5E1;transform:translateY(-50%)}
.ll-tick.on{border-color:var(--pri)}
.ll-thumb{position:absolute;left:-11px;width:26px;height:26px;border-radius:50%;background:var(--pri);border:3px solid #fff;box-shadow:0 2px 10px rgba(15,23,42,.4);transform:translateY(-50%)}
.ll-thumb.s{transition:top .15s}
.ll-bubble{position:absolute;right:30px;transform:translateY(-50%);background:var(--pri);color:#fff;font-size:12px;font-weight:700;padding:6px 10px;border-radius:10px;white-space:nowrap;max-width:60vw;overflow:hidden;text-overflow:ellipsis;pointer-events:none}
@keyframes llGrow{from{opacity:0;transform:scaleY(.55) translateY(-6px)}to{opacity:1;transform:none}}
@keyframes llShrink{from{opacity:.25;transform:scale(1.07)}to{opacity:1;transform:none}}
@keyframes llSpin{to{transform:rotate(360deg)}}
@keyframes llPulse{0%,100%{opacity:1}50%{opacity:.35}}
@media (prefers-reduced-motion:reduce){.ll-inner,.ll-inner .ll-row{animation:none!important}.ll-node{transition:none}}
@media (max-width:760px){
  .ll{padding:12px}
  .ll-head{padding:14px}
  .ll-btn .t{display:none}.ll-btn{padding:0;width:40px}
  .ll-tab .t{font-size:12px}
  .ll-tab{gap:5px;font-size:12px}
  .ll-stats{grid-template-columns:1fr 1fr;gap:10px}
  .ll-stat{padding:14px}.ll-stat .v{font-size:20px}
  .ll-sec{padding:14px}
  .ll-sbox{width:auto;flex:1}
  .ll-ov{align-items:flex-end}
  .ll-dr{width:100%;height:auto;max-height:90vh;border-radius:22px 22px 0 0}
  .ll-ov.c{align-items:center}
}

/* ================= PREMIUM LOGIN (light, full screen) ================= */
.lc{--pearl:#f4f5fc;--ink:#151a3a;--ink2:#4a5174;--ink3:#6b7296;--line:rgba(120,130,190,.24);--indigo:#4f6bff;--violet:#9a5cff;--aqua:#12c6d8;--champ:#e9c27a;
  --fd:'Sora','Manrope',system-ui,-apple-system,'Segoe UI',sans-serif;--fb:'Manrope',system-ui,-apple-system,'Segoe UI',sans-serif;
  position:fixed;inset:0;z-index:110;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;color:var(--ink);font-family:var(--fb);-webkit-font-smoothing:antialiased;-webkit-tap-highlight-color:transparent;
  background:radial-gradient(900px 520px at 6% -8%,#e2e8ff 0%,transparent 65%),radial-gradient(760px 520px at 100% 0%,#d9f6fb 0%,transparent 62%),radial-gradient(700px 500px at 50% 112%,#fff1d6 0%,transparent 65%),var(--pearl)}
.lc,.lc *,.lc *::before,.lc *::after{box-sizing:border-box}
.lc button,.lc input{font-family:inherit}
.lc-x{position:absolute;top:max(16px,env(safe-area-inset-top));right:16px;z-index:5;width:44px;height:44px;border-radius:50%;border:1px solid var(--line);background:#fff;color:var(--ink2);display:grid;place-items:center;cursor:pointer;box-shadow:0 8px 18px -10px rgba(50,62,170,.45);transition:transform .2s}
.lc-x:hover{transform:translateY(-1px)}
.lc-shell{position:relative;min-height:100vh;min-height:100dvh;max-width:1180px;margin:0 auto;display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,.95fr);gap:40px;align-items:center;
  padding:max(32px,env(safe-area-inset-top)) 32px max(32px,env(safe-area-inset-bottom))}

/* hero panel */
.lc-hero{position:relative;overflow:hidden;isolation:isolate;display:flex;flex-direction:column;justify-content:center;min-height:min(680px,calc(100dvh - 64px));padding:clamp(28px,4vw,52px);border-radius:34px;color:#fff;
  background:radial-gradient(90% 120% at 100% 0%,rgba(255,226,166,.5),transparent 55%),radial-gradient(80% 90% at 0% 100%,rgba(18,198,216,.45),transparent 60%),linear-gradient(135deg,#5b6dff 0%,#8d5bff 55%,#6a63ff 100%);
  box-shadow:0 40px 70px -36px rgba(79,107,255,.85),0 1px 0 rgba(255,255,255,.45) inset;animation:lcIn .6s ease-out both}
.lc-hero::after{content:"";position:absolute;top:0;left:12%;right:12%;height:2px;border-radius:2px;background:linear-gradient(90deg,transparent,var(--champ),transparent)}
.lc-art{position:absolute;z-index:-1;right:-20px;bottom:-24px;width:min(62%,360px);height:auto;opacity:.5;pointer-events:none}
.lc-art path{fill:none;stroke:#fff;stroke-width:1.4;stroke-dasharray:3 5;opacity:.8}
.lc-art circle{fill:#fff;opacity:.95}.lc-art circle.r{fill:#ffe2a6}
.lc-badge{align-self:flex-start;display:inline-flex;align-items:center;gap:8px;padding:7px 14px;border-radius:999px;font-size:13px;font-weight:700;color:#3d2a00;background:linear-gradient(135deg,#ffe9b5,#f0c46b);box-shadow:0 10px 20px -10px rgba(120,80,0,.7)}
.lc-hero h1{margin:22px 0 0;font-family:var(--fd);font-size:clamp(30px,4.2vw,52px);line-height:1.08;font-weight:600;letter-spacing:-.025em;text-shadow:0 2px 22px rgba(30,20,120,.3)}
.lc-hero p.sub{margin:16px 0 0;max-width:480px;font-size:clamp(14.5px,1.4vw,16.5px);line-height:1.65;color:rgba(255,255,255,.92)}
.lc-feats{display:grid;gap:10px;margin-top:28px;max-width:480px}
.lc-feat{display:flex;align-items:center;gap:14px;padding:12px 14px;border-radius:18px;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.3)}
.lc-feat .ic{width:38px;height:38px;border-radius:12px;display:grid;place-items:center;flex:none;color:#3d2a00;background:linear-gradient(135deg,#ffe9b5,#f0c46b)}
.lc-feat b{display:block;font-size:14.5px;font-weight:700}
.lc-feat small{display:block;font-size:13px;color:rgba(255,255,255,.85);margin-top:1px}
.lc-chat{margin-top:20px;max-width:480px;padding:14px;border-radius:22px;background:rgba(255,255,255,.96);box-shadow:0 24px 44px -26px rgba(30,20,120,.7);display:grid;gap:10px}
.lc-msg{max-width:88%;padding:10px 14px;border-radius:16px;font-size:13.5px;line-height:1.5}
.lc-msg.u{justify-self:end;color:#fff;font-weight:600;background:linear-gradient(135deg,var(--indigo),var(--violet));border-bottom-right-radius:5px}
.lc-msg.ai{justify-self:start;color:var(--ink2);background:#f1f2fb;border-bottom-left-radius:5px;display:flex;gap:8px;align-items:flex-start}
.lc-msg.ai svg{flex:none;margin-top:2px;color:var(--indigo)}

/* login card */
.lc-cardw{animation:lcIn .6s .08s ease-out both}
.lc-card{position:relative;max-width:480px;margin:0 auto;padding:clamp(24px,3.4vw,40px);border-radius:32px;background:#fff;border:1px solid var(--line);
  box-shadow:0 1px 0 #fff inset,0 2px 4px rgba(40,50,140,.05),0 40px 70px -40px rgba(50,62,170,.55)}
.lc-card::before{content:"";position:absolute;top:0;left:14%;right:14%;height:3px;border-radius:0 0 4px 4px;background:linear-gradient(90deg,var(--indigo),var(--violet),var(--aqua),var(--champ))}
.lc-emblem{width:58px;height:58px;border-radius:20px;display:grid;place-items:center;color:#fff;margin:0 0 18px;background:linear-gradient(145deg,#8fa2ff,var(--indigo) 45%,var(--violet));box-shadow:0 14px 26px -12px rgba(79,107,255,.9),0 1px 0 rgba(255,255,255,.55) inset}
.lc-card h2{margin:0;font-family:var(--fd);font-size:clamp(22px,2.6vw,26px);font-weight:600;letter-spacing:-.02em;color:var(--ink)}
.lc-card .tag{margin:8px 0 26px;font-size:14.5px;line-height:1.55;color:var(--ink3)}
.lc-field{margin-bottom:16px}
.lc-field label{display:block;margin-bottom:8px;font-size:13px;font-weight:700;color:var(--ink2)}
.lc-inw{position:relative}
.lc-inw>svg.lead{position:absolute;left:16px;top:50%;transform:translateY(-50%);color:var(--ink3);pointer-events:none}
.lc-input{width:100%;height:56px;border-radius:16px;border:1.5px solid var(--line);background:#f8f9fe;color:var(--ink);font-size:16px;font-weight:600;padding:0 50px 0 48px;outline:none;transition:border-color .15s,box-shadow .15s,background .15s}
.lc-input::placeholder{color:#9aa1c2;font-weight:500}
.lc-input:focus{border-color:var(--indigo);background:#fff;box-shadow:0 0 0 4px rgba(79,107,255,.16)}
.lc-eye{position:absolute;right:7px;top:50%;transform:translateY(-50%);width:42px;height:42px;border:0;border-radius:12px;background:transparent;color:var(--ink3);display:grid;place-items:center;cursor:pointer}
.lc-eye:hover{color:var(--indigo);background:rgba(79,107,255,.08)}
.lc-error{margin:2px 0 16px;padding:12px 14px;border-radius:14px;font-size:13.5px;font-weight:600;color:#a3203f;background:#fff6f8;border:1px solid #ffd0da}
.lc-cta{width:100%;height:58px;border:0;border-radius:999px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;font-size:16px;font-weight:700;color:#fff;margin-top:8px;
  background:linear-gradient(135deg,var(--indigo),var(--violet));box-shadow:0 16px 28px -14px rgba(79,107,255,.95);transition:transform .2s,box-shadow .2s}
.lc-cta:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 20px 32px -14px rgba(79,107,255,1)}
.lc-cta:active:not(:disabled){transform:scale(.985)}
.lc-cta:disabled{opacity:.7;cursor:progress}
.lc-spin{width:18px;height:18px;border-radius:50%;border:3px solid rgba(255,255,255,.35);border-top-color:#fff;animation:llSpin .8s linear infinite}
.lc-trust{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:22px}
.lc-trust div{display:flex;flex-direction:column;align-items:center;gap:6px;padding:12px 6px;border-radius:16px;text-align:center;font-size:12px;font-weight:700;line-height:1.3;color:var(--ink2);background:linear-gradient(135deg,rgba(79,107,255,.07),rgba(18,198,216,.08));border:1px solid var(--line)}
.lc-trust svg{color:var(--indigo)}
.lc-note{margin-top:16px;text-align:center;font-size:12.5px;line-height:1.55;color:var(--ink3)}
.lc :focus-visible{outline:3px solid rgba(79,107,255,.55);outline-offset:3px}
.lc-input:focus-visible{outline:none}

@keyframes lcIn{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.lc-hero,.lc-cardw{animation:none!important}.lc *{transition:none!important}}

/* tablet + mobile */
@media (max-width:960px){
  .lc-shell{grid-template-columns:minmax(0,1fr);gap:20px;padding:max(20px,env(safe-area-inset-top)) 20px max(24px,env(safe-area-inset-bottom));align-items:start}
  .lc-hero{min-height:0;padding:28px 24px;border-radius:28px}
  .lc-feats,.lc-chat{display:none}
  .lc-cardw{width:100%}
}
@media (max-width:560px){
  .lc-shell{padding:max(14px,env(safe-area-inset-top)) 14px max(20px,env(safe-area-inset-bottom));gap:16px}
  .lc-hero{padding:22px 20px;border-radius:24px}
  .lc-hero h1{margin-top:16px;font-size:27px}
  .lc-hero p.sub{margin-top:10px;font-size:14px}
  .lc-art{width:56%;opacity:.35}
  .lc-card{padding:24px 18px;border-radius:26px}
  .lc-trust{gap:6px}
  .lc-trust div{font-size:11px;padding:10px 4px}
}
@media (max-height:640px) and (orientation:landscape){
  .lc-shell{align-items:start}
}
`;

// ---------------------------------------------------------------------------
// Avatar
// ---------------------------------------------------------------------------
const Avatar = memo(function Avatar({ name, id, photoUrl, color, size = 56, fontSize = 16 }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [photoUrl]);
  return (
    <div className="ll-av" style={{ width: size, height: size, border: `${size < 44 ? 2 : 3}px solid ${color}`, color, fontSize }}>
      {photoUrl && !failed
        ? <img src={photoUrl} alt="" loading="lazy" onError={() => setFailed(true)} />
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
// Tree pieces
// ---------------------------------------------------------------------------
const getStatus = (n) => {
  const ring = getRing(n);
  if (ring.label === 'Terminated') return { ...ring, cls: 'r', tag: 'Terminated' };
  const pv = Number(n.self_pv ?? n.current_pv ?? 0);
  return { ...ring, cls: pv > 0 ? 'g' : '', tag: `${formatNumber(pv)} PV` };
};

const Branch = ({ index, count }) => (
  <>
    {count > 1 && <div className={`ll-hl${index === 0 ? ' f' : ''}${index === count - 1 ? ' l' : ''}`} />}
    <div className="ll-st" />
  </>
);

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
        if (d === 1 || n.has_children || Number(n.children_count) > 0 || crawl) { need.push(id); unknown = true; }
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
    <div className="ll-col">
      <Branch index={index} count={count} />
      <div className={`ll-node${st.cls === 'r' ? ' t' : ''}`} style={{ '--fc': st.color }} role="button" tabIndex={0}
        onClick={() => onPick(chain)} onKeyDown={(e) => { if (e.key === 'Enter') onPick(chain); }}>
        <Avatar name={node.name} id={id} photoUrl={node.photo_url} color={st.color} size={34} fontSize={11} />
        <div className="nm">{node.name || `#${id}`}</div>
        <div className="id">{id}</div>
        <span className={`ll-tag ${st.cls}`}>{st.tag}</span>
        {!showKids && kc > 0 && <span className="ll-kidhint">↓ {kc}</span>}
      </div>
      {slots > 0 && (
        <>
          <div className="ll-vline" style={{ '--h': '12px' }} />
          <div className="ll-row">
            {shown.map((k, i) => (
              <Subtree key={nid(k)} node={k} chain={chain.concat(k)} index={i} count={slots}
                level={level + 1} plan={plan} getKids={getKids} onPick={onPick} />
            ))}
            {extra > 0 && (
              <div className="ll-col">
                <Branch index={shown.length} count={slots} />
                <button type="button" className="ll-more" onClick={() => onPick(chain)} aria-label={`${extra} more`}>+{extra}</button>
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
    <div className="ll-rail" aria-label="Tree depth"
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); draggingRef.current = true; pick(e.clientY); }}
      onPointerMove={(e) => { if (draggingRef.current) pick(e.clientY); }}
      onPointerUp={stop} onPointerCancel={stop}>
      <div className="ll-rtrack" ref={trackRef}>
        <div className="ll-rfill" style={{ height: `${ratio * 100}%` }} />
        {n <= 30 && trail.map((t, i) => (
          <div key={nid(t) + i} className={`ll-tick${i <= idx ? ' on' : ''}`} style={{ top: `${n > 1 ? (i / (n - 1)) * 100 : 0}%` }} />
        ))}
        <div className={`ll-thumb${drag === null ? ' s' : ''}`} style={{ top: `${ratio * 100}%` }} />
        {drag !== null && (
          <div className="ll-bubble" style={{ top: `${ratio * 100}%` }}>
            L{idx} • {trail[idx]?.name || nid(trail[idx])}
          </div>
        )}
      </div>
    </div>
  );
}

function TreeScreen({
  trail, idx, setIdx, onPush, getKids, ensureKids, retry, isLoading, isFailed,
  crawlRunning, onClose, onProfile, search, setSearch, results, searching, onPickResult
}) {
  const focus = trail[idx];
  const fid = nid(focus);
  const kids = getKids(fid);
  const [visible, setVisible] = useState(TREE_PAGE);
  const [searchFocus, setSearchFocus] = useState(false);
  const [winW, setWinW] = useState(() => window.innerWidth);
  const stageRef = useRef(null);
  const crumbsRef = useRef(null);
  const dirRef = useRef('');
  const lastRef = useRef({ fid, idx });

  if (lastRef.current.fid !== fid) {
    dirRef.current = idx > lastRef.current.idx ? 'grow' : 'shrink';
    lastRef.current = { fid, idx };
  }

  useEffect(() => {
    const f = () => setWinW(window.innerWidth);
    window.addEventListener('resize', f);
    return () => window.removeEventListener('resize', f);
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

  const onPick = useCallback((chain) => onPush(chain), [onPush]);

  const st = getStatus(focus);
  const shownKids = kids ? kids.slice(0, visible) : [];
  const leftMode = plan.widest * slot > availW;
  const ancestors = trail.slice(Math.max(0, idx - 2), idx);
  const hiddenAbove = Math.max(0, idx - 2);
  const selfPv = Number(focus.self_pv ?? focus.current_pv ?? 0);

  return (
    <div className="ll-tree" style={{ '--slot': `${slot}px`, '--upw': `${upW}px` }}>
      <div className="ll-tbar">
        <button type="button" className="ll-btn ic" onClick={onClose} aria-label="Close tree"><ArrowLeft size={18} /></button>
        <h2>Team Tree</h2>
        <div className="ll-sbox">
          <Search size={16} />
          <input className="ll-in" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or ID"
            onFocus={() => setSearchFocus(true)} onBlur={() => setTimeout(() => setSearchFocus(false), 150)} />
          {searchFocus && search.trim().length >= 2 && (
            <div className="ll-sres" onPointerDown={(e) => e.preventDefault()}>
              {searching && <div style={{ padding: 12, fontSize: 12, color: '#64748B' }}>Searching...</div>}
              {!searching && results.length === 0 && <div style={{ padding: 12, fontSize: 12, color: '#64748B' }}>No members found.</div>}
              {results.map((r) => (
                <div key={nid(r)} className="it" onClick={() => onPickResult(r)}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{r.name || `Associate #${nid(r)}`}</div>
                  <div style={{ fontSize: 11, color: '#64748B' }}>ID {nid(r)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="ll-crumbbar">
        <button type="button" className="ll-btn" style={{ height: 32, padding: '0 10px' }} disabled={idx === 0} onClick={() => setIdx(idx - 1)}>
          <ChevronUp size={15} /><span>Back</span>
        </button>
        <button type="button" className="ll-btn" style={{ height: 32, padding: '0 10px' }} disabled={idx === 0} onClick={() => setIdx(0)}>
          <ChevronsUp size={15} /><span>Top</span>
        </button>
        <div className="ll-crumbs" ref={crumbsRef}>
          {trail.map((t, i) => (
            <React.Fragment key={nid(t) + i}>
              {i > 0 && <span className="ll-sep">›</span>}
              <button type="button" data-active={i === idx ? '1' : '0'}
                className={`ll-crumb${i === idx ? ' on' : ''}${i > idx ? ' fw' : ''}`} onClick={() => setIdx(i)}>
                {i === 0 ? 'You' : (t.name || nid(t))}
              </button>
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className="ll-stage" ref={stageRef}>
        <div className={`ll-inner ${leftMode ? 'left' : ''} ${dirRef.current}`} key={fid}>
          <div className="ll-up">
            {hiddenAbove > 0 && (
              <>
                <button type="button" className="ll-more" onClick={() => setIdx(Math.max(0, idx - 3))}>+{hiddenAbove} above</button>
                <div className="ll-vline" style={{ '--h': '8px' }} />
              </>
            )}
            {ancestors.map((a, i) => {
              const as = getStatus(a);
              const pos = idx - ancestors.length + i;
              return (
                <React.Fragment key={nid(a) + pos}>
                  <button type="button" className={`ll-apill${as.cls === 'r' ? ' t' : ''}`} style={{ '--fc': as.color }} onClick={() => setIdx(pos)}>
                    <Avatar name={a.name} id={nid(a)} photoUrl={a.photo_url} color={as.color} size={22} fontSize={8} />
                    <span className="n">{pos === 0 ? 'You' : (a.name || nid(a))}</span>
                  </button>
                  <div className="ll-vline" style={{ '--h': '10px' }} />
                </React.Fragment>
              );
            })}

            <div className={`ll-fcard${st.cls === 'r' ? ' t' : ''}`} style={{ '--fc': st.color }}>
              <button type="button" className="inf" aria-label="View profile" onClick={() => onProfile(focus)}><Info size={14} /></button>
              <Avatar name={focus.name} id={fid} photoUrl={focus.photo_url} color={st.color} size={40} fontSize={13} />
              <div className="nm">{focus.name || `Associate #${fid}`}{idx === 0 ? ' (You)' : ''}</div>
              <div className="id">ID {fid}{focus.max_pin ? ` • ${focus.max_pin}` : ''}{focus.curr_pin && ` • ${focus.curr_pin}`}</div>
              <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
                <span className={`ll-tag ${st.cls}`} style={{ marginTop: 0 }}>{st.cls === 'r' ? 'Terminated' : `Self ${formatNumber(selfPv)} PV`}</span>
                {kids && <span className="ll-tag" style={{ marginTop: 0 }}>{kids.length} direct</span>}
              </div>
            </div>
            {kids && kids.length > 0 && <div className="ll-vline" style={{ '--h': '18px' }} />}
          </div>

          {!kids && isLoading(fid) && <div style={{ padding: 24, color: '#64748B', fontSize: 13 }}>Loading downline...</div>}
          {!kids && !isLoading(fid) && isFailed(fid) && (
            <div style={{ padding: 20, textAlign: 'center' }}>
              <div style={{ color: '#B91C1C', fontSize: 13, marginBottom: 10 }}>Could not load this downline.</div>
              <button type="button" className="ll-btn p" onClick={() => retry(fid)}>Try again</button>
            </div>
          )}
          {kids && kids.length === 0 && (
            <div style={{ marginTop: 14, border: '1px dashed #CBD5E1', borderRadius: 12, padding: '10px 16px', fontSize: 13, color: '#64748B' }}>
              {crawlRunning ? 'Team is still syncing...' : 'No downline enrolled yet'}
            </div>
          )}

          {shownKids.length > 0 && (
            <div className="ll-row">
              {leftMode && upW / 2 > slot / 2 && (
                <div className="ll-spine" style={{ left: slot / 2, width: upW / 2 - slot / 2 }} />
              )}
              {shownKids.map((k, i) => (
                <Subtree key={nid(k)} node={k} chain={[k]} index={i} count={shownKids.length}
                  level={1} plan={plan} getKids={getKids} onPick={onPick} />
              ))}
            </div>
          )}

          {kids && kids.length > visible && (
            <button type="button" className="ll-btn" style={{ marginTop: 16 }} onClick={() => setVisible((v) => v + TREE_PAGE)}>
              Show more ({kids.length - visible} left)
            </button>
          )}
        </div>
      </div>

      {trail.length > 1 && <DepthRail trail={trail} idx={idx} onChange={setIdx} />}
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
// Premium full-screen connect / login screen
// ---------------------------------------------------------------------------
function ConnectScreen({
  canClose, onClose, loginId, setLoginId, password, setPassword, formError, isConnecting, onConnect
}) {
  const [showPass, setShowPass] = useState(false);

  return (
    <div className="lc" role="dialog" aria-modal="true" aria-labelledby="lc-title">
      {canClose && (
        <button type="button" className="lc-x" aria-label="Close" onClick={onClose}><X size={18} /></button>
      )}

      <div className="lc-shell">
        {/* Brand / value panel */}
        <section className="lc-hero">
          <svg className="lc-art" viewBox="0 0 320 220" aria-hidden="true">
            <path d="M160 30 L80 100 M160 30 L240 100 M80 100 L40 175 M80 100 L120 175 M240 100 L200 175 M240 100 L280 175" />
            <circle className="r" cx="160" cy="30" r="9" />
            <circle cx="80" cy="100" r="7" /><circle cx="240" cy="100" r="7" />
            <circle cx="40" cy="175" r="5" /><circle cx="120" cy="175" r="5" />
            <circle cx="200" cy="175" r="5" /><circle cx="280" cy="175" r="5" />
          </svg>

          <span className="lc-badge"><Sparkles size={14} /> AI-powered team intelligence</span>
          <h1>Your entire team, one question away.</h1>
          <p className="sub">
            Connect your RCM account and ask the AI about any member, leg or level of your downline. Answers in seconds, from your own live data.
          </p>

          <div className="lc-feats">
            <div className="lc-feat">
              <div className="ic"><TreePine size={18} /></div>
              <div><b>Complete tree and downline</b><small>Every level and every member in one view</small></div>
            </div>
            <div className="lc-feat">
              <div className="ic"><TrendingUp size={18} /></div>
              <div><b>Leg-wise PV and repurchase</b><small>Live business figures for Leg A and Leg B</small></div>
            </div>
            <div className="lc-feat">
              <div className="ic"><UserCheck size={18} /></div>
              <div><b>Active and inactive tracking</b><small>See who is purchasing and who is not</small></div>
            </div>
          </div>

          <div className="lc-chat" aria-hidden="true">
            <div className="lc-msg u">Which members in my Leg B are inactive this month?</div>
            <div className="lc-msg ai"><Sparkles size={15} /><span>Your downline has been analysed. Here are the inactive members in Leg B.</span></div>
          </div>
        </section>

        {/* Login card */}
        <section className="lc-cardw">
          <div className="lc-card">
            <div className="lc-emblem"><ShieldCheck size={28} /></div>
            <h2 id="lc-title">Connect your RCM account</h2>
            <div className="tag">Sign in with your RCM credentials to start asking AI about your team.</div>

            <div className="lc-field">
              <label htmlFor="ll-buyer">RCM Buyer ID</label>
              <div className="lc-inw">
                <Users size={18} className="lead" />
                <input id="ll-buyer" className="lc-input" value={loginId}
                  onChange={(e) => setLoginId(e.target.value.replace(/\D/g, ''))}
                  inputMode="numeric" maxLength={10} autoComplete="username" placeholder="Enter your Buyer ID" />
              </div>
            </div>

            <div className="lc-field">
              <label htmlFor="ll-pass">RCM Password</label>
              <div className="lc-inw">
                <Lock size={18} className="lead" />
                <input id="ll-pass" className="lc-input" type={showPass ? 'text' : 'password'} value={password}
                  onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="Enter your password"
                  onKeyDown={(e) => { if (e.key === 'Enter' && !isConnecting) onConnect(); }} />
                <button type="button" className="lc-eye" aria-label={showPass ? 'Hide password' : 'Show password'} onClick={() => setShowPass((s) => !s)}>
                  {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {formError && <div className="lc-error" role="alert">{formError}</div>}

            <button type="button" className="lc-cta" onClick={onConnect} disabled={isConnecting}>
              {isConnecting
                ? (<><span className="lc-spin" />Verifying...</>)
                : (<><Sparkles size={18} />Connect with AI</>)}
            </button>

            <div className="lc-trust">
              <div><Lock size={16} />Password never stored</div>
              <div><ShieldCheck size={16} />Secure connection</div>
              <div><Users size={16} />Private to your account</div>
            </div>

            <div className="lc-note">
              Your password is used only to sign in to RCM and is never saved.
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

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

  const [nav, setNav] = useState({ path: [], idx: 0 });
  const [, setVer] = useState(0);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const [selectedMember, setSelectedMember] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [assistantQuery, setAssistantQuery] = useState('');
  const [matrixData, setMatrixData] = useState([]);
  const [matrixMonths, setMatrixMonths] = useState(() => ['Nov 2026 (Current / Live)', 'Oct 2026 (Closed)', 'Sept 2026 (Closed)']);
  const [loadingAssistant, setLoadingAssistant] = useState(false);
  const [matrixPage, setMatrixPage] = useState(0);
  const [selectedYear, setSelectedYear] = useState('2026');
  const [selectedMonth, setSelectedMonth] = useState('11');
  const [selectedLegFilter, setSelectedLegFilter] = useState('all');

  const monthKey = `${selectedYear}${selectedMonth}`;

  const sessionRef = useRef(0);
  const activeIdRef = useRef(activeBuyerId);
  const assistantQueryRef = useRef('');
  const lastCompleteRef = useRef(0);
  const syncCompleteRef = useRef(null);
  const kidsRef = useRef(new Map());
  const inflightRef = useRef(new Map());
  const failedRef = useRef(new Set());
  const bumpTimerRef = useRef(null);

  useEffect(() => { activeIdRef.current = activeBuyerId; }, [activeBuyerId]);
  useEffect(() => { assistantQueryRef.current = assistantQuery; }, [assistantQuery]);

  const scheduleRender = useCallback(() => {
    if (bumpTimerRef.current) return;
    bumpTimerRef.current = setTimeout(() => { bumpTimerRef.current = null; setVer((v) => v + 1); }, 60);
  }, []);
  useEffect(() => () => clearTimeout(bumpTimerRef.current), []);

  const getKids = useCallback((id) => kidsRef.current.get(String(id)), []);
  const isLoading = useCallback((id) => inflightRef.current.has(String(id)), []);
  const isFailed = useCallback((id) => failedRef.current.has(String(id)), []);

  const ensureKids = useCallback((parentId) => {
    const pid = String(parentId);
    if (!pid || !activeIdRef.current) return Promise.resolve(null);
    if (kidsRef.current.has(pid)) return Promise.resolve(kidsRef.current.get(pid));
    if (inflightRef.current.has(pid)) return inflightRef.current.get(pid);
    const sid = sessionRef.current;
    failedRef.current.delete(pid);
    const p = limitTreeCalls(() => getTreeChildren(activeIdRef.current, pid))
      .then((json) => {
        if (sid !== sessionRef.current) return null;
        if (json?.success && Array.isArray(json.data)) {
          kidsRef.current.set(pid, json.data);
          return json.data;
        }
        failedRef.current.add(pid);
        return null;
      })
      .catch(() => { if (sid === sessionRef.current) failedRef.current.add(pid); return null; })
      .finally(() => {
        inflightRef.current.delete(pid);
        if (sid === sessionRef.current) scheduleRender();
      });
    inflightRef.current.set(pid, p);
    scheduleRender();
    return p;
  }, [scheduleRender]);

  const retryKids = useCallback((id) => { failedRef.current.delete(String(id)); ensureKids(id); }, [ensureKids]);

  const clearTreeCache = useCallback(() => {
    kidsRef.current = new Map();
    inflightRef.current = new Map();
    failedRef.current = new Set();
    scheduleRender();
  }, [scheduleRender]);

  const resetSessionState = useCallback(() => {
    sessionRef.current += 1;
    kidsRef.current = new Map();
    inflightRef.current = new Map();
    failedRef.current = new Set();
    setOverview(null);
    setMatrixData([]);
    setNav({ path: [], idx: 0 });
    setSelectedMember(null);
    setDrawerOpen(false);
    setSearch('');
    setSearchResults([]);
    setAssistantQuery('');
    setSyncing(false);
    setLoadError('');
    setActiveBuyerId('');
  }, []);

  const loadOverview = useCallback(async (id, sid) => {
    try {
      const json = await getLifelinesOverview(id);
      if (sid !== sessionRef.current) return;
      if (json?.success && json.data) {
        setOverview(json.data);
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

  const loadAssistant = useCallback(async (id, queryStr, monthKey, sid) => {
    setLoadingAssistant(true);
    try {
      const json = await getAssistantQuery(id, queryStr, monthKey);
      if (sid !== sessionRef.current) return;
      if (json?.success && Array.isArray(json.data)) {
        setMatrixData(json.data);
        setMatrixPage(0);
        if (Array.isArray(json.months) && json.months.length) setMatrixMonths(json.months);
      } else {
        setMatrixData([]);
      }
    } catch (e) {
      if (sid === sessionRef.current) setMatrixData([]);
    } finally {
      if (sid === sessionRef.current) setLoadingAssistant(false);
    }
  }, []);

  const loadAll = useCallback(async (id) => {
    if (!id) return;
    const sid = sessionRef.current;
    setLoadError('');
    clearTreeCache();
    try {
      await Promise.allSettled([
        loadOverview(id, sid),
        loadAssistant(id, assistantQueryRef.current, `${selectedYear}${selectedMonth}`, sid)
      ]);
    } finally {
      if (sid === sessionRef.current) setBooting(false);
    }
  }, [loadOverview, loadAssistant, clearTreeCache, selectedYear, selectedMonth]);

  useEffect(() => {
    if (initialId) loadAll(initialId); else setShowSyncModal(true);
  }, []);

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
    const q = search.trim();
    if (q.length < 2 || !activeBuyerId) { setSearchResults([]); return undefined; }
    const sid = sessionRef.current;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const json = await searchLifelines(activeBuyerId, q);
        if (sid !== sessionRef.current) return;
        const list = Array.isArray(json?.data) ? json.data : json?.data?.results || [];
        setSearchResults(list.slice(0, 20));
      } catch (e) {
        if (sid === sessionRef.current) setSearchResults([]);
      } finally {
        if (sid === sessionRef.current) setSearching(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [search, activeBuyerId]);

  useEffect(() => {
    if (!drawerOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setDrawerOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  useEffect(() => {
    if (activeTab !== 'tree') return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [activeTab]);

  // Lock page scroll behind the full-screen login screen
  useEffect(() => {
    if (!showSyncModal) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [showSyncModal]);

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

  const openMemberDetails = useCallback(async (node) => {
    const memberId = nid(node);
    if (!memberId || !activeIdRef.current) return;
    const sid = sessionRef.current;
    try {
      const json = await getMemberFullProfile(activeIdRef.current, memberId);
      if (sid !== sessionRef.current) return;
      if (json?.success) { setSelectedMember(json.data); setDrawerOpen(true); }
    } catch (e) {
      if (e.status !== 401) setNotice(e.message || 'Could not open member profile.');
    }
  }, []);

  // ----- derived metrics -----
  const ovData = overview || {};
  const totalNetworkPv = ovData.total_pv ?? ovData.totals?.totalPv ?? 0;
  const selfPurchasePv = ovData.self_pv ?? ovData.totals?.selfPv ?? 0;
  const totalTeamRepurchaseAmt = ovData.total_repurchase_amt ?? ovData.totals?.totalRepurchaseAmt ?? 0;
  const selfRepurchaseAmt = ovData.self_repurchase_amt ?? ovData.repurchase_amt ?? 0;
  const activeCount = ovData.active_purchasers ?? ovData.totals?.activePurchasers ?? ovData.totals?.active ?? 0;
  const inactiveCount = ovData.inactive_members ?? ovData.totals?.inactive ?? ovData.totals?.zeroPv ?? 0;
  const terminatedCount = ovData.terminated_members ?? ovData.totals?.terminated ?? 0;
  const totalTeamCount = ovData.total_team ?? ovData.totals?.totalMembers ?? 0;
  const directLegs = ovData.directLegs || ovData.legs || [];
  const rootIdentity = ovData.identity || {};
  const photoUrl = rootIdentity.photo_url || null;
  const crawlRunning = Boolean(syncing || ovData.crawl?.running);

  const rootNode = useMemo(() => ({
    buyer_id: activeBuyerId,
    name: rootIdentity.name || `Leader #${activeBuyerId}`,
    photo_url: photoUrl,
    highest_pin: rootIdentity.highest_pin,
    self_pv: selfPurchasePv,
    total_group_pv: totalNetworkPv,
    status: 1
  }), [activeBuyerId, rootIdentity.name, rootIdentity.highest_pin, photoUrl, selfPurchasePv, totalNetworkPv]);

  const trail = useMemo(() => [rootNode, ...nav.path], [rootNode, nav.path]);

  const pushNodes = useCallback((nodes) => {
    setNav((n) => ({ path: n.path.slice(0, n.idx).concat(nodes), idx: n.idx + nodes.length }));
  }, []);
  const setIdx = useCallback((i) => setNav((n) => (n.idx === i ? n : { ...n, idx: i })), []);

  const openLeg = (leg, idx) => {
    const headId = leg.head_id || leg.buyer_id;
    if (!headId) { setActiveTab('tree'); return; }
    setNav({ path: [{ buyer_id: headId, name: leg.head_name || leg.name, status: 1, self_pv: 0, total_group_pv: leg.pv }], idx: 1 });
    setActiveTab('tree');
  };

  const pickSearchResult = useCallback((r) => {
    setSearch(''); setSearchResults([]);
    openMemberDetails(r);
  }, [openMemberDetails]);

  const pagedRows = useMemo(
    () => matrixData.slice(matrixPage * MATRIX_PAGE, (matrixPage + 1) * MATRIX_PAGE),
    [matrixData, matrixPage]
  );
  const memberPhone = toWhatsappNumber(selectedMember?.mobile || selectedMember?.mobile_no);

  return (
    <div className="ll">
      <style>{CSS}</style>
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
                  {rootIdentity.curr_pin && <span className="ll-chip t">Current Pin: {rootIdentity.curr_pin}</span>}
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
            { key: 'assistant', label: 'Reports', icon: <Sparkles size={17} /> }
          ].map((tab) => (
            <button key={tab.key} type="button" role="tab" aria-selected={activeTab === tab.key}
              className={`ll-tab${activeTab === tab.key ? ' on' : ''}`} onClick={() => setActiveTab(tab.key)}>
              {tab.icon}<span className="t">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* OVERVIEW */}
        {activeTab === 'overview' && (
          <div>
            {(!overview || overview.synced === false) && !booting && (
              <div className="ll-card ll-empty" style={{ marginBottom: 14 }}>
                {activeBuyerId ? 'No data synced yet. Tap "Re-sync from RCM" to fetch live data.' : 'Connect your RCM account to see live metrics.'}
              </div>
            )}

            {/* 4 OVERVIEW CARDS */}
            <div className="ll-stats">
              {/* Card 1: Total Network Turnover */}
              <div className="ll-card ll-stat">
                <div className="ico"><TrendingUp size={19} /></div>
                <div className="l">Total Network Turnover</div>
                <div className="v">₹ {formatNumber(totalTeamRepurchaseAmt)}</div>
                <div className="n">Total team purchase (₹)</div>
                <div className="sub-v">{formatNumber(totalNetworkPv)} PV</div>
                <div className="n">Official portal turnover</div>
              </div>

              {/* Card 2: Your Self Purchase */}
              <div className="ll-card ll-stat">
                <div className="ico"><Wallet size={19} /></div>
                <div className="l">Your Self Purchase</div>
                <div className="v">₹ {formatNumber(selfRepurchaseAmt)}</div>
                <div className="n">Personal consumption (₹)</div>
                <div className="sub-v">{formatNumber(selfPurchasePv)} PV</div>
                <div className="n">Personal monthly consumption</div>
              </div>

              {/* Card 3: Active Purchasers & Breakdown */}
              <div className="ll-card ll-stat">
                <div className="ico"><UserCheck size={19} /></div>
                <div className="l">Active Purchasers</div>
                <div className="v" style={{ color: COLORS.green }}>{formatNumber(activeCount)}</div>
                <div className="n">Members billing above 0 PV</div>
                <div className="split-row">
                  <span style={{ color: '#D97706' }}>Inactive: {formatNumber(inactiveCount)}</span>
                  <span style={{ color: COLORS.red }}>Terminated: {formatNumber(terminatedCount)}</span>
                </div>
              </div>

              {/* Card 4: Total Downline Team */}
              <div className="ll-card ll-stat">
                <div className="ico"><Users size={19} /></div>
                <div className="l">Total Downline Team</div>
                <div className="v">{formatNumber(totalTeamCount)}</div>
                <div className="n">{crawlRunning ? 'Deep sync in progress...' : 'Members across all legs'}</div>
              </div>
            </div>

            <div className="ll-card ll-sec">
              <div className="ll-sechd">
                <div>
                  <h3>Direct leg heads</h3>
                  <p>Group volume of each direct leg. Tap a leg to open its tree.</p>
                </div>
                <button type="button" className="ll-btn" onClick={() => { setNav({ path: [], idx: 0 }); setActiveTab('tree'); }}>
                  <span>Open full tree</span><ArrowUpRight size={15} />
                </button>
              </div>
              <div className="ll-legs">
                {directLegs.length > 0 ? directLegs.map((leg, i) => {
                  const letter = leg.leg || String.fromCharCode(65 + i);
                  const headId = leg.head_id || leg.buyer_id;
                  return (
                    <button type="button" key={headId || i} className="ll-leg" onClick={() => openLeg(leg, i)}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                        <Avatar name={leg.head_name || leg.name} id={headId} photoUrl={leg.photo_url} color={COLORS.green} size={42} fontSize={14} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                            <span className="ll-chip t">Leg {letter}</span>
                            {leg.highest_pin && <span className="ll-chip g">{leg.highest_pin}</span>}
                          </div>
                          <div style={{ fontSize: 15, fontWeight: 800, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis' }}>{leg.head_name || leg.name}</div>
                          <div style={{ fontSize: 11, color: '#64748B', marginTop: 1 }}>ID {headId}</div>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div style={{ fontSize: 17, fontWeight: 800, color: COLORS.green }}>₹ {formatNumber(leg.total_leg_repurchase_amt ?? leg.repurchase_amt)}</div>
                        <div style={{ fontSize: 12, color: '#64748B', fontWeight: 700 }}>{formatNumber(leg.total_leg_subtree_pv ?? leg.pv)} PV</div>
                      </div>
                    </button>
                  );
                }) : <div className="ll-empty" style={{ gridColumn: '1 / -1' }}>{booting ? 'Loading...' : 'No direct leg volume yet.'}</div>}
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
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span className="ll-chip t">
                  {matrixMonths[matrixMonths.length - 1]?.split(' ')[0]} {matrixMonths[matrixMonths.length - 1]?.split(' ')[1]} to {matrixMonths[0]?.split(' ')[0]} {matrixMonths[0]?.split(' ')[1]}
                </span>
                <select className="ll-in" style={{ width: 100, height: 36, fontSize: 13 }}
                  value={selectedYear} onChange={(e) => {
                    setSelectedYear(e.target.value);
                    loadAssistant(activeBuyerId, assistantQueryRef.current, `${e.target.value}${selectedMonth}`, sessionRef.current);
                  }}>
                  {Array.from({ length: 5 }, (_, i) => String(2026 - i)).map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
                <select className="ll-in" style={{ width: 120, height: 36, fontSize: 13 }}
                  value={selectedMonth} onChange={(e) => {
                    setSelectedMonth(e.target.value);
                    loadAssistant(activeBuyerId, assistantQueryRef.current, `${selectedYear}${e.target.value}`, sessionRef.current);
                  }}>
                  {Array.from({ length: 12 }, (_, i) => {
                    const monthNum = String(12 - i).padStart(2, '0');
                    return <option key={monthNum} value={monthNum}>{new Date(2000, 12 - i - 1, 1).toLocaleString('en-IN', { month: 'long' })}</option>;
                  })}
                </select>
              </div>
            </div>

            <input
              type="text"
              className="ll-in"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setAssistantQuery(e.target.value);
                loadAssistant(activeBuyerId, e.target.value, monthKey, sessionRef.current);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  loadAssistant(activeBuyerId, assistantQuery, monthKey, sessionRef.current);
                }
              }}
              placeholder="🔍 Ask AI or search by Name, ID, or query (e.g. 'Gourav leg > 1000 PV', 'inactive members', 'Ajaybhai')..."
              style={{ width: '100%', height: 44, paddingLeft: 14, paddingRight: 14, fontSize: 14, marginBottom: 16 }}
            />

            <div className="ll-chips">
              {[
                { label: 'All Members', q: 'all', leg: 'all', count: totalTeamCount },
                { label: `Leg A: ${overview?.directLegs?.[0]?.head_name || 'N/A'}`, q: 'leg A', leg: 'A', count: overview?.directLegs?.[0]?.total_leg_subtree_pv || 0 },
                { label: `Leg B: ${overview?.directLegs?.[1]?.head_name || 'N/A'}`, q: 'leg B', leg: 'B', count: overview?.directLegs?.[1]?.total_leg_subtree_pv || 0 },
              ].map((c) => (
                <button key={c.label} type="button" className={`ll-fchip${selectedLegFilter === c.leg ? ' on' : ''}`}
                  onClick={() => {
                    setSelectedLegFilter(c.leg);
                    setAssistantQuery(c.q);
                    assistantQueryRef.current = c.q;
                    loadAssistant(activeBuyerId, c.q, monthKey, sessionRef.current);
                  }}>
                  {c.label} {c.leg === 'all' ? `(${formatNumber(c.count)})` : `(${formatNumber(c.count)} PV)`}
                </button>
              ))}
            </div>

            <div className="ll-tw">
              <table className="ll-tbl">
                <thead>
                  <tr>
                    <th className="sl">Member Info</th>
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
                    <tr><td colSpan={matrixMonths.length * 2 + 2} className="ll-empty">
                      <div style={{ display: 'inline-block', width: 22, height: 22, border: `3px solid ${COLORS.green}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'llSpin .8s linear infinite' }} />
                      <div style={{ marginTop: 10 }}>Loading records...</div>
                    </td></tr>
                  ) : pagedRows.length > 0 ? (
                    pagedRows.filter(row => selectedLegFilter === 'all' || (row.leg_type && row.leg_type.toLowerCase().includes(selectedLegFilter.toLowerCase()))).map((row) => <MatrixRow key={row.buyer_id} row={row} months={matrixMonths} />)
                  ) : (
                    <tr><td colSpan={matrixMonths.length * 2 + 2} className="ll-empty">
                      {crawlRunning ? 'Team is still syncing...' : 'No records match this filter.'}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {matrixData.length > MATRIX_PAGE && (
              <div className="ll-pager">
                <span>{matrixPage * MATRIX_PAGE + 1}-{Math.min((matrixPage + 1) * MATRIX_PAGE, matrixData.length)} of {formatNumber(matrixData.length)}</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="ll-btn" disabled={matrixPage === 0} onClick={() => setMatrixPage((p) => p - 1)}>Previous</button>
                  <button type="button" className="ll-btn" disabled={(matrixPage + 1) * MATRIX_PAGE >= matrixData.length} onClick={() => setMatrixPage((p) => p + 1)}>Next</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* FULL-SCREEN TREE */}
      {activeTab === 'tree' && activeBuyerId && (
        <TreeScreen
          trail={trail} idx={Math.min(nav.idx, trail.length - 1)} setIdx={setIdx} onPush={pushNodes}
          getKids={getKids} ensureKids={ensureKids} retry={retryKids} isLoading={isLoading} isFailed={isFailed}
          crawlRunning={crawlRunning} onClose={() => setActiveTab('overview')} onProfile={openMemberDetails}
          search={search} setSearch={setSearch} results={searchResults} searching={searching} onPickResult={pickSearchResult}
        />
      )}
      {activeTab === 'tree' && !activeBuyerId && (
        <div className="ll-wrap"><div className="ll-card ll-empty">Connect your RCM account to open the tree.</div></div>
      )}

      {/* MEMBER DRAWER / BOTTOM SHEET */}
      {drawerOpen && selectedMember && (
        <div className="ll-ov" onClick={() => setDrawerOpen(false)}>
          <div className="ll-dr" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <div style={{ fontSize: 17, fontWeight: 800 }}>Member profile</div>
              <button type="button" className="ll-btn ic" aria-label="Close" onClick={() => setDrawerOpen(false)}><X size={18} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: 18 }}>
              <Avatar name={selectedMember.name} id={selectedMember.buyer_id} photoUrl={selectedMember.photo_url}
                color={Number(selectedMember.status) === 0 ? COLORS.red : Number(selectedMember.self_pv) > 0 ? COLORS.green : COLORS.slate} size={76} fontSize={24} />
              <div style={{ fontSize: 19, fontWeight: 800, marginTop: 10 }}>{selectedMember.name}</div>
              <div style={{ fontSize: 13, color: '#64748B', marginTop: 3 }}>Buyer ID {selectedMember.buyer_id}</div>
              <span className={`ll-chip ${Number(selectedMember.status) === 0 ? 'r' : 'g'}`} style={{ marginTop: 8 }}>
                {Number(selectedMember.status) === 0 ? 'Terminated' : formatKyc(selectedMember.kyc_status)}
              </span>
            </div>
            <div className="ll-grid2" style={{ marginBottom: 18 }}>
              {[
                { k: 'Current Pin', v: selectedMember.curr_pin || '—' },
                { k: 'Highest Pin', v: selectedMember.max_pin || '—' },
                { k: 'KYC Status', v: formatKyc(selectedMember.kyc_status) },
                { k: 'Join date', v: formatJoinDate(selectedMember.join_date) },
                { k: 'Self purchase', v: `${formatNumber(selectedMember.self_pv)} PV` },
                { k: 'Re-purchase amount', v: `₹${formatNumber(selectedMember.repurchase_amt)}` },
                { k: 'Group volume', v: `${formatNumber(selectedMember.total_group_pv)} PV` },
                { k: 'Direct downlines', v: formatNumber(selectedMember.children_count) },
                { k: 'District / State', v: [selectedMember.district, selectedMember.state].filter(Boolean).join(', ') || '—' }
              ].map((it) => (
                <div key={it.k} className="ll-kv"><div className="k">{it.k}</div><div className="v">{it.v}</div></div>
              ))}
            </div>
            {memberPhone ? (
              <div style={{ display: 'flex', gap: 10 }}>
                <a className="ll-btn" style={{ flex: 1 }} href={`tel:+${memberPhone}`}><Phone size={16} />Call</a>
                <a className="ll-btn p" style={{ flex: 1, background: COLORS.green, borderColor: COLORS.green }} target="_blank" rel="noreferrer"
                  href={`https://wa.me/${memberPhone}?text=${encodeURIComponent(`Namaste ${selectedMember.name} ji! Connecting regarding your RCM business updates.`)}`}>
                  <MessageCircle size={16} />WhatsApp
                </a>
              </div>
            ) : <div style={{ fontSize: 12, color: '#64748B', textAlign: 'center' }}>Mobile number not available for this member.</div>}
          </div>
        </div>
      )}

      {/* CONNECT / LOGIN SCREEN */}
      {showSyncModal && (
        <ConnectScreen
          canClose={Boolean(activeBuyerId)}
          onClose={() => setShowSyncModal(false)}
          loginId={loginId}
          setLoginId={setLoginId}
          password={password}
          setPassword={setPassword}
          formError={formError}
          isConnecting={isConnecting}
          onConnect={handleSyncConnect}
        />
      )}

      {activeBuyerId && <SyncPill buyerId={activeBuyerId} onComplete={handleSyncComplete} />}
    </div>
  );
}