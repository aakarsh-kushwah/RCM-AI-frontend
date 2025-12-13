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

      // 1. Get Subscription + User Data from Backend (Fresh DB Data)
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
        image: "/rcmai_logo.png",
        
        // ✅ CORRECT PREFILL: Use data from Backend Response
        prefill: {
          name: data.user_name,    
          email: data.user_email,  
          contact: data.user_contact 
        },

        retry: { enabled: true },
        theme: { color: "#3399cc" },

        // ✅ HANDLER: This runs ONLY after successful payment
        handler: async function (response) {
          try {
            console.log("Payment Success! Verifying...");
            
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
            console.log("Verification Response:", vData);

            if (vData.success) {
              alert("✅ AutoPay Activated Successfully!");
              // 🚀 FORCE REDIRECT
              window.location.href = "/dashboard"; 
              // Note: used window.location to ensure a full refresh update of the dashboard state
            } else {
              alert("❌ Payment Successful, but Verification Failed.");
              console.error("Verification failed:", vData);
            }
          } catch (e) { 
            console.error("Verification API Error:", e);
            alert("⚠️ Network Error during verification. Please check your Dashboard.");
          }
        },

        // ✅ RESTORED: Modal Dismiss Logic
        modal: {
          ondismiss: function() {
            console.log("Payment Cancelled by User");
            alert("⚠️ Payment Cancelled");
            setLoading(false);
          }
        }
      };

      const razorpay = new window.Razorpay(options);
      
      // Handle Payment Failures
      razorpay.on('payment.failed', function (response){
        console.error("Payment Failed:", response.error);
        alert(`Payment Failed: ${response.error.description}`);
        setLoading(false);
      });

      razorpay.open();
      
    } catch (error) {
      console.error("Payment setup error:", error);
      setLoading(false);
      alert("❌ Error starting payment.");
    }
  };

  return (
    <div className="payment-container">
      <div className="payment-card">
        <img src="/rcmai_logo.png" alt="RCM Network" className="payment-logo" />
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