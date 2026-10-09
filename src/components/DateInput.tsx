import React, { useState, useRef, useEffect } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Check, X, Clock, Sparkles } from 'lucide-react';

export interface DatePreset {
  label: string;
  daysOffset?: number;
  monthsOffset?: number;
  special?: 'today' | 'tomorrow' | 'end_of_month' | 'end_of_next_month';
}

interface DateInputProps {
  value: string; // YYYY-MM-DD
  onChange: (dateStr: string) => void;
  label?: string;
  required?: boolean;
  min?: string;
  max?: string;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  id?: string;
  disabled?: boolean;
  showPresets?: boolean;
  customPresets?: DatePreset[];
  showRelativeBadge?: boolean;
  helperText?: string;
  align?: 'left' | 'right' | 'auto';
}

const DEFAULT_PRESETS: DatePreset[] = [
  { label: 'Today', special: 'today' },
  { label: '+7 Days', daysOffset: 7 },
  { label: '+14 Days', daysOffset: 14 },
  { label: '+1 Month', monthsOffset: 1 },
  { label: 'End of Mo.', special: 'end_of_month' },
];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const SHORT_MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

const DAYS_OF_WEEK = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

/** Safe date parser to avoid timezone offset shifts */
export function parseDateSafe(dateStr?: string): Date | null {
  if (!dateStr) return null;
  try {
    const [yearStr, monthStr, dayStr] = dateStr.split('-');
    if (!yearStr || !monthStr || !dayStr) return null;
    const y = parseInt(yearStr, 10);
    const m = parseInt(monthStr, 10) - 1;
    const d = parseInt(dayStr, 10);
    const date = new Date(y, m, d);
    return isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}

/** Helper to format date string into nice display */
export function formatFriendlyDate(dateStr: string): string {
  if (!dateStr) return '';
  const parsed = parseDateSafe(dateStr);
  if (!parsed) return dateStr;
  return `${SHORT_MONTH_NAMES[parsed.getMonth()]} ${parsed.getDate()}, ${parsed.getFullYear()}`;
}

/** Helper to get relative label like "Today", "Tomorrow", "In 3 days", "2 days ago" */
export function getRelativeDateLabel(dateStr: string): string | null {
  if (!dateStr) return null;
  const target = parseDateSafe(dateStr);
  if (!target) return null;
  target.setHours(0, 0, 0, 0);

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const diffTime = target.getTime() - now.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  if (diffDays > 1 && diffDays <= 7) return `In ${diffDays}d`;
  if (diffDays > 7 && diffDays <= 30) return `In ${Math.round(diffDays / 7)}w`;
  if (diffDays < -1 && diffDays >= -7) return `${Math.abs(diffDays)}d ago`;
  return null;
}

/** Compute ISO string YYYY-MM-DD from a Date object in local time */
export function toLocalIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default function DateInput({
  value,
  onChange,
  label,
  required = false,
  min,
  max,
  placeholder = 'Select date...',
  className = '',
  inputClassName = '',
  id,
  disabled = false,
  showPresets = true,
  customPresets,
  showRelativeBadge = true,
  helperText,
  align = 'auto',
}: DateInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const nativeInputRef = useRef<HTMLInputElement>(null);

  // Compute view date for the calendar from current value, min, or today
  const resolveTargetDate = () => {
    return parseDateSafe(value) || parseDateSafe(min) || new Date();
  };

  const [viewDate, setViewDate] = useState<Date>(() => {
    const target = resolveTargetDate();
    return new Date(target.getFullYear(), target.getMonth(), 1);
  });

  // Sync viewDate whenever value changes
  useEffect(() => {
    if (value) {
      const target = parseDateSafe(value);
      if (target) {
        setViewDate(new Date(target.getFullYear(), target.getMonth(), 1));
      }
    }
  }, [value]);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const viewYear = viewDate.getFullYear();
  const viewMonth = viewDate.getMonth();

  // Open & initialize view date synchronously to avoid stale view
  const handleToggleOpen = () => {
    if (disabled) return;
    if (!isOpen) {
      const target = resolveTargetDate();
      setViewDate(new Date(target.getFullYear(), target.getMonth(), 1));
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  };

  // Navigation handlers
  const handlePrevMonth = () => {
    setViewDate(new Date(viewYear, viewMonth - 1, 1));
  };

  const handleNextMonth = () => {
    setViewDate(new Date(viewYear, viewMonth + 1, 1));
  };

  const handleYearChange = (newYear: number) => {
    setViewDate(new Date(newYear, viewMonth, 1));
  };

  const handleMonthChange = (newMonth: number) => {
    setViewDate(new Date(viewYear, newMonth, 1));
  };

  // Generate days for the month grid
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayIndex = new Date(viewYear, viewMonth, 1).getDay(); // 0 is Sunday
  const prevMonthDays = new Date(viewYear, viewMonth, 0).getDate();

  const daysList: { day: number; isCurrentMonth: boolean; dateStr: string; isDisabled: boolean }[] = [];

  // Previous month filler days
  for (let i = firstDayIndex - 1; i >= 0; i--) {
    const d = prevMonthDays - i;
    const prevDate = new Date(viewYear, viewMonth - 1, d);
    const dateStr = toLocalIsoDate(prevDate);
    const isDisabled = (min && dateStr < min) || (max && dateStr > max);
    daysList.push({ day: d, isCurrentMonth: false, dateStr, isDisabled: !!isDisabled });
  }

  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    const curDate = new Date(viewYear, viewMonth, d);
    const dateStr = toLocalIsoDate(curDate);
    const isDisabled = (min && dateStr < min) || (max && dateStr > max);
    daysList.push({ day: d, isCurrentMonth: true, dateStr, isDisabled: !!isDisabled });
  }

  // Next month filler days (fill up to 42 cells total for consistent grid)
  const remainingCells = 42 - daysList.length;
  for (let d = 1; d <= remainingCells; d++) {
    const nextDate = new Date(viewYear, viewMonth + 1, d);
    const dateStr = toLocalIsoDate(nextDate);
    const isDisabled = (min && dateStr < min) || (max && dateStr > max);
    daysList.push({ day: d, isCurrentMonth: false, dateStr, isDisabled: !!isDisabled });
  }

  // Handle selecting a date
  const handleSelectDate = (dateStr: string) => {
    onChange(dateStr);
    const parsed = parseDateSafe(dateStr);
    if (parsed) {
      setViewDate(new Date(parsed.getFullYear(), parsed.getMonth(), 1));
    }
    setIsOpen(false);
  };

  // Handle Preset Clicks (offsets based on min / issueDate or value or today)
  const handleApplyPreset = (preset: DatePreset) => {
    const baseDate = parseDateSafe(min) || parseDateSafe(value) || new Date();
    const target = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());

    if (preset.special === 'today') {
      const today = new Date();
      onChange(toLocalIsoDate(today));
      setViewDate(new Date(today.getFullYear(), today.getMonth(), 1));
    } else if (preset.special === 'tomorrow') {
      const tom = new Date();
      tom.setDate(tom.getDate() + 1);
      onChange(toLocalIsoDate(tom));
      setViewDate(new Date(tom.getFullYear(), tom.getMonth(), 1));
    } else if (preset.special === 'end_of_month') {
      const endMonth = new Date(target.getFullYear(), target.getMonth() + 1, 0);
      onChange(toLocalIsoDate(endMonth));
      setViewDate(new Date(endMonth.getFullYear(), endMonth.getMonth(), 1));
    } else if (preset.special === 'end_of_next_month') {
      const endNextMonth = new Date(target.getFullYear(), target.getMonth() + 2, 0);
      onChange(toLocalIsoDate(endNextMonth));
      setViewDate(new Date(endNextMonth.getFullYear(), endNextMonth.getMonth(), 1));
    } else if (preset.daysOffset !== undefined) {
      target.setDate(target.getDate() + preset.daysOffset);
      onChange(toLocalIsoDate(target));
      setViewDate(new Date(target.getFullYear(), target.getMonth(), 1));
    } else if (preset.monthsOffset !== undefined) {
      target.setMonth(target.getMonth() + preset.monthsOffset);
      onChange(toLocalIsoDate(target));
      setViewDate(new Date(target.getFullYear(), target.getMonth(), 1));
    }
    setIsOpen(false);
  };

  const todayStr = toLocalIsoDate(new Date());
  const relativeLabel = getRelativeDateLabel(value);
  const presetsToUse = customPresets || DEFAULT_PRESETS;

  // Year options for dropdown: +/- 10 years around current viewYear
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 21 }, (_, idx) => currentYear - 5 + idx);

  // Determine popover alignment class
  const alignClass = align === 'right' 
    ? 'right-0' 
    : align === 'left' 
    ? 'left-0' 
    : 'left-0 sm:right-0 sm:left-auto';

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {/* Label */}
      {label && (
        <div className="flex items-center justify-between mb-1">
          <label 
            htmlFor={id} 
            className="block text-[9.5px] font-bold text-slate-500 uppercase tracking-wider"
          >
            {label} {required && <span className="text-rose-500 font-bold">*</span>}
          </label>
          {showRelativeBadge && relativeLabel && (
            <span className={`text-[8.5px] font-bold px-1.5 py-0.2 rounded-full ${
              relativeLabel === 'Today' 
                ? 'bg-sky-100 text-sky-700 border border-sky-200' 
                : relativeLabel === 'Tomorrow' || relativeLabel.startsWith('In ')
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-slate-100 text-slate-600'
            }`}>
              {relativeLabel}
            </span>
          )}
        </div>
      )}

      {/* Main Input Display Trigger */}
      <div 
        id={id}
        tabIndex={disabled ? -1 : 0}
        onClick={handleToggleOpen}
        onKeyDown={(e) => {
          if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            handleToggleOpen();
          }
        }}
        className={`group w-full flex items-center justify-between gap-2 bg-slate-50 hover:bg-white focus:bg-white border rounded-xl py-2 px-3 text-xs transition-all cursor-pointer select-none outline-none ${
          isOpen 
            ? 'border-slate-800 ring-2 ring-slate-800/10 bg-white shadow-xs' 
            : 'border-slate-200 hover:border-slate-300'
        } ${disabled ? 'opacity-50 cursor-not-allowed bg-slate-100' : ''} ${inputClassName}`}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className={`p-1 rounded-lg transition-colors shrink-0 ${
            value ? 'bg-sky-50 text-sky-600' : 'bg-slate-100 text-slate-400 group-hover:text-slate-600'
          }`}>
            <CalendarIcon className="w-3.5 h-3.5" />
          </div>
          
          <div className="truncate flex items-center gap-1.5">
            {value ? (
              <>
                <span className="font-semibold text-slate-900 tracking-tight">
                  {formatFriendlyDate(value)}
                </span>
                <span className="text-[10px] text-slate-400 font-mono hidden xs:inline">
                  ({value})
                </span>
              </>
            ) : (
              <span className="text-slate-400 font-normal">
                {placeholder}
              </span>
            )}
          </div>
        </div>

        {/* Action icons / Clear */}
        <div className="flex items-center gap-1 shrink-0">
          {value && !required && !disabled && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange('');
              }}
              title="Clear date"
              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          )}
          <span className={`text-[10px] text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180 text-slate-700' : ''}`}>
            ▼
          </span>
        </div>
      </div>

      {helperText && (
        <p className="text-[9px] text-slate-400 mt-1 pl-0.5">{helperText}</p>
      )}

      {/* Hidden Native Input fallback for form validation & autofill */}
      <input
        ref={nativeInputRef}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        min={min}
        max={max}
        tabIndex={-1}
        className="sr-only"
        aria-hidden="true"
      />

      {/* Modern Popover Calendar UI */}
      {isOpen && (
        <div className={`absolute top-full mt-1.5 z-50 w-[290px] xs:w-[310px] sm:w-[320px] max-w-[calc(100vw-28px)] bg-white rounded-2xl border border-slate-200 shadow-2xl p-3 sm:p-3.5 animate-fade-in text-slate-800 ${alignClass}`}>
          {/* Quick Presets Bar */}
          {showPresets && (
            <div className="flex items-center gap-1 pb-2.5 mb-2.5 border-b border-slate-100 overflow-x-auto no-scrollbar">
              <span className="text-[8px] font-black uppercase text-slate-400 tracking-wider shrink-0 flex items-center gap-0.5 mr-0.5">
                <Sparkles className="w-2.5 h-2.5 text-amber-500" />
                Quick:
              </span>
              {presetsToUse.map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleApplyPreset(preset)}
                  className="shrink-0 bg-slate-50 hover:bg-slate-900 hover:text-white text-slate-600 text-[9px] font-bold px-2 py-1 rounded-lg border border-slate-200 transition-all active:scale-95 cursor-pointer whitespace-nowrap"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          )}

          {/* Month & Year Controls */}
          <div className="flex items-center justify-between gap-1 mb-2 px-0.5">
            <div className="flex items-center gap-1">
              {/* Month Select */}
              <select
                value={viewMonth}
                onChange={(e) => handleMonthChange(Number(e.target.value))}
                className="bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold py-1 px-2 rounded-lg cursor-pointer focus:outline-none border-none"
              >
                {MONTH_NAMES.map((name, mIdx) => (
                  <option key={mIdx} value={mIdx}>
                    {name}
                  </option>
                ))}
              </select>

              {/* Year Select */}
              <select
                value={viewYear}
                onChange={(e) => handleYearChange(Number(e.target.value))}
                className="bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold py-1 px-2 rounded-lg cursor-pointer focus:outline-none border-none font-mono"
              >
                {yearOptions.map((yr) => (
                  <option key={yr} value={yr}>
                    {yr}
                  </option>
                ))}
              </select>
            </div>

            {/* Prev / Next buttons */}
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={handlePrevMonth}
                title="Previous Month"
                className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleNextMonth}
                title="Next Month"
                className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Day of Week Headers */}
          <div className="grid grid-cols-7 gap-1 text-center mb-1 text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">
            {DAYS_OF_WEEK.map((d, i) => (
              <div key={i} className={`py-0.5 ${i === 0 || i === 6 ? 'text-slate-300' : ''}`}>
                {d}
              </div>
            ))}
          </div>

          {/* Calendar Day Cells */}
          <div className="grid grid-cols-7 gap-1">
            {daysList.map((item, idx) => {
              const isSelected = item.dateStr === value;
              const isToday = item.dateStr === todayStr;

              let cellStyle = 'text-slate-700 hover:bg-slate-100 hover:text-slate-900';

              if (item.isDisabled) {
                cellStyle = 'opacity-20 cursor-not-allowed text-slate-300 pointer-events-none';
              } else if (isSelected) {
                cellStyle = 'bg-slate-900 text-white font-bold shadow-xs hover:bg-slate-800 scale-105';
              } else if (!item.isCurrentMonth) {
                cellStyle = 'text-slate-300 hover:bg-slate-50 hover:text-slate-500';
              } else if (isToday) {
                cellStyle = 'bg-sky-50 text-sky-700 font-bold border border-sky-200 hover:bg-sky-100';
              }

              return (
                <button
                  key={idx}
                  type="button"
                  disabled={item.isDisabled}
                  onClick={() => !item.isDisabled && handleSelectDate(item.dateStr)}
                  className={`h-7 sm:h-8 w-full rounded-xl flex flex-col items-center justify-center text-xs transition-all relative cursor-pointer ${cellStyle}`}
                >
                  <span className="leading-none">{item.day}</span>
                  {isToday && !isSelected && (
                    <span className="w-1 h-1 rounded-full bg-sky-500 absolute bottom-1" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Footer with Today / Clear / Done */}
          <div className="flex items-center justify-between pt-2.5 mt-2.5 border-t border-slate-100 text-[10px]">
            <button
              type="button"
              onClick={() => handleSelectDate(todayStr)}
              className="text-sky-600 hover:text-sky-800 font-bold hover:underline cursor-pointer flex items-center gap-1"
            >
              <Clock className="w-3 h-3" /> Jump to Today
            </button>

            <div className="flex items-center gap-1.5">
              {value && (
                <button
                  type="button"
                  onClick={() => {
                    onChange('');
                    setIsOpen(false);
                  }}
                  className="px-2.5 py-1 text-slate-500 hover:text-rose-600 font-semibold rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-3 py-1 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1"
              >
                <Check className="w-3 h-3" /> Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
