import React, { useState, useEffect } from 'react';
import axios from 'axios';
import config from '../../config/env';
import './CalculatorWidget.css';

/**
 * @function CalculatorWidget
 * @description A React component for an interactive bonus calculator within the chat.
 * @param {object} props - Component props.
 * @param {object} props.initialData - Initial PV values from the backend (selfPurchasePv, legAPv, legBPv).
 */
const CalculatorWidget = ({ initialData }) => {
    const [selfPurchasePv, setSelfPurchasePv] = useState(initialData?.selfPurchasePv || '');
    const [legAPv, setLegAPv] = useState(initialData?.legAPv || '');
    const [legBPv, setLegBPv] = useState(initialData?.legBPv || '');
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        setSelfPurchasePv(initialData?.selfPurchasePv || '');
        setLegAPv(initialData?.legAPv || '');
        setLegBPv(initialData?.legBPv || '');
        setResult(null); // Reset result when initialData changes
    }, [initialData]);

    const calculateBonus = async () => {
        setLoading(true);
        setError(null);
        setResult(null);

        const apiUrl = config.API.BASE_URL;

        try {
            const response = await axios.post(`${apiUrl}/api/calculator/bonus`, {
                selfPurchasePv: Number(selfPurchasePv),
                legAPv: Number(legAPv),
                legBPv: Number(legBPv)
            });
            setResult(response.data.data); // Assuming response.data.data contains the bonus details
        } catch (err) {
            console.error("Error calculating bonus:", err);
            setError("Calculation failed. Please check your inputs and try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="calculator-widget-card">
            <h3>Bonus Calculator</h3>
            <div className="input-group">
                <label htmlFor="selfPv">Self Purchase PV:</label>
                <input
                    id="selfPv"
                    type="number"
                    value={selfPurchasePv}
                    onChange={(e) => setSelfPurchasePv(e.target.value)}
                    placeholder="e.g., 1000"
                />
            </div>
            <div className="input-group">
                <label htmlFor="legAPv">Leg A PV:</label>
                <input
                    id="legAPv"
                    type="number"
                    value={legAPv}
                    onChange={(e) => setLegAPv(e.target.value)}
                    placeholder="e.g., 150000"
                />
            </div>
            <div className="input-group">
                <label htmlFor="legBPv">Leg B PV:</label>
                <input
                    id="legBPv"
                    type="number"
                    value={legBPv}
                    onChange={(e) => setLegBPv(e.target.value)}
                    placeholder="e.g., 100000"
                />
            </div>
            <button onClick={calculateBonus} disabled={loading}>
                {loading ? 'Calculating...' : 'Calculate'}
            </button>

            {error && <p className="error-message">{error}</p>}

            {result && (
                <div className="calculation-result">
                    <h4>Calculation Result:</h4>
                    <p>
                        Performance Bonus: ₹{result.performanceBonus} | 
                        Royalty Bonus: ₹{result.royaltyBonus} 
                        {result.royaltyDisclaimer && 
                            ` (${result.royaltyDisclaimer})`} | 
                        Technical Bonus: ₹{result.technicalBonus} | 
                        Gross: ₹{result.grossIncome} | 
                        TDS(2%): ₹{result.tdsAmount} | 
                        Net Payable: ₹{result.netPayable}
                    </p>
                </div>
            )}
        </div>
    );
};

export default CalculatorWidget;
