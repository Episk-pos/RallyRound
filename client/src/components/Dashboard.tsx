import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useTopics } from '../hooks/useTopics';
import { TopicCard } from './TopicCard';
import { CreateTopicModal } from './CreateTopicModal';
import { SchedulingPanel } from './SchedulingPanel';
import type { Topic } from '../types';

export function Dashboard() {
  const { googleUser } = useAuth();
  const {
    stage1Topics,
    stage2Topics,
    scheduledTopics,
    interests,
    isLoading,
    createTopic,
    updateTopic,
    toggleInterest,
    scheduleTopic,
  } = useTopics();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTopic, setEditingTopic] = useState<Topic | null>(null);
  const [schedulingTopic, setSchedulingTopic] = useState<Topic | null>(null);

  const handleOpenCreate = () => {
    setEditingTopic(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (topic: Topic) => {
    setEditingTopic(topic);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingTopic(null);
  };

  const handleOpenScheduling = (topic: Topic) => {
    setSchedulingTopic(topic);
  };

  const handleCloseScheduling = () => {
    setSchedulingTopic(null);
  };

  const handleScheduleConfirm = async (topicId: string, scheduledTime: number) => {
    try {
      await scheduleTopic(topicId, scheduledTime);
      setSchedulingTopic(null);
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
        <button className="btn btn-primary" onClick={handleOpenCreate}>
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
                onEdit={() => handleOpenEdit(topic)}
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
                onSchedule={() => handleOpenScheduling(topic)}
                onEdit={() => handleOpenEdit(topic)}
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
        onClose={handleCloseModal}
        onSubmit={createTopic}
        editingTopic={editingTopic}
        onUpdate={updateTopic}
      />

      {schedulingTopic && (
        <SchedulingPanel
          topic={schedulingTopic}
          isOpen={true}
          onClose={handleCloseScheduling}
          onScheduleConfirm={(scheduledTime) => handleScheduleConfirm(schedulingTopic.id, scheduledTime)}
        />
      )}
    </section>
  );
}
