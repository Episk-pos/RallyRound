// Initialize GunDB
const gun = Gun({
    peers: ['http://localhost:8765/gun'],
    localStorage: true,
    radisk: true
});

// Global state
let currentUser = null;
let topics = gun.get('topics');

// DOM Elements
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const userInfo = document.getElementById('user-info');
const userName = document.getElementById('user-name');
const userAvatar = document.getElementById('user-avatar');
const welcomeSection = document.getElementById('welcome-section');
const dashboardSection = document.getElementById('dashboard-section');
const createTopicBtn = document.getElementById('create-topic-btn');
const createTopicModal = document.getElementById('create-topic-modal');
const createTopicForm = document.getElementById('create-topic-form');
const cancelTopicBtn = document.getElementById('cancel-topic-btn');
const topicTypeSelect = document.getElementById('topic-type');
const recurringOptions = document.getElementById('recurring-options');
const stage1Topics = document.getElementById('stage1-topics');
const stage2Topics = document.getElementById('stage2-topics');
const scheduledTopics = document.getElementById('scheduled-topics');

// Initialize app
async function init() {
    // Check authentication status
    await checkAuth();

    // Set up event listeners
    setupEventListeners();

    // Listen for topics updates
    if (currentUser) {
        listenForTopics();
    }
}

// Check authentication status
async function checkAuth() {
    try {
        const response = await fetch('/auth/user', {
            credentials: 'include'
        });

        if (response.ok) {
            currentUser = await response.json();
            showDashboard();
        } else {
            showWelcome();
        }
    } catch (error) {
        console.error('Auth check failed:', error);
        showWelcome();
    }

    // Check for auth success in URL
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('auth') === 'success') {
        window.history.replaceState({}, document.title, '/');
        await checkAuth();
    }
}

// Show welcome screen
function showWelcome() {
    loginBtn.style.display = 'block';
    userInfo.style.display = 'none';
    welcomeSection.style.display = 'block';
    dashboardSection.style.display = 'none';
}

// Show dashboard
function showDashboard() {
    loginBtn.style.display = 'none';
    userInfo.style.display = 'flex';
    userName.textContent = currentUser.name;
    if (currentUser.picture) {
        userAvatar.src = currentUser.picture;
    }
    welcomeSection.style.display = 'none';
    dashboardSection.style.display = 'block';
}

// Setup event listeners
function setupEventListeners() {
    // Login
    loginBtn.addEventListener('click', () => {
        window.location.href = '/auth/google';
    });

    // Logout
    logoutBtn.addEventListener('click', async () => {
        try {
            await fetch('/auth/logout', {
                method: 'POST',
                credentials: 'include'
            });
            currentUser = null;
            showWelcome();
        } catch (error) {
            console.error('Logout failed:', error);
        }
    });

    // Create topic modal
    createTopicBtn.addEventListener('click', () => {
        openModal(createTopicModal);
    });

    cancelTopicBtn.addEventListener('click', () => {
        closeModal(createTopicModal);
    });

    // Topic type change
    topicTypeSelect.addEventListener('change', (e) => {
        if (e.target.value === 'recurring') {
            recurringOptions.style.display = 'block';
        } else {
            recurringOptions.style.display = 'none';
        }
    });

    // Create topic form submission
    createTopicForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await createTopic();
    });

    // Close modals when clicking outside
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            closeModal(e.target);
        }
    });

    // Close buttons
    document.querySelectorAll('.close').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modal = e.target.closest('.modal');
            closeModal(modal);
        });
    });
}

// Open modal
function openModal(modal) {
    modal.classList.add('active');
}

// Close modal
function closeModal(modal) {
    modal.classList.remove('active');
}

