/**
 * Celebration utilities for goal creation and investment success
 * Premium gold-themed confetti animations
 */

import confetti from 'canvas-confetti';

/**
 * Launch gold confetti celebration
 * @param {Object} options - Configuration options
 * @param {HTMLElement} options.element - Optional element to emit confetti from
 * @param {number} options.particleCount - Number of particles (default: 35)
 * @param {number} options.spread - Spread angle in degrees (default: 70)
 */
export function launchCelebration({ element = null, particleCount = 35, spread = 70 } = {}) {
  // Brand colors: gold tones matching the app aesthetic
  const colors = ['#F6C56D', '#F1A92B', '#FFD787', '#FF9F1C'];
  
  const config = {
    particleCount,
    spread,
    origin: { y: 0.6 },
    colors,
    ticks: 200,
    gravity: 0.8,
    scalar: 0.9,
    decay: 0.94,
  };

  // If element is provided, emit from that element's position
  if (element) {
    const rect = element.getBoundingClientRect();
    const x = (rect.left + rect.width / 2) / window.innerWidth;
    const y = (rect.top + rect.height / 2) / window.innerHeight;
    
    confetti({
      ...config,
      origin: { x, y },
    });
  } else {
    // Default: emit from center-top
    confetti(config);
  }
}

/**
 * Launch celebration from a button element
 * @param {HTMLElement} buttonElement - The button element to emit from
 */
export function launchCelebrationFromElement(buttonElement) {
  if (!buttonElement) {
    launchCelebration();
    return;
  }
  
  launchCelebration({ element: buttonElement });
}

/**
 * Launch a subtle celebration (fewer particles, shorter duration)
 * For less prominent moments
 */
export function launchSubtleCelebration() {
  confetti({
    particleCount: 20,
    spread: 50,
    origin: { y: 0.7 },
    colors: ['#F6C56D', '#F1A92B'],
    ticks: 150,
    gravity: 0.9,
    scalar: 0.8,
  });
}

