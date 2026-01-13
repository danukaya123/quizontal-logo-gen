const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();

// Enable CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

app.use(express.json());

// Simple health check
app.get('/', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'ephoto360 API is running',
    endpoints: ['/api/logo']
  });
});

// Main logo generation endpoint
app.get('/api/logo', async (req, res) => {
  try {
    const { url, name } = req.query;
    
    // Validate input
    if (!url || !name) {
      return res.status(400).json({
        success: false,
        error: 'Missing parameters. Use: /api/logo?url=EPHOTO_URL&name=TEXT'
      });
    }
    
    console.log(`Processing request: ${url} - "${name}"`);
    
    // Get the effect page
    const pageResponse = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Referer': 'https://en.ephoto360.com/',
      },
      timeout: 10000
    });
    
    const $ = cheerio.load(pageResponse.data);
    
    // Extract required form data
    const token = $('input[name="token"]').val();
    const buildServer = $('input[name="build_server"]').val();
    const buildServerId = $('input[name="build_server_id"]').val();
    
    if (!token || !buildServer) {
      throw new Error('Could not extract required form data');
    }
    
    // Prepare form data
    const formData = new URLSearchParams();
    formData.append('text[]', name);
    formData.append('token', token);
    formData.append('build_server', buildServer);
    formData.append('build_server_id', buildServerId || '2');
    formData.append('submit', 'GO');
    
    // Submit the form
    const postResponse = await axios.post(url, formData.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': url,
        'Origin': 'https://en.ephoto360.com',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      maxRedirects: 5,
      timeout: 15000
    });
    
    // Parse the response
    const $result = cheerio.load(postResponse.data);
    
    // Try to find the image URL
    let imageUrl = null;
    
    // Method 1: Check for image with bg-image class
    const bgImage = $result('img.bg-image').attr('src');
    if (bgImage) {
      imageUrl = bgImage;
    }
    
    // Method 2: Check for any image with yotools.net
    if (!imageUrl) {
      $result('img').each((i, elem) => {
        const src = $result(elem).attr('src');
        if (src && src.includes('yotools.net')) {
          imageUrl = src;
          return false; // Break loop
        }
      });
    }
    
    // Method 3: Check for save button URL
    if (!imageUrl) {
      const saveBtn = $result('#save-image-btn').attr('href');
      if (saveBtn && saveBtn.includes('save-image')) {
        imageUrl = saveBtn;
      }
    }
    
    // Method 4: Check share link text
    if (!imageUrl) {
      const shareText = $result('#link-image').text();
      if (shareText) {
        const urlMatch = shareText.match(/https?:\/\/[^\s]+/);
        if (urlMatch) {
          imageUrl = urlMatch[0];
        }
      }
    }
    
    // Method 5: Search in entire HTML for image pattern
    if (!imageUrl) {
      const html = postResponse.data;
      const imageRegex = /https?:\/\/[^\s"']*\.(jpg|png|jpeg)/gi;
      const matches = html.match(imageRegex);
      if (matches) {
        for (const match of matches) {
          if (match.includes('yotools.net')) {
            imageUrl = match;
            break;
          }
        }
      }
    }
    
    if (!imageUrl) {
      return res.status(500).json({
        success: false,
        error: 'Could not find generated image',
        debug: 'Image URL not found in response'
      });
    }
    
    // Ensure the URL is complete
    if (!imageUrl.startsWith('http')) {
      imageUrl = 'https:' + imageUrl;
    }
    
    res.json({
      success: true,
      result: {
        image_url: imageUrl,
        download_url: imageUrl
      }
    });
    
  } catch (error) {
    console.error('API Error:', error.message);
    
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error',
      type: error.name
    });
  }
});

// POST endpoint (alternative)
app.post('/api/logo', async (req, res) => {
  try {
    const { url, text } = req.body;
    
    if (!url || !text) {
      return res.status(400).json({
        success: false,
        error: 'URL and text are required in request body'
      });
    }
    
    // Redirect to GET endpoint
    const apiUrl = `${req.protocol}://${req.get('host')}/api/logo?url=${encodeURIComponent(url)}&name=${encodeURIComponent(text)}`;
    
    const response = await axios.get(apiUrl);
    res.json(response.data);
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Test endpoint with Naruto
app.get('/api/test', async (req, res) => {
  try {
    const testUrl = 'https://en.ephoto360.com/naruto-shippuden-logo-style-text-effect-online-808.html';
    const testName = 'NARUTO';
    
    // Call our own API
    const response = await axios.get(`http://localhost:${process.env.PORT || 3000}/api/logo?url=${encodeURIComponent(testUrl)}&name=${encodeURIComponent(testName)}`);
    
    res.json(response.data);
  } catch (error) {
    res.json({
      success: false,
      error: error.message,
      note: 'Make sure server is running locally for this test'
    });
  }
});

// Handle 404
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    available: ['/api/logo', '/api/test', '/']
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

// Export for Vercel
module.exports = app;
