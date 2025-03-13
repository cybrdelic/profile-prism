// profile-generator.js
class ProfileGenerator {
    constructor() {
        this.githubData = null;
        this.resumeData = null;
        this.profileData = null;
        this.sourceContext = null; // Store the source context that went into generation
        this.dashboardInitialized = false;

        // Analytics & Theming (extended features)
        this.analyticsLog = [];
        this.themes = {
            default: {
                primaryColor: '#3b82f6',
                secondaryColor: '#4f46e5',
                backgroundColor: '#FFFFFF',
                textColor: '#333333',
            },
            dark: {
                primaryColor: '#0A84FF',
                secondaryColor: '#1C1C1E',
                backgroundColor: '#1C1C1E',
                textColor: '#F5F5F7',
            }
        };
        this.currentTheme = this.themes.default;
    }

    /***********************
     * GitHub Data Methods *
     ***********************/
    async fetchGitHubData() {
        try {
            // Fetch user data
            const userResponse = await fetch('/api/github/user');
            if (!userResponse.ok) throw new Error('User not authenticated');
            const userData = await userResponse.json();
            this.logAnalyticsEvent('GitHubUserFetched', { user: userData.login });

            // Handle pagination: GitHub returns 30 items per page by default.
            let allRepos = [];
            let page = 1;
            const perPage = 100;
            let reposResponse;
            do {
                reposResponse = await fetch(`/api/github/repos?per_page=${perPage}&page=${page}`);
                if (!reposResponse.ok) throw new Error('Failed to fetch repositories');
                const reposPage = await reposResponse.json();
                allRepos = allRepos.concat(reposPage);
                page++;
            } while (
                reposResponse.headers.get('Link') &&
                reposResponse.headers.get('Link').includes('rel="next"')
            );

            // Filter out unwanted repos:
            // - Exclude private repos
            // - Exclude archived repos
            // - Exclude repos named "workspaceautomator" (case-insensitive)
            const repos = allRepos.filter(repo =>
                repo.private === false &&
                repo.archived === false &&
                repo.name.toLowerCase() !== 'workspaceautomator'
            );

            const reposWithReadme = await Promise.all(
                repos.map(async (repo) => {
                    try {
                        const token = sessionStorage.getItem('github_token');
                        const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
                        let readmeResponse = await fetch(`https://api.github.com/repos/${repo.full_name}/contents/README.md`, { headers });
                        if (!readmeResponse.ok) {
                            readmeResponse = await fetch(`https://api.github.com/repos/${repo.full_name}/contents/readme.md`, { headers });
                        }
                        if (readmeResponse.ok) {
                            const readmeData = await readmeResponse.json();
                            const content = readmeData.content ? atob(readmeData.content.replace(/\n/g, '')) : '';
                            return { ...repo, readme: content };
                        }
                        return { ...repo, readme: "No README available" };
                    } catch (error) {
                        console.error(`Error fetching README for ${repo.full_name}:`, error);
                        return { ...repo, readme: "Error fetching README" };
                    }
                })
            );

            this.githubData = { user: userData, repos: reposWithReadme };
            this.logAnalyticsEvent('GitHubDataFetched', { repoCount: reposWithReadme.length });
            return this.githubData;
        } catch (error) {
            console.error('Error fetching GitHub data:', error);
            this.logAnalyticsEvent('GitHubDataError', { message: error.message });
            throw error;
        }
    }

    /*********************************
     * Resume Artifact Data Methods  *
     *********************************/
    setResumeData(artifacts) {
        const resumeArtifacts = artifacts.filter(a =>
            a.type === 'application/pdf' || a.type.startsWith('image/')
        );
        this.resumeData = resumeArtifacts;
        this.logAnalyticsEvent('ResumeDataSet', { artifactCount: resumeArtifacts.length });
        return this.resumeData;
    }

