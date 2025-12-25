# Live Speaker System - User Stories
# Gherkin format for comprehensive feature specification

# =============================================================================
# AUTHENTICATION
# =============================================================================

Feature: Discord OAuth Authentication
  As a session participant
  I want to log in with my Discord account
  So that I can participate in sessions with my Discord identity

  Background:
    Given the RallyRound web dashboard is accessible
    And the Discord OAuth application is configured

  Scenario: First-time login with Discord
    Given I am not authenticated
    When I click "Login with Discord"
    Then I should be redirected to Discord's authorization page
    And I should see the permissions being requested
    When I authorize the application
    Then I should be redirected back to the dashboard
    And I should see my Discord username and avatar
    And I should have a persistent cryptographic identity

  Scenario: Returning user login
    Given I have previously authenticated with Discord
    When I visit the dashboard
    Then I should be automatically logged in
    And I should see my Discord username and avatar

  Scenario: Logout
    Given I am authenticated
    When I click "Logout"
    Then I should be logged out of the dashboard
    And I should see the login screen

# =============================================================================
# SESSION MANAGEMENT
# =============================================================================

Feature: Session Creation and Lifecycle
  As a facilitator
  I want to create and manage live sessions
  So that I can run structured discussions

  Background:
    Given I am authenticated as a Discord user
    And I have the facilitator role in my Discord server

  Scenario: Create a new session
    Given I am in a Discord voice channel
    When I use the command "!session start Weekly Standup"
    Then a new session should be created with title "Weekly Standup"
    And the session should be in "unstructured" mode by default
    And I should be designated as the facilitator
    And a link to the web dashboard should be posted in chat

  Scenario: Start a session from web dashboard
    Given I am on the web dashboard
    And I have selected a Discord voice channel
    When I click "Start Session"
    And I enter the session title "Team Retrospective"
    Then a new session should be created
    And the Discord bot should post the session link in the text channel

  Scenario: End a session
    Given I am the facilitator of an active session
    When I use the command "!session end"
    Then the session status should change to "ended"
    And all participants should see "Session Ended" on their dashboard
    And session statistics should be saved

  Scenario: Pause and resume a session
    Given I am the facilitator of an active session
    When I use the command "!session pause"
    Then the session status should change to "paused"
    And participants should see "Session Paused" indicator
    When I use the command "!session resume"
    Then the session status should change to "active"
    And participants should see the normal session view

  Scenario: Non-facilitator cannot end session
    Given I am a participant but not the facilitator
    When I use the command "!session end"
    Then I should see an error "Only the facilitator can end the session"
    And the session should remain active

# =============================================================================
# MODE SWITCHING
# =============================================================================

Feature: Session Mode Management
  As a facilitator
  I want to switch between unstructured and structured modes
  So that I can adapt the discussion format as needed

  Background:
    Given an active session exists
    And I am the facilitator

  Scenario: Switch to structured mode
    Given the session is in "unstructured" mode
    When I use the command "!mode structured"
    Then the session mode should change to "structured"
    And all participants should see "Mode: Structured" in the dashboard header
    And the full signal palette should become available
    And a sound effect should play (if enabled)

  Scenario: Switch to unstructured mode
    Given the session is in "structured" mode
    When I use the command "!mode unstructured"
    Then the session mode should change to "unstructured"
    And all participants should see "Mode: Unstructured" in the dashboard header
    And only basic signals should be available (hand, away)
    And the speaker queue should be preserved

  Scenario: Mode change from web dashboard
    Given I am viewing the dashboard as facilitator
    When I click the mode toggle in the header
    Then the mode should switch
    And all connected clients should update in real-time

  Scenario: Pending signals when switching to unstructured
    Given the session is in "structured" mode
    And participant Alice has a "point_of_clarification" signal active
    When I switch to "unstructured" mode
    Then Alice's signal should be converted to a "hand" signal
    And Alice should be notified of the conversion

# =============================================================================
# RECORDING
# =============================================================================

Feature: Session Recording
  As a facilitator
  I want to indicate when a session is being recorded
  So that participants are aware and can consent

  Background:
    Given an active session exists
    And I am the facilitator

  Scenario: Start recording indicator
    Given recording is not active
    When I use the command "!record start"
    Then the session should show a recording indicator
    And a red dot should appear in the dashboard header
    And the bot should announce "Recording has started" in chat
    And a sound effect should play (if enabled)

  Scenario: Stop recording indicator
    Given recording is active
    When I use the command "!record stop"
    Then the recording indicator should be removed
    And the bot should announce "Recording has stopped" in chat

  Scenario: Recording indicator visible to all
    Given recording is active
    When a new participant views the dashboard
    Then they should immediately see the recording indicator

  Scenario: Recording persists across mode changes
    Given recording is active
    And the session is in "structured" mode
    When I switch to "unstructured" mode
    Then the recording indicator should still be visible

