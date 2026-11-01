import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from '../../context/AuthContext';
import {
  ShieldCheck, Lock, ChevronRight, CheckCircle, Zap, ShieldAlert
} from "lucide-react";
import "./PaymentPage.css";

function PaymentPage() {
   const [loading, setLoading] = useState(false);
   const [verifying, setVerifying] = useState(false); // New state for better UX
   const [isSdkReady, setSdkReady] = useState(false);
   
   // Ref to track if payment was successful to prevent premature loading stop
   const isPaymentProcessing = useRef(false); 
   
   const navigate = useNavigate();
   const { login } = useAuth(); // Access login function from AuthContext

   // 1. Robust SDK Loading
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

   const handlePayment = async () => {
      if (!isSdkReady) {
         alert("Payment system is still loading. Please wait...");
         return;
      }

      // Reset the processing tracker
      isPaymentProcessing.current = false;

      try {
         setLoading(true);
         const token = localStorage.getItem("accessToken");
         if (!token) { navigate("/login"); return; }

         // 2. Fetch Order + User Details from Backend
         const baseUrl = (process.env.REACT_APP_API_URL || "http://localhost:5000").replace(/\/$/, "");

         const res = await fetch(`${baseUrl}/api/payment/create-subscription`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({}),
         });

         const data = await res.json();

         if (!data.success) {
            setLoading(false);
            alert(`⚠️ ${data.message || "Subscription Init Failed"}`);
            return;
         }

         // 3. Configure Razorpay
         const options = {
            key: data.key,
            subscription_id: data.subscriptionId,
            name: "Enterprise AI Suite",
            description: "24-Hour Trial / Setup",
            image: "/rcmai_logo.png",
            theme: { color: "#0071e3" },

            prefill: {
               name: data.user_name,
               email: data.user_email,
               contact: data.user_contact
            },
            retry: { enabled: true },

            // ✅ HANDLER: Verify Payment on Backend
            handler: async function (response) {
               // CRITICAL FIX: Lock the process so ondismiss doesn't stop the loader
               isPaymentProcessing.current = true;
               setVerifying(true); // Change button text to "Verifying..."

               try {
                  const verifyRes = await fetch(`${baseUrl}/api/payment/verify-payment`, {
                     method: "POST",
                     headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                     },
                     body: JSON.stringify(response),
                  });

                  const vData = await verifyRes.json();

                  if (vData.success) {
                     // Update Local Storage & AuthContext immediately with status: 'premium'
                     const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
                     const updatedUser = { ...currentUser, status: 'premium', ...(vData.user || {}) };
                     localStorage.setItem('user', JSON.stringify(updatedUser));
                     login(updatedUser, token);

                     // Navigate without full page reload
                     navigate("/dashboard", { replace: true });
                  } else {
                     alert("❌ Payment Successful, but Verification Failed.");
                     setLoading(false);
                     setVerifying(false);
                  }
               } catch (e) {
                  console.error("Verification API Error:", e);
                  alert("⚠️ Network Error during verification. Please contact support.");
                  setLoading(false);
                  setVerifying(false);
               }
            },

            modal: {
               ondismiss: () => {
                  // CRITICAL FIX: Only stop loading if payment was NOT successful
                  if (isPaymentProcessing.current) {
                      // Do nothing. The handler is running. 
                      // This prevents the "pay again" confusion.
                      return;
                  }
                  setLoading(false);
                  console.log("Payment cancelled by user");
               }
            },
         };

         const rzp = new window.Razorpay(options);
         rzp.on('payment.failed', function (response) {
            console.error("Payment Failed:", response.error);
            alert(`Payment Failed: ${response.error.description}`);
            setLoading(false);
            setVerifying(false);
         });

         rzp.open();

      } catch (e) {
         console.error("Payment Setup Error:", e);
         setLoading(false);
         alert("Server connection failed. Please ensure backend is running.");
      }
   };

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
                     <p className="hero-desc">Auto-renews at ₹49/month after 24 hours.</p>
                  </div>
               </div>

               <div className="feature-grid">
                  <div className="f-item">
                     <Zap size={18} className="f-icon" />
                     <span><b>Unlimited 24x7</b> AI Chat Support & Instant Answers</span>
                  </div>
                  <div className="f-item">
                     <Zap size={18} className="f-icon" />
                     <span><b>RCM A to Z</b> Product Knowledge (PV, BV & Benefits)</span>
                  </div>
                  <div className="f-item">
                     <Zap size={18} className="f-icon" />
                     <span><b>Rise Health</b> & Health Care Nutrition Guidance</span>
                  </div>
                  <div className="f-item">
                     <Zap size={18} className="f-icon" />
                     <span><b>Tree Structure Analysis</b> (Track who purchased & who didn't)</span>
                  </div>
                  <div className="f-item">
                     <Zap size={18} className="f-icon" />
                     <span><b>Diamond Club</b> (5000+ PV) & Pin Achiever Auto-Tracker</span>
                  </div>
                  <div className="f-item">
                     <Zap size={18} className="f-icon" />
                     <span><b>Active vs Terminate</b> Downline List</span>
                  </div>
                  <div className="f-item">
                     <Zap size={18} className="f-icon" />
                     <span><b>Auto WhatsApp</b> Congratulations Poster Generator</span>
                  </div>
                  <div className="f-item">
                     <Zap size={18} className="f-icon" />
                     <span><b>Daily Business Report</b> & Growth Tracking</span>
                  </div>
                  <div className="f-item">
                     <Zap size={18} className="f-icon" />
                     <span><b>Commission & Target</b> Calculator</span>
                  </div>
               </div>

               <div className="cta-wrapper">
                  <button
                     onClick={handlePayment}
                     className="shiny-btn"
                     disabled={loading || !isSdkReady}
                  >
                     {/* Dynamic Button Text for Better UX */}
                     {verifying 
                        ? "Verifying Payment..." 
                        : loading 
                           ? "Securing Connection..." 
                           : "Activate Now for ₹5 (24-Hour Trial)"
                     }
                     {!loading && !verifying && <ChevronRight size={20} />}
                  </button>
               </div>

               <div className="sub-detail-faint">
                  ₹5 (24-Hour Trial / Setup), followed by ₹49/month recurring autopay. Cancel with 1-click anytime.
               </div>
            </div>

            <div className="trust-badges">
               <div className="t-badge"><Lock size={12} /> PCI-DSS Compliant</div>
               <div className="t-badge"><ShieldAlert size={12} /> No Hidden Fees</div>
            </div>
         </div>
      </div>
   );
}

export default PaymentPage;
