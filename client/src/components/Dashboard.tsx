import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useTopics } from '../hooks/useTopics';
import { TopicCard } from './TopicCard';
import { CreateTopicModal } from './CreateTopicModal';

export function Dashboard() {
  const { googleUser } = useAuth();
  const {
    stage1Topics,
    stage2Topics,
    scheduledTopics,
    interests,
    isLoading,
    createTopic,
    toggleInterest,
    scheduleTopic,
  } = useTopics();

  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleSchedule = async (topicId: string) => {
    // For now, schedule 1 week from now at 2 PM
    const scheduledTime = new Date();
    scheduledTime.setDate(scheduledTime.getDate() + 7);
    scheduledTime.setHours(14, 0, 0, 0);

    try {
      // TODO: Integrate with Google Calendar API
      await scheduleTopic(topicId, scheduledTime.getTime());
      alert('Session scheduled successfully!');
    } catch (error) {
      console.error('Failed to schedule:', error);
      alert('Failed to schedule session');
    }
  };

  if (isLoading) {
    return <div className="loading">Loading topics...</div>;
  }

  return (
    <section className="section">
      <div className="dashboard-header">
        <h2>Community Topics</h2>
        <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
          Create New Topic
        </button>
      </div>

      {/* Stage 1: Topics awaiting interest */}
      <div className="topics-section">
        <h3>Stage 1: Gathering Interest</h3>
        <div className="topics-grid">
          {stage1Topics.length === 0 ? (
            <p className="empty-state">No topics yet. Create one to get started!</p>
          ) : (
            stage1Topics.map((topic) => (
              <TopicCard
                key={topic.id}
                topic={topic}
                interests={interests.get(topic.id) || new Map()}
                onToggleInterest={() =>
                  toggleInterest(
                    topic.id,
                    topic.presenterPub,
                    googleUser?.name || '',
                    googleUser?.email || ''
                  )
                }
              />
            ))
          )}
        </div>
      </div>

      {/* Stage 2: Topics ready for scheduling */}
      <div className="topics-section">
        <h3>Stage 2: Ready to Schedule</h3>
        <div className="topics-grid">
          {stage2Topics.length === 0 ? (
            <p className="empty-state">
              Topics will appear here once they reach minimum participants.
            </p>
          ) : (
            stage2Topics.map((topic) => (
              <TopicCard
                key={topic.id}
                topic={topic}
                interests={interests.get(topic.id) || new Map()}
                onToggleInterest={() =>
                  toggleInterest(
                    topic.id,
                    topic.presenterPub,
                    googleUser?.name || '',
                    googleUser?.email || ''
                  )
                }
                onSchedule={() => handleSchedule(topic.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* Scheduled Topics */}
      <div className="topics-section">
        <h3>Scheduled Sessions</h3>
        <div className="topics-grid">
          {scheduledTopics.length === 0 ? (
            <p className="empty-state">No scheduled sessions yet.</p>
          ) : (
            scheduledTopics.map((topic) => (
              <TopicCard
                key={topic.id}
                topic={topic}
                interests={interests.get(topic.id) || new Map()}
                onToggleInterest={() => {}}
              />
            ))
          )}
        </div>
      </div>

      <CreateTopicModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={createTopic}
      />
    </section>
  );
}
