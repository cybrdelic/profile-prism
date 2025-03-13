// profile-generator.js
class ProfileGenerator {
    constructor() {
        this.githubData = null;
        this.resumeData = null;
        this.profileData = null;
        this.sourceContext = null; // Store the source context that went into generation
    }

    // Fetch GitHub repositories for the authenticated user
    async fetchGitHubData() {
        try {
            // First check if user is authenticated
            const userResponse = await fetch('/api/github/user');
            if (!userResponse.ok) {
                throw new Error('User not authenticated');
            }

            // Fetch user data
            const userData = await userResponse.json();

            // Fetch repositories
            const reposResponse = await fetch('/api/github/repos');
            if (!reposResponse.ok) {
                throw new Error('Failed to fetch repositories');
            }

            this.githubData = {
                user: userData,
                repos: await reposResponse.json()
            };

            return this.githubData;
        } catch (error) {
            console.error('Error fetching GitHub data:', error);
            throw error;
        }
    }

    // Extract data from resume artifacts
    setResumeData(artifacts) {
        // Filter to only get PDFs and images
        const resumeArtifacts = artifacts.filter(a =>
            a.type === 'application/pdf' || a.type.startsWith('image/')
        );

        this.resumeData = resumeArtifacts;
        return this.resumeData;
    }

