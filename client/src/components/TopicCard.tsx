import type { Topic, Interest } from '../types';
import { useAuth } from '../hooks/useAuth';

interface TopicCardProps {
  topic: Topic;
  interests: Map<string, Interest>;
  onToggleInterest: () => void;
  onSchedule?: () => void;
  onEdit?: () => void;
  schedulingProgress?: {
    participantsVoted: number;
    totalParticipants: number;
    topSlotPercentage: number;
    threshold: number;
  };
}

export function TopicCard({ topic, interests, onToggleInterest, onSchedule, onEdit, schedulingProgress }: TopicCardProps) {
  const { seaPub, isAuthenticated } = useAuth();

  // Exclude creator's interest from count (creator shouldn't count toward threshold)
  const interestCount = Array.from(interests.keys()).filter(
    (pub) => pub !== topic.presenterPub
  ).length;
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

      {topic.stage === 2 && schedulingProgress && (
        <div className="scheduling-progress">
          <div className="scheduling-stats">
            <span>{schedulingProgress.participantsVoted} / {schedulingProgress.totalParticipants} voted</span>
            <span className={schedulingProgress.topSlotPercentage >= schedulingProgress.threshold ? 'consensus-near' : ''}>
              {schedulingProgress.topSlotPercentage}% consensus
            </span>
          </div>
          <div className="progress-bar scheduling-bar">
            <div
              className="progress-fill"
              style={{
                width: `${Math.min((schedulingProgress.topSlotPercentage / schedulingProgress.threshold) * 100, 100)}%`,
                backgroundColor: schedulingProgress.topSlotPercentage >= schedulingProgress.threshold ? '#28a745' : undefined,
              }}
            />
          </div>
        </div>
      )}

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

        {topic.stage === 2 && isAuthenticated && onSchedule && (
          <button className={`btn ${isOwner ? 'btn-success' : 'btn-primary'}`} onClick={onSchedule}>
            {isOwner ? 'Manage Scheduling' : 'Vote on Times'}
          </button>
        )}

        {isOwner && onEdit && topic.stage !== 3 && (
          <button className="btn btn-secondary" onClick={onEdit}>
            Edit
          </button>
        )}

              </div>
    </div>
  );
}
