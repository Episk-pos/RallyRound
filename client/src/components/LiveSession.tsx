import { useState, useEffect } from 'react';
import { useSession } from '../hooks/useSession';
import type { ParticipantSignal } from '../types';
import './LiveSession.css';

interface LiveSessionProps {
  sessionId: string;
  token?: string;
}

// Signal display configuration
const SIGNAL_CONFIG: Record<ParticipantSignal, { icon: string; label: string; color: string }> = {
  hand: { icon: '✋', label: 'Raise Hand', color: '#f59e0b' },
  away: { icon: '🔇', label: 'Step Away', color: '#6b7280' },
  point_of_order: { icon: '📋', label: 'Point of Order', color: '#ef4444' },
  point_of_clarification: { icon: '📌', label: 'Clarification', color: '#8b5cf6' },
  point_of_information: { icon: 'ℹ️', label: 'Information', color: '#3b82f6' },
  question: { icon: '❓', label: 'Question', color: '#10b981' },
  agree: { icon: '✓', label: 'Agree', color: '#22c55e' },
  disagree: { icon: '✗', label: 'Disagree', color: '#ef4444' },
  move_to_vote: { icon: '🗳️', label: 'Move to Vote', color: '#6366f1' },
  table: { icon: '⏸️', label: 'Table', color: '#78716c' }
};

const STATUS_CONFIG: Record<string, { icon: string; color: string }> = {
  ready: { icon: '🟢', color: '#22c55e' },
  away: { icon: '🟡', color: '#f59e0b' },
  speaking: { icon: '🎤', color: '#3b82f6' },
  queued: { icon: '📋', color: '#8b5cf6' },
  disconnected: { icon: '🔴', color: '#ef4444' }
};

