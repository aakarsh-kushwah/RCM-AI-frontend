/**
 * @file installFx.js
 * @description "Cracker burn-out" effect for the install card.
 *
 * The card dissolves while tiny bubbles fly out of it and get swallowed by the profile
 * avatar. Every swallowed bubble makes the avatar squish a little, like a bag being
 * stuffed, then it settles back to normal with a ripple.
 *
 * Performance: pure Web Animations API, only transform/opacity are animated, no layout
 * reads inside the loop, and every node removes itself when it finishes.
 */

const COLORS = ['#12c6d8', '#4f6bff', '#9a5cff', '#e9c27a', '#ffffff', '#2fcf94'];
const BUBBLE_COUNT = 38;

const rand = (min, max) => min + Math.random() * (max - min);
const lerp = (a, b, t) => a + (b - a) * t;

/** Short squish on the avatar: grows a bit, compresses, settles. */
const squish = (target, scale, duration) => {
    target.animate(
        [
            { transform: 'scale(1)' },
            { transform: `scale(${scale})`, offset: 0.4 },
            { transform: 'scale(0.95)', offset: 0.7 },
            { transform: 'scale(1)' },
        ],
        { duration, easing: 'cubic-bezier(0.3, 0.7, 0.4, 1)' }
    );
};

/** Expanding ring around the avatar once everything has been swallowed. */
const ripple = (layer, x, y) => {
    const ring = document.createElement('span');
    ring.className = 'tdud-fx-ring';
    ring.style.left = `${x}px`;
    ring.style.top = `${y}px`;
    layer.appendChild(ring);

    const anim = ring.animate(
        [
            { transform: 'translate(-50%, -50%) scale(0.7)', opacity: 0.8 },
            { transform: 'translate(-50%, -50%) scale(2.6)', opacity: 0 },
        ],
        { duration: 750, easing: 'ease-out' }
    );
    anim.onfinish = () => ring.remove();
};

/**
 * @param {object}      p
 * @param {HTMLElement} p.wrapper  Collapsing wrapper around the card.
 * @param {HTMLElement} p.card     The card itself (fades out).
 * @param {HTMLElement} p.target   Profile avatar button (bubbles fly into it).
 * @param {HTMLElement} p.layer    Fixed, pointer-events:none overlay that hosts the bubbles.
 * @returns {Promise<void>} Resolves when the card is fully gone.
 */
export const playInstallAbsorb = async ({ wrapper, card, target, layer }) => {
    if (!wrapper || !card || !target || !layer || typeof card.animate !== 'function') return;

    /* ---- measure once ---- */
    const from = card.getBoundingClientRect();
    const toRect = target.getBoundingClientRect();
    const toX = toRect.left + toRect.width / 2;
    const toY = toRect.top + toRect.height / 2;
    const wrapHeight = wrapper.offsetHeight;
    const gap = parseFloat(getComputedStyle(wrapper.parentElement).rowGap) || 0;

    /* ---- bubbles ---- */
    const flights = [];
    let lastSquish = 0;

    for (let i = 0; i < BUBBLE_COUNT; i += 1) {
        const size = rand(5, 12);
        const half = size / 2;
        const color = COLORS[(Math.random() * COLORS.length) | 0];

        const el = document.createElement('span');
        el.className = 'tdud-fx-bubble';
        el.style.width = `${size}px`;
        el.style.height = `${size}px`;
        el.style.background = `radial-gradient(circle at 30% 30%, #fff, ${color} 70%)`;
        layer.appendChild(el);

        const sx = rand(from.left + 16, from.right - 16);
        const sy = rand(from.top + 10, from.bottom - 10);
        const mx = lerp(sx, toX, rand(0.3, 0.55)) + rand(-70, 70);
        const my = lerp(sy, toY, rand(0.3, 0.55)) + rand(-60, 40);

        const flight = el.animate(
            [
                { transform: `translate3d(${sx - half}px, ${sy - half}px, 0) scale(0.4)`, opacity: 0 },
                { transform: `translate3d(${mx - half}px, ${my - half}px, 0) scale(1)`, opacity: 1, offset: 0.4 },
                { transform: `translate3d(${toX - half}px, ${toY - half}px, 0) scale(0.25)`, opacity: 0.2 },
            ],
            {
                duration: rand(850, 1300),
                // most bubbles leave early, a few straggle: a cracker burning out
                delay: Math.pow(Math.random(), 1.7) * 1100,
                easing: 'cubic-bezier(0.45, 0.05, 0.4, 1)',
                fill: 'both',
            }
        );

        flights.push(
            flight.finished
                .then(() => {
                    el.remove();
                    const now = performance.now();
                    if (now - lastSquish > 110) {
                        lastSquish = now;
                        squish(target, 1.08, 200);
                    }
                })
                .catch(() => el.remove())
        );
    }

    /* ---- the card slowly burns out, then its space folds away ---- */
    const fade = card.animate(
        [
            { opacity: 1, transform: 'scale(1)' },
            { opacity: 0, transform: 'scale(0.96)' },
        ],
        { duration: 1400, delay: 250, easing: 'ease-in', fill: 'forwards' }
    );

    const collapse = fade.finished.then(() => {
        wrapper.style.overflow = 'hidden'; // only now, so the card shadow is never clipped early
        return wrapper.animate(
            [
                { height: `${wrapHeight}px`, marginBottom: '0px' },
                { height: '0px', marginBottom: `${-gap}px` },
            ],
            { duration: 420, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' }
        ).finished;
    });

    await Promise.all([...flights, collapse]);

    /* ---- finale: one big squish and a ripple, then the avatar is back to normal ---- */
    squish(target, 1.22, 520);
    ripple(layer, toX, toY);
};