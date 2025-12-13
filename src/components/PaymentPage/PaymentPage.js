import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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

      if (!token) {
        alert("Please log in again.");
        navigate("/login");
        return;
      }

      // 1. Get Subscription + User Data from Backend
      const res = await fetch(
        `${process.env.REACT_APP_API_URL}/api/payment/create-subscription`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({}), 
        }
      );

      const data = await res.json();
      setLoading(false);

      if (!data.success) {
        alert(`⚠️ ${data.message}`);
        return;
      }

      // 2. Razorpay Options
      const options = {
        key: data.key,
        subscription_id: data.subscriptionId,
        name: "RCM Network",
        description: "Monthly RCM Autopay Plan",
        image: "/logo.png",
        
        // ✅ CORRECT PREFILL: Use data from Backend Response (Fresh DB Data)
        // Do NOT use localStorage here.
        prefill: {
          name: data.user_name,    // From DB via Backend
          email: data.user_email,  // From DB via Backend
          contact: data.user_contact // From DB via Backend (Correct Phone)
        },

        retry: { enabled: true },
        theme: { color: "#3399cc" },

        handler: async function (response) {
          // Verify Logic (Same as before)...
          try {
            const verifyRes = await fetch(
              `${process.env.REACT_APP_API_URL}/api/payment/verify-payment`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(response),
              }
            );
            const vData = await verifyRes.json();
            if (vData.success) {
              alert("✅ AutoPay Activated!");
              navigate("/dashboard");
            } else {
              alert("❌ Verification Failed");
            }
          } catch (e) { console.error(e); }
        },
      };

      const razorpay = new window.Razorpay(options);
      razorpay.on('payment.failed', function (response){
        alert(`Payment Failed: ${response.error.description}`);
        setLoading(false);
      });
      razorpay.open();
      
    } catch (error) {
      console.error("Payment error:", error);
      setLoading(false);
      alert("❌ Error starting payment.");
    }
  };

  return (
    <div className="payment-container">
      <div className="payment-card">
        <img src="/logo.png" alt="RCM Network" className="payment-logo" />
        <h2 className="payment-title">Start Your AutoPay Subscription</h2>
        <p className="payment-subtitle">First month just ₹5 (refundable), then ₹29/month</p>
        <button
          onClick={handlePayment}
          className={`payment-btn ${loading ? "disabled" : ""}`}
          disabled={loading}
        >
          {loading ? "Processing..." : "Start AutoPay"}
        </button>
      </div>
    </div>
  );
}

export default PaymentPage;