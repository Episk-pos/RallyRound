import type { Topic, Interest } from '../types';
import { useAuth } from '../hooks/useAuth';

interface TopicCardProps {
  topic: Topic;
  interests: Map<string, Interest>;
  onToggleInterest: () => void;
  onSchedule?: () => void;
}

export function TopicCard({ topic, interests, onToggleInterest, onSchedule }: TopicCardProps) {
  const { seaPub, isAuthenticated } = useAuth();

  const interestCount = interests.size;
  const progress = topic.minParticipants
    ? (interestCount / topic.minParticipants) * 100
    : 0;
  const isInterested = seaPub ? interests.has(seaPub) : false;
  const isOwner = seaPub === topic.presenterPub;

  // Determine badge class based on progress
  let badgeClass = 'low';
  if (progress >= 100) {
    badgeClass = 'high';
  } else if (progress >= 50) {
    badgeClass = 'medium';
  }

  return (
    <div className="topic-card">
      <h4>{topic.title}</h4>
      <div className="presenter">Presented by: {topic.presenter}</div>
      <div className="description">{topic.description}</div>

      <div className="stats">
        <span>
          {interestCount} / {topic.minParticipants}
          {topic.maxParticipants ? ` (max ${topic.maxParticipants})` : ''} interested
        </span>
        <span className={`interest-badge ${badgeClass}`}>{Math.round(progress)}%</span>
      </div>

      <div className="progress-bar">
        <div
          className="progress-fill"
          style={{ width: `${Math.min(progress, 100)}%` }}
        />
      </div>

      {topic.stage === 3 && topic.scheduledTime && (
        <div className="scheduled-info">
          <span>📅 {new Date(topic.scheduledTime).toLocaleDateString()}</span>
          <span>🕐 {new Date(topic.scheduledTime).toLocaleTimeString()}</span>
          <span>Duration: {topic.duration} minutes</span>
          {topic.type === 'recurring' && <span>🔄 {topic.recurrence}</span>}
        </div>
      )}

      <div className="actions">
        {topic.stage === 1 && isAuthenticated && (
          <button
            className={`btn ${isInterested ? 'btn-warning' : 'btn-primary'}`}
            onClick={onToggleInterest}
          >
            {isInterested ? "Remove Interest" : "I'm Interested"}
          </button>
        )}

        {topic.stage === 2 && isOwner && onSchedule && (
          <button className="btn btn-success" onClick={onSchedule}>
            Schedule Session
          </button>
        )}
      </div>
    </div>
  );
}
