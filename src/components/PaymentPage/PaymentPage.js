import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { 
  ShieldCheck, Lock, ChevronRight, Sparkles, 
  CheckCircle, Zap, ShieldAlert 
} from "lucide-react"; 
import "./PaymentPage.css";

function PaymentPage() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    document.body.appendChild(script);
  }, []);

  const handlePayment = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      if (!token) { navigate("/login"); return; }

      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/payment/create-subscription`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({}), 
      });
      const data = await res.json();
      setLoading(false);

      if (!data.success) { alert(`⚠️ ${data.message}`); return; }

      const options = {
        key: data.key,
        subscription_id: data.subscriptionId,
        name: "Enterprise AI Suite",
        description: "Refundable Security Verification",
        theme: { color: "#000000" },
        handler: () => { window.location.href = "/dashboard"; },
        modal: { ondismiss: () => setLoading(false) },
      };
      new window.Razorpay(options).open();
    } catch (e) { setLoading(false); }
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
     Master Your Business <br/> 
     with <span className="gemini-ai">AI</span>
   </h1>
   <p className="hero-sub">Enterprise-grade tools, now in your pocket.</p>
</header>

        <div className="master-card shadow-xl">
           {/* HIGH-LIGHTED ANCHOR */}
           <div className="value-anchor">
              <span className="anchor-label">Standard Industry Price</span>
              <div className="anchor-price"><s>₹599</s></div>
              <div className="price-tag-floating">95% SAVING</div>
           </div>

           {/* THE MAIN HOOK (₹5) */}
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

           {/* ACTION BUTTON */}
           <div className="cta-wrapper">
              <button onClick={handlePayment} className="shiny-btn">
                 {loading ? "Securing Connection..." : "Activate Now for ₹5"}
                 <ChevronRight size={20} />
              </button>
           </div>

           {/* HIDDEN ₹29 FOOTER */}
           <div className="sub-detail-faint">
              Renews at ₹29/mo after trial. Cancel with 1-click.
           </div>
        </div>

        <div className="trust-badges">
           <div className="t-badge"><Lock size={12}/> PCI-DSS Compliant</div>
           <div className="t-badge"><ShieldAlert size={12}/> No Hidden Fees</div>
        </div>
      </div>
    </div>
  );
}

export default PaymentPage;