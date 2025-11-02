import React, { useState } from 'react';
import { Plus, X, Calculator } from 'lucide-react';
import './CommissionCalculator.css'; // हम यह CSS फ़ाइल नीचे बनाएंगे

function CommissionCalculator({ onSubmit, isLoading }) {
    const [selfBV, setSelfBV] = useState('');
    const [legs, setLegs] = useState([{ bv: '' }, { bv: '' }]); // 2 लेग से शुरू करें

    // लेग के BV को बदलें
    const handleLegChange = (index, value) => {
        // केवल नंबर और खाली स्ट्रिंग को अलाऊ करें
        if (/^[0-9]*$/.test(value)) {
            const newLegs = [...legs];
            newLegs[index].bv = value;
            setLegs(newLegs);
        }
    };
    
    const handleSelfBVChange = (value) => {
        if (/^[0-9]*$/.test(value)) {
            setSelfBV(value);
        }
    };

    // एक और लेग जोड़ें
    const handleAddLeg = () => {
        setLegs([...legs, { bv: '' }]);
    };

    // लेग हटाएँ
    const handleRemoveLeg = (index) => {
        const newLegs = legs.filter((_, i) => i !== index);
        setLegs(newLegs);
    };

    // सबमिट करें
    const handleSubmit = (e) => {
        e.preventDefault();
        // खाली लेग्स को 0 के रूप में भेजें
        const finalData = {
            selfBV: selfBV || '0',
            legs: legs.map(leg => ({ bv: leg.bv || '0' }))
        };
        onSubmit(finalData);
    };

    return (
        <form className="commission-calculator" onSubmit={handleSubmit}>
            <div className="calc-input-group">
                <label>Your Self Purchase BV</label>
                <input
                    type="tel" // 'tel' मोबाइल पर नंबर पैड खोलता है
                    inputMode="numeric" // नंबर पैड का संकेत
                    pattern="[0-9]*"
                    placeholder="e.g., 5000"
                    value={selfBV}
                    onChange={(e) => handleSelfBVChange(e.target.value)}
                    disabled={isLoading}
                    required
                />
            </div>

            <hr className="calc-divider" />
            
            <label className="legs-label">Your Legs' BV</label>
            {legs.map((leg, index) => (
                <div key={index} className="calc-input-group leg-input">
                    <label>Leg {String.fromCharCode(65 + index)}</label>
                    <input
                        type="tel"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        placeholder="e.g., 115000"
                        value={leg.bv}
                        onChange={(e) => handleLegChange(index, e.target.value)}
                        disabled={isLoading}
                    />
                    {legs.length > 2 && ( // 2 लेग से कम होने पर X न दिखाएँ
                        <button 
                            type="button" 
                            className="btn-remove-leg" 
                            onClick={() => handleRemoveLeg(index)}
                            disabled={isLoading}
                            title="Remove Leg"
                        >
                            <X size={16} />
                        </button>
                    )}
                </div>
            ))}

            <button type="button" className="btn-add-leg" onClick={handleAddLeg} disabled={isLoading}>
                <Plus size={16} /> Add Another Leg
            </button>

            <button type="submit" className="btn-calculate" disabled={isLoading}>
                <Calculator size={18} /> {isLoading ? 'Calculating...' : 'Calculate Commission'}
            </button>
        </form>
    );
}

export default CommissionCalculator;
