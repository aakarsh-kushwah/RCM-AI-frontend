import React, { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import {
  ShieldCheck, Activity, TreePine, Sparkles, RefreshCw, LogOut,
  Search, ChevronDown, ChevronRight, Phone, MessageCircle, X, ArrowUpRight
} from 'lucide-react';
import socketService from '../../services/socketService';
import {
  syncLifelines, logoutLifelines, getLifelinesOverview, getTreeChildren,
  getMemberFullProfile, getAssistantQuery, getSyncStatus, searchLifelines
} from '../../services/lifelinesApiClient';

const ACTIVE_ID_KEY = 'rcm_active_buyer_id';
const COLORS = { green: '#25D366', red: '#EF4444', slate: '#8696A0', teal: '#00A884', line: '#2A3942' };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const formatNumber = (val) => new Intl.NumberFormat('en-IN').format(Number(val || 0));

const getRolling12Months = () => {
  const months = [];
  const now = new Date();
  for (let i = 0; i < 12; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }));
  }
  return months;
};

const getInitials = (nameOrId) => {
  const text = String(nameOrId || '').trim();
  if (!text) return 'RC';
  if (/^\d+$/.test(text)) return text.slice(0, 2);
  const parts = text.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
};

const formatJoinDate = (d) => {
  if (!d) return '—';
  const parsed = new Date(d);
  if (Number.isNaN(parsed.getTime())) return String(d);
  return parsed.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatKyc = (status) => {
  if (status === null || status === undefined || status === '') return '—';
  if (status === 1 || status === 'A') return 'Active';
  if (status === 0 || status === 'T') return 'Terminated';
  return String(status);
};

const getRing = (node) => {
  if (Number(node.status ?? 1) === 0) return { color: COLORS.red, label: 'Terminated' };
  if (Number(node.self_pv ?? node.current_pv ?? 0) > 0) return { color: COLORS.green, label: 'Active' };
  return { color: COLORS.slate, label: '0 PV' };
};

const toWhatsappNumber = (mobile) => {
  const digits = String(mobile || '').replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  return digits.length >= 11 ? digits : '';
};

const getActiveSocket = () => {
  if (typeof socketService?.on === 'function') return socketService;
  return socketService?.getSocket?.() || socketService?.socket || null;
};

const cardStyle = { background: '#111B21', border: '1px solid #202C33', borderRadius: 20 };
const inputStyle = {
  width: '100%', background: '#1F2C34', border: '1px solid #2A3942', borderRadius: 12,
  color: '#E9EDEF', padding: '12px 16px', fontSize: 14, outline: 'none', boxSizing: 'border-box'
};

// ---------------------------------------------------------------------------
// Avatar (photo with graceful fallback to 2-letter initials)
// ---------------------------------------------------------------------------
const Avatar = ({ name, id, photoUrl, color, size = 60, fontSize = 18 }) => {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [photoUrl]);
  return (
    <div style={{
      width: size, height: size, minWidth: size, borderRadius: '50%', border: `3px solid ${color}`,
      background: '#1F2C34', display: 'flex', alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden', boxSizing: 'border-box'
    }}>
      {photoUrl && !failed ? (
        <img src={photoUrl} alt="" onError={() => setFailed(true)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <span style={{ fontSize, fontWeight: 800, color }}>{getInitials(name || id)}</span>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Live telemetry pill (own state, so socket updates never re-render the tree)
// ---------------------------------------------------------------------------
function SyncPill({ buyerId, onComplete }) {
  const [t, setT] = useState(null);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  useEffect(() => {
    const socket = getActiveSocket();
    if (!socket || !buyerId) return undefined;
    let hideTimer;
    const handle = (data) => {
      if (!data || String(data.buyerId) !== String(buyerId)) return;
      setT(data);
      if (data.isComplete) {
        if (onCompleteRef.current) onCompleteRef.current(data);
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => setT(null), data.status === 'error' ? 6000 : 4000);
      }
    };
    socket.on('LIFELINES_SYNC_PROGRESS', handle);
    return () => {
      clearTimeout(hideTimer);
      if (socket.off) socket.off('LIFELINES_SYNC_PROGRESS', handle);
    };
  }, [buyerId]);

  if (!t) return null;
  const isError = t.status === 'error';
  const done = t.isComplete && !isError;

  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, background: '#111B21',
      border: `2px solid ${isError ? COLORS.red : COLORS.teal}`, borderRadius: 16, padding: '14px 22px',
      zIndex: 90, boxShadow: '0 10px 30px rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', gap: 14, maxWidth: '90vw'
    }}>
      <div style={{
        width: 12, height: 12, borderRadius: '50%', background: isError ? COLORS.red : COLORS.green,
        animation: t.isComplete ? 'none' : 'lifelinesPulse 1.2s infinite'
      }} />
      <div>
        <div style={{ fontSize: 14, fontWeight: 800, color: '#E9EDEF' }}>
          {isError
            ? (t.message || 'Sync failed')
            : done
              ? `✅ Sync complete: ${formatNumber(t.totalParsed)} members`
              : `⚡ Live Syncing Team: ${formatNumber(t.totalParsed)} members found`}
        </div>
        {!isError && (
          <div style={{ fontSize: 12, color: COLORS.slate, marginTop: 2 }}>
            ({formatNumber(t.activePurchasers)} active, {formatNumber(t.terminatedCount)} terminated)
            {!done && ` • ${t.latestMemberName || 'Processing...'}`}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tree node (recursive, memoised)
// ---------------------------------------------------------------------------
const Connector = ({ index, count }) => {
  const line = `2px dashed ${COLORS.line}`;
  return (
    <>
      {count > 1 && (
        <div style={{
          position: 'absolute', top: 0, height: 0, borderTop: line,
          left: index === 0 ? '50%' : 0, right: index === count - 1 ? '50%' : 0
        }} />
      )}
      <div style={{ position: 'absolute', top: 0, left: '50%', height: 24, borderLeft: line }} />
    </>
  );
};

const TreeNode = memo(function TreeNode({
  node, index, count, expandedNodes, childrenCache, loadingNodes, crawlRunning, onToggle, onOpen
}) {
  const id = String(node.buyer_id || node.id);
  const isExpanded = Boolean(expandedNodes[id]);
  const children = childrenCache[id];
  const loading = Boolean(loadingNodes[id]);
  const ring = getRing(node);
  const selfPv = Number(node.self_pv ?? node.current_pv ?? 0);
  const rePur = Number(node.repurchase_amt || 0);
  const groupPv = Number(node.total_group_pv || 0);
  const isTerminated = Number(node.status ?? 1) === 0;
  const canExpand = Boolean(node.has_children) || Number(node.children_count) > 0 || crawlRunning;

  return (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 18px 0' }}>
      <Connector index={index} count={count} />

      <div
        onClick={() => onOpen(node)}
        style={{
          background: '#111B21', border: `2px solid ${ring.color}`, borderRadius: 20, padding: '14px 18px',
          minWidth: 220, maxWidth: 260, display: 'flex', flexDirection: 'column', alignItems: 'center',
          cursor: 'pointer', boxShadow: '0 6px 20px rgba(0,0,0,0.4)', zIndex: 2
        }}
      >
        <div style={{ marginBottom: 8 }}>
          <Avatar name={node.name} id={id} photoUrl={node.photo_url} color={ring.color} size={60} />
        </div>

        <div style={{ fontWeight: 800, fontSize: 15, color: '#E9EDEF', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%' }}>
          {node.name || `Associate #${id}`}
        </div>
        <div style={{ fontSize: 12, color: COLORS.slate, marginTop: 2 }}>
          ID: <span style={{ color: '#E9EDEF', fontWeight: 600 }}>{id}</span>
        </div>

        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
          <span style={{
            background: isTerminated ? 'rgba(239,68,68,0.15)' : selfPv > 0 ? 'rgba(37,211,102,0.15)' : 'rgba(134,150,160,0.15)',
            color: ring.color, padding: '3px 8px', borderRadius: 8, fontSize: 11, fontWeight: 700
          }}>
            {isTerminated ? 'Terminated' : `Self: ${formatNumber(selfPv)} PV`}
          </span>
          {rePur > 0 && (
            <span style={{ background: '#1F2C34', color: COLORS.slate, padding: '3px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600 }}>
              ₹{formatNumber(rePur)}
            </span>
          )}
        </div>

        {groupPv > 0 && (
          <div style={{ fontSize: 11, color: COLORS.teal, fontWeight: 700, marginTop: 6 }}>
            Group: {formatNumber(groupPv)} PV
          </div>
        )}

        {canExpand && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggle(node); }}
            style={{
              marginTop: 10, background: '#1F2C34', border: `1px solid ${COLORS.line}`, color: '#E9EDEF',
              padding: '5px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 4
            }}
          >
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            {loading ? 'Loading...' : isExpanded ? 'Collapse' : 'Expand Downline'}
          </button>
        )}
      </div>

      {isExpanded && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ height: 0 }} />
          {loading && !children ? (
            <div style={{ padding: '30px 10px 0', fontSize: 12, color: COLORS.slate }}>Loading downline...</div>
          ) : children && children.length > 0 ? (
            <div style={{ display: 'flex', alignItems: 'flex-start', marginTop: 0 }}>
              <div style={{ position: 'absolute' }} />
              {children.map((child, i) => (
                <TreeNode
                  key={child.buyer_id || child.id}
                  node={child}
                  index={i}
                  count={children.length}
                  expandedNodes={expandedNodes}
                  childrenCache={childrenCache}
                  loadingNodes={loadingNodes}
                  crawlRunning={crawlRunning}
                  onToggle={onToggle}
                  onOpen={onOpen}
                />
              ))}
            </div>
          ) : (
            <div style={{ marginTop: 24, background: '#111B21', border: `1px dashed ${COLORS.line}`, borderRadius: 12, padding: '10px 16px', fontSize: 12, color: COLORS.slate }}>
              No deeper downlines enrolled
            </div>
          )}
        </div>
      )}
    </div>
  );
});

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function LifelinesPage() {
  const initialId = localStorage.getItem(ACTIVE_ID_KEY) || localStorage.getItem('rcm_buyer_id') || '';

  const [activeBuyerId, setActiveBuyerId] = useState(initialId);
  const [loginId, setLoginId] = useState(initialId);
  const [password, setPassword] = useState('');
  const [showSyncModal, setShowSyncModal] = useState(!initialId);
  const [formError, setFormError] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [booting, setBooting] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');

  const [overview, setOverview] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  const [tree, setTree] = useState([]);
  const [expandedNodes, setExpandedNodes] = useState({});
  const [childrenCache, setChildrenCache] = useState({});
  const [loadingNodes, setLoadingNodes] = useState({});
  const [selectedLeg, setSelectedLeg] = useState(null);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const [selectedMember, setSelectedMember] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [assistantQuery, setAssistantQuery] = useState('');
  const [matrixData, setMatrixData] = useState([]);
  const [matrixMonths, setMatrixMonths] = useState(getRolling12Months);
  const [loadingAssistant, setLoadingAssistant] = useState(false);

  const sessionRef = useRef(0);
  const activeIdRef = useRef(activeBuyerId);
  const expandedRef = useRef(expandedNodes);
  const cacheRef = useRef(childrenCache);
  const assistantQueryRef = useRef('');
  const lastCompleteRef = useRef(0);
  const unauthorizedRef = useRef(null);
  const syncCompleteRef = useRef(null);

  useEffect(() => { activeIdRef.current = activeBuyerId; }, [activeBuyerId]);
  useEffect(() => { expandedRef.current = expandedNodes; }, [expandedNodes]);
  useEffect(() => { cacheRef.current = childrenCache; }, [childrenCache]);
  useEffect(() => { assistantQueryRef.current = assistantQuery; }, [assistantQuery]);

  const resetSessionState = useCallback(() => {
    sessionRef.current += 1;
    setOverview(null);
    setTree([]);
    setMatrixData([]);
    setExpandedNodes({});
    setChildrenCache({});
    setLoadingNodes({});
    setSelectedLeg(null);
    setSelectedMember(null);
    setDrawerOpen(false);
    setSearch('');
    setSearchResults([]);
    setAssistantQuery('');
    setSyncing(false);
    setLoadError('');
    setActiveBuyerId('');
  }, []);

  useEffect(() => {
    unauthorizedRef.current = () => {
      setOverview(null);
      setTree([]);
      setMatrixData([]);
      setBooting(false);
      setShowSyncModal(true);
    };
  }, []);

  const fetchChildren = useCallback(async (rootId, parentId) => {
    try {
      const json = await getTreeChildren(rootId, parentId);
      if (json?.success && Array.isArray(json.data)) {
        return json.data;
      }
      return [];
    } catch (e) {
      return [];
    }
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
        if (e.status === 401) {
          setShowSyncModal(true);
        }
      }
    }
  }, []);

  const loadTree = useCallback(async (id, sid) => {
    try {
      const kids = await fetchChildren(id, id);
      if (sid === sessionRef.current) setTree(kids);
    } catch (e) {
      if (sid === sessionRef.current) setTree([]);
    }
  }, [fetchChildren]);

  const loadAssistant = useCallback(async (id, queryStr, sid) => {
    setLoadingAssistant(true);
    try {
      const json = await getAssistantQuery(id, queryStr);
      if (sid !== sessionRef.current) return;
      if (json?.success && Array.isArray(json.data)) {
        setMatrixData(json.data);
        if (Array.isArray(json.months) && json.months.length) setMatrixMonths(json.months);
      } else {
        setMatrixData([]);
      }
    } catch (e) {
      if (sid === sessionRef.current) {
        setMatrixData([]);
      }
    } finally {
      if (sid === sessionRef.current) setLoadingAssistant(false);
    }
  }, []);

  const refreshExpanded = useCallback(async (rootId, sid) => {
    const ids = Object.keys(expandedRef.current).filter((k) => expandedRef.current[k]);
    if (!ids.length) return;
    const entries = await Promise.all(ids.map(async (pid) => [pid, await fetchChildren(rootId, pid)]));
    if (sid !== sessionRef.current) return;
    setChildrenCache((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
  }, [fetchChildren]);

  const loadAll = useCallback(async (id) => {
    if (!id) return;
    const sid = sessionRef.current;
    setLoadError('');
    try {
      await Promise.allSettled([
        loadOverview(id, sid),
        loadTree(id, sid),
        loadAssistant(id, assistantQueryRef.current, sid)
      ]);
    } catch (e) {
      if (sid === sessionRef.current) {
        setOverview(null);
        setTree([]);
        setMatrixData([]);
      }
    } finally {
      if (sid === sessionRef.current) {
        setBooting(false);
        refreshExpanded(id, sid);
      }
    }
  }, [loadOverview, loadTree, loadAssistant, refreshExpanded]);

  useEffect(() => {
    if (initialId) {
      loadAll(initialId);
    } else {
      setShowSyncModal(true);
    }
  }, [initialId, loadAll]);

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
      ticks += 1;
      if (ticks > 720) { setSyncing(false); return; }
      try {
        const json = await getSyncStatus(activeBuyerId);
        if (sid !== sessionRef.current) return;
        const crawl = json?.data?.crawl;
        if (!crawl || (!crawl.running && crawl.finishedAt)) {
          if (syncCompleteRef.current) syncCompleteRef.current();
        }
      } catch (e) { /* ignore transient errors */ }
    }, 5000);
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
    }, 350);
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

  const handleSyncConnect = async () => {
    const id = loginId.trim();
    if (!/^\d{6,10}$/.test(id)) { setFormError('Enter a valid RCM Buyer ID (digits only).'); return; }
    if (!password) { setFormError('Enter your RCM password.'); return; }

    setIsConnecting(true);
    setFormError('');
    try {
      resetSessionState();
      const json = await syncLifelines(id, password);
      const token = json?.lifelinesToken || json?.token;
      if (!json?.success || !token) throw new Error(json?.message || 'RCM connection failed.');

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
    localStorage.removeItem(ACTIVE_ID_KEY);
    localStorage.removeItem('rcm_buyer_id');
    localStorage.removeItem('lifelines_token');
    localStorage.removeItem('rcm_lifelines_token');
    resetSessionState();
    setLoginId('');
    setPassword('');
    setFormError('');
    setShowSyncModal(true);
  };

  const openMemberDetails = useCallback(async (node) => {
    const memberId = node?.buyer_id || node?.id;
    if (!memberId || !activeBuyerId) return;
    const sid = sessionRef.current;
    try {
      const json = await getMemberFullProfile(activeBuyerId, memberId);
      if (sid !== sessionRef.current) return;
      if (json?.success) {
        setSelectedMember(json.data);
        setDrawerOpen(true);
      }
    } catch (e) {
      if (e.status !== 401) setNotice(e.message || 'Could not open member profile.');
    }
  }, [activeBuyerId]);

  const toggleNode = useCallback(async (node) => {
    const id = String(node?.buyer_id || node?.id);
    const open = Boolean(expandedRef.current[id]);
    setExpandedNodes((prev) => ({ ...prev, [id]: !open }));

    if (!open && !cacheRef.current[id]) {
      const sid = sessionRef.current;
      setLoadingNodes((prev) => ({ ...prev, [id]: true }));
      const kids = await fetchChildren(activeIdRef.current, id);
      if (sid !== sessionRef.current) return;
      setChildrenCache((prev) => ({ ...prev, [id]: kids }));
      setLoadingNodes((prev) => ({ ...prev, [id]: false }));
    }
  }, [fetchChildren]);

  const ovData = overview || {};
  const totalNetworkPv = ovData.total_pv ?? ovData.totals?.totalPv ?? 0;
  const selfPurchasePv = ovData.self_pv ?? ovData.totals?.selfPv ?? 0;
  const activeCount = ovData.active_purchasers ?? ovData.totals?.activePurchasers ?? 0;
  const totalTeamCount = ovData.total_team ?? ovData.totals?.totalMembers ?? 0;
  const directLegs = ovData.directLegs || ovData.legs || [];
  const rootIdentity = ovData.identity || {};
  const photoUrl = rootIdentity.photo_url || null;
  const crawlRunning = Boolean(syncing || ovData.crawl?.running);

  const filteredTree = useMemo(() => {
    if (!selectedLeg) return tree;
    return tree.filter((n) => Number(n.buyer_id) === Number(selectedLeg.headId));
  }, [tree, selectedLeg]);

  const memberPhone = toWhatsappNumber(selectedMember?.mobile || selectedMember?.mobile_no);

  return (
    <div style={{ background: '#0B141A', color: '#E9EDEF', minHeight: '100vh', fontFamily: 'system-ui, -apple-system, sans-serif', padding: '24px 32px', boxSizing: 'border-box' }}>
      <style>{`
        @keyframes lifelinesSpin { to { transform: rotate(360deg); } }
        @keyframes lifelinesPulse { 0%,100% { opacity: 1; } 50% { opacity: .35; } }
      `}</style>

      {(loadError || notice) && (
        <div style={{ background: '#2C1B1B', border: '1px solid rgba(239,68,68,0.4)', color: '#FCA5A5', borderRadius: 12, padding: '10px 16px', marginBottom: 16, fontSize: 13, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <span>{notice || loadError}</span>
          <button type="button" onClick={() => { setNotice(''); setLoadError(''); }} style={{ background: 'transparent', border: 'none', color: '#FCA5A5', cursor: 'pointer' }}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* 1. EXECUTIVE HEADER */}
      <div style={{ ...cardStyle, padding: '20px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 20, marginBottom: 24, boxShadow: '0 8px 30px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <Avatar name={rootIdentity.name} id={activeBuyerId} photoUrl={photoUrl} color={COLORS.green} size={64} fontSize={22} />
          <div>
            <div style={{ fontSize: 11, color: COLORS.teal, fontWeight: 800, letterSpacing: 1.5, textTransform: 'uppercase' }}>
              Enterprise RCM AI Assistant
            </div>
            <div style={{ fontSize: 24, fontWeight: 900, marginTop: 2 }}>
              {booting ? 'Loading...' : rootIdentity.name || (activeBuyerId ? `Leader #${activeBuyerId}` : 'Not connected')}
            </div>
            {activeBuyerId && (
              <div style={{ fontSize: 13, color: COLORS.slate, marginTop: 3, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span>ID: <strong style={{ color: '#E9EDEF' }}>{activeBuyerId}</strong></span>
                {rootIdentity.highest_pin && (<><span>•</span><span>Pin: <strong style={{ color: COLORS.green }}>{rootIdentity.highest_pin}</strong></span></>)}
                {rootIdentity.kyc_status && (
                  <><span>•</span>
                    <span style={{ color: COLORS.green, background: 'rgba(37,211,102,0.1)', padding: '2px 8px', borderRadius: 6, fontWeight: 700, fontSize: 11 }}>
                      {formatKyc(rootIdentity.kyc_status)}
                    </span></>
                )}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" disabled={!activeBuyerId} onClick={() => loadAll(activeBuyerId)}
            style={{ background: '#1F2C34', border: `1px solid ${COLORS.green}`, color: COLORS.green, padding: '10px 18px', borderRadius: 12, fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
            <RefreshCw size={16} /> Refresh
          </button>
          <button type="button" disabled={!activeBuyerId}
            onClick={() => { setLoginId(activeBuyerId); setFormError(''); setShowSyncModal(true); }}
            style={{ background: '#1F2C34', border: `1px solid ${COLORS.line}`, color: '#E9EDEF', padding: '10px 18px', borderRadius: 12, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            Re-sync from RCM
          </button>
          <button type="button" onClick={handleDisconnect}
            style={{ background: '#2C1B1B', border: '1px solid rgba(239,68,68,0.4)', color: COLORS.red, padding: '10px 18px', borderRadius: 12, fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
            <LogOut size={16} /> Disconnect
          </button>
        </div>
      </div>

      {/* 2. TABS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, ...cardStyle, borderRadius: 16, padding: 8, marginBottom: 24 }}>
        {[
          { key: 'overview', label: 'Executive Overview', icon: <Activity size={18} /> },
          { key: 'tree', label: 'MLM Visual Tree', icon: <TreePine size={18} /> },
          { key: 'assistant', label: 'Smart Reports & Outreach', icon: <Sparkles size={18} /> }
        ].map((tab) => (
          <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)}
            style={{ background: activeTab === tab.key ? COLORS.teal : 'transparent', color: activeTab === tab.key ? '#0B141A' : COLORS.slate, border: 'none', borderRadius: 12, padding: 12, fontWeight: 800, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div style={{ display: 'grid', gap: 24 }}>
          {(!overview || overview.synced === false) && (
            <div style={{ ...cardStyle, padding: 24, textAlign: 'center', color: COLORS.slate, fontSize: 14 }}>
              {activeBuyerId ? 'No data synced yet for this ID. Click "Re-sync from RCM" to fetch live data.' : 'Please connect your RCM account to view live metrics.'}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
            <div style={{ ...cardStyle, border: `2px solid ${COLORS.green}`, borderRadius: 18, padding: 22 }}>
              <div style={{ fontSize: 13, color: COLORS.slate, fontWeight: 600 }}>Total Network Turnover</div>
              <div style={{ fontSize: 34, fontWeight: 900, color: COLORS.green, marginTop: 6 }}>{formatNumber(totalNetworkPv)} PV</div>
              <div style={{ fontSize: 12, color: COLORS.teal, marginTop: 6, fontWeight: 700 }}>Official portal turnover</div>
            </div>
            <div style={{ ...cardStyle, borderRadius: 18, padding: 22 }}>
              <div style={{ fontSize: 13, color: COLORS.slate, fontWeight: 600 }}>Your Self Purchase PV</div>
              <div style={{ fontSize: 34, fontWeight: 900, marginTop: 6 }}>{formatNumber(selfPurchasePv)} PV</div>
              <div style={{ fontSize: 12, color: COLORS.slate, marginTop: 6 }}>Personal monthly consumption</div>
            </div>
            <div style={{ ...cardStyle, borderRadius: 18, padding: 22 }}>
              <div style={{ fontSize: 13, color: COLORS.slate, fontWeight: 600 }}>Active Purchasers</div>
              <div style={{ fontSize: 34, fontWeight: 900, color: COLORS.green, marginTop: 6 }}>{formatNumber(activeCount)}</div>
              <div style={{ fontSize: 12, color: COLORS.slate, marginTop: 6 }}>Team members with billing > 0 PV</div>
            </div>
            <div style={{ ...cardStyle, borderRadius: 18, padding: 22 }}>
              <div style={{ fontSize: 13, color: COLORS.slate, fontWeight: 600 }}>Total Downline Team</div>
              <div style={{ fontSize: 34, fontWeight: 900, marginTop: 6 }}>{formatNumber(totalTeamCount)}</div>
              <div style={{ fontSize: 12, color: COLORS.slate, marginTop: 6 }}>
                {crawlRunning ? 'Still counting... deep sync in progress' : 'Members across all legs'}
              </div>
            </div>
          </div>

          <div style={{ ...cardStyle, padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 20 }}>Direct Leg Heads & Business Volume</h3>
                <p style={{ margin: '4px 0 0', color: COLORS.slate, fontSize: 13 }}>Group volume of each direct leg</p>
              </div>
              <button type="button" onClick={() => setActiveTab('tree')}
                style={{ background: 'transparent', border: 'none', color: COLORS.green, fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                Inspect Visual Tree <ArrowUpRight size={16} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
              {directLegs.length > 0 ? directLegs.map((leg, idx) => {
                const letter = leg.leg || String.fromCharCode(65 + idx);
                const headId = leg.head_id || leg.buyer_id;
                return (
                  <div key={headId || idx}
                    onClick={() => { setSelectedLeg({ letter, headId }); setActiveTab('tree'); }}
                    style={{ background: '#1F2C34', border: `1px solid ${COLORS.line}`, borderRadius: 16, padding: 20, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 12, color: COLORS.teal, fontWeight: 800 }}>LEG {letter} HEAD</div>
                      <div style={{ fontSize: 18, fontWeight: 800, marginTop: 4 }}>{leg.head_name || leg.name}</div>
                      <div style={{ fontSize: 12, color: COLORS.slate, marginTop: 2 }}>ID: {headId}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 22, fontWeight: 900, color: COLORS.green }}>{formatNumber(leg.pv)} PV</div>
                      <div style={{ fontSize: 11, color: COLORS.slate, marginTop: 4 }}>Click to filter tree ↗</div>
                    </div>
                  </div>
                );
              }) : (
                <div style={{ color: COLORS.slate, padding: 20 }}>{booting ? 'Loading...' : 'No direct leg volume detected yet.'}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: TREE */}
      {activeTab === 'tree' && (
        <div style={{ ...cardStyle, padding: 28 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28, flexWrap: 'wrap', gap: 16 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 22 }}>MLM Visual Tree Network</h3>
              <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 12, flexWrap: 'wrap' }}>
                <span style={{ color: COLORS.green }}>● Active purchaser (> 0 PV)</span>
                <span style={{ color: COLORS.red }}>● Terminated member</span>
                <span style={{ color: COLORS.slate }}>● Inactive (0 PV)</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', minWidth: 260 }}>
                <Search size={16} style={{ position: 'absolute', left: 14, top: 12, color: COLORS.slate }} />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search downline name or ID..."
                  style={{ ...inputStyle, borderRadius: 10, padding: '10px 14px 10px 38px', fontSize: 13 }} />
                {search.trim().length >= 2 && (
                  <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, background: '#1F2C34', border: `1px solid ${COLORS.line}`, borderRadius: 12, zIndex: 20, maxHeight: 280, overflowY: 'auto', boxShadow: '0 12px 30px rgba(0,0,0,0.5)' }}>
                    {searching && <div style={{ padding: 12, fontSize: 12, color: COLORS.slate }}>Searching...</div>}
                    {!searching && searchResults.length === 0 && <div style={{ padding: 12, fontSize: 12, color: COLORS.slate }}>No members found.</div>}
                    {searchResults.map((r) => {
                      const rid = r.buyer_id || r.id;
                      return (
                        <div key={rid} onClick={() => { setSearch(''); setSearchResults([]); openMemberDetails({ buyer_id: rid }); }}
                          style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #202C33' }}>
                          <div style={{ fontSize: 13, fontWeight: 700 }}>{r.name || `Associate #${rid}`}</div>
                          <div style={{ fontSize: 11, color: COLORS.slate }}>ID: {rid}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {selectedLeg && (
                <button type="button" onClick={() => setSelectedLeg(null)}
                  style={{ background: '#1F2C34', border: `1px solid ${COLORS.green}`, color: COLORS.green, padding: '8px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  Clear Leg {selectedLeg.letter}
                </button>
              )}
            </div>
          </div>

          <div style={{ overflowX: 'auto', padding: '20px 0' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 'max-content', margin: '0 auto' }}>
              <div onClick={() => openMemberDetails({ buyer_id: activeBuyerId })}
                style={{ background: '#1F2C34', border: `3px solid ${COLORS.green}`, borderRadius: 24, padding: '16px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer', boxShadow: '0 8px 30px rgba(37,211,102,0.2)', zIndex: 3 }}>
                <Avatar name={rootIdentity.name} id={activeBuyerId} photoUrl={photoUrl} color={COLORS.green} size={68} fontSize={22} />
                <div style={{ fontSize: 17, fontWeight: 900, marginTop: 10 }}>{rootIdentity.name || `Leader #${activeBuyerId}`} (You)</div>
                <div style={{ fontSize: 12, color: COLORS.slate, marginTop: 2 }}>
                  ID: {activeBuyerId}{rootIdentity.highest_pin ? <> • <span style={{ color: COLORS.green, fontWeight: 700 }}>{rootIdentity.highest_pin}</span></> : null}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <span style={{ background: 'rgba(37,211,102,0.15)', color: COLORS.green, padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>
                    Self: {formatNumber(selfPurchasePv)} PV
                  </span>
                  <span style={{ background: '#111B21', padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>
                    Group: {formatNumber(totalNetworkPv)} PV
                  </span>
                </div>
              </div>

              {filteredTree.length > 0 && <div style={{ height: 0 }} />}

              <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                {filteredTree.length > 0 ? filteredTree.map((child, i) => (
                  <TreeNode
                    key={child.buyer_id || child.id}
                    node={child}
                    index={i}
                    count={filteredTree.length}
                    expandedNodes={expandedNodes}
                    childrenCache={childrenCache}
                    loadingNodes={loadingNodes}
                    crawlRunning={crawlRunning}
                    onToggle={toggleNode}
                    onOpen={openMemberDetails}
                  />
                )) : (
                  <div style={{ color: COLORS.slate, padding: 30, textAlign: 'center' }}>
                    {booting ? 'Loading tree...' : crawlRunning ? 'Team is still being synced...' : 'No downline members found.'}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: 12 MONTH MATRIX */}
      {activeTab === 'assistant' && (
        <div style={{ ...cardStyle, padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 22 }}>12-Month Performance Matrix</h3>
              <p style={{ margin: '4px 0 0', color: COLORS.slate, fontSize: 13 }}>
                Rolling 12-month purchase volume. Past months fill up as monthly syncs accumulate.
              </p>
            </div>
            <div style={{ fontSize: 12, color: COLORS.green, background: 'rgba(37,211,102,0.1)', padding: '6px 14px', borderRadius: 20, fontWeight: 700 }}>
              Rolling Window: {matrixMonths[matrixMonths.length - 1]} → {matrixMonths[0]}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
            {[
              { label: 'All Members', q: '' },
              { label: '1500-2499 PV Regular', q: '1500 se 2499 pv' },
              { label: '100-500 PV Grahak', q: '100 to 500 pv' },
              { label: '0 PV Inactive', q: '0 pv' }
            ].map((chip) => (
              <button key={chip.label} type="button"
                onClick={() => { setAssistantQuery(chip.q); assistantQueryRef.current = chip.q; loadAssistant(activeBuyerId, chip.q, sessionRef.current).catch(() => {}); }}
                style={{ background: assistantQuery === chip.q ? COLORS.teal : '#1F2C34', color: assistantQuery === chip.q ? '#0B141A' : '#E9EDEF', border: `1px solid ${COLORS.line}`, borderRadius: 20, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                {chip.label}
              </button>
            ))}
          </div>

          <div style={{ overflowX: 'auto', border: '1px solid #202C33', borderRadius: 16, background: '#111B21', maxWidth: '100%', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13, whiteSpace: 'nowrap' }}>
              <thead>
                <tr style={{ background: '#1F2C34', color: COLORS.slate, borderBottom: '1px solid #202C33' }}>
                  <th style={{ padding: '14px 20px', position: 'sticky', left: 0, background: '#1F2C34', zIndex: 3, minWidth: 220, boxShadow: '2px 0 8px rgba(0,0,0,0.3)' }}>Member Name & ID</th>
                  <th style={{ padding: '14px 16px', minWidth: 100 }}>District</th>
                  {matrixMonths.map((m, idx) => (
                    <th key={m} style={{ padding: '14px 16px', textAlign: 'right', minWidth: 105, color: idx === 0 ? COLORS.green : '#E9EDEF', fontWeight: idx === 0 ? 900 : 600, background: idx === 0 ? 'rgba(37,211,102,0.08)' : 'transparent' }}>
                      {m}{idx === 0 ? ' (Current)' : ''}
                    </th>
                  ))}
                  <th style={{ padding: '14px 20px', textAlign: 'center', position: 'sticky', right: 0, background: '#1F2C34', zIndex: 3, minWidth: 120, boxShadow: '-2px 0 8px rgba(0,0,0,0.3)' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {loadingAssistant ? (
                  <tr><td colSpan={matrixMonths.length + 3} style={{ textAlign: 'center', padding: 50, color: COLORS.slate }}>
                    <div style={{ display: 'inline-block', width: 24, height: 24, border: `3px solid ${COLORS.green}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'lifelinesSpin 0.8s linear infinite' }} />
                    <div style={{ marginTop: 12 }}>Loading 12-month records...</div>
                  </td></tr>
                ) : matrixData.length > 0 ? matrixData.map((row, idx) => {
                  const rowBg = idx % 2 === 0 ? '#111B21' : '#16222A';
                  const wa = toWhatsappNumber(row.mobile_no);
                  const dialable = String(row.mobile_no || '').replace(/\D/g, '');
                  return (
                    <tr key={row.buyer_id} style={{ borderBottom: '1px solid #202C33', background: rowBg }}>
                      <td style={{ padding: '14px 20px', position: 'sticky', left: 0, background: rowBg, zIndex: 2, boxShadow: '2px 0 8px rgba(0,0,0,0.2)' }}>
                        <div style={{ fontWeight: 800 }}>{row.name}</div>
                        <div style={{ fontSize: 11, color: COLORS.slate, marginTop: 2 }}>ID: {row.buyer_id}{row.leg_type ? ` • ${row.leg_type}` : ''}</div>
                      </td>
                      <td style={{ padding: '14px 16px', color: COLORS.slate }}>{row.district || '—'}</td>
                      {matrixMonths.map((m, mIdx) => {
                        const pv = row.monthly_pv?.[m] ?? (mIdx === 0 ? row.current_month_pv || 0 : 0);
                        const isCurrent = mIdx === 0;
                        return (
                          <td key={m} style={{ padding: '14px 16px', textAlign: 'right', fontWeight: isCurrent ? 800 : pv > 0 ? 600 : 400, color: isCurrent ? COLORS.green : pv > 0 ? '#E9EDEF' : COLORS.slate, background: isCurrent ? 'rgba(37,211,102,0.04)' : 'transparent' }}>
                            {formatNumber(pv)} PV
                          </td>
                        );
                      })}
                      <td style={{ padding: '14px 20px', textAlign: 'center', position: 'sticky', right: 0, background: rowBg, zIndex: 2, boxShadow: '-2px 0 8px rgba(0,0,0,0.2)' }}>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
                          {dialable.length >= 10 ? (
                            <a href={`tel:${dialable}`} title="Call" style={{ width: 32, height: 32, borderRadius: '50%', background: '#1F2C34', color: COLORS.green, display: 'grid', placeItems: 'center', textDecoration: 'none' }}>
                              <Phone size={14} />
                            </a>
                          ) : (
                            <span title="Mobile number not available" style={{ width: 32, height: 32, borderRadius: '50%', background: '#1F2C34', color: COLORS.slate, display: 'grid', placeItems: 'center', opacity: 0.4 }}>
                              <Phone size={14} />
                            </span>
                          )}
                          {wa ? (
                            <a href={`https://wa.me/${wa}?text=${encodeURIComponent(`Namaste ${row.name} ji! RCM team business update.`)}`} target="_blank" rel="noreferrer" title="WhatsApp"
                              style={{ width: 32, height: 32, borderRadius: '50%', background: COLORS.green, color: '#0B141A', display: 'grid', placeItems: 'center', textDecoration: 'none' }}>
                              <MessageCircle size={14} />
                            </a>
                          ) : (
                            <span title="Mobile number not available" style={{ width: 32, height: 32, borderRadius: '50%', background: '#1F2C34', color: COLORS.slate, display: 'grid', placeItems: 'center', opacity: 0.4 }}>
                              <MessageCircle size={14} />
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                }) : (
                  <tr><td colSpan={matrixMonths.length + 3} style={{ textAlign: 'center', padding: 40, color: COLORS.slate }}>
                    {crawlRunning ? 'Team is still being synced...' : 'No records found matching this filter.'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MEMBER DRAWER */}
      {drawerOpen && selectedMember && (
        <div onClick={() => setDrawerOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'flex-end', zIndex: 100 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ width: 'min(420px, 92vw)', background: '#111B21', borderLeft: '1px solid #202C33', height: '100%', padding: 28, boxSizing: 'border-box', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>Member Profile Inspection</div>
              <button type="button" onClick={() => setDrawerOpen(false)} style={{ background: 'transparent', border: 'none', color: COLORS.slate, cursor: 'pointer' }}>
                <X size={22} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: 24 }}>
              <div style={{ marginBottom: 12 }}>
                <Avatar name={selectedMember.name} id={selectedMember.buyer_id} photoUrl={selectedMember.photo_url}
                  color={Number(selectedMember.status) === 0 ? COLORS.red : Number(selectedMember.self_pv) > 0 ? COLORS.green : COLORS.slate} size={76} fontSize={24} />
              </div>
              <div style={{ fontSize: 20, fontWeight: 900 }}>{selectedMember.name}</div>
              <div style={{ fontSize: 13, color: COLORS.slate, marginTop: 3 }}>
                Buyer ID: <span style={{ color: '#E9EDEF', fontWeight: 700 }}>{selectedMember.buyer_id}</span>
              </div>
              <div style={{ marginTop: 8, background: Number(selectedMember.status) === 0 ? 'rgba(239,68,68,0.1)' : 'rgba(37,211,102,0.1)', color: Number(selectedMember.status) === 0 ? COLORS.red : COLORS.green, padding: '4px 12px', borderRadius: 12, fontSize: 11, fontWeight: 800 }}>
                {Number(selectedMember.status) === 0 ? 'Terminated' : formatKyc(selectedMember.kyc_status)}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
              {[
                { label: 'Self Purchase', value: `${formatNumber(selectedMember.self_pv)} PV`, color: COLORS.green },
                { label: 'Re-Purchase Amt', value: `₹${formatNumber(selectedMember.repurchase_amt)}` },
                { label: 'Group Volume', value: `${formatNumber(selectedMember.total_group_pv)} PV` },
                { label: 'Direct Downlines', value: formatNumber(selectedMember.children_count) },
                { label: 'Join Date', value: formatJoinDate(selectedMember.join_date), small: true },
                { label: 'District / State', value: [selectedMember.district, selectedMember.state].filter(Boolean).join(', ') || '—', small: true }
              ].map((item) => (
                <div key={item.label} style={{ background: '#1F2C34', borderRadius: 12, padding: 14, border: `1px solid ${COLORS.line}` }}>
                  <div style={{ fontSize: 11, color: COLORS.slate }}>{item.label}</div>
                  <div style={{ fontSize: item.small ? 13 : 16, fontWeight: item.small ? 700 : 800, color: item.color || '#E9EDEF', marginTop: 4 }}>{item.value}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10, flexDirection: 'column' }}>
              {memberPhone ? (
                <div style={{ display: 'flex', gap: 10 }}>
                  <a href={`tel:${memberPhone}`} style={{ flex: 1, background: '#1F2C34', border: `1px solid ${COLORS.line}`, color: '#E9EDEF', padding: 12, borderRadius: 12, textDecoration: 'none', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <Phone size={16} /> Call
                  </a>
                  <a href={`https://wa.me/${memberPhone}?text=${encodeURIComponent(`Namaste ${selectedMember.name} ji! Connecting regarding your RCM business updates.`)}`} target="_blank" rel="noreferrer"
                    style={{ flex: 1, background: COLORS.green, color: '#0B141A', padding: 12, borderRadius: 12, textDecoration: 'none', fontWeight: 800, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <MessageCircle size={16} /> WhatsApp
                  </a>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: COLORS.slate, textAlign: 'center' }}>Mobile number not available for this member.</div>
              )}
              <button type="button" onClick={() => setDrawerOpen(false)}
                style={{ width: '100%', background: '#1F2C34', border: `1px solid ${COLORS.line}`, color: COLORS.slate, padding: 12, borderRadius: 12, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                Close Profile
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONNECT MODAL */}
      {showSyncModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(11,20,26,0.95)', backdropFilter: 'blur(10px)', display: 'grid', placeItems: 'center', padding: 20, zIndex: 110 }}>
          <div style={{ width: 'min(460px, 96vw)', background: '#111B21', border: `1px solid ${COLORS.line}`, borderRadius: 24, padding: 36, boxShadow: '0 24px 60px rgba(0,0,0,0.8)', position: 'relative' }}>
            {activeBuyerId && (
              <button type="button" onClick={() => setShowSyncModal(false)} aria-label="Close"
                style={{ position: 'absolute', top: 16, right: 16, background: 'transparent', border: 'none', color: COLORS.slate, cursor: 'pointer' }}>
                <X size={20} />
              </button>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
              <div style={{ width: 50, height: 50, borderRadius: 14, background: COLORS.green, display: 'grid', placeItems: 'center', color: '#0B141A' }}>
                <ShieldCheck size={28} />
              </div>
              <div>
                <div style={{ fontSize: 22, fontWeight: 900 }}>RCM Enterprise Workspace</div>
                <div style={{ fontSize: 13, color: COLORS.slate }}>Connect with your own RCM account</div>
              </div>
            </div>

            <div style={{ display: 'grid', gap: 16 }}>
              <div>
                <label htmlFor="ll-buyer" style={{ display: 'block', fontSize: 12, color: COLORS.slate, marginBottom: 6, fontWeight: 700 }}>RCM Buyer ID</label>
                <input id="ll-buyer" value={loginId} onChange={(e) => setLoginId(e.target.value.replace(/\D/g, ''))}
                  inputMode="numeric" autoComplete="username" placeholder="Enter your RCM Buyer ID" style={inputStyle} />
              </div>
              <div>
                <label htmlFor="ll-pass" style={{ display: 'block', fontSize: 12, color: COLORS.slate, marginBottom: 6, fontWeight: 700 }}>RCM Password</label>
                <input id="ll-pass" value={password} onChange={(e) => setPassword(e.target.value)} type="password"
                  autoComplete="current-password" placeholder="Enter RCM Password" style={inputStyle}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !isConnecting) handleSyncConnect(); }} />
              </div>

              {formError && (
                <div style={{ background: '#2C1B1B', border: '1px solid rgba(239,68,68,0.4)', color: '#FCA5A5', borderRadius: 10, padding: '10px 14px', fontSize: 13 }}>
                  {formError}
                </div>
              )}

              <button type="button" onClick={handleSyncConnect} disabled={isConnecting}
                style={{ background: COLORS.teal, color: '#0B141A', border: 'none', borderRadius: 12, padding: 14, fontSize: 15, fontWeight: 900, cursor: isConnecting ? 'wait' : 'pointer', marginTop: 10, opacity: isConnecting ? 0.7 : 1 }}>
                {isConnecting ? 'Verifying & Unlocking Overview...' : 'Connect & Unlock Executive Overview'}
              </button>
              <div style={{ fontSize: 11, color: COLORS.slate, textAlign: 'center' }}>
                Your password is used only to log in to RCM and is never stored.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* LIVE TELEMETRY */}
      {activeBuyerId && <SyncPill buyerId={activeBuyerId} onComplete={handleSyncComplete} />}
    </div>
  );
}
