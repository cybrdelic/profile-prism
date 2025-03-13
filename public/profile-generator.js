// profile-generator.js
class ProfileGenerator {
    constructor() {
        this.githubData = null;
        this.resumeData = null;
        this.profileData = null;
    }

    // Fetch GitHub repositories for the authenticated user
    async fetchGitHubData() {
        try {
            // First check if user is authenticated
            const userResponse = await fetch('/api/github/user');
            if (!userResponse.ok) {
                throw new Error('User not authenticated');
            }

            // Fetch repositories
            const reposResponse = await fetch('/api/github/repos');
            if (!reposResponse.ok) {
                throw new Error('Failed to fetch repositories');
            }

            this.githubData = await reposResponse.json();
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
            const topRepos = this.githubData.slice(0, 5); // Limit to top 5 repos

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

            // Create the prompt for OpenAI
            const prompt = `
                Generate a comprehensive professional profile based on the following data:

                GitHub Repositories:
                ${JSON.stringify(topRepos, null, 2)}

                Resume Information:
                ${combinedResumeText}

                Please provide a JSON response in the following format:
                {
                    "name": "Full Name",
                    "title": "Professional Title",
                    "summary": "A concise professional summary (2-3 paragraphs)",
                    "skills": ["skill1", "skill2", ...],
                    "experience": [
                        {"position": "Title", "company": "Company Name", "period": "Date Range", "description": "Description"},
                        ...
                    ],
                    "education": [
                        {"degree": "Degree Name", "institution": "Institution Name", "period": "Date Range"},
                        ...
                    ],
                    "projects": [
                        {"name": "Project Name", "description": "Description", "technologies": ["tech1", "tech2"]},
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
        `;

        element.innerHTML = html;
    }
}

// Export the class for use in the main script
window.ProfileGenerator = ProfileGenerator;
