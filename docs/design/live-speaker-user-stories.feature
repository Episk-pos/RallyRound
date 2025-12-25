# Live Speaker System - User Stories
# Gherkin format for comprehensive feature specification
#
# Architecture Note:
# - RallyRound: Web dashboard, session state, GunDB, REST API
# - DiscordStats: Discord bot, OAuth, sound effects, VC presence
# - Stories are tagged with @RallyRound or @DiscordStats to indicate ownership

# =============================================================================
# AUTHENTICATION (DiscordStats provides OAuth, RallyRound validates)
# =============================================================================

@DiscordStats
Feature: Discord OAuth Provider
  As the DiscordStats system
  I want to provide Discord OAuth authentication
  So that users can authenticate across both systems

  Background:
    Given the DiscordStats OAuth application is configured
    And the Discord bot has required permissions

  Scenario: OAuth initiation
    Given a user clicks "Login with Discord" on RallyRound
    When they are redirected to DiscordStats /auth/discord
    Then DiscordStats should redirect to Discord's authorization page
    And include the correct scopes (identify, guilds)

  Scenario: OAuth callback
    Given a user authorizes the Discord application
    When Discord redirects to /auth/discord/callback
    Then DiscordStats should exchange the code for tokens
    And create a session token (JWT)
    And redirect to RallyRound with the token

  Scenario: Token validation endpoint
    Given RallyRound receives a request with a token
    When RallyRound calls DiscordStats /auth/validate
    Then DiscordStats should verify the token signature
    And return the Discord user info if valid
    And return an error if invalid or expired

@RallyRound
Feature: Dashboard Authentication
  As a session participant
  I want to log in with my Discord account via the dashboard
  So that I can participate in sessions with my Discord identity

  Background:
    Given the RallyRound web dashboard is accessible
    And DiscordStats OAuth is configured

  Scenario: First-time login with Discord
    Given I am not authenticated
    When I click "Login with Discord"
    Then I should be redirected to DiscordStats OAuth
    When I complete Discord authorization
    Then I should be redirected back to RallyRound with a token
    And RallyRound should validate the token with DiscordStats
    And I should see my Discord username and avatar
    And I should have a persistent SEA cryptographic identity

  Scenario: Token validation on page load
    Given I have a token stored in localStorage
    When I load the dashboard
    Then RallyRound should validate the token with DiscordStats
    And if valid, I should be authenticated
    And if invalid, I should see the login screen

  Scenario: Logout
    Given I am authenticated
    When I click "Logout"
    Then my local token should be cleared
    And I should see the login screen

# =============================================================================
# SESSION MANAGEMENT
# =============================================================================

@DiscordStats
Feature: Session Creation via Discord Bot
  As a facilitator using Discord
  I want to create sessions via chat commands
  So that I can start sessions without leaving Discord

  Background:
    Given I am authenticated in Discord
    And the RallyRound bot is in my server
    And I am in a voice channel

  Scenario: Create session via Discord command
    When I type "!rr start Weekly Standup" in the text channel
    Then the bot should call RallyRound POST /api/sessions
    And include my Discord ID, guild ID, voice channel ID
    When RallyRound returns success
    Then the bot should post the dashboard URL in chat
    And the bot should register its webhook URL with the session

  Scenario: End session via Discord command
    Given an active session exists in this channel
    And I am the facilitator
    When I type "!rr end"
    Then the bot should call RallyRound DELETE /api/sessions/:id
    When RallyRound returns success
    Then the bot should post session summary in chat
    And the bot should leave the voice channel

  Scenario: Non-facilitator cannot end session
    Given an active session exists in this channel
    And I am NOT the facilitator
    When I type "!rr end"
    Then the bot should reply "Only the facilitator can end the session"
    And the bot should NOT call the RallyRound API

@RallyRound
Feature: Session Lifecycle API
  As the RallyRound system
  I want to manage session state
  So that both dashboard and bot can interact with sessions

  Background:
    Given the RallyRound API is running
    And a valid Discord token is provided

  Scenario: Create session via API
    When POST /api/sessions is called with valid session data
    Then a new session should be created in GunDB
    And the session should have status "active"
    And the session should have mode "unstructured" by default
    And the response should include the session ID and dashboard URL

  Scenario: Get session state via API
    Given a session exists with ID "session_123"
    When GET /api/sessions/session_123 is called
    Then the response should include full session state
    And include participants if requested
    And include queue if requested
    And include agenda if requested

  Scenario: Update session mode via API
    Given I am the facilitator of session "session_123"
    When PATCH /api/sessions/session_123 with { mode: "structured" }
    Then the session mode should update in GunDB
    And a webhook should be sent to the registered URL
    And all dashboard clients should see the update in real-time

  Scenario: End session via API
    Given I am the facilitator of session "session_123"
    When DELETE /api/sessions/session_123 is called
    Then the session status should change to "ended"
    And session statistics should be calculated
    And a webhook should be sent with session_ended event

@RallyRound
Feature: Session Dashboard View
  As a participant using the web dashboard
  I want to view and interact with the session
  So that I can participate fully

  Background:
    Given I am authenticated on the RallyRound dashboard
    And I have a valid session URL

  Scenario: Load session dashboard
    When I navigate to /live/session_123
    Then the dashboard should subscribe to GunDB for session_123
    And I should see the current session state
    And updates should appear in real-time

  Scenario: Start session from dashboard
    Given I am on the dashboard
    When I click "Start Session"
    And select my Discord server and voice channel
    And enter a session title
    Then a POST request should be made to /api/sessions
    And I should be redirected to the new session dashboard

  Scenario: Session not found
    When I navigate to /live/nonexistent_session
    Then I should see "Session not found" message
    And be offered to create a new session

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

