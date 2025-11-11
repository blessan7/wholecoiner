'use client';

/**
 * NumericKeypad - Component for numeric PIN entry
 * 3x3 grid (1-9), bottom row with 0 and backspace
 */
export default function NumericKeypad({ onDigit, onBackspace, disabled = false }) {
  const handleDigit = (digit) => {
    if (!disabled && onDigit) {
      onDigit(digit);
    }
  };

  const handleBackspace = () => {
    if (!disabled && onBackspace) {
      onBackspace();
    }
  };

  return (
    <div className="mt-7 grid grid-cols-3 gap-4 justify-items-center">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
        <button
          key={digit}
          onClick={() => handleDigit(digit.toString())}
          disabled={disabled}
          className="keypad-button w-16 h-16 sm:w-20 sm:h-20 rounded-full text-lg sm:text-xl flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label={`Digit ${digit}`}
        >
          {digit}
        </button>
      ))}
      <div className="w-16 h-16 sm:w-20 sm:h-20" />
      <button
        onClick={() => handleDigit('0')}
        disabled={disabled}
        className="keypad-button w-16 h-16 sm:w-20 sm:h-20 rounded-full text-lg sm:text-xl flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
        aria-label="Digit 0"
      >
        0
      </button>
      <button
        onClick={handleBackspace}
        disabled={disabled}
        className="keypad-button w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
        aria-label="Delete last digit"
      >
        ←
      </button>
    </div>
  );
}