# =============================================================================
# PARTICIPANT MANAGEMENT
# =============================================================================

Feature: Participant Tracking
  As a session participant
  I want to see who is in the session
  So that I know who I'm discussing with

  Background:
    Given an active session exists
    And multiple users are in the Discord voice channel

  Scenario: Participant list shows all VC members
    Given Alice, Bob, and Carol are in the voice channel
    When I view the participant list on the dashboard
    Then I should see Alice, Bob, and Carol
    And each should show their Discord avatar
    And each should show their status indicator

  Scenario: Participant joins VC
    Given the session is active
    When Dave joins the voice channel
    Then Dave should appear in the participant list
    And Dave's status should be "ready"
    And the participant count should increase

  Scenario: Participant leaves VC
    Given Alice is in the participant list
    When Alice leaves the voice channel
    Then Alice's status should change to "disconnected"
    And if Alice was in the queue, they should be removed

  Scenario: Participant steps away
    Given I am a participant
    When I click "Step Away" or use "!away"
    Then my status should change to "away"
    And my avatar should show an AFK indicator
    When I click "I'm Back" or use "!back"
    Then my status should change to "ready"

# =============================================================================
# SPEAKER MANAGEMENT
# =============================================================================

Feature: Speaker and Floor Control
  As a facilitator
  I want to manage who has the floor
  So that discussions remain organized

  Background:
    Given an active session exists
    And I am the facilitator
    And there are participants Alice, Bob, and Carol

  Scenario: Designate initial speaker
    Given no one currently has the floor
    When I use the command "!speaker @Alice"
    Then Alice should be designated as the current speaker
    And Alice's card should show "Speaking" status
    And the speaker timer should start

  Scenario: Pass speaker to next in queue
    Given Alice is the current speaker
    And Bob and Carol are in the queue
    When I use the command "!speaker next"
    Then Bob should become the current speaker
    And Alice should return to "ready" status
    And Carol should move up in the queue

  Scenario: Speaker time tracking
    Given Alice has been speaking for 5 minutes
    When I view the speaker display
    Then I should see "Speaking: 5:00" under Alice's name

  Scenario: Clear the speaker queue
    Given there are 5 people in the queue
    When I use the command "!speaker clear"
    Then the queue should be empty
    And all queued participants should return to "ready" status
    And a notification should appear for affected participants

  Scenario: Current speaker visible to all
    Given Alice is the current speaker
    When Bob views the dashboard
    Then Bob should see Alice prominently displayed as speaker
    And Alice's card should be visually distinct

# =============================================================================
# PARTICIPANT SIGNALS
# =============================================================================

Feature: Raise Hand (Unstructured Mode)
  As a participant
  I want to raise my hand
  So that I can indicate I want to speak

  Background:
    Given an active session in "unstructured" mode
    And I am a participant named Alice

  Scenario: Raise hand via dashboard
    Given my hand is not raised
    When I click the "Raise Hand" button
    Then my signal should change to "hand"
    And I should appear in the speaker queue
    And my card should show a hand icon

  Scenario: Lower hand via dashboard
    Given my hand is raised
    When I click the "Lower Hand" button
    Then my signal should be cleared
    And I should be removed from the speaker queue

  Scenario: Raise hand via Discord command
    When I type "!hand" in the session text channel
    Then my signal should change to "hand"
    And the bot should react with ✋

  Scenario: Toggle hand via Discord command
    Given my hand is raised
    When I type "!hand" in the session text channel
    Then my signal should be cleared
    And I should be removed from the queue

Feature: Structured Mode Signals
  As a participant
  I want to use parliamentary signals
  So that I can participate in structured discourse

  Background:
    Given an active session in "structured" mode
    And I am a participant named Bob
    And Alice is the current speaker

  Scenario: Point of Order interrupts
    When I click "Point of Order" button
    Then my signal should change to "point_of_order"
    And I should be placed at the front of the queue
    And a gavel sound should play (if enabled)
    And the facilitator should see an "interrupt" indicator

  Scenario: Point of Clarification
    When I click "Point of Clarification" button
    Then my signal should change to "point_of_clarification"
    And I should be added to the queue with high priority
    And my card should show a 📌 icon

  Scenario: Point of Information
    When I click "Point of Information" button
    Then my signal should change to "point_of_information"
    And I should be added to the queue with high priority
    And my card should show an ℹ️ icon

  Scenario: Question signal
    When I click "Question" button
    Then my signal should change to "question"
    And I should be added to the queue with normal priority
    And my card should show a ❓ icon

  Scenario: Agree signal (non-queue)
    When I click "Agree" button
    Then my signal should change to "agree"
    And I should NOT be added to the queue
    And my card should show a ✓ icon
    And a small indicator should appear near the speaker

  Scenario: Disagree signal (non-queue)
    When I click "Disagree" button
    Then my signal should change to "disagree"
    And I should NOT be added to the queue
    And my card should show a ✗ icon
    And a small indicator should appear near the speaker

  Scenario: Clear own signal
    Given I have an active signal
    When I click my active signal button again
    Then my signal should be cleared
    And I should be removed from the queue if applicable

  Scenario: Structured signals unavailable in unstructured mode
    Given the session switches to "unstructured" mode
    When I view my controls
    Then I should only see "Raise Hand" and "Step Away" buttons
    And parliamentary signal buttons should be hidden

