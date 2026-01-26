import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  ShieldCheck, Lock, ChevronRight, CheckCircle, Zap, ShieldAlert, Loader
} from "lucide-react";
import "./PaymentPage.css";

function PaymentPage() {
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false); // New state for verification UI
  const [isSdkReady, setSdkReady] = useState(false);
  const paymentCheckInterval = useRef(null); // To store interval ID
  const navigate = useNavigate();

  // 1. Load SDK
  useEffect(() => {
    if (window.Razorpay) {
      setSdkReady(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => setSdkReady(true);
    script.onerror = () => alert("Razorpay SDK failed to load. Please refresh.");
    document.body.appendChild(script);
  }, []);

  // 🛑 2. POLLING FUNCTION: Server se status puchte raho
  const checkPaymentStatus = async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return;

      const baseUrl = (process.env.REACT_APP_API_URL || "http://localhost:10000").replace(/\/$/, "");
      
      // Backend me /status endpoint bana hona chahiye
      const res = await fetch(`${baseUrl}/api/payment/status`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();

      // Agar status active/premium ho gya hai
      if (data.success && (data.status === 'active' || data.status === 'premium')) {
        clearInterval(paymentCheckInterval.current); // Stop checking
        setVerifying(false);
        setLoading(false);
        window.location.href = "/dashboard"; // Redirect
        return true;
      }
    } catch (error) {
      console.error("Status check failed", error);
    }
    return false;
  };

  // 👁️ 3. VISIBILITY LISTENER: Jab user wapis app me aaye
  useEffect(() => {
    const handleVisibilityChange = () => {
      // Agar user tab par wapis aa gya hai aur loading chal rhi hai
      if (document.visibilityState === 'visible' && loading) {
        console.log("User returned. Checking payment status...");
        setVerifying(true); // Show "Verifying" text
        
        // Turant check karo
        checkPaymentStatus();

        // Aur agle 10 second tak har 2 second me check karo
        let attempts = 0;
        paymentCheckInterval.current = setInterval(async () => {
            attempts++;
            const success = await checkPaymentStatus();
            if (success || attempts > 10) clearInterval(paymentCheckInterval.current);
        }, 2000);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
        clearInterval(paymentCheckInterval.current);
    };
  }, [loading]);

  const handlePayment = async () => {
    if (!isSdkReady) {
      alert("Payment system loading...");
      return;
    }

    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      if (!token) { navigate("/login"); return; }

      const baseUrl = (process.env.REACT_APP_API_URL || "http://localhost:10000").replace(/\/$/, "");

      // Step A: Create Subscription
      const res = await fetch(`${baseUrl}/api/payment/create-subscription`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });

      const data = await res.json();
      if (!data.success) {
        setLoading(false);
        alert(`⚠️ ${data.message || "Init Failed"}`);
        return;
      }

      // Step B: Razorpay Options
      const options = {
        key: data.key,
        subscription_id: data.subscriptionId,
        name: "Enterprise AI Suite",
        description: "Refundable Verification Fee", // Changed description
        image: "/rcmai_logo.png",
        theme: { color: "#0071e3" },
        prefill: {
          name: data.user_name,
          email: data.user_email,
          contact: data.user_contact
        },
        // Force specific method flow if needed
        config: {
          display: {
            blocks: {
              utib: { // BHIM UPI specific block to encourage intent flow
                name: "Pay via UPI",
                instruments: [
                  { method: "upi" },
                ]
              }
            },
            sequence: ["block.utib", "block.other"],
            preferences: { show_default_blocks: true }
          }
        },
        retry: { enabled: true },
        
        // ✅ Handler executes ONLY if user stays on page
        handler: async function (response) {
           setVerifying(true);
           try {
             const verifyRes = await fetch(`${baseUrl}/api/payment/verify-payment`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify(response),
             });
             const vData = await verifyRes.json();
             if (vData.success) {
                window.location.href = "/dashboard";
             } else {
                alert("Verification failed. Checking background status...");
                checkPaymentStatus(); // Fallback check
             }
           } catch (e) {
             checkPaymentStatus(); // Network error, try polling
           }
        },
        modal: {
           ondismiss: () => {
              // User closed manually, stop loading ONLY if not verifying
              if(!verifying) setLoading(false); 
           }
        }
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', function (response) {
         // Agar failure authentic hai to hi alert karo
         console.error(response.error);
         // Kabhi kabhi success ke baad bhi fail event aata hai mobile pe
         // isliye pehle status check kar lo
         checkPaymentStatus().then(isPaid => {
            if(!isPaid) {
                alert("Payment Failed. Please try again.");
                setLoading(false);
            }
         });
      });

      rzp.open();

    } catch (e) {
      console.error(e);
      setLoading(false);
      alert("Connection Error");
    }
  };

  // ✅ New Verifying UI (Jab mobile se wapis aaye)
  if (verifying) {
      return (
          <div className="verifying-overlay">
              <div className="verify-box">
                  <Loader className="spin-icon" size={40} />
                  <h2>Verifying Payment...</h2>
                  <p>Please wait while we confirm with the bank.</p>
                  <button onClick={checkPaymentStatus} className="check-btn">
                      Click here if not redirected
                  </button>
              </div>
          </div>
      );
  }

  return (
    <div className="apple-premium-bg">
      <nav className="top-nav">
        <div className="nav-content">
          <ShieldCheck size={18} color="#0071e3" />
          <span>Apple-Grade 256-bit Encryption</span>
        </div>
      </nav>

      <div className="main-content">
        <header className="hero-header">
          <span className="premium-tag">Founder's Intelligence Access</span>
          <h1 className="ultra-heading">
            Master Your Business <br />
            with <span className="gemini-ai">AI</span>
          </h1>
          <p className="hero-sub">Enterprise-grade tools, now in your pocket.</p>
        </header>

        <div className="master-card shadow-xl">
           <div className="value-anchor">
              <span className="anchor-label">Standard Industry Price</span>
              <div className="anchor-price"><s>₹599</s></div>
              <div className="price-tag-floating">95% SAVING</div>
           </div>

           <div className="trial-hero-section">
              <div className="hero-price-wrap">
                 <span className="hero-curr">₹</span>
                 <span className="hero-amt">5</span>
              </div>
              <div className="hero-details">
                 <div className="refundable-badge">
                    <CheckCircle size={14} /> 100% REFUNDABLE
                 </div>
                 <p className="hero-desc">Refunded automatically after verification</p>
              </div>
           </div>

           <div className="cta-wrapper">
              <button
                 onClick={handlePayment}
                 className="shiny-btn"
                 disabled={loading || !isSdkReady}
              >
                 {loading ? "Processing..." : "Activate Now for ₹5"}
                 <ChevronRight size={20} />
              </button>
           </div>
           
           <div className="sub-detail-faint">
              Renews at ₹29/mo after trial. Cancel anytime.
           </div>
        </div>
        
        <div className="trust-badges">
            <div className="t-badge"><Lock size={12} /> PCI-DSS Compliant</div>
        </div>
      </div>
    </div>
  );
}

export default PaymentPage;