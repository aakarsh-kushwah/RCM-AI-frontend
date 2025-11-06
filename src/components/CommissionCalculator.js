import React, { useState } from 'react';
import { Send } from 'lucide-react';

// Basic styles taaki component dikhe
const inputStyle = {
  width: '100%',
  padding: '8px',
  margin: '5px 0 10px 0',
  borderRadius: '5px',
  border: '1px solid #ccc',
  boxSizing: 'border-box'
};

const buttonStyle = {
  background: '#00796b',
  color: 'white',
  border: 'none',
  borderRadius: '5px',
  padding: '10px 15px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '5px',
  width: '100%',
  fontSize: '15px'
};

const addButtonStyle = {
  ...buttonStyle,
  background: '#607d8b',
  marginTop: '10px'
};

// Yeh component ChatWindow se props leta hai
function CommissionCalculator({ onSubmit, isLoading }) {
    const [selfBV, setSelfBV] = useState('');
    const [legs, setLegs] = useState([{ id: 1, bv: '' }]);

    const handleLegChange = (id, value) => {
        setLegs(legs.map(leg => leg.id === id ? { ...leg, bv: value } : leg));
    };

    const addLeg = () => {
        setLegs([...legs, { id: legs.length + 1, bv: '' }]);
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const data = {
            selfBV: parseInt(selfBV) || 0,
            legs: legs.map(leg => ({ bv: parseInt(leg.bv) || 0 })),
        };
        onSubmit(data); // Data parent (ChatWindow) ko wapas bhejein
    };

    return (
        <form onSubmit={handleSubmit} style={{ marginTop: '15px' }}>
            <label style={{ fontSize: '14px', fontWeight: '500' }}>Self BV</label>
            <input
                type="number"
                value={selfBV}
                onChange={(e) => setSelfBV(e.target.value)}
                placeholder="Aapka apna BV"
                style={inputStyle}
            />

            {legs.map((leg, index) => (
                <div key={leg.id}>
                    <label style={{ fontSize: '14px', fontWeight: '500' }}>Leg {index + 1} BV</label>
                    <input
                        type="number"
                        value={leg.bv}
                        onChange={(e) => handleLegChange(leg.id, e.target.value)}
                        placeholder={`Leg ${index + 1} ka total BV`}
                        style={inputStyle}
                    />
                </div>
            ))}
            
            <button type="button" onClick={addLeg} style={addButtonStyle}>
                Add Leg
            </button>

            <button type="submit" disabled={isLoading} style={{...buttonStyle, marginTop: '10px'}}>
                {isLoading ? 'Calculating...' : 'Calculate'}
                <Send size={16} />
            </button>
        </form>
    );
}

export default CommissionCalculator;