    /***************************************
     * OpenAI Profile Generation Methods   *
     ***************************************/
    async generateProfile(apiKey) {
        if (!this.githubData || !this.resumeData || this.resumeData.length === 0) {
            throw new Error('GitHub data or resume data is missing');
        }
        try {
            const topRepos = this.githubData.repos.slice(0, 5);
            const userData = this.githubData.user;
            const resumeTexts = await Promise.all(
                this.resumeData.map(async artifact => {
                    if (artifact.type === 'application/pdf') {
                        return await this.extractTextFromPDF(artifact.content);
                    } else if (artifact.type.startsWith('image/')) {
                        return await this.performOCR(artifact.content);
                    }
                    return '';
                })
            );
            const combinedResumeText = resumeTexts.join('\n\n');
            this.sourceContext = { githubUser: userData, githubRepos: topRepos, resumeTexts: resumeTexts };

            // IMPORTANT: Update your prompt if you want extra fields populated.
            const prompt = `
Generate a comprehensive professional profile based on the following data:

GitHub User:
${JSON.stringify(userData, null, 2)}

GitHub Repositories (including READMEs):
${JSON.stringify(topRepos.map(repo => ({
                name: repo.name,
                description: repo.description,
                language: repo.language,
                stars: repo.stargazers_count,
                readme: repo.readme
            })), null, 2)}

Resume Information:
${combinedResumeText}

IMPORTANT INSTRUCTIONS:
- You are an expert professional resume writer experienced with tech professionals.
- DO NOT copy phrases directly from the provided data.
- Rewrite everything in your own authoritative language.
- Use active voice, powerful verbs, and quantifiable achievements.
- Highlight impact and results.
- List technical skills exactly as they appear.
- Create a clear personal brand statement in the summary.
- For experience, follow: Action → Context → Result.
- Provide strategic recommendations based on the candidate's trajectory.
- Additionally, please include the following extra fields (if applicable):
    - "targetSalary": Ideal salary range based on skills and market trends.
    - "newProjects": Recommendations for new projects.
    - "newGoals": Suggestions for new career goals.
    - "newIdeas": Innovative ideas for career advancement.
    - "newRoles": Recommendations on potential new roles.
    - "newLifePaths": Suggestions on broader career shifts or life paths.

Return your response as a JSON object in the following format:
{
  "name": "Full Name",
  "title": "Professional Title",
  "summary": "A compelling professional summary (2-3 paragraphs) that establishes unique value proposition and expertise",
  "skills": ["skill1", "skill2", ...],
  "experience": [
    {"position": "Title", "company": "Company Name", "period": "Date Range", "description": "Impactful description"},
    ...
  ],
  "education": [
    {"degree": "Degree Name", "institution": "Institution Name", "period": "Date Range"},
    ...
  ],
  "projects": [
    {"name": "Project Name", "description": "Description highlighting challenge, solution, and outcome", "technologies": ["tech1", "tech2"]},
    ...
  ],
  "interests": ["interest1", "interest2", ...],
  "recommendations": ["career recommendation 1", "career recommendation 2", ...],
  "targetSalary": "Ideal salary range",
  "newProjects": ["Project idea 1", "Project idea 2", ...],
  "newGoals": ["Career goal 1", "Career goal 2", ...],
  "newIdeas": ["Innovative idea 1", "Innovative idea 2", ...],
  "newRoles": ["Role suggestion 1", "Role suggestion 2", ...],
  "newLifePaths": ["Life path suggestion 1", "Life path suggestion 2", ...]
}
Only include information that can be inferred from the data.
      `;

            this.logAnalyticsEvent('ProfileGenerationStarted', { timestamp: Date.now() });
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                body: JSON.stringify({
                    model: 'gpt-4o',
                    messages: [{ role: 'user', content: prompt }],
                    max_tokens: 2000,
                    temperature: 0.7
                })
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`API request failed: ${errorData.error.message}`);
            }
            const data = await response.json();
            const profileContent = data.choices[0].message.content.trim();
            this.logAnalyticsEvent('ProfileGenerationResponseReceived', { length: profileContent.length });
            const jsonMatch = profileContent.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                this.profileData = JSON.parse(jsonMatch[0]);
                this.logAnalyticsEvent('ProfileDataParsed', { fields: Object.keys(this.profileData) });
                return this.profileData;
            } else {
                throw new Error('Could not extract JSON from OpenAI response');
            }
        } catch (error) {
            console.error('Error generating profile:', error);
            this.logAnalyticsEvent('ProfileGenerationError', { message: error.message });
            throw error;
        }
    }

    /***********************************
     * PDF & OCR Helper Methods        *
     ***********************************/
    async extractTextFromPDF(base64) {
        try {
            const pdfData = atob(base64.split(',')[1]);
            const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
            let text = '';
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const content = await page.getTextContent();
                text += content.items.map(item => item.str).join(' ') + '\n';
            }
            this.logAnalyticsEvent('PDFTextExtracted', { pageCount: pdf.numPages });
            return text;
        } catch (error) {
            console.error('Error extracting text from PDF:', error);
            this.logAnalyticsEvent('PDFExtractionError', { message: error.message });
            return '';
        }
    }

    async performOCR(base64) {
        try {
            if (typeof Tesseract === 'undefined') {
                await this.loadTesseract();
            }
            const { data: { text } } = await Tesseract.recognize(base64, 'eng');
            this.logAnalyticsEvent('OCREngineFinished', { length: text.length });
            return text;
        } catch (error) {
            console.error('Error performing OCR:', error);
            this.logAnalyticsEvent('OCRError', { message: error.message });
            return '';
        }
    }

    /**************************
     * Analytics & Logging    *
     **************************/
    logAnalyticsEvent(eventName, details = {}) {
        const event = {
            timestamp: new Date().toISOString(),
            event: eventName,
            details: details
        };
        this.analyticsLog.push(event);
        localStorage.setItem('profileAnalyticsLog', JSON.stringify(this.analyticsLog, null, 2));
        console.log('Analytics Event:', event);
    }

    /**************************
     * Theming & Customization*
     **************************/
    applyTheme(themeName) {
        if (this.themes[themeName]) {
            this.currentTheme = this.themes[themeName];
            document.documentElement.style.setProperty('--primary-color', this.currentTheme.primaryColor);
            document.documentElement.style.setProperty('--secondary-color', this.currentTheme.secondaryColor);
            document.documentElement.style.setProperty('--background-color', this.currentTheme.backgroundColor);
            document.documentElement.style.setProperty('--text-color', this.currentTheme.textColor);
            this.logAnalyticsEvent('ThemeApplied', { theme: themeName });
        } else {
            console.warn(`Theme ${themeName} not found`);
        }
    }

    /**************************
     * Dashboard & Rendering  *
     **************************/
    calculateCompletionScore() {
        if (!this.profileData) return 0;
        let score = 0;
        const totalSections = 6;
        if (this.profileData.skills && this.profileData.skills.length > 0) score++;
        if (this.profileData.experience && this.profileData.experience.length > 0) score++;
        if (this.profileData.education && this.profileData.education.length > 0) score++;
        if (this.profileData.projects && this.profileData.projects.length > 0) score++;
        if (this.profileData.interests && this.profileData.interests.length > 0) score++;
        if (this.profileData.summary && this.profileData.summary.length > 20) score++;
        return Math.round((score / totalSections) * 100);
    }

    loadDashboardStyles() {
        if (document.getElementById('profile-dashboard-styles')) return;
        const styleElement = document.createElement('style');
        styleElement.id = 'profile-dashboard-styles';
        styleElement.textContent = `
      /* =======================
         Profile Dashboard Styles
         ======================= */
      .profile-dashboard {
        width: 100%;
        background-color: var(--background-color, #FFFFFF);
        box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        border-radius: 16px;
        overflow: hidden;
        margin-bottom: 2rem;
      }
      .dashboard-header {
        position: relative;
        background: linear-gradient(to right, var(--primary-color, #3b82f6), var(--secondary-color, #4f46e5));
        padding: 1.5rem;
        padding-bottom: 7.5rem;
        color: #FFFFFF;
      }
      .dashboard-title {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .dashboard-title h1 {
        font-size: 2rem;
        font-weight: bold;
        margin: 0;
      }
      .dashboard-subtitle {
        font-size: 1.25rem;
        opacity: 0.9;
        margin-top: 0.75rem;
      }
      .dashboard-expand-btn {
        display: flex;
        align-items: center;
        background-color: rgba(255, 255, 255, 0.2);
        border: none;
        color: white;
        padding: 0.5rem 1rem;
        border-radius: 9999px;
        cursor: pointer;
        font-size: 0.875rem;
        transition: background-color 0.3s ease;
      }
      .dashboard-expand-btn:hover {
        background-color: rgba(255, 255, 255, 0.3);
      }
      .dashboard-expand-btn svg {
        width: 16px;
        height: 16px;
        margin-right: 0.5rem;
      }
      .dashboard-content {
        position: relative;
        margin-top: -6rem;
        padding: 0 1.5rem;
        padding-bottom: 1.5rem;
      }
      .profile-card {
        background-color: #FFFFFF;
        border-radius: 0.75rem;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
        padding: 1.5rem;
      }
      .profile-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 1.5rem;
      }
      .profile-avatar-section {
        display: flex;
        align-items: center;
      }
      .profile-avatar {
        width: 80px;
        height: 80px;
        background: linear-gradient(to right, var(--primary-color, #3b82f6), var(--secondary-color, #4f46e5));
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-size: 2rem;
        font-weight: bold;
      }
      .profile-info {
        margin-left: 1rem;
      }
      .profile-info h2 {
        font-size: 1.5rem;
        font-weight: 600;
        margin: 0;
        margin-bottom: 0.25rem;
      }
      .profile-info p {
        color: #6E6E73;
        margin: 0;
      }
      .profile-score {
        text-align: center;
      }
      .completion-circle {
        position: relative;
        width: 64px;
        height: 64px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      .completion-circle svg {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
      }
      .completion-circle .completion-text {
        font-size: 1.25rem;
        font-weight: bold;
      }
      .completion-label {
        font-size: 0.875rem;
        color: #6E6E73;
        margin-top: 0.25rem;
      }
      .dashboard-tabs {
        display: flex;
        border-bottom: 1px solid rgba(0, 0, 0, 0.1);
        margin-bottom: 1rem;
      }
      .dashboard-tab {
        padding: 0.5rem 1rem;
        font-weight: 500;
        color: #6E6E73;
        background: none;
        border: none;
        cursor: pointer;
        position: relative;
        transition: color 0.3s ease;
      }
      .dashboard-tab:hover {
        color: var(--primary-color, #3b82f6);
      }
      .dashboard-tab.active {
        color: var(--primary-color, #3b82f6);
      }
      .dashboard-tab.active::after {
        content: '';
        position: absolute;
        bottom: -1px;
        left: 0;
        width: 100%;
        height: 2px;
        background-color: var(--primary-color, #3b82f6);
      }
      .tab-content {
        display: none;
        margin-bottom: 1rem;
      }
      .tab-content.active {
        display: block;
      }
      .skill-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
      }
      .skill-tag {
        padding: 0.25rem 0.75rem;
        background-color: #eef2ff;
        color: #4f46e5;
        border-radius: 9999px;
        font-size: 0.875rem;
      }
      .interest-tag {
        padding: 0.25rem 0.75rem;
        background-color: #fef2f2;
        color: #ef4444;
        border-radius: 9999px;
        font-size: 0.875rem;
      }
      .tech-tag {
        padding: 0.25rem 0.75rem;
        background-color: #ecfdf5;
        color: #10b981;
        border-radius: 9999px;
        font-size: 0.875rem;
      }
      .experience-item {
        margin-bottom: 1rem;
        border-left: 2px solid var(--primary-color, #3b82f6);
        padding-left: 1rem;
      }
      .experience-item h3 {
        font-size: 1.125rem;
        font-weight: 500;
        margin-bottom: 0.25rem;
      }
      .experience-company {
        color: #6E6E73;
      }
      .experience-period {
        font-size: 0.875rem;
        color: #6E6E73;
        margin-bottom: 0.5rem;
      }
      .project-item {
        margin-bottom: 1rem;
        padding: 1rem;
        border: 1px solid rgba(0, 0, 0, 0.1);
        border-radius: 0.375rem;
        transition: box-shadow 0.3s ease;
      }
      .project-item:hover {
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
      }
      .project-item h3 {
        font-size: 1.125rem;
        font-weight: 500;
        margin-bottom: 0.5rem;
      }
      .project-technologies {
        display: flex;
        flex-wrap: wrap;
        gap: 0.25rem;
        margin-top: 0.5rem;
      }
      .recommendations-section {
        display: none;
        margin-top: 1rem;
        padding-top: 1rem;
        border-top: 1px solid rgba(0, 0, 0, 0.1);
      }
      .recommendations-section.expanded {
        display: block;
      }
      .recommendation-item {
        padding: 0.5rem;
        background-color: #f9fafb;
        border-radius: 0.375rem;
        margin-bottom: 0.5rem;
      }
      .recommendation-item svg {
        display: inline-block;
        width: 16px;
        height: 16px;
        margin-right: 0.25rem;
        color: #eab308;
        vertical-align: middle;
      }
      .dashboard-actions {
        margin-top: 1.5rem;
        display: flex;
        justify-content: flex-end;
        gap: 0.5rem;
      }
      .dashboard-actions button {
        display: flex;
        align-items: center;
        gap: 0.25rem;
      }
      .dashboard-actions svg {
        width: 16px;
        height: 16px;
      }
      @media (max-width: 768px) {
        .profile-header {
          flex-direction: column;
          align-items: center;
          gap: 1rem;
        }
        .dashboard-tabs {
          overflow-x: auto;
          white-space: nowrap;
          padding-bottom: 0.25rem;
        }
      }
    `;
        document.head.appendChild(styleElement);
    }

    loadTesseract() {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@2.1.4/dist/tesseract.min.js';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    /**************************
     * Rendering Methods      *
     **************************/
    renderProfile(element) {
        if (!this.profileData) {
            element.innerHTML = '<p>No profile data available. Please generate a profile first.</p>';
            return;
        }
        this.loadDashboardStyles();

        const dashboardContainer = document.createElement('div');
        dashboardContainer.id = 'profile-dashboard-container';

        const traditionalContainer = document.createElement('div');
        traditionalContainer.id = 'traditional-profile-container';
        traditionalContainer.style.display = 'none';

        this.renderTraditionalProfile(traditionalContainer);
        element.appendChild(dashboardContainer);
        element.appendChild(traditionalContainer);

        this.renderDashboard(dashboardContainer);

        const controlsContainer = document.createElement('div');
        controlsContainer.id = 'profile-controls';

        const toggleButton = document.createElement('button');
        toggleButton.id = 'toggle-profile-view';
        toggleButton.className = 'btn secondary';
        toggleButton.textContent = 'Switch to Traditional View';
        toggleButton.addEventListener('click', () => {
            const dash = document.getElementById('profile-dashboard-container');
            const trad = document.getElementById('traditional-profile-container');
            if (dash.style.display === 'none') {
                dash.style.display = 'block';
                trad.style.display = 'none';
                toggleButton.textContent = 'Switch to Traditional View';
            } else {
                dash.style.display = 'none';
                trad.style.display = 'block';
                toggleButton.textContent = 'Switch to Dashboard View';
            }
        });

        const sourceButton = document.createElement('button');
        sourceButton.id = 'view-source-context';
        sourceButton.className = 'btn secondary';
        sourceButton.textContent = 'View Source Data';
        sourceButton.addEventListener('click', () => { this.showSourceContextModal(); });

        controlsContainer.appendChild(toggleButton);
        controlsContainer.appendChild(sourceButton);
        element.appendChild(controlsContainer);
        this.logAnalyticsEvent('ProfileRendered', { view: 'both' });
    }

    renderTraditionalProfile(container) {
        const profile = this.profileData;
        container.innerHTML = `
      <div class="profile-header">
          <h2>${profile.name || 'Name Not Available'}</h2>
          <h3>${profile.title || 'Title Not Available'}</h3>
      </div>
      <section class="profile-section">
          <h3>Summary</h3>
          <p>${profile.summary || 'No summary available.'}</p>
      </section>
      <section class="profile-section">
          <h3>Skills</h3>
          <div class="skills-container">
              ${profile.skills && profile.skills.length ?
                profile.skills.map(skill => `<span class="skill-tag">${skill}</span>`).join('') :
                'No skills listed.'}
          </div>
      </section>
      <section class="profile-section">
          <h3>Experience</h3>
          ${profile.experience && profile.experience.length ?
                profile.experience.map(exp => `
              <div class="experience-item">
                  <h4>${exp.position} at ${exp.company}</h4>
                  <p class="period">${exp.period || 'Date not specified'}</p>
                  <p>${exp.description || 'No description available.'}</p>
              </div>
            `).join('') :
                '<p>No experience listed.</p>'}
      </section>
      <section class="profile-section">
          <h3>Education</h3>
          ${profile.education && profile.education.length ?
                profile.education.map(edu => `
              <div class="education-item">
                  <h4>${edu.degree}</h4>
                  <p>${edu.institution} (${edu.period || 'Date not specified'})</p>
              </div>
            `).join('') :
                '<p>No education listed.</p>'}
      </section>
      <section class="profile-section">
          <h3>Projects</h3>
          ${profile.projects && profile.projects.length ?
                profile.projects.map(proj => `
              <div class="project-item">
                  <h4>${proj.name}</h4>
                  <p>${proj.description || 'No description available.'}</p>
                  <div class="technologies">
                      ${proj.technologies && proj.technologies.length ?
                        proj.technologies.map(tech => `<span class="tech-tag">${tech}</span>`).join('') :
                        'No technologies listed.'}
                  </div>
              </div>
            `).join('') :
                '<p>No projects listed.</p>'}
      </section>
      <section class="profile-section">
          <h3>Interests</h3>
          <p>${profile.interests && profile.interests.length ?
                profile.interests.join(', ') :
                'No interests listed.'}</p>
      </section>
      <section class="profile-section">
          <h3>Recommendations</h3>
          <ul>
              ${profile.recommendations && profile.recommendations.length ?
                profile.recommendations.map(rec => `<li>${rec}</li>`).join('') :
                '<li>No recommendations available.</li>'}
          </ul>
      </section>
    `;
    }

    renderDashboard(container) {
        const profile = this.profileData;
        const score = this.calculateCompletionScore();
        const firstInitial = profile.name ? profile.name.charAt(0) : '?';

        container.innerHTML = `
      <div class="profile-dashboard">
        <div class="dashboard-header">
          <div class="dashboard-title">
            <h1>${profile.name || 'Profile'}</h1>
            <button class="dashboard-expand-btn" id="dashboard-expand-btn">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
              <span>Expand</span>
            </button>
          </div>
          <div class="dashboard-subtitle">${profile.title || ''}</div>
        </div>
        <div class="dashboard-content">
          <div class="profile-card">
            <div class="profile-header">
              <div class="profile-avatar-section">
                <div class="profile-avatar">${firstInitial}</div>
                <div class="profile-info">
                  <h2>${profile.name || 'Name Not Available'}</h2>
                  <p>${profile.title || 'Title Not Available'}</p>
                </div>
              </div>
              <div class="profile-score">
                <div class="completion-circle">
                  <svg viewBox="0 0 36 36">
                    <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#E5E7EB" stroke-width="3" />
                    <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#3B82F6" stroke-width="3" stroke-dasharray="${score}, 100" transform="rotate(-90, 18, 18)" />
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
              <button class="dashboard-tab" data-tab="extras">Extras</button>
            </div>
            <div class="tab-content active" id="tab-summary">
              <p>${profile.summary || 'No summary available.'}</p>
              ${profile.education && profile.education.length > 0 ? `
                <h3 style="margin-top: 1rem;">Education</h3>
                ${profile.education.map(edu => `
                  <div style="margin-bottom: 1rem;">
                    <p style="font-weight: 500;">${edu.degree}</p>
                    <p style="color: #6E6E73; font-size: 0.875rem;">${edu.institution} • ${edu.period || 'Not specified'}</p>
                  </div>
                `).join('')}
              ` : ''}
            </div>
            <div class="tab-content" id="tab-skills">
              <h3 style="margin-bottom: 0.5rem;">Skills</h3>
              <div class="skill-tags">
                ${profile.skills && profile.skills.length ?
                profile.skills.map(skill => `<span class="skill-tag">${skill}</span>`).join('') :
                '<p>No skills listed.</p>'}
              </div>
              ${profile.interests && profile.interests.length ? `
                <h3 style="margin-top: 1rem;">Interests</h3>
                <div class="skill-tags">
                  ${profile.interests.map(interest => `<span class="interest-tag">${interest}</span>`).join('')}
                </div>
              ` : ''}
            </div>
            <div class="tab-content" id="tab-experience">
              ${profile.experience && profile.experience.length ?
                profile.experience.map(exp => `
                  <div class="experience-item">
                    <h3>${exp.position}</h3>
                    <div class="experience-company">${exp.company}</div>
                    <div class="experience-period">${exp.period || 'Not specified'}</div>
                    <p>${exp.description || 'No description available.'}</p>
                  </div>
                `).join('') :
                '<p>No experience listed.</p>'}
            </div>
            <div class="tab-content" id="tab-projects">
              ${profile.projects && profile.projects.length ?
                profile.projects.map(proj => `
                  <div class="project-item">
                    <h3>${proj.name}</h3>
                    <p>${proj.description || 'No description available.'}</p>
                    ${proj.technologies && proj.technologies.length ? `
                      <div class="project-technologies">
                        ${proj.technologies.map(tech => `<span class="tech-tag">${tech}</span>`).join('')}
                      </div>
                    ` : ''}
                  </div>
                `).join('') :
                '<p>No projects listed.</p>'}
            </div>
            <div class="tab-content" id="tab-extras">
              <div id="recommendations-section">
                <h3 style="margin-bottom: 0.5rem;">Recommendations</h3>
                <ul>
                  ${profile.recommendations && profile.recommendations.length ?
                profile.recommendations.map(rec => `<li>${rec}</li>`).join('') :
                '<li>No recommendations available.</li>'}
                </ul>
              </div>
              <h3 style="margin-top: 1rem;">Target Salary</h3>
              <p>${profile.targetSalary || 'No salary target provided.'}</p>
              <h3 style="margin-top: 1rem;">New Projects</h3>
              <ul>
                ${profile.newProjects && profile.newProjects.length ?
                profile.newProjects.map(np => `<li>${np}</li>`).join('') :
                '<li>No new project recommendations provided.</li>'}
              </ul>
              <h3 style="margin-top: 1rem;">New Goals</h3>
              <ul>
                ${profile.newGoals && profile.newGoals.length ?
                profile.newGoals.map(ng => `<li>${ng}</li>`).join('') :
                '<li>No new career goals provided.</li>'}
              </ul>
              <h3 style="margin-top: 1rem;">New Ideas</h3>
              <ul>
                ${profile.newIdeas && profile.newIdeas.length ?
                profile.newIdeas.map(ni => `<li>${ni}</li>`).join('') :
                '<li>No new innovative ideas provided.</li>'}
              </ul>
              <h3 style="margin-top: 1rem;">New Roles</h3>
              <ul>
                ${profile.newRoles && profile.newRoles.length ?
                profile.newRoles.map(nr => `<li>${nr}</li>`).join('') :
                '<li>No new role suggestions provided.</li>'}
              </ul>
              <h3 style="margin-top: 1rem;">New Life Paths</h3>
              <ul>
                ${profile.newLifePaths && profile.newLifePaths.length ?
                profile.newLifePaths.map(nl => `<li>${nl}</li>`).join('') :
                '<li>No new life path suggestions provided.</li>'}
              </ul>
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
        this.setupDashboardEventListeners();
        this.logAnalyticsEvent('DashboardRendered', { tabs: ['summary', 'skills', 'experience', 'projects', 'extras'] });
    }

    setupDashboardEventListeners() {
        const tabs = document.querySelectorAll('.dashboard-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                const tabName = tab.getAttribute('data-tab');
                document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
                const activeContent = document.getElementById(`tab-${tabName}`);
                if (activeContent) activeContent.classList.add('active');
                this.logAnalyticsEvent('TabSwitched', { tab: tabName });
            });
        });

        // Use a separate control for expand/collapse recommendations.
        const expandBtn = document.getElementById('dashboard-expand-btn');
        if (expandBtn) {
            expandBtn.addEventListener('click', () => {
                const recommendationsSection = document.getElementById('recommendations-section');
                if (recommendationsSection) {
                    if (recommendationsSection.classList.contains('expanded')) {
                        expandBtn.innerHTML = `
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
              <span>Expand</span>
            `;
                        recommendationsSection.classList.remove('expanded');
                        this.logAnalyticsEvent('RecommendationsCollapsed');
                    } else {
                        expandBtn.innerHTML = `
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="18 15 12 9 6 15"></polyline>
              </svg>
              <span>Collapse</span>
            `;
                        recommendationsSection.classList.add('expanded');
                        this.logAnalyticsEvent('RecommendationsExpanded');
                    }
                }
            });
        }
    }

    /**************************
     * Source Context Modal   *
     **************************/
    showSourceContextModal() {
        let modal = document.getElementById('source-context-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'source-context-modal';
            modal.style.position = 'fixed';
            modal.style.top = 0;
            modal.style.left = 0;
            modal.style.width = '100%';
            modal.style.height = '100%';
            modal.style.backgroundColor = 'rgba(0,0,0,0.5)';
            modal.style.display = 'flex';
            modal.style.justifyContent = 'center';
            modal.style.alignItems = 'center';
            modal.style.zIndex = 1000;
            modal.innerHTML = `
        <div id="source-context-content" style="background: white; padding: 1.5rem; border-radius: 8px; max-width: 90%; max-height: 90%; overflow-y: auto;">
          <h2>Source Context Data</h2>
          <pre style="background: #f4f4f4; padding: 1rem; border-radius: 4px;">${JSON.stringify(this.sourceContext, null, 2)}</pre>
          <button id="close-source-modal" style="margin-top: 1rem;">Close</button>
        </div>
      `;
            document.body.appendChild(modal);
            document.getElementById('close-source-modal').addEventListener('click', () => {
                modal.style.display = 'none';
            });
        } else {
            document.querySelector('#source-context-content pre').textContent = JSON.stringify(this.sourceContext, null, 2);
            modal.style.display = 'flex';
        }
        this.logAnalyticsEvent('SourceContextModalShown');
    }
}

// Export the class for use in the main script
window.ProfileGenerator = ProfileGenerator;