# =============================================================================
# CROSS-SYSTEM INTEGRATION (RallyRound ↔ DiscordStats)
# =============================================================================

@Integration
Feature: Bot to API Integration
  As the DiscordStats bot
  I want to communicate with RallyRound API
  So that Discord commands affect session state

  Scenario: Signal raised via Discord updates dashboard
    Given Alice is viewing the dashboard
    And Bob is in the Discord voice channel
    When Bob types "!rr hand" in Discord
    Then the bot should call POST /api/sessions/:id/signals
    And RallyRound should update GunDB
    And Alice should see Bob's hand raised on dashboard within 1 second

  Scenario: Speaker change via Discord triggers webhook
    Given the session has a registered webhook
    And Bob is the current speaker
    When the facilitator types "!rr next"
    Then the bot should call POST /api/sessions/:id/speaker/next
    And RallyRound should update the speaker in GunDB
    And RallyRound should send a speaker_changed webhook
    And the bot should receive the webhook
    And the bot should play the transition sound

  Scenario: Dashboard action triggers Discord sound
    Given Alice is viewing the dashboard
    And sound effects are enabled
    When Alice clicks "Point of Order" on the dashboard
    Then RallyRound should update GunDB
    And RallyRound should send a signal_raised webhook to DiscordStats
    And DiscordStats should play the gavel sound in VC
    And DiscordStats should post a notification in the text channel

  Scenario: Participant joins via VC detected by bot
    Given an active session exists
    When Charlie joins the Discord voice channel
    Then DiscordStats should detect the voiceStateUpdate event
    And DiscordStats should call POST /api/sessions/:id/participants
    And RallyRound should add Charlie to the session
    And all dashboard users should see Charlie in the participant list

  Scenario: Participant leaves VC
    Given Charlie is in the session
    When Charlie leaves the Discord voice channel
    Then DiscordStats should detect the voiceStateUpdate event
    And DiscordStats should call DELETE /api/sessions/:id/participants/:id
    And if Charlie was in the queue, they should be removed
    And all dashboard users should see Charlie as "disconnected"

@Integration
Feature: Webhook Delivery and Handling
  As the RallyRound system
  I want to reliably deliver webhooks to DiscordStats
  So that Discord events are triggered correctly

  Scenario: Webhook signature verification
    Given a webhook is configured with secret "shared_secret"
    When RallyRound sends a webhook
    Then the request should include X-RallyRound-Signature header
    And the request should include X-RallyRound-Timestamp header
    When DiscordStats receives the webhook
    Then it should verify the signature matches
    And reject the webhook if signature is invalid

  Scenario: Webhook retry on failure
    Given DiscordStats is temporarily unavailable
    When RallyRound attempts to send a webhook
    And the request fails
    Then RallyRound should retry with exponential backoff
    And log the failure for debugging
    And continue session operation regardless

  Scenario: Stale webhook prevention
    Given a webhook was sent 10 minutes ago
    When DiscordStats receives the webhook now
    Then it should reject the webhook as stale
    And log a warning about timestamp mismatch

@Integration
Feature: Consistent State Across Systems
  As a participant
  I want session state to be consistent
  Whether I interact via Discord or Dashboard

  Scenario: Signal state consistent across interfaces
    Given Alice raised her hand via dashboard
    When Bob queries "!rr queue" in Discord
    Then Bob should see Alice in the queue
    And the position should match what dashboard shows

  Scenario: Agenda state consistent across interfaces
    Given the facilitator added items via dashboard
    When a participant queries "!rr agenda" in Discord
    Then they should see the same items as dashboard
    And the current item should match

  Scenario: Mode change visible everywhere
    Given the session is in "unstructured" mode
    When facilitator switches to "structured" via "!rr mode structured"
    Then dashboard should show "Structured" mode
    And structured signals should become available on dashboard
    And "!rr point order" should now work in Discord

  Scenario: Recording indicator visible everywhere
    When facilitator types "!rr record start"
    Then dashboard should show recording indicator
    And bot should announce in text channel
    And bot should play recording announcement in VC

@Integration
Feature: VC Presence as Source of Truth
  As the system
  Discord VC presence should be authoritative for who is "in" the session

  Scenario: Dashboard user not in VC shows limited status
    Given Alice is authenticated on dashboard
    But Alice is NOT in the Discord voice channel
    When Alice views the session
    Then Alice should see session state (read-only observer mode)
    But Alice should NOT be able to raise signals
    And Alice should see "Join VC to participate" message

  Scenario: User in VC can participate from either interface
    Given Bob is in the Discord voice channel
    When Bob opens the dashboard
    Then Bob should be able to raise signals from dashboard
    And Bob should be able to raise signals from Discord
    And either action should update both interfaces

  Scenario: Graceful handling when bot loses VC connection
    Given the bot is in the voice channel
    When the bot is disconnected unexpectedly
    Then the session should continue in RallyRound
    But sound effects should not play
    And the facilitator should see "Bot disconnected" warning
    When the bot reconnects
    Then it should rejoin the voice channel
    And resume sound effect functionality
