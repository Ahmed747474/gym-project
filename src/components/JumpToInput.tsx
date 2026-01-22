import { useState, type FormEvent } from 'react';

interface JumpToInputProps {
  label: string;
  max: number;
  onJump: (value: number) => void;
}

export default function JumpToInput({ label, max, onJump }: JumpToInputProps) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError('');

    const num = parseInt(value);
    if (isNaN(num) || num < 1) {
      setError('Enter a valid number');
      return;
    }
    if (num > max) {
      setError(`Maximum is ${max}`);
      return;
    }

    onJump(num);
    setValue('');
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2">
      <div className="flex-1">
        <label className="block text-sm font-medium text-slate-400 mb-1">
          {label}
        </label>
        <div className="flex gap-2">
          <input
            type="number"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError('');
            }}
            min="1"
            max={max}
            placeholder={`1-${max}`}
            className="flex-1 px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
          />
          <button
            type="submit"
            className="px-4 py-2.5 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg transition-colors"
          >
            Go
          </button>
        </div>
        {error && (
          <p className="text-xs text-red-400 mt-1">{error}</p>
        )}
      </div>
    </form>
  );
}