    // Generate a comprehensive profile using OpenAI
    async generateProfile(apiKey) {
        if (!this.githubData || !this.resumeData || this.resumeData.length === 0) {
            throw new Error('GitHub data or resume data is missing');
        }

        try {
            // Prepare the prompt with GitHub and resume data
            const topRepos = this.githubData.repos.slice(0, 5); // Limit to top 5 repos
            const userData = this.githubData.user;

            // Get text from all resume artifacts
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

            // Store the source context for transparency
            this.sourceContext = {
                githubUser: userData,
                githubRepos: topRepos,
                resumeTexts: resumeTexts
            };

            // Create the prompt for OpenAI with anti-plagiarism instructions
            const prompt = `
                Generate a comprehensive professional profile based on the following data:

                GitHub User:
                ${JSON.stringify(userData, null, 2)}

                GitHub Repositories:
                ${JSON.stringify(topRepos, null, 2)}

                Resume Information:
                ${combinedResumeText}

                IMPORTANT INSTRUCTION:
                - DO NOT copy phrases or sentences directly from the resume.
                - COMPLETELY REWRITE all information in your own words.
                - DO NOT use any unique phrasing, unusual word choices, or distinctive sentence structures from the resumes.
                - Maintain factual accuracy while ensuring the content is 100% original.
                - For technical terms, skills, languages, and tool names, those can be listed as-is.

                Please provide a JSON response in the following format:
                {
                    "name": "Full Name",
                    "title": "Professional Title",
                    "summary": "A concise professional summary (2-3 paragraphs) in original phrasing",
                    "skills": ["skill1", "skill2", ...],
                    "experience": [
                        {"position": "Title", "company": "Company Name", "period": "Date Range", "description": "Description in original wording"},
                        ...
                    ],
                    "education": [
                        {"degree": "Degree Name", "institution": "Institution Name", "period": "Date Range"},
                        ...
                    ],
                    "projects": [
                        {"name": "Project Name", "description": "Description in original phrasing", "technologies": ["tech1", "tech2"]},
                        ...
                    ],
                    "interests": ["interest1", "interest2", ...],
                    "recommendations": ["recommendation for career growth 1", "recommendation 2", ...]
                }

                Only include information that can be reasonably inferred from the provided data. Don't make up specific dates, company names, or achievements unless they appear in the data.
            `;

            // Make request to OpenAI
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
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

            // Extract JSON from the response
            const jsonMatch = profileContent.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                this.profileData = JSON.parse(jsonMatch[0]);
                return this.profileData;
            } else {
                throw new Error('Could not extract JSON from OpenAI response');
            }

        } catch (error) {
            console.error('Error generating profile:', error);
            throw error;
        }
    }

    // Helper method to extract text from PDF
    async extractTextFromPDF(base64) {
        const pdfData = atob(base64.split(',')[1]);
        const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
        let text = '';
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            text += content.items.map(item => item.str).join(' ') + '\n';
        }
        return text;
    }

    // Helper method to perform OCR on images
    async performOCR(base64) {
        try {
            // Check if Tesseract is loaded
            if (typeof Tesseract === 'undefined') {
                await this.loadTesseract();
            }

            const { data: { text } } = await Tesseract.recognize(base64, 'eng');
            return text;
        } catch (error) {
            console.error('Error performing OCR:', error);
            return '';
        }
    }

    // Helper method to load Tesseract.js
    loadTesseract() {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@2.1.4/dist/tesseract.min.js';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    // Render the profile to a given element
    renderProfile(element) {
        if (!this.profileData) {
            element.innerHTML = '<p>No profile data available. Please generate a profile first.</p>';
            return;
        }

        const profile = this.profileData;

        // Create profile HTML
        const html = `
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

            <section class="profile-section">
                <h3>View Source Context</h3>
                <p>See what data was used to generate this profile:</p>
                <button id="view-source-context" class="btn secondary">View Source Data</button>
            </section>
        `;

        element.innerHTML = html;

        // Add event listener for the source context button
        document.getElementById('view-source-context').addEventListener('click', () => {
            this.showSourceContextModal();
        });
    }

    // Show modal with the source context data
    showSourceContextModal() {
        if (!this.sourceContext) {
            alert('Source context is not available');
            return;
        }

        // Create modal if it doesn't exist
        let modal = document.getElementById('source-context-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'source-context-modal';
            modal.className = 'modal';
            modal.setAttribute('role', 'dialog');
            modal.setAttribute('aria-modal', 'true');
            modal.setAttribute('aria-labelledby', 'source-context-title');

            document.body.appendChild(modal);
        }

        // Style the modal similar to the existing analysis modal
        modal.style.display = 'flex';
        modal.style.position = 'fixed';
        modal.style.top = '0';
        modal.style.left = '0';
        modal.style.width = '100%';
        modal.style.height = '100%';
        modal.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        modal.style.justifyContent = 'center';
        modal.style.alignItems = 'center';
        modal.style.zIndex = '2000';
        modal.style.padding = 'var(--space-md)';
        modal.style.opacity = '1';
        modal.style.transition = 'opacity var(--transition-base)';

        // Create the modal content
        modal.innerHTML = `
            <div id="source-context-content" style="
                background: var(--glass-bg-light);
                backdrop-filter: blur(20px);
                border: 1px solid var(--border-light);
                padding: var(--space-xl);
                width: 100%;
                max-width: 900px;
                max-height: 90vh;
                overflow-y: auto;
                border-radius: var(--border-radius);
                box-shadow: var(--glass-shadow);
                position: relative;
            ">
                <h2 id="source-context-title">Source Context Data</h2>
                <button id="close-source-modal" style="
                    position: absolute;
                    top: var(--space-md);
                    right: var(--space-md);
                    background: none;
                    font-size: var(--font-size-lg);
                    border: none;
                    cursor: pointer;
                    color: var(--text-secondary-light);
                ">×</button>

                <h3>GitHub User Information</h3>
                <pre style="
                    white-space: pre-wrap;
                    background: var(--glass-bg-light);
                    padding: var(--space-md);
                    border: 1px solid var(--border-light);
                    border-radius: var(--border-radius);
                    font-family: monospace;
                    font-size: var(--font-size-sm);
                    max-height: 200px;
                    overflow-y: auto;
                ">${JSON.stringify(this.sourceContext.githubUser, null, 2)}</pre>

                <h3>GitHub Repositories</h3>
                <pre style="
                    white-space: pre-wrap;
                    background: var(--glass-bg-light);
                    padding: var(--space-md);
                    border: 1px solid var(--border-light);
                    border-radius: var(--border-radius);
                    font-family: monospace;
                    font-size: var(--font-size-sm);
                    max-height: 200px;
                    overflow-y: auto;
                ">${JSON.stringify(this.sourceContext.githubRepos, null, 2)}</pre>

                <h3>Resume Texts</h3>
                ${this.sourceContext.resumeTexts.map((text, index) => `
                    <h4>Resume ${index + 1}</h4>
                    <pre style="
                        white-space: pre-wrap;
                        background: var(--glass-bg-light);
                        padding: var(--space-md);
                        border: 1px solid var(--border-light);
                        border-radius: var(--border-radius);
                        font-family: monospace;
                        font-size: var(--font-size-sm);
                        max-height: 300px;
                        overflow-y: auto;
                    ">${text}</pre>
                `).join('')}

                <div style="margin-top: var(--space-lg);">
                    <p style="font-size: var(--font-size-sm); color: var(--text-secondary-light);">
                        This is the raw data used to generate your profile.
                        The AI has been instructed not to plagiarize this content
                        but to generate a completely original profile based on the information provided.
                    </p>
                </div>
            </div>
        `;

        // Add event listener for the close button
        document.getElementById('close-source-modal').addEventListener('click', () => {
            modal.style.display = 'none';
        });

        // Close modal if user clicks outside the content
        modal.addEventListener('click', (event) => {
            if (event.target === modal) {
                modal.style.display = 'none';
            }
        });
    }
}

// Export the class for use in the main script
window.ProfileGenerator = ProfileGenerator;
