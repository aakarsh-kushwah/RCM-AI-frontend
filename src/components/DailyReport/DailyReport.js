import React, { useState, useEffect, useCallback, useMemo, memo, useRef } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  Save, 
  CheckCircle, 
  AlertCircle, 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  Calendar,
  BarChart2
} from 'lucide-react';
import './DailyReport.css';

// --- CONFIGURATION ---
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';

// ✅ FIX: Timeout increased to 60 Seconds (1 Minute) to handle slow network/DB
const API_TIMEOUT = 60000; 

// --- UTILS ---
const getDaysInMonth = (monthIndex, year) => new Date(year, monthIndex + 1, 0).getDate();
const getMonthName = (monthIndex) => new Date(2000, monthIndex, 1).toLocaleString('en-US', { month: 'long' });
const formatNumber = (num) => new Intl.NumberFormat('en-IN').format(num);

// --- TOAST NOTIFICATION ---
const Toast = ({ message, type, onClose }) => {
  useEffect(() => {
    if (message) {
      const timer = setTimeout(onClose, 4000);
      return () => clearTimeout(timer);
    }
  }, [message, onClose]);

  if (!message) return null;

  return (
    <div className={`toast-notification ${type}`}>
      <div className="toast-icon">
        {type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
      </div>
      <span className="toast-text">{message}</span>
    </div>
  );
};

// --- REPORT ROW (Memoized) ---
const ReportRow = memo(({ day, currentPv, prevPv, onChange }) => {
  const current = currentPv === '' ? '' : parseInt(currentPv, 10);
  const previous = prevPv !== null ? parseInt(prevPv, 10) : null;
  
  let comparison = { type: 'neutral', icon: <Minus size={14} />, text: '-' };
  
  if (previous !== null && current !== '') {
    const diff = current - previous;
    if (diff > 0) comparison = { type: 'positive', icon: <TrendingUp size={14} />, text: `+${diff}` };
    else if (diff < 0) comparison = { type: 'negative', icon: <TrendingDown size={14} />, text: `${diff}` };
    else comparison = { type: 'neutral', icon: <Minus size={14} />, text: '0' };
  }

  return (
    <tr className={`table-row ${current !== '' ? 'active-row' : ''}`}>
      <td className="cell-date">
        <div className="date-wrapper">
          <span className="date-day">{day}</span>
        </div>
      </td>
      <td className="cell-input">
        <div className="input-group">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={currentPv}
            onChange={(e) => onChange(e.target.value, day)}
            placeholder="-"
            className="modern-input"
          />
          {previous !== null && (
            <div className={`trend-badge ${comparison.type}`}>
              {comparison.icon}
              <span className="trend-text">{comparison.text}</span>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
});

// --- MAIN COMPONENT ---
const DailyReport = () => {
  const navigate = useNavigate();

  // State
  const [reportData, setReportData] = useState({});
  const [currentMonthIndex, setCurrentMonthIndex] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [viewState, setViewState] = useState('LOADING'); 
  const [toast, setToast] = useState({ message: '', type: '' });
  
  // Ref to track ongoing requests to prevent duplicates
  const abortControllerRef = useRef(null);

  // Derived Values
  const monthKey = useMemo(() => 
    `${getMonthName(currentMonthIndex).toLowerCase()}-${currentYear}`, 
  [currentMonthIndex, currentYear]);

  const daysInMonth = useMemo(() => 
    getDaysInMonth(currentMonthIndex, currentYear), 
  [currentMonthIndex, currentYear]);

  const currentMonthData = useMemo(() => 
    reportData[monthKey] || {}, 
  [reportData, monthKey]);

  // CUMULATIVE TOTAL LOGIC
  const totalPV = useMemo(() => {
    const days = Object.keys(currentMonthData).map(d => parseInt(d));
    if (days.length === 0) return 0;
    days.sort((a, b) => b - a);
    
    for (const day of days) {
      const val = parseInt(currentMonthData[day]?.pv || '0', 10);
      if (val > 0) return val;
    }
    return 0;
  }, [currentMonthData]);

  const monthOptions = useMemo(() => {
    const opts = [];
    const today = new Date();
    for (let i = 6; i >= -1; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      opts.push({
        label: `${d.toLocaleString('en-US', { month: 'long' })} ${d.getFullYear()}`,
        value: `${d.toLocaleString('en-US', { month: 'long' })}-${d.getFullYear()}`
      });
    }
    return opts;
  }, []);

  // Fetch Data
  const fetchData = useCallback(async (signal) => {
    setViewState(prev => reportData[monthKey] ? 'IDLE' : 'LOADING');
    if (reportData[monthKey]) return;

    try {
      const getMonthData = async (m, y) => {
        const token = localStorage.getItem('token');
        const response = await axios.post(
          `${API_BASE_URL}/api/reports/get-dailyReport`,
          { month: m, year: y },
          { 
            headers: { Authorization: `Bearer ${token}` }, 
            timeout: API_TIMEOUT,
            signal: signal 
          }
        );
        return response.data?.status && Array.isArray(response.data.data) ? response.data.data : [];
      };

      const currMonthStr = (currentMonthIndex + 1).toString().padStart(2, '0');
      const prevDate = new Date(currentYear, currentMonthIndex - 1, 1);
      const prevMonthStr = (prevDate.getMonth() + 1).toString().padStart(2, '0');
      const prevYearVal = prevDate.getFullYear();

      const [currentRes, prevRes] = await Promise.all([
        getMonthData(currMonthStr, currentYear),
        getMonthData(prevMonthStr, prevYearVal)
      ]);

      const normalize = (dataArr) => {
        const map = {};
        dataArr.forEach(d => {
          const day = parseInt(d.date.split('-')[2]);
          map[day] = parseInt(d.amount);
        });
        return map;
      };

      const currMap = normalize(currentRes);
      const prevMap = normalize(prevRes);

      const combined = {};
      for (let i = 1; i <= daysInMonth; i++) {
        combined[i] = {
          pv: currMap[i]?.toString() ?? '',
          prevPv: prevMap[i] ?? null,
        };
      }

      setReportData(prev => ({ ...prev, [monthKey]: combined }));
      setViewState('IDLE');

    } catch (err) {
      if (axios.isCancel(err)) return; 

      console.error('Sync Error:', err);
      
      if (err.response?.status === 403 && err.response?.data?.code === 'SUBSCRIPTION_REQUIRED') {
          const user = JSON.parse(localStorage.getItem('user') || '{}');
          user.status = 'pending';
          localStorage.setItem('user', JSON.stringify(user));
          
          showToast('Subscription expired. Redirecting...', 'error');
          setTimeout(() => navigate('/payment-setup', { replace: true }), 1000);
          return;
      }

      setViewState('ERROR');
      showToast('Server is slow. Retrying might help.', 'error');
    }
  }, [currentMonthIndex, currentYear, daysInMonth, monthKey, navigate, reportData]);

  // Effect with Cleanup
  useEffect(() => {
    if (abortControllerRef.current) {
        abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    
    fetchData(abortControllerRef.current.signal);

    return () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
    };
  }, [fetchData]); 

  // --- SAVE HANDLER (OPTIMIZED) ---
  const handleSave = async () => {
    setViewState('SAVING');

    // ✅ FIX: Payload Construction
    // Hum wohi data bhejenge jo valid number hai.
    // Backend ab bulk update handle karega.
    const payload = Object.entries(currentMonthData).map(([day, { pv }]) => ({
      date: `${currentYear}-${(currentMonthIndex + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`,
      amount: parseInt(pv || '0', 10),
    })).filter(item => !isNaN(item.amount));

    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        `${API_BASE_URL}/api/reports/post-dailyReport`,
        payload,
        { 
            headers: { Authorization: `Bearer ${token}` }, 
            timeout: API_TIMEOUT // 60 Seconds wait karega
        }
      );

      if (response.data?.status) {
        showToast('Report saved successfully!', 'success');
      }
    } catch (error) {
      console.error('Save Error:', error);
      
      if (error.code === 'ECONNABORTED') {
          showToast('Server took too long. Check your connection.', 'error');
      } else if (error.response?.status === 403) {
         showToast('Subscription expired.', 'error');
         navigate('/payment-setup');
      } else if (error.response?.status === 401) {
         showToast('Please login again.', 'error');
         navigate('/login');
      } else {
         showToast('Save failed. Try again.', 'error');
      }
    } finally {
      setViewState('IDLE');
    }
  };

  const handleInputChange = useCallback((value, day) => {
    if (/^\d*$/.test(value)) {
      setReportData(prev => ({
        ...prev,
        [monthKey]: {
          ...prev[monthKey],
          [day]: { ...prev[monthKey][day], pv: value }
        }
      }));
    }
  }, [monthKey]);

  const handleMonthSelect = (e) => {
    const [m, y] = e.target.value.split('-');
    const newDate = new Date(`${m} 1, ${y}`);
    setCurrentMonthIndex(newDate.getMonth());
    setCurrentYear(newDate.getFullYear());
  };

  const showToast = (message, type) => setToast({ message, type });
  const closeToast = () => setToast({ message: '', type: '' });

  // Loading Screen
  if (viewState === 'LOADING' && !reportData[monthKey]) {
    return (
      <div className="loading-screen">
        <div className="spinner-ring"></div>
        <p>Syncing Data...</p>
      </div>
    );
  }

  // Error Screen
  if (viewState === 'ERROR' && !reportData[monthKey]) {
    return (
      <div className="error-screen">
        <AlertCircle size={48} strokeWidth={1.5} />
        <h3>Connection Timeout</h3>
        <p>Server is taking time to respond.</p>
        <button className="retry-btn" onClick={() => fetchData(null)}>Tap to Retry</button>
      </div>
    );
  }

  return (
    <div className="app-layout">
      <Toast message={toast.message} type={toast.type} onClose={closeToast} />

      <header className="app-header">
        <div className="header-content">
          <button className="icon-btn" onClick={() => navigate('/dashboard')}>
            <ArrowLeft size={22} />
          </button>
          <h1 className="page-title">Volume Tracker</h1>
          <div className="header-spacer"></div>
        </div>
      </header>

      <div className="main-content-wrapper">
        <div className="stats-card">
          <div className="stats-icon-bg">
            <BarChart2 size={24} />
          </div>
          <div className="stats-info">
            <span className="stats-label">Cumulative Total</span>
            <h2 className="stats-value">{formatNumber(totalPV)} <span className="unit">PV</span></h2>
          </div>
        </div>

        <div className="filter-bar">
          <div className="custom-select-wrapper">
            <Calendar className="select-icon" size={16} />
            <select 
              className="custom-select"
              value={`${getMonthName(currentMonthIndex)}-${currentYear}`}
              onChange={handleMonthSelect}
            >
              {monthOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="data-card">
          <div className="table-responsive">
            <table className="modern-table">
              <thead>
                <tr>
                  <th className="th-day">Day</th>
                  <th className="th-pv">Business Volume (PV)</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => (
                  <ReportRow
                    key={`${monthKey}-${day}`}
                    day={day}
                    currentPv={currentMonthData[day]?.pv ?? ''}
                    prevPv={currentMonthData[day]?.prevPv}
                    onChange={handleInputChange}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="sticky-footer">
        <button 
          className={`primary-action-btn ${viewState === 'SAVING' ? 'loading' : ''}`}
          onClick={handleSave}
          disabled={viewState === 'SAVING'}
        >
          {viewState === 'SAVING' ? (
            <div className="btn-loader"></div>
          ) : (
            <>
              <Save size={20} />
              <span>Save Changes</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default DailyReport;