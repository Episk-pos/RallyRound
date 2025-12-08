import { useState, useMemo } from 'react';
import type { AvailabilityWindow } from '../types';

interface AvailabilityInputProps {
  availability: AvailabilityWindow[];
  onAddWindow: (window: Omit<AvailabilityWindow, 'source'>) => void;
  onRemoveWindow: (index: number) => void;
  onSyncCalendar: () => Promise<void>;
  hasCalendar: boolean;
  isLoading: boolean;
  schedulingWindowDays: number;
}

// Meeting hours: 9 AM to 6 PM
const MEETING_START_HOUR = 9;
const MEETING_END_HOUR = 18;
const SLOT_DURATION_MINUTES = 30;

export function AvailabilityInput({
  availability,
  onAddWindow,
  onRemoveWindow,
  onSyncCalendar,
  hasCalendar,
  isLoading,
  schedulingWindowDays,
}: AvailabilityInputProps) {
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  });
  const [selectedStart, setSelectedStart] = useState<string>('09:00');
  const [selectedEnd, setSelectedEnd] = useState<string>('17:00');

  // Generate date options for the scheduling window
  const dateOptions = useMemo(() => {
    const options: string[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 1; i <= schedulingWindowDays; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() + i);
      // Skip weekends
      if (date.getDay() !== 0 && date.getDay() !== 6) {
        options.push(date.toISOString().split('T')[0]);
      }
    }
    return options;
  }, [schedulingWindowDays]);

  // Generate time options (30-min intervals from 9 AM to 6 PM)
  const timeOptions = useMemo(() => {
    const options: string[] = [];
    for (let hour = MEETING_START_HOUR; hour < MEETING_END_HOUR; hour++) {
      for (let min = 0; min < 60; min += SLOT_DURATION_MINUTES) {
        options.push(`${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`);
      }
    }
    // Add end of day option
    options.push(`${MEETING_END_HOUR}:00`);
    return options;
  }, []);

  const handleAddWindow = () => {
    const [year, month, day] = selectedDate.split('-').map(Number);
    const [startHour, startMin] = selectedStart.split(':').map(Number);
    const [endHour, endMin] = selectedEnd.split(':').map(Number);

    const startDate = new Date(year, month - 1, day, startHour, startMin);
    const endDate = new Date(year, month - 1, day, endHour, endMin);

    if (endDate <= startDate) {
      alert('End time must be after start time');
      return;
    }

    onAddWindow({
      start: startDate.getTime(),
      end: endDate.getTime(),
    });
  };

  const formatDateTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const formatDateLabel = (dateStr: string) => {
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  // Separate manual vs calendar availability
  const manualWindows = availability.filter((w) => w.source === 'manual');
  const calendarWindows = availability.filter((w) => w.source === 'google');

  return (
    <div className="availability-input">
      <div className="availability-header">
        <h4>Your Availability</h4>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={onSyncCalendar}
          disabled={isLoading}
        >
          {isLoading ? 'Syncing...' : hasCalendar ? 'Re-sync Calendar' : 'Sync Google Calendar'}
        </button>
      </div>

      {hasCalendar && calendarWindows.length > 0 && (
        <div className="availability-section">
          <h5>From Google Calendar</h5>
          <p className="availability-note">
            Your free times have been imported from Google Calendar.
          </p>
          <div className="availability-summary">
            {calendarWindows.length} free time window{calendarWindows.length !== 1 ? 's' : ''} found
          </div>
        </div>
      )}

      <div className="availability-section">
        <h5>Manual Entry</h5>
        <p className="availability-note">
          {hasCalendar
            ? 'Add additional times when you are available.'
            : 'Select times when you are available to meet.'}
        </p>

        <div className="availability-form">
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="avail-date">Date</label>
              <select
                id="avail-date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              >
                {dateOptions.map((date) => (
                  <option key={date} value={date}>
                    {formatDateLabel(date)}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="avail-start">From</label>
              <select
                id="avail-start"
                value={selectedStart}
                onChange={(e) => setSelectedStart(e.target.value)}
              >
                {timeOptions.slice(0, -1).map((time) => (
                  <option key={time} value={time}>
                    {time}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="avail-end">To</label>
              <select
                id="avail-end"
                value={selectedEnd}
                onChange={(e) => setSelectedEnd(e.target.value)}
              >
                {timeOptions.slice(1).map((time) => (
                  <option key={time} value={time}>
                    {time}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleAddWindow}
            >
              Add
            </button>
          </div>
        </div>

        {manualWindows.length > 0 && (
          <div className="availability-list">
            {manualWindows.map((window, index) => (
              <div key={index} className="availability-item">
                <span>
                  {formatDateTime(window.start)} - {formatDateTime(window.end)}
                </span>
                <button
                  type="button"
                  className="btn-remove"
                  onClick={() => {
                    // Find the actual index in the full availability array
                    const actualIndex = availability.findIndex(
                      (w) => w.source === 'manual' && w.start === window.start && w.end === window.end
                    );
                    if (actualIndex !== -1) {
                      onRemoveWindow(actualIndex);
                    }
                  }}
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        )}

        {manualWindows.length === 0 && !hasCalendar && (
          <div className="availability-empty">
            No availability added yet. Add times when you can meet.
          </div>
        )}
      </div>

      <style>{`
        .availability-input {
          border: 1px solid var(--border-color);
          border-radius: 8px;
          padding: 1rem;
          margin-bottom: 1rem;
        }

        .availability-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
        }

        .availability-header h4 {
          margin: 0;
        }

        .availability-section {
          margin-bottom: 1rem;
        }

        .availability-section h5 {
          margin: 0 0 0.5rem 0;
          font-size: 0.9rem;
          color: var(--text-muted);
        }

        .availability-note {
          font-size: 0.85rem;
          color: var(--text-muted);
          margin: 0 0 0.75rem 0;
        }

        .availability-summary {
          background: var(--success-bg, #e8f5e9);
          color: var(--success-text, #2e7d32);
          padding: 0.5rem 0.75rem;
          border-radius: 4px;
          font-size: 0.85rem;
        }

        .availability-form .form-row {
          display: flex;
          gap: 0.5rem;
          align-items: flex-end;
          flex-wrap: wrap;
        }

        .availability-form .form-group {
          flex: 1;
          min-width: 100px;
        }

        .availability-form label {
          display: block;
          font-size: 0.8rem;
          margin-bottom: 0.25rem;
          color: var(--text-muted);
        }

        .availability-form select {
          width: 100%;
          padding: 0.4rem;
          border: 1px solid var(--border-color);
          border-radius: 4px;
          font-size: 0.9rem;
        }

        .availability-list {
          margin-top: 0.75rem;
        }

        .availability-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.5rem 0.75rem;
          background: var(--bg-secondary, #f5f5f5);
          border-radius: 4px;
          margin-bottom: 0.25rem;
          font-size: 0.9rem;
        }

        .btn-remove {
          background: none;
          border: none;
          font-size: 1.2rem;
          cursor: pointer;
          color: var(--text-muted);
          padding: 0 0.25rem;
        }

        .btn-remove:hover {
          color: var(--danger-color, #dc3545);
        }

        .availability-empty {
          text-align: center;
          padding: 1rem;
          color: var(--text-muted);
          font-size: 0.9rem;
          background: var(--bg-secondary, #f5f5f5);
          border-radius: 4px;
        }

        .btn-sm {
          padding: 0.4rem 0.75rem;
          font-size: 0.85rem;
        }
      `}</style>
    </div>
  );
}
