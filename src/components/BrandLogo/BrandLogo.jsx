import React, { memo } from 'react';
import './BrandLogo.css';

// Icon is an SVG traced from the real Team Dekho logo. Put teamdekho-icon.svg in /public.
const LOGO_SRC = '/teamdekho-icon.svg';

const BrandLogo = ({ tagline = true, className = '' }) => (
  <span
    className={`tdlogo ${className}`}
    role="img"
    aria-label="Team Dekho - Virtual Meetings & Collaboration"
  >
    <img className="tdlogo-mark" src={LOGO_SRC} alt="" decoding="async" draggable="false" />
    <span className="tdlogo-text">
      <span className="tdlogo-name">
        <span className="tdlogo-team">TEAM</span>{' '}
        <span className="tdlogo-dekho">DEKHO</span>
      </span>
      {tagline && <span className="tdlogo-tag">VIRTUAL MEETINGS &amp; COLLABORATION</span>}
    </span>
  </span>
);

export default memo(BrandLogo);