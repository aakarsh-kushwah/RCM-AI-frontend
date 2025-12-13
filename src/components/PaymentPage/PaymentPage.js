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
        alert("Session expired. Please login again.");
        navigate("/login");
        return;
      }

      // 🔹 Create Subscription
      const res = await fetch(
        `${process.env.REACT_APP_API_URL}/api/payment/create-subscription`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await res.json();
      setLoading(false);

      if (!data.success) {
        alert(data.message || "Unable to initiate AutoPay");
        return;
      }

      // 🔹 Razorpay Native UPI AutoPay
      const options = {
        key: data.key,
        subscription_id: data.subscriptionId,

        name: "RCM Network",
        description: "UPI AutoPay Subscription",
        image: "/rcmai_logo.png",

        // 🔥 Force Native UPI / Redirect UI
        redirect: true,

        method: {
          upi: true,
          card: false,
          netbanking: false,
          wallet: false,
          emi: false,
        },

        config: {
          display: {
            blocks: {
              upi: {
                name: "Pay using UPI",
                instruments: [{ method: "upi" }],
              },
            },
            sequence: ["block.upi"],
            preferences: {
              show_default_blocks: false,
            },
          },
        },

        prefill: {
          name: data.user_name,
          email: data.user_email,
          contact: data.user_contact,
        },

        theme: { color: "#2563eb" },

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

            const vData = await verifyRes.json();

            if (vData.success) {
              alert("✅ AutoPay Mandate Activated Successfully");
              window.location.href = "/dashboard";
            } else {
              alert("Mandate created but verification pending.");
            }
          } catch (err) {
            console.error(err);
            alert("Verification error. Please check dashboard.");
          }
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (error) {
      console.error("Payment Error:", error);
      setLoading(false);
      alert("Failed to start AutoPay");
    }
  };

  return (
    <div className="payment-container">
      <div className="payment-card">
        <img src="/rcmai_logo.png" alt="RCM Network" className="payment-logo" />

        <h2 className="payment-title">Activate UPI AutoPay</h2>
        <p className="payment-subtitle">
          ₹1 mandate now • First payment after 24 hours
        </p>

        <ul className="payment-details">
          <li>UPI AutoPay (PhonePe / GPay)</li>
          <li>No manual payments required</li>
          <li>Cancel anytime from dashboard</li>
          <li>Secure Razorpay Gateway</li>
        </ul>

        <button
          onClick={handlePayment}
          className={`payment-btn ${loading ? "disabled" : ""}`}
          disabled={loading}
        >
          {loading ? "Processing..." : "Activate AutoPay"}
        </button>
      </div>
    </div>
  );
}

export default PaymentPage;