# =============================================================================
# SPEAKER QUEUE
# =============================================================================

Feature: Speaker Queue Management
  As a facilitator and participant
  I want to see and manage the speaker queue
  So that discussions flow smoothly

  Background:
    Given an active session in "structured" mode
    And multiple participants have raised signals

  Scenario: Queue displays in priority order
    Given Alice has a "point_of_order" (interrupt priority)
    And Bob has a "point_of_clarification" (high priority)
    And Carol has a "hand" (normal priority)
    When I view the queue
    Then I should see Alice first
    And Bob second
    And Carol third

  Scenario: Queue updates in real-time
    Given the queue shows Bob and Carol
    When Alice raises a Point of Order
    Then Alice should appear at the top of the queue
    And the display should update without page refresh

  Scenario: Facilitator acknowledges signal
    Given Alice is in the queue with an unacknowledged signal
    When I (facilitator) click "Acknowledge" on Alice's queue entry
    Then Alice's entry should show as acknowledged
    And Alice should see a visual indicator

  Scenario: Time in queue displayed
    Given Bob has been in the queue for 3 minutes
    When I view the queue
    Then I should see "3:00" next to Bob's entry

# =============================================================================
# AGENDA MANAGEMENT
# =============================================================================

Feature: Session Agenda
  As a facilitator
  I want to manage a session agenda
  So that discussions stay on track

  Background:
    Given an active session exists
    And I am the facilitator

  Scenario: Create agenda items
    When I click "Add Item" in the agenda panel
    And I enter "Budget Review"
    Then "Budget Review" should appear in the agenda
    And its status should be "pending"

  Scenario: Add agenda item via Discord
    When I type "!agenda add Discuss Q4 Goals"
    Then "Discuss Q4 Goals" should appear in the agenda
    And the bot should confirm the addition

  Scenario: Start an agenda item
    Given "Budget Review" is the first pending item
    When I click on "Budget Review" or use "!agenda next"
    Then "Budget Review" should become the "active" item
    And it should show as the current topic in the header
    And a timer should start for the item

  Scenario: Complete an agenda item
    Given "Budget Review" is the active item
    When I click the checkmark or use "!agenda done"
    Then "Budget Review" should be marked "completed"
    And the next pending item should become active
    And a completion sound should play (if enabled)

  Scenario: Skip an agenda item
    Given "Budget Review" is the active item
    When I use "!agenda skip"
    Then "Budget Review" should be marked "skipped"
    And the next pending item should become active

  Scenario: Reorder agenda items
    Given the agenda has items A, B, C in that order
    When I drag item C above item A
    Then the agenda should show C, A, B
    And all participants should see the updated order

  Scenario: Participants view agenda
    Given the agenda has 5 items
    When participant Alice views the dashboard
    Then Alice should see all 5 agenda items
    And Alice should see which item is currently active
    And Alice should see which items are completed

  Scenario: Participant suggests agenda item
    Given agenda suggestions are enabled
    When participant Bob uses "!agenda add New Business"
    Then "New Business" should appear as "suggested"
    And I (facilitator) should see an approval prompt
    When I approve the suggestion
    Then it should become a regular agenda item

# =============================================================================
# DISCORD BOT INTEGRATION
# =============================================================================

Feature: Discord Bot Commands
  As a Discord user
  I want to interact with the session via chat commands
  So that I can participate without leaving Discord

  Background:
    Given the RallyRound bot is in my Discord server
    And an active session exists in voice channel "General"
    And I am in the voice channel

  Scenario: View session status
    When I type "!status"
    Then the bot should reply with:
      | Field | Example Value |
      | Mode | Structured |
      | Speaker | @Alice |
      | Queue | 3 people waiting |
      | Agenda | "Budget Review" (2/5) |
      | Recording | No |

  Scenario: View current queue
    When I type "!queue show"
    Then the bot should reply with the ordered queue
    And each entry should show position, user, and signal type

  Scenario: View agenda
    When I type "!agenda show"
    Then the bot should reply with the full agenda
    And completed items should show ☑
    And the current item should show ◉
    And pending items should show ○

  Scenario: Unknown command
    When I type "!invalidcommand"
    Then the bot should reply "Unknown command. Use !help for available commands"

  Scenario: Help command
    When I type "!help"
    Then the bot should reply with a list of available commands
    And commands should be grouped by category

  Scenario: Commands outside session channel
    Given I am in a different text channel
    When I type "!hand"
    Then the bot should reply "No active session in this channel"

