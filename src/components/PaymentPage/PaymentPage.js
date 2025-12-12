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
      const user = JSON.parse(localStorage.getItem("user")); 

      if (!token) {
        alert("Please log in again before making payment.");
        navigate("/login");
        return;
      }

      // 1. Backend se Subscription ID maango
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

      // 2. Razorpay Options (Standard Mode)
      const options = {
        key: data.key,
        subscription_id: data.subscriptionId,
        name: "RCM Network",
        description: "Monthly RCM Autopay Plan",
        image: "/logo.png",
        
        // ✅ User Details Prefill (User ka time bachane ke liye)
        prefill: {
          name: data.user_name || user?.fullName,
          email: data.user_email || user?.email,
          contact: data.user_contact || user?.phone || "", 
        },

        // ⚠️ MAIN FIX: "config" block ko puri tarah hata diya hai.
        // Ab Razorpay khud best options dikhayega (Cards, Netbanking, All UPI Apps).
        
        // ✅ Retry Option: Agar payment fail ho to retry ka option dega
        retry: {
          enabled: true,
        },

        // ✅ Theme Color (Optional: Apni branding ke hisab se change karein)
        theme: {
          color: "#3399cc",
        },

        handler: async function (response) {
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

            const verifyData = await verifyRes.json();
            if (verifyData.success) {
              alert("✅ AutoPay Activated Successfully!");
              navigate("/dashboard"); 
            } else {
              alert("❌ Payment Verification Failed!");
            }
          } catch (err) {
            console.error("Verification error:", err);
            alert("Error verifying payment!");
          }
        },

        modal: {
          ondismiss: function() {
            alert("⚠️ Payment Cancelled");
            setLoading(false);
          }
        }
      };

      const razorpay = new window.Razorpay(options);
      
      // ✅ Payment Failure Handle karna
      razorpay.on('payment.failed', function (response){
        alert(`Payment Failed: ${response.error.description}`);
        setLoading(false);
      });

      razorpay.open();
      
    } catch (error) {
      console.error("Payment initiation failed:", error);
      setLoading(false);
      alert("❌ Something went wrong. Please try again later.");
    }
  };

  return (
    <div className="payment-container">
      <div className="payment-card">
        <img src="/logo.png" alt="RCM Network" className="payment-logo" />
        <h2 className="payment-title">Start Your AutoPay Subscription</h2>
        <p className="payment-subtitle">First month just ₹5 (refundable), then ₹29/month</p>

        <div className="payment-details">
          <ul>
            <li>✔ Secure Razorpay Gateway</li>
            <li>✔ Cancel Anytime</li>
            <li>✔ Instant Activation</li>
          </ul>
        </div>

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