import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useScheduling } from '../hooks/useScheduling';
import { useAvailability } from '../hooks/useAvailability';
import { useNotifications } from '../hooks/useNotifications';
import { AvailabilityInput } from './AvailabilityInput';
import type { Topic } from '../types';

interface SchedulingPanelProps {
  topic: Topic;
  isOpen: boolean;
  onClose: () => void;
  onScheduleConfirm: (scheduledTime: number) => void;
}

export function SchedulingPanel({ topic, isOpen, onClose, onScheduleConfirm }: SchedulingPanelProps) {
  const { googleUser, seaPub } = useAuth();
  const isOwner = seaPub === topic.presenterPub;

  const {
    slots,
    preferences,
    mySelectedSlots,
    isLoading,
    isGeneratingSlots,
    generateSlots,
    toggleSlotSelection,
    submitPreference,
    getConsensusProgress,
    isSlotGenerationLocked,
    getAvailabilityGrid,
  } = useScheduling({ topic });

  const {
    calendarAvailability,
    manualAvailability,
    fetchCalendarAvailability,
    addManualWindow,
    removeManualWindow,
    getCombinedAvailability,
    isLoading: isLoadingAvailability,
  } = useAvailability({ topicId: topic.id });

  const { notifyTopicParticipants } = useNotifications();

  const [activeTab, setActiveTab] = useState<'slots' | 'availability'>('slots');
  const [hasSubmittedAvailability, setHasSubmittedAvailability] = useState(false);

  // Load calendar availability when panel opens
  useEffect(() => {
    if (isOpen) {
      const windowDays = topic.schedulingConfig?.schedulingWindowDays || 14;
      const timeMax = new Date(Date.now() + windowDays * 24 * 60 * 60 * 1000).toISOString();
      fetchCalendarAvailability(undefined, timeMax).catch(console.error);
    }
  }, [isOpen, topic.schedulingConfig?.schedulingWindowDays, fetchCalendarAvailability]);

  // Check if current user has submitted availability
  useEffect(() => {
    if (seaPub && preferences.has(seaPub)) {
      setHasSubmittedAvailability(true);
    }
  }, [seaPub, preferences]);

  if (!isOpen) return null;

  const consensus = getConsensusProgress();
  const isLocked = isSlotGenerationLocked();
  const grid = getAvailabilityGrid();

  const handleSyncCalendar = async () => {
    const windowDays = topic.schedulingConfig?.schedulingWindowDays || 14;
    const timeMax = new Date(Date.now() + windowDays * 24 * 60 * 60 * 1000).toISOString();
    await fetchCalendarAvailability(undefined, timeMax);
  };

  const handleSubmitAvailability = async () => {
    if (!googleUser) return;

    await submitPreference(
      googleUser.name,
      googleUser.email,
      getCombinedAvailability()
    );
    setHasSubmittedAvailability(true);
    setActiveTab('slots');
  };

  const handleGenerateSlots = async () => {
    await generateSlots();
  };

  const handleConfirmSlot = async (slot: typeof slots[0]) => {
    // Notify all participants about the scheduled time
    const scheduledDate = new Date(slot.start);
    const formattedTime = scheduledDate.toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });

    // Create Google Calendar event
    try {
      const startTime = new Date(slot.start).toISOString();
      const endTime = new Date(slot.end).toISOString();

      // Collect attendee emails from preferences
      const attendees: Array<{ email: string }> = [];
      preferences.forEach((pref) => {
        if (pref.userEmail) {
          attendees.push({ email: pref.userEmail });
        }
      });

      await fetch('/auth/calendar/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          summary: `RallyRound: ${topic.title}`,
          description: `${topic.description}\n\nOrganized via RallyRound`,
          start: startTime,
          end: endTime,
          attendees,
        }),
      });

      console.log('Calendar event created successfully');
    } catch (error) {
      // Don't block scheduling if calendar event fails
      console.error('Failed to create calendar event:', error);
    }

    // Send notifications to all participants
    await notifyTopicParticipants(
      topic.id,
      topic.title,
      'scheduled',
      `Session scheduled for ${formattedTime}`,
      [seaPub || ''] // Exclude the owner from notifications
    );

    onScheduleConfirm(slot.start);
    onClose();
  };

  const formatSlotTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  return (
    <div className="modal active" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-content scheduling-panel">
        <span className="close" onClick={onClose}>&times;</span>

        <h2>Schedule: {topic.title}</h2>

        {/* Consensus Progress */}
        <div className="consensus-progress">
          <div className="progress-header">
            <span>Consensus Progress</span>
            <span className={consensus.consensusReached ? 'consensus-reached' : ''}>
              {consensus.topSlotPercentage}% / {consensus.threshold}% needed
            </span>
          </div>
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{
                width: `${Math.min((consensus.topSlotPercentage / consensus.threshold) * 100, 100)}%`,
                backgroundColor: consensus.consensusReached ? 'var(--success-color, #28a745)' : undefined,
              }}
            />
          </div>
          <div className="progress-stats">
            <span>{consensus.participantsVoted} / {consensus.totalParticipants} voted</span>
            {consensus.topSlot && (
              <span>Leading: {formatSlotTime(consensus.topSlot.start)}</span>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="tabs">
          <button
            className={`tab ${activeTab === 'slots' ? 'active' : ''}`}
            onClick={() => setActiveTab('slots')}
          >
            Time Slots ({slots.length})
          </button>
          <button
            className={`tab ${activeTab === 'availability' ? 'active' : ''}`}
            onClick={() => setActiveTab('availability')}
          >
            My Availability
          </button>
        </div>

        {/* Slots Tab */}
        {activeTab === 'slots' && (
          <div className="slots-tab">
            {!hasSubmittedAvailability && (
              <div className="availability-prompt">
                Please submit your availability first to help find the best time.
                <button className="btn btn-primary btn-sm" onClick={() => setActiveTab('availability')}>
                  Add Availability
                </button>
              </div>
            )}

            {slots.length === 0 ? (
              <div className="no-slots">
                <p>No time slots have been generated yet.</p>
                {isOwner && (
                  <button
                    className="btn btn-primary"
                    onClick={handleGenerateSlots}
                    disabled={isGeneratingSlots}
                  >
                    {isGeneratingSlots ? 'Generating...' : 'Generate Time Slots'}
                  </button>
                )}
              </div>
            ) : (
              <>
                {isOwner && !isLocked && (
                  <div className="regenerate-section">
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={handleGenerateSlots}
                      disabled={isGeneratingSlots}
                    >
                      {isGeneratingSlots ? 'Regenerating...' : 'Regenerate Slots'}
                    </button>
                    <span className="lock-warning">
                      Locked after {topic.schedulingConfig?.lockAfterSelections || 3} participants vote
                    </span>
                  </div>
                )}

                <div className="slots-list">
                  {slots.map((slot) => {
                    const isSelected = mySelectedSlots.includes(slot.id);
                    const votePercentage = consensus.totalParticipants > 0
                      ? Math.round((slot.votes.length / consensus.totalParticipants) * 100)
                      : 0;

                    return (
                      <div
                        key={slot.id}
                        className={`slot-card ${isSelected ? 'selected' : ''}`}
                        onClick={() => toggleSlotSelection(slot.id)}
                      >
                        <div className="slot-time">
                          <div className="slot-date">
                            {new Date(slot.start).toLocaleDateString(undefined, {
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric',
                            })}
                          </div>
                          <div className="slot-hours">
                            {new Date(slot.start).toLocaleTimeString(undefined, {
                              hour: 'numeric',
                              minute: '2-digit',
                            })}
                            {' - '}
                            {new Date(slot.end).toLocaleTimeString(undefined, {
                              hour: 'numeric',
                              minute: '2-digit',
                            })}
                          </div>
                        </div>

                        <div className="slot-votes">
                          <div className="vote-count">{slot.votes.length} vote{slot.votes.length !== 1 ? 's' : ''}</div>
                          <div className="vote-bar">
                            <div className="vote-fill" style={{ width: `${votePercentage}%` }} />
                          </div>
                          {slot.voterNames.length > 0 && (
                            <div className="voter-names">{slot.voterNames.join(', ')}</div>
                          )}
                        </div>

                        <div className="slot-actions">
                          {isSelected ? (
                            <span className="selected-badge">Selected</span>
                          ) : (
                            <span className="select-prompt">Click to select</span>
                          )}

                          {isOwner && (
                            <button
                              className="btn btn-success btn-sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleConfirmSlot(slot);
                              }}
                            >
                              Confirm
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* Availability Tab */}
        {activeTab === 'availability' && (
          <div className="availability-tab">
            <AvailabilityInput
              availability={getCombinedAvailability()}
              onAddWindow={addManualWindow}
              onRemoveWindow={removeManualWindow}
              onSyncCalendar={handleSyncCalendar}
              hasCalendar={calendarAvailability?.hasCalendar || false}
              isLoading={isLoadingAvailability}
              schedulingWindowDays={topic.schedulingConfig?.schedulingWindowDays || 14}
            />

            <div className="availability-actions">
              <button
                className="btn btn-primary"
                onClick={handleSubmitAvailability}
                disabled={getCombinedAvailability().length === 0}
              >
                {hasSubmittedAvailability ? 'Update Availability' : 'Submit Availability'}
              </button>
            </div>
          </div>
        )}

        {/* Participant List */}
        <div className="participants-section">
          <h4>Participants ({preferences.size})</h4>
          <div className="participants-list">
            {Array.from(preferences.values()).map((pref) => (
              <div key={pref.userPub} className="participant">
                <span className="participant-name">{pref.userName}</span>
                <span className="participant-status">
                  {pref.selectedSlots?.length || 0} slot{(pref.selectedSlots?.length || 0) !== 1 ? 's' : ''} selected
                </span>
              </div>
            ))}
            {preferences.size === 0 && (
              <div className="no-participants">No participants have submitted availability yet.</div>
            )}
          </div>
        </div>

        <style>{`
          .scheduling-panel {
            max-width: 700px;
            max-height: 90vh;
            overflow-y: auto;
          }

          .consensus-progress {
            background: var(--bg-secondary, #f5f5f5);
            padding: 1rem;
            border-radius: 8px;
            margin-bottom: 1rem;
          }

          .progress-header {
            display: flex;
            justify-content: space-between;
            margin-bottom: 0.5rem;
            font-weight: 500;
          }

          .consensus-reached {
            color: var(--success-color, #28a745);
            font-weight: bold;
          }

          .progress-stats {
            display: flex;
            justify-content: space-between;
            margin-top: 0.5rem;
            font-size: 0.85rem;
            color: var(--text-muted);
          }

          .tabs {
            display: flex;
            gap: 0.5rem;
            margin-bottom: 1rem;
            border-bottom: 1px solid var(--border-color);
            padding-bottom: 0.5rem;
          }

          .tab {
            padding: 0.5rem 1rem;
            border: none;
            background: none;
            cursor: pointer;
            font-size: 0.95rem;
            border-radius: 4px 4px 0 0;
          }

          .tab.active {
            background: var(--primary-color, #007bff);
            color: white;
          }

          .availability-prompt {
            background: var(--warning-bg, #fff3cd);
            color: var(--warning-text, #856404);
            padding: 1rem;
            border-radius: 8px;
            margin-bottom: 1rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 1rem;
          }

          .no-slots {
            text-align: center;
            padding: 2rem;
            color: var(--text-muted);
          }

          .regenerate-section {
            display: flex;
            align-items: center;
            gap: 1rem;
            margin-bottom: 1rem;
          }

          .lock-warning {
            font-size: 0.85rem;
            color: var(--text-muted);
          }

          .slots-list {
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
          }

          .slot-card {
            display: grid;
            grid-template-columns: 1fr 1fr auto;
            gap: 1rem;
            padding: 1rem;
            border: 2px solid var(--border-color);
            border-radius: 8px;
            cursor: pointer;
            transition: border-color 0.2s, background 0.2s;
          }

          .slot-card:hover {
            border-color: var(--primary-color, #007bff);
          }

          .slot-card.selected {
            border-color: var(--primary-color, #007bff);
            background: var(--primary-bg, #e7f1ff);
          }

          .slot-time {
            display: flex;
            flex-direction: column;
          }

          .slot-date {
            font-weight: 600;
          }

          .slot-hours {
            color: var(--text-muted);
            font-size: 0.9rem;
          }

          .slot-votes {
            display: flex;
            flex-direction: column;
            gap: 0.25rem;
          }

          .vote-count {
            font-size: 0.9rem;
          }

          .vote-bar {
            height: 6px;
            background: var(--border-color);
            border-radius: 3px;
            overflow: hidden;
          }

          .vote-fill {
            height: 100%;
            background: var(--success-color, #28a745);
            transition: width 0.3s;
          }

          .voter-names {
            font-size: 0.75rem;
            color: var(--text-muted);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          .slot-actions {
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            gap: 0.5rem;
          }

          .selected-badge {
            background: var(--primary-color, #007bff);
            color: white;
            padding: 0.25rem 0.5rem;
            border-radius: 4px;
            font-size: 0.8rem;
          }

          .select-prompt {
            color: var(--text-muted);
            font-size: 0.8rem;
          }

          .availability-tab {
            padding: 1rem 0;
          }

          .availability-actions {
            margin-top: 1rem;
            display: flex;
            justify-content: flex-end;
          }

          .participants-section {
            margin-top: 1.5rem;
            border-top: 1px solid var(--border-color);
            padding-top: 1rem;
          }

          .participants-section h4 {
            margin: 0 0 0.75rem 0;
          }

          .participants-list {
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
          }

          .participant {
            display: flex;
            justify-content: space-between;
            padding: 0.5rem;
            background: var(--bg-secondary, #f5f5f5);
            border-radius: 4px;
          }

          .participant-name {
            font-weight: 500;
          }

          .participant-status {
            color: var(--text-muted);
            font-size: 0.9rem;
          }

          .no-participants {
            text-align: center;
            padding: 1rem;
            color: var(--text-muted);
          }
        `}</style>
      </div>
    </div>
  );
}