# =============================================================================
# SOUND EFFECTS
# =============================================================================

Feature: Audio Feedback
  As a session participant
  I want to hear audio cues for events
  So that I can stay aware without watching the screen

  Background:
    Given an active session with sound effects enabled
    And the bot is connected to voice

  Scenario: Sound on hand raise
    When participant Alice raises their hand
    Then a soft chime sound should play in the VC

  Scenario: Sound on Point of Order
    When participant Bob signals Point of Order
    Then a gavel tap sound should play in the VC

  Scenario: Sound on speaker change
    When the speaker changes from Alice to Bob
    Then a transition sound should play in the VC

  Scenario: Sound on recording start
    When the facilitator starts recording
    Then a "Recording" announcement should play

  Scenario: Sound on agenda completion
    When an agenda item is marked complete
    Then a completion ding should play

  Scenario: Disable sounds
    Given I am the facilitator
    When I use "!sfx off"
    Then sound effects should be disabled
    And participants should see "Sound effects: Off" in settings

  Scenario: Trigger manual sound
    Given I am the facilitator
    When I use "!sfx gavel"
    Then the gavel sound should play in the VC

# =============================================================================
# REAL-TIME SYNCHRONIZATION
# =============================================================================

Feature: Real-time State Sync
  As a participant
  I want all state changes to appear instantly
  So that everyone has the same view of the session

  Background:
    Given an active session exists
    And Alice and Bob are both viewing the dashboard

  Scenario: Signal sync across clients
    When Alice raises her hand on her dashboard
    Then Bob should see Alice's hand raised within 1 second
    And the facilitator should see Alice in the queue

  Scenario: Mode change syncs instantly
    When the facilitator changes mode to "structured"
    Then Alice should see the mode change immediately
    And Bob should see the mode change immediately
    And available signals should update for both

  Scenario: Agenda updates sync
    When the facilitator adds an agenda item
    Then all participants should see the new item
    And the update should occur without page refresh

  Scenario: Participant status syncs
    When Bob steps away via "!away"
    Then Alice should see Bob's status change to "away"
    And the facilitator should see the status change

  Scenario: Reconnection after disconnect
    Given Alice loses internet connection for 30 seconds
    When Alice reconnects
    Then Alice should see the current state of the session
    And any changes made during disconnect should be visible

# =============================================================================
# ERROR HANDLING
# =============================================================================

Feature: Error Handling and Edge Cases
  As a user
  I want graceful handling of errors
  So that the session can continue smoothly

  Scenario: Bot disconnects from VC
    Given the bot is playing sound effects
    When the bot is disconnected from VC
    Then an alert should appear for the facilitator
    And the session should continue without sound
    And the bot should attempt to rejoin

  Scenario: Facilitator leaves unexpectedly
    Given Alice is the facilitator
    When Alice loses connection
    Then the session should remain active
    And a "Facilitator disconnected" warning should appear
    When Alice reconnects
    Then Alice should resume facilitator controls

  Scenario: Rate limiting on signals
    When I rapidly toggle my signal 10 times in 5 seconds
    Then only the first few toggles should register
    And I should see "Please slow down" message

  Scenario: Session ends with people in queue
    Given there are 3 people in the queue
    When the facilitator ends the session
    Then all participants should see the end message
    And no error should occur due to pending signals

  Scenario: Invalid Discord user reference
    Given I am the facilitator
    When I type "!speaker @nonexistentuser"
    Then the bot should reply "User not found in session"

# =============================================================================
# ACCESSIBILITY
# =============================================================================

Feature: Accessibility
  As a user with accessibility needs
  I want the dashboard to be accessible
  So that I can fully participate

  Scenario: Keyboard navigation
    Given I am using keyboard navigation
    When I press Tab through the interface
    Then I should be able to reach all interactive elements
    And focus indicators should be clearly visible

  Scenario: Screen reader compatibility
    Given I am using a screen reader
    When I navigate the dashboard
    Then I should hear appropriate labels for all elements
    And status changes should be announced

  Scenario: Color-blind friendly indicators
    When I view participant statuses
    Then each status should have both a color AND an icon
    And icons should be distinct from each other

  Scenario: Signal buttons have labels
    When I view the signal controls
    Then each button should have visible text label
    And each button should have an icon

  Scenario: High contrast mode support
    Given my system is in high contrast mode
    When I view the dashboard
    Then all elements should remain visible and distinct
