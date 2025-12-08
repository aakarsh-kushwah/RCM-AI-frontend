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

      if (!user || !user.id || !user.email) {
        alert("Please log in again before making payment.");
        setLoading(false);
        return;
      }

      // 1. Create Subscription on Backend
      const res = await fetch(
        `${process.env.REACT_APP_API_URL}/api/payment/create-subscription`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            userId: user.id,
            email: user.email,
            name: user.full_name || user.fullName,
          }),
        }
      );

      const data = await res.json();
      setLoading(false);

      if (!data.success) {
        alert(`⚠️ ${data.message}`);
        return;
      }

      // 2. Razorpay Options (SIMPLIFIED & SAFE)
      const options = {
        key: data.key,
        subscription_id: data.subscriptionId,
        name: "RCM Network",
        description: "Monthly RCM Autopay Plan",
        image: "/logo.png",
        theme: { color: "#007bff" },
        
        // ⚠️ REMOVED THE COMPLEX 'config' BLOCK
        // Let Razorpay automatically decide:
        // - On Mobile: It will show UPI Apps (Intent)
        // - On Desktop: It will show QR Code & Card options automatically
        
        handler: async function (response) {
          try {
            // alert("Payment Authorized! Verifying..."); // Optional feedback
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
              navigate("/login"); // or /dashboard
            } else {
              alert("❌ Payment Verification Failed!");
            }
          } catch (err) {
            console.error("Verification error:", err);
            alert("Error verifying payment!");
          }
        },
        prefill: {
          email: user.email,
          contact: user.phone || "",
          name: user.full_name || user.fullName,
        },
        // 3. HANDLE POPUP CLOSE (User clicked 'X')
        modal: {
          ondismiss: function() {
            alert("⚠️ You cancelled the subscription process. AutoPay is NOT active.");
          }
        }
      };

      const razorpay = new window.Razorpay(options);
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
        <img
          src="/logo.png"
          alt="RCM Network"
          className="payment-logo"
        />
        <h2 className="payment-title">Start Your AutoPay Subscription</h2>
        <p className="payment-subtitle">
          First month just ₹1 (refundable), then ₹21/month
        </p>

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