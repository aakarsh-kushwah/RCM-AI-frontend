import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
   ShieldCheck, Lock, ChevronRight, CheckCircle, Zap, ShieldAlert
} from "lucide-react";
import "./PaymentPage.css";

function PaymentPage() {
   const [loading, setLoading] = useState(false);
   const [isSdkReady, setSdkReady] = useState(false);
   const navigate = useNavigate();

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

      try {
         setLoading(true);
         const token = localStorage.getItem("token");
         if (!token) { navigate("/login"); return; }

         // 2. Fetch Order + User Details from Backend
         const baseUrl = (process.env.REACT_APP_API_URL || "http://localhost:10000").replace(/\/$/, "");

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

         // 3. Configure Razorpay with PREFILL (The Fix)
         const options = {
            key: data.key,
            subscription_id: data.subscriptionId,
            name: "Enterprise AI Suite",
            description: "Refundable Security Verification",
            image: "/rcmai_logo.png",
            theme: { color: "#0071e3" }, // Matches your UI color

            // ✅ CRITICAL FIX: Prefill data so user doesn't type it again
            prefill: {
               name: data.user_name,
               email: data.user_email,
               contact: data.user_contact
            },
            retry: { enabled: true },

            // ✅ HANDLER: Verify Payment on Backend
            handler: async function (response) {
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
                     // Update Local Storage immediately to reflect 'active' status
                     const user = JSON.parse(localStorage.getItem('user') || '{}');
                     user.status = 'active';
                     localStorage.setItem('user', JSON.stringify(user));

                     // Force Redirect to Dashboard
                     window.location.href = "/dashboard";
                  } else {
                     alert("❌ Payment Successful, but Verification Failed.");
                     setLoading(false);
                  }
               } catch (e) {
                  console.error("Verification API Error:", e);
                  alert("⚠️ Network Error during verification. Please contact support.");
                  setLoading(false);
               }
            },

            modal: {
               ondismiss: () => {
                  setLoading(false);
                  // Optional: alert("Payment Cancelled"); 
               }
            },
         };

         const rzp = new window.Razorpay(options);
         rzp.on('payment.failed', function (response) {
            console.error("Payment Failed:", response.error);
            alert(`Payment Failed: ${response.error.description}`);
            setLoading(false);
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
                     <p className="hero-desc">Refunded automatically after verification</p>
                  </div>
               </div>

               <div className="feature-grid">
                  <div className="f-item">
                     <Zap size={18} className="f-icon" />
                     <span><b>Unlimited</b> AI Business Coaching</span>
                  </div>
                  <div className="f-item">
                     <Zap size={18} className="f-icon" />
                     <span><b>Pro</b> Voice Pitching Tools</span>
                  </div>
               </div>

               <div className="cta-wrapper">
                  <button
                     onClick={handlePayment}
                     className="shiny-btn"
                     disabled={loading || !isSdkReady}
                  >
                     {loading ? "Securing Connection..." : "Activate Now for ₹5"}
                     <ChevronRight size={20} />
                  </button>
               </div>

               <div className="sub-detail-faint">
                  Renews at ₹29/mo after trial. Cancel with 1-click.
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