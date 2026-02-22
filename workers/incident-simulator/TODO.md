# Incident Simulator - Future Enhancement TODO

## Priority Features for Next Session

### Challenge & Depth
- [ ] **Multiple Incident Scenarios**
  - Add scenario selector (kernel patch, DDoS attack, data breach, DNS hijacking)
  - Different severity levels (P0, P1, P2) with varying complexity
  - Scenario-specific tools and metrics

- [ ] **Time Pressure Mechanics**
  - Real countdown timer showing business impact
  - Escalating consequences if not resolved quickly
  - Customer impact metrics (revenue loss, SLA breaches)

- [ ] **Randomized Events**
  - Unexpected complications during patching
  - Cascading failures between regions
  - Misleading logs requiring careful analysis

### Enhanced Gameplay
- [ ] **Scoring System**
  - Track MTTR (Mean Time To Resolution)
  - Points for correct actions, penalties for mistakes
  - Leaderboard (localStorage or database)

- [ ] **Progressive Difficulty**
  - Tutorial mode for first-time users
  - Hard mode with less hints and faster degradation
  - Expert mode with multiple concurrent incidents

- [ ] **Decision Consequences**
  - Branching paths based on user choices
  - Trade-offs (speed vs. safety)
  - Post-incident review with lessons learned

### UI/UX Improvements
- [ ] **Visual Polish**
  - Animated metrics (charts showing real-time changes)
  - Region map visualization
  - Sound effects for alerts and completions

- [ ] **Better Onboarding**
  - Interactive tutorial walkthrough
  - Contextual help tooltips
  - Command auto-completion

- [ ] **Mobile Responsiveness**
  - Responsive layout for tablets/phones
  - Touch-friendly terminal interface

### Technical Enhancements
- [ ] **Multiplayer Mode**
  - Multiple users in same incident (collaboration)
  - Role-based access (Incident Commander, SRE, Communications Lead)

- [ ] **Analytics**
  - Track common mistakes
  - Most used commands
  - Session duration and completion rate

- [ ] **Export/Sharing**
  - Share incident reports
  - Export as blog post template
  - Screenshot mode for social sharing

### Bug Fixes & Polish
- [ ] **Error Handling**
  - Better error messages for AI failures
  - Graceful degradation when services unavailable
  - Retry logic for transient failures

- [ ] **State Management**
  - Save/resume sessions
  - Better state cleanup on disconnect
  - Handle browser refresh gracefully

## Notes from Current Implementation
- AI requires wrangler login to work in production
- WebSocket handles both string and binary messages
- Assets served via `[assets]` not `[site]` for Custom Domain support
- Agent needs `onRequest` method for HTTP health checks

## Reference Links
- Current URL: https://agents.brandon-harris.com/
- Source: /workers/incident-simulator/
- Blog post: https://blog.cloudflare.com/cloudflare-delivers-on-commitment-to-cisa/
