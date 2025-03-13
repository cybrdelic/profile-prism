require('dotenv').config();
const express = require('express');
const session = require('express-session');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

// Configure session middleware
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // Set to true if using HTTPS
}));

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// GitHub OAuth Configuration
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const GITHUB_AUTH_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_API_URL = 'https://api.github.com/user';

// GitHub OAuth login endpoint
app.get('/auth/github', (req, res) => {
  // Generate a random state parameter to prevent CSRF attacks
  const state = Math.random().toString(36).substring(7);
  req.session.oauth_state = state;

  // Redirect to GitHub's authorization page
  const redirectUri = `${req.protocol}://${req.get('host')}/auth/callback`;
  const authUrl = `${GITHUB_AUTH_URL}?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=user%20repo&state=${state}`;

  res.redirect(authUrl);
});

// GitHub OAuth callback endpoint
app.get('/auth/callback', async (req, res) => {
  const { code, state } = req.query;
  const storedState = req.session.oauth_state;

  // Verify state to prevent CSRF attacks
  if (!state || state !== storedState) {
    return res.status(403).send('Authorization failed: state mismatch');
  }

  try {
    // Exchange code for access token
    const redirectUri = `${req.protocol}://${req.get('host')}/auth/callback`;
    const tokenResponse = await axios.post(GITHUB_TOKEN_URL, {
      client_id: GITHUB_CLIENT_ID,
      client_secret: GITHUB_CLIENT_SECRET,
      code: code,
      redirect_uri: redirectUri
    }, {
      headers: {
        Accept: 'application/json'
      }
    });

    const { access_token } = tokenResponse.data;

    // Store the token in the session
    req.session.github_token = access_token;

    // Redirect back to the main app
    res.redirect('/');

  } catch (error) {
    console.error('Error exchanging code for token:', error.response?.data || error.message);
    res.status(500).send('Authentication failed');
  }
});

// API endpoint to get the current user's GitHub data
app.get('/api/github/user', async (req, res) => {
  const token = req.session.github_token;

  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const userResponse = await axios.get(GITHUB_API_URL, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json'
      }
    });

    res.json(userResponse.data);
  } catch (error) {
    console.error('Error fetching GitHub user data:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch user data' });
  }
});

// Fetch user's GitHub repositories
app.get('/api/github/repos', async (req, res) => {
  const token = req.session.github_token;

  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const reposResponse = await axios.get('https://api.github.com/user/repos', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json'
      },
      params: {
        sort: 'updated',
        direction: 'desc',
        per_page: 10 // Limit to most recent 10 repos
      }
    });

    res.json(reposResponse.data);
  } catch (error) {
    console.error('Error fetching GitHub repositories:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch repositories' });
  }
});

// Logout endpoint
app.get('/auth/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

// Start the server
app.listen(PORT, () => {
  console.log(`
  ╔═══════════════════════════════════════════════════╗
  ║               ProfilePrism Server                  ║
  ╠═══════════════════════════════════════════════════╣
  ║  Server running at: http://localhost:${PORT}        ║
  ╚═══════════════════════════════════════════════════╝
  `);
});