// Create a new topic
async function createTopic() {
    const title = document.getElementById('topic-title').value;
    const description = document.getElementById('topic-description').value;
    const presenter = document.getElementById('topic-presenter').value;
    const minParticipants = parseInt(document.getElementById('topic-min-participants').value);
    const maxParticipants = document.getElementById('topic-max-participants').value
        ? parseInt(document.getElementById('topic-max-participants').value)
        : null;
    const duration = parseInt(document.getElementById('topic-duration').value);
    const type = document.getElementById('topic-type').value;
    const recurrence = type === 'recurring'
        ? document.getElementById('topic-recurrence').value
        : null;

    const topicId = `topic_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const topicData = {
        id: topicId,
        title,
        description,
        presenter,
        presenterEmail: currentUser.email,
        minParticipants,
        maxParticipants,
        duration,
        type,
        recurrence,
        stage: 1,
        createdAt: Date.now(),
        createdBy: currentUser.email,
        interested: {}
    };

    // Store in GunDB
    topics.get(topicId).put(topicData);

    // Reset form and close modal
    createTopicForm.reset();
    closeModal(createTopicModal);

    console.log('Topic created:', topicData);
}

// Listen for topics updates from GunDB
function listenForTopics() {
    topics.map().on((topicData, topicId) => {
        if (!topicData) return;

        // Calculate interest level
        const interestedCount = topicData.interested
            ? Object.keys(topicData.interested).length
            : 0;

        // Determine which stage the topic is in
        const stage = topicData.stage || 1;

        // Update UI based on stage
        if (stage === 1) {
            renderTopicCard(topicData, stage1Topics);
        } else if (stage === 2) {
            renderTopicCard(topicData, stage2Topics);
        } else if (topicData.scheduledTime) {
            renderScheduledTopic(topicData, scheduledTopics);
        }
    });
}

// Render a topic card
function renderTopicCard(topicData, container) {
    const existingCard = document.getElementById(`topic-${topicData.id}`);
    if (existingCard) {
        existingCard.remove();
    }

    const interestedCount = topicData.interested
        ? Object.keys(topicData.interested).length
        : 0;

    const progress = topicData.minParticipants
        ? (interestedCount / topicData.minParticipants) * 100
        : 0;

    const isInterested = topicData.interested && currentUser && topicData.interested[currentUser.email];

    const card = document.createElement('div');
    card.className = 'topic-card';
    card.id = `topic-${topicData.id}`;

    // Determine interest badge
    let badgeClass = 'low';
    if (progress >= 100) {
        badgeClass = 'high';
    } else if (progress >= 50) {
        badgeClass = 'medium';
    }

    card.innerHTML = `
        <h4>${escapeHtml(topicData.title)}</h4>
        <div class="presenter">Presented by: ${escapeHtml(topicData.presenter)}</div>
        <div class="description">${escapeHtml(topicData.description)}</div>
        <div class="stats">
            <span>${interestedCount} / ${topicData.minParticipants}${topicData.maxParticipants ? ` (max ${topicData.maxParticipants})` : ''} interested</span>
            <span class="interest-badge ${badgeClass}">${Math.round(progress)}%</span>
        </div>
        <div class="progress-bar">
            <div class="progress-fill" style="width: ${Math.min(progress, 100)}%"></div>
        </div>
        <div class="actions">
            ${topicData.stage === 1 ? `
                <button class="btn ${isInterested ? 'btn-warning' : 'btn-primary'}"
                        onclick="toggleInterest('${topicData.id}')">
                    ${isInterested ? 'Remove Interest' : 'I\'m Interested'}
                </button>
            ` : ''}
            ${topicData.stage === 2 && topicData.presenterEmail === currentUser?.email ? `
                <button class="btn btn-success" onclick="scheduleSession('${topicData.id}')">
                    Schedule Session
                </button>
            ` : ''}
        </div>
    `;

    container.appendChild(card);

    // Check if topic should move to stage 2
    if (topicData.stage === 1 && interestedCount >= topicData.minParticipants) {
        moveToStage2(topicData.id);
    }
}

// Render a scheduled topic
function renderScheduledTopic(topicData, container) {
    const existingCard = document.getElementById(`topic-${topicData.id}`);
    if (existingCard) {
        existingCard.remove();
    }

    const card = document.createElement('div');
    card.className = 'topic-card';
    card.id = `topic-${topicData.id}`;

    const scheduledDate = new Date(topicData.scheduledTime);

    card.innerHTML = `
        <h4>${escapeHtml(topicData.title)}</h4>
        <div class="presenter">Presented by: ${escapeHtml(topicData.presenter)}</div>
        <div class="description">${escapeHtml(topicData.description)}</div>
        <div class="stats">
            <span>📅 ${scheduledDate.toLocaleDateString()}</span>
            <span>🕐 ${scheduledDate.toLocaleTimeString()}</span>
        </div>
        <div class="stats">
            <span>Duration: ${topicData.duration} minutes</span>
            ${topicData.type === 'recurring' ? `<span>🔄 ${topicData.recurrence}</span>` : ''}
        </div>
    `;

    container.appendChild(card);
}

// Toggle interest in a topic
window.toggleInterest = function(topicId) {
    if (!currentUser) {
        alert('Please sign in to express interest');
        return;
    }

    const topic = topics.get(topicId);

    topic.once((topicData) => {
        if (!topicData) return;

        const interested = topicData.interested || {};
        const userEmail = currentUser.email;

        if (interested[userEmail]) {
            // Remove interest
            delete interested[userEmail];
        } else {
            // Add interest
            interested[userEmail] = {
                name: currentUser.name,
                timestamp: Date.now()
            };
        }

        topic.get('interested').put(interested);
    });
};

// Move topic to stage 2
function moveToStage2(topicId) {
    topics.get(topicId).get('stage').put(2);
    console.log(`Topic ${topicId} moved to stage 2`);
}

// Schedule a session
window.scheduleSession = async function(topicId) {
    if (!currentUser) {
        alert('Please sign in to schedule');
        return;
    }

    // Get topic data
    topics.get(topicId).once(async (topicData) => {
        if (!topicData) return;

        // Get interested participants
        const participants = topicData.interested
            ? Object.keys(topicData.interested)
            : [];

        // Fetch availability from Google Calendar
        try {
            const response = await fetch('/auth/calendar/availability', {
                credentials: 'include'
            });

            if (!response.ok) {
                alert('Failed to fetch calendar availability');
                return;
            }

            const availability = await response.json();

            // For now, just schedule at a default time
            // In a full implementation, you would analyze availability and propose times
            const scheduledTime = new Date();
            scheduledTime.setDate(scheduledTime.getDate() + 7); // Schedule 1 week from now
            scheduledTime.setHours(14, 0, 0, 0); // 2 PM

            // Create calendar event
            const eventResponse = await fetch('/auth/calendar/event', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({
                    summary: topicData.title,
                    description: `Presented by ${topicData.presenter}\n\n${topicData.description}`,
                    start: scheduledTime.toISOString(),
                    end: new Date(scheduledTime.getTime() + topicData.duration * 60000).toISOString(),
                    attendees: participants.map(email => ({ email }))
                })
            });

            if (eventResponse.ok) {
                // Update topic with scheduled time
                topics.get(topicId).put({
                    ...topicData,
                    scheduledTime: scheduledTime.getTime(),
                    stage: 3
                });

                alert('Session scheduled successfully!');
            } else {
                alert('Failed to create calendar event');
            }
        } catch (error) {
            console.error('Error scheduling session:', error);
            alert('Error scheduling session');
        }
    });
};

// Utility function to escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
