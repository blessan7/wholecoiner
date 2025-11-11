'use client';

/**
 * PINIndicator - Component for displaying 6 PIN indicator dots
 * Shows filled/unfilled dots based on PIN length
 */
export default function PINIndicator({ value = '', length }) {
  const pinLength = length !== undefined ? length : value.length;
  const filledCount = Math.min(pinLength, 6);

  return (
    <div className="flex justify-center space-x-3">
      {[0, 1, 2, 3, 4, 5].map((index) => (
        <div
          key={index}
          className={`h-4 w-4 rounded-full ${
            index < filledCount
              ? 'bg-primary'
              : 'bg-primary/30 dark:bg-primary/20'
          }`}
        />
      ))}
    </div>
  );
}