export function LiveSession({ sessionId, token }: LiveSessionProps) {
  const {
    session,
    participants,
    queue,
    agenda,
    loading,
    error,
    currentParticipant,
    isFacilitator,
    raiseSignal,
    clearSignal,
    setMode,
    setRecording,
    setSpeaker,
    nextSpeaker,
    clearQueue,
    endSession,
    addAgendaItem,
    advanceAgenda
  } = useSession({ sessionId, token });

  const [newAgendaItem, setNewAgendaItem] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  // Format time duration
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Calculate speaker time
  const [speakerTime, setSpeakerTime] = useState(0);
  useEffect(() => {
    if (!session?.speakerStartedAt) {
      setSpeakerTime(0);
      return;
    }

    const interval = setInterval(() => {
      setSpeakerTime(Math.floor((Date.now() - session.speakerStartedAt!) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [session?.speakerStartedAt]);

  // Handle action with error display
  const handleAction = async (action: () => Promise<void>) => {
    try {
      setActionError(null);
      await action();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed');
      setTimeout(() => setActionError(null), 3000);
    }
  };

  // Get available signals based on mode
  const getAvailableSignals = (): ParticipantSignal[] => {
    const basic: ParticipantSignal[] = ['hand', 'away'];
    if (session?.mode === 'structured') {
      return [
        'hand',
        'point_of_order',
        'point_of_clarification',
        'point_of_information',
        'question',
        'agree',
        'disagree',
        'away'
      ];
    }
    return basic;
  };

  // Get current speaker participant
  const currentSpeaker = participants.find(p => p.discordId === session?.speakerId);

  if (loading) {
    return (
      <div className="live-session loading">
        <div className="loading-spinner"></div>
        <p>Loading session...</p>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="live-session error">
        <h2>Session Not Found</h2>
        <p>{error || 'This session does not exist or has ended.'}</p>
      </div>
    );
  }

  if (session.status === 'ended') {
    return (
      <div className="live-session ended">
        <h2>Session Ended</h2>
        <p>This session has concluded.</p>
      </div>
    );
  }

  return (
    <div className="live-session">
      {/* Header */}
      <header className="session-header">
        <div className="session-title">
          <h1>{session.title}</h1>
          {session.isRecording && <span className="recording-badge">🔴 Recording</span>}
        </div>
        <div className="session-mode">
          Mode: <strong>{session.mode === 'structured' ? '📋 Structured' : '💬 Unstructured'}</strong>
          {session.status === 'paused' && <span className="paused-badge">⏸️ Paused</span>}
        </div>
      </header>

      {/* Error display */}
      {actionError && (
        <div className="action-error">
          {actionError}
        </div>
      )}

      <div className="session-content">
        {/* Left column: Speaker & Queue */}
        <div className="session-column left">
          {/* Current Speaker */}
          <section className="speaker-section">
            <h2>🎤 Speaker</h2>
            {currentSpeaker ? (
              <div className="current-speaker">
                <div className="speaker-avatar">
                  {currentSpeaker.discordAvatar ? (
                    <img
                      src={`https://cdn.discordapp.com/avatars/${currentSpeaker.discordId}/${currentSpeaker.discordAvatar}.png`}
                      alt={currentSpeaker.discordUsername}
                    />
                  ) : (
                    <div className="avatar-placeholder">{currentSpeaker.discordUsername[0]}</div>
                  )}
                </div>
                <div className="speaker-info">
                  <span className="speaker-name">@{currentSpeaker.discordUsername}</span>
                  <span className="speaker-time">Speaking: {formatDuration(speakerTime)}</span>
                </div>
                {isFacilitator && (
                  <button
                    className="btn btn-secondary"
                    onClick={() => handleAction(nextSpeaker)}
                  >
                    Next Speaker
                  </button>
                )}
              </div>
            ) : (
              <div className="no-speaker">
                <p>No one has the floor</p>
                {isFacilitator && queue.length > 0 && (
                  <button
                    className="btn btn-primary"
                    onClick={() => handleAction(nextSpeaker)}
                  >
                    Give Floor to Next
                  </button>
                )}
              </div>
            )}
          </section>

          {/* Queue */}
          <section className="queue-section">
            <h2>📋 Queue ({queue.length})</h2>
            {queue.length > 0 ? (
              <ul className="queue-list">
                {queue.map((entry, index) => (
                  <li key={entry.discordId} className={`queue-entry priority-${entry.priority}`}>
                    <span className="queue-position">{index + 1}.</span>
                    <span className="queue-user">@{entry.discordUsername}</span>
                    <span className="queue-signal">
                      {SIGNAL_CONFIG[entry.signal]?.icon} {SIGNAL_CONFIG[entry.signal]?.label}
                    </span>
                    {isFacilitator && (
                      <button
                        className="btn btn-sm"
                        onClick={() => handleAction(() => setSpeaker(entry.discordId))}
                      >
                        Select
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty-queue">Queue is empty</p>
            )}
            {isFacilitator && queue.length > 0 && (
              <button
                className="btn btn-danger btn-sm"
                onClick={() => handleAction(clearQueue)}
              >
                Clear Queue
              </button>
            )}
          </section>

          {/* Participants */}
          <section className="participants-section">
            <h2>👥 Participants ({participants.length})</h2>
            <ul className="participants-list">
              {participants.map(p => (
                <li key={p.discordId} className={`participant status-${p.status}`}>
                  <span className="status-icon">{STATUS_CONFIG[p.status]?.icon}</span>
                  <span className="participant-name">
                    @{p.discordUsername}
                    {p.discordId === session.facilitatorId && <span className="badge facilitator">Facilitator</span>}
                  </span>
                  {p.signal && (
                    <span className="participant-signal">
                      {SIGNAL_CONFIG[p.signal]?.icon}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* Right column: Agenda & Controls */}
        <div className="session-column right">
          {/* Agenda */}
          <section className="agenda-section">
            <h2>📝 Agenda</h2>
            {agenda && agenda.items.length > 0 ? (
              <ul className="agenda-list">
                {agenda.items.map((item) => (
                  <li
                    key={item.id}
                    className={`agenda-item status-${item.status}`}
                  >
                    <span className="agenda-status">
                      {item.status === 'completed' ? '☑️' :
                       item.status === 'active' ? '◉' :
                       item.status === 'skipped' ? '⏭️' : '○'}
                    </span>
                    <span className="agenda-title">{item.title}</span>
                    {item.duration && (
                      <span className="agenda-duration">{item.duration}min</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty-agenda">No agenda items</p>
            )}

            {/* Add agenda item */}
            <div className="add-agenda">
              <input
                type="text"
                value={newAgendaItem}
                onChange={(e) => setNewAgendaItem(e.target.value)}
                placeholder="Add agenda item..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newAgendaItem.trim()) {
                    handleAction(async () => {
                      await addAgendaItem(newAgendaItem.trim());
                      setNewAgendaItem('');
                    });
                  }
                }}
              />
              <button
                className="btn btn-sm"
                onClick={() => {
                  if (newAgendaItem.trim()) {
                    handleAction(async () => {
                      await addAgendaItem(newAgendaItem.trim());
                      setNewAgendaItem('');
                    });
                  }
                }}
              >
                Add
              </button>
            </div>

            {isFacilitator && agenda && agenda.items.some(i => i.status === 'pending' || i.status === 'active') && (
              <button
                className="btn btn-secondary"
                onClick={() => handleAction(advanceAgenda)}
              >
                Advance Agenda
              </button>
            )}
          </section>

          {/* My Controls */}
          <section className="controls-section">
            <h2>🎮 My Controls</h2>
            <div className="signal-buttons">
              {getAvailableSignals().map(signal => {
                const config = SIGNAL_CONFIG[signal];
                const isActive = currentParticipant?.signal === signal;
                return (
                  <button
                    key={signal}
                    className={`signal-btn ${isActive ? 'active' : ''}`}
                    style={{ '--signal-color': config.color } as React.CSSProperties}
                    onClick={() => handleAction(async () => {
                      if (isActive) {
                        await clearSignal();
                      } else {
                        await raiseSignal(signal);
                      }
                    })}
                  >
                    <span className="signal-icon">{config.icon}</span>
                    <span className="signal-label">{config.label}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Facilitator Controls */}
          {isFacilitator && (
            <section className="facilitator-section">
              <h2>⚙️ Facilitator Controls</h2>
              <div className="facilitator-controls">
                <div className="control-group">
                  <label>Mode:</label>
                  <button
                    className={`btn ${session.mode === 'unstructured' ? 'active' : ''}`}
                    onClick={() => handleAction(() => setMode('unstructured'))}
                  >
                    💬 Unstructured
                  </button>
                  <button
                    className={`btn ${session.mode === 'structured' ? 'active' : ''}`}
                    onClick={() => handleAction(() => setMode('structured'))}
                  >
                    📋 Structured
                  </button>
                </div>

                <div className="control-group">
                  <label>Recording:</label>
                  <button
                    className={`btn ${session.isRecording ? 'active recording' : ''}`}
                    onClick={() => handleAction(() => setRecording(!session.isRecording))}
                  >
                    {session.isRecording ? '🔴 Stop Recording' : '⚫ Start Recording'}
                  </button>
                </div>

                <div className="control-group">
                  <button
                    className="btn btn-danger"
                    onClick={() => {
                      if (confirm('Are you sure you want to end this session?')) {
                        handleAction(endSession);
                      }
                    }}
                  >
                    End Session
                  </button>
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
