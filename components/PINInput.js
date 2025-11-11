'use client';

import { useRef, useState } from 'react';

/**
 * PINInput - Reusable 6-digit PIN input component
 * Features:
 * - 6 individual input boxes
 * - Auto-focus next box on digit entry
 * - Auto-focus previous box on backspace
 * - Paste support
 * - Keyboard navigation
 * - Accessible
 */
export default function PINInput({ value = '', onChange, disabled = false, error = false }) {
  const inputRefs = useRef([]);
  const [pins, setPins] = useState(value.split('').concat(Array(6 - value.length).fill('')));

  const handleChange = (index, digit) => {
    // Only allow digits
    if (digit && !/^\d$/.test(digit)) return;

    const newPins = [...pins];
    newPins[index] = digit;
    setPins(newPins);

    // Call onChange with complete PIN
    const pinValue = newPins.join('');
    onChange(pinValue);

    // Auto-focus next input
    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    // Handle backspace
    if (e.key === 'Backspace') {
      if (!pins[index] && index > 0) {
        // If current box is empty, focus previous
        inputRefs.current[index - 1]?.focus();
      } else {
        // Clear current box
        const newPins = [...pins];
        newPins[index] = '';
        setPins(newPins);
        onChange(newPins.join(''));
      }
    }
    // Handle arrow keys
    else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').slice(0, 6);
    
    // Only allow digits
    if (!/^\d+$/.test(pastedData)) return;

    const newPins = pastedData.split('').concat(Array(6 - pastedData.length).fill(''));
    setPins(newPins);
    onChange(pastedData);

    // Focus the next empty box or last box
    const nextEmptyIndex = Math.min(pastedData.length, 5);
    inputRefs.current[nextEmptyIndex]?.focus();
  };

  return (
    <div className="flex gap-2 justify-center">
      {pins.map((pin, index) => (
        <input
          key={index}
          ref={(el) => (inputRefs.current[index] = el)}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={pin}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={handlePaste}
          disabled={disabled}
          className={`
            w-12 h-14 text-center text-2xl font-semibold
            border-2 rounded-lg
            focus:outline-none focus:ring-2 focus:ring-offset-2
            transition-all
            ${error 
              ? 'border-red-500 focus:ring-red-500' 
              : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
            }
            ${disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'}
          `}
          aria-label={`PIN digit ${index + 1}`}
          autoComplete="off"
        />
      ))}
    </div>
  );
}

