// profile-dashboard.js
class ProfileDashboard {
    constructor(profileData) {
        this.profileData = profileData;
        this.activeTab = 'summary';
        this.expanded = false;
    }

    // Calculate profile completion score
    calculateCompletionScore() {
        let score = 0;
        let total = 6; // Total possible sections

        if (this.profileData.skills && this.profileData.skills.length > 0) score++;
        if (this.profileData.experience && this.profileData.experience.length > 0) score++;
        if (this.profileData.education && this.profileData.education.length > 0) score++;
        if (this.profileData.projects && this.profileData.projects.length > 0) score++;
        if (this.profileData.interests && this.profileData.interests.length > 0) score++;
        if (this.profileData.summary && this.profileData.summary.length > 20) score++;

        return Math.round((score / total) * 100);
    }

    // Create HTML for the dashboard
    createDashboardHTML() {
        const score = this.calculateCompletionScore();
        const firstInitial = this.profileData.name ? this.profileData.name.charAt(0) : '?';

        return `
      <div class="profile-dashboard">
        <div class="dashboard-header">
          <div class="dashboard-title">
            <h1>${this.profileData.name || 'Profile'}</h1>
            <button class="dashboard-expand-btn" id="dashboard-expand-btn">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
              <span>Expand</span>
            </button>
          </div>
          <div class="dashboard-subtitle">${this.profileData.title || ''}</div>
        </div>

        <div class="dashboard-content">
          <div class="profile-card">
            <div class="profile-header">
              <div class="profile-avatar-section">
                <div class="profile-avatar">${firstInitial}</div>
                <div class="profile-info">
                  <h2>${this.profileData.name || 'Name Not Available'}</h2>
                  <p>${this.profileData.title || 'Title Not Available'}</p>
                </div>
              </div>

              <div class="profile-score">
                <div class="completion-circle">
                  <svg viewBox="0 0 36 36">
                    <path
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none"
                      stroke="#E5E7EB"
                      stroke-width="3"
                    />
                    <path
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none"
                      stroke="#3B82F6"
                      stroke-width="3"
                      stroke-dasharray="${score}, 100"
                      transform="rotate(-90, 18, 18)"
                    />
                  </svg>
                  <span class="completion-text">${score}%</span>
                </div>
                <div class="completion-label">Profile Score</div>
              </div>
            </div>

            <div class="dashboard-tabs">
              <button class="dashboard-tab active" data-tab="summary">Summary</button>
              <button class="dashboard-tab" data-tab="skills">Skills</button>
              <button class="dashboard-tab" data-tab="experience">Experience</button>
              <button class="dashboard-tab" data-tab="projects">Projects</button>
            </div>

            <div class="tab-content active" id="tab-summary">
              <p>${this.profileData.summary || 'No summary available.'}</p>

              ${this.profileData.education && this.profileData.education.length > 0 ? `
                <h3 style="margin-top: var(--space-lg); margin-bottom: var(--space-sm); font-size: 1.125rem; font-weight: 600;">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block; vertical-align: middle; margin-right: 8px; color: #3B82F6;">
                    <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path>
                  </svg>
                  Education
                </h3>
                ${this.profileData.education.map(edu => `
                  <div style="margin-bottom: var(--space-md);">
                    <p style="font-weight: 500; margin-bottom: 4px;">${edu.degree}</p>
                    <p style="color: var(--text-secondary-light); font-size: 0.875rem;">${edu.institution} • ${edu.period || 'Not specified'}</p>
                  </div>
                `).join('')}
              ` : ''}
            </div>

            <div class="tab-content" id="tab-skills">
              <h3 style="margin-bottom: var(--space-sm); font-size: 1.125rem; font-weight: 600;">Skills</h3>
              <div class="skill-tags">
                ${this.profileData.skills && this.profileData.skills.length > 0 ?
                this.profileData.skills.map(skill => `<span class="skill-tag">${skill}</span>`).join('') :
                '<p>No skills listed.</p>'
            }
              </div>

              ${this.profileData.interests && this.profileData.interests.length > 0 ? `
                <h3 style="margin-top: var(--space-lg); margin-bottom: var(--space-sm); font-size: 1.125rem; font-weight: 600;">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block; vertical-align: middle; margin-right: 8px; color: #EF4444;">
                    <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path>
                  </svg>
                  Interests
                </h3>
                <div class="skill-tags">
                  ${this.profileData.interests.map(interest => `<span class="interest-tag">${interest}</span>`).join('')}
                </div>
              ` : ''}
            </div>

            <div class="tab-content" id="tab-experience">
              ${this.profileData.experience && this.profileData.experience.length > 0 ?
                this.profileData.experience.map(exp => `
                  <div class="experience-item">
                    <h3>${exp.position}</h3>
                    <div class="experience-company">${exp.company}</div>
                    <div class="experience-period">${exp.period || 'Not specified'}</div>
                    <p>${exp.description || 'No description available.'}</p>
                  </div>
                `).join('') :
                '<p>No experience listed.</p>'
            }
            </div>

            <div class="tab-content" id="tab-projects">
              ${this.profileData.projects && this.profileData.projects.length > 0 ?
                this.profileData.projects.map(proj => `
                  <div class="project-item">
                    <h3>${proj.name}</h3>
                    <p>${proj.description || 'No description available.'}</p>
                    ${proj.technologies && proj.technologies.length > 0 ? `
                      <div class="project-technologies">
                        ${proj.technologies.map(tech => `<span class="tech-tag">${tech}</span>`).join('')}
                      </div>
                    ` : ''}
                  </div>
                `).join('') :
                '<p>No projects listed.</p>'
            }
            </div>

            <div class="recommendations-section" id="recommendations-section">
              <h3 style="margin-bottom: var(--space-sm); font-size: 1.125rem; font-weight: 600;">Recommendations</h3>
              ${this.profileData.recommendations && this.profileData.recommendations.length > 0 ?
                this.profileData.recommendations.map(rec => `
                  <div class="recommendation-item">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                    </svg>
                    ${rec}
                  </div>
                `).join('') :
                '<p>No recommendations available.</p>'
            }
            </div>

            <div class="dashboard-actions">
              <button class="btn secondary" id="share-profile-btn">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
                </svg>
                Share Profile
              </button>
              <button class="btn primary" id="view-github-btn">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"></path>
                </svg>
                View on GitHub
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
    }

    // Initialize the dashboard
    init(container) {
        // Insert the dashboard HTML
        container.innerHTML = this.createDashboardHTML();

        // Add event listeners
        this.addEventListeners();
    }

    // Set up all event listeners
    addEventListeners() {
        // Tab switching
        const tabs = document.querySelectorAll('.dashboard-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                // Update active tab
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                // Show corresponding content
                const tabName = tab.getAttribute('data-tab');
                document.querySelectorAll('.tab-content').forEach(content => {
                    content.classList.remove('active');
                });
                document.getElementById(`tab-${tabName}`).classList.add('active');

                this.activeTab = tabName;
            });
        });

        // Expand/collapse button
        const expandBtn = document.getElementById('dashboard-expand-btn');
        if (expandBtn) {
            expandBtn.addEventListener('click', () => {
                this.expanded = !this.expanded;
                const recommendationsSection = document.getElementById('recommendations-section');

                if (this.expanded) {
                    expandBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="18 15 12 9 6 15"></polyline>
            </svg>
            <span>Collapse</span>
          `;
                    recommendationsSection.classList.add('expanded');
                } else {
                    expandBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
            <span>Expand</span>
          `;
                    recommendationsSection.classList.remove('expanded');
                }
            });
        }

        // Share profile button
        const shareBtn = document.getElementById('share-profile-btn');
        if (shareBtn) {
            shareBtn.addEventListener('click', () => {
                // Create a simplified version of the profile for sharing
                const profile = this.profileData;
                const shareText = `
${profile.name} - ${profile.title}

${profile.summary}

Skills: ${profile.skills.join(', ')}

Generated with ProfilePrism
        `.trim();

                // Copy to clipboard
                const textarea = document.createElement('textarea');
                textarea.value = shareText;
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);

                alert('Profile copied to clipboard! You can now paste it wherever you want to share it.');
            });
        }

        // View on GitHub button
        const githubBtn = document.getElementById('view-github-btn');
        if (githubBtn) {
            githubBtn.addEventListener('click', () => {
                // Get the GitHub user information
                fetch('/api/github/user')
                    .then(response => response.json())
                    .then(data => {
                        if (data.html_url) {
                            window.open(data.html_url, '_blank');
                        } else {
                            alert('GitHub profile URL not available.');
                        }
                    })
                    .catch(error => {
                        console.error('Error fetching GitHub user:', error);
                        alert('Failed to get GitHub profile URL.');
                    });
            });
        }
    }
}
