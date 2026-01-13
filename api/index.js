const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const FormData = require('form-data');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// User-Agent to mimic browser
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Helper function to extract token and server info
async function getFormData(url) {
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Referer': 'https://en.ephoto360.com/',
      }
    });
    
    const $ = cheerio.load(response.data);
    
    // Extract form data
    const token = $('input[name="token"]').val();
    const buildServer = $('input[name="build_server"]').val();
    const buildServerId = $('input[name="build_server_id"]').val();
    const submitBtn = $('#submit').val();
    
    // Get action URL if exists
    let actionUrl = $('form.ajax-submit').attr('action');
    if (!actionUrl || actionUrl.trim() === '') {
      actionUrl = url; // Use the same page URL
    }
    
    return {
      token,
      buildServer,
      buildServerId,
      submitBtn,
      actionUrl,
      cookies: response.headers['set-cookie']
    };
  } catch (error) {
    console.error('Error getting form data:', error.message);
    throw error;
  }
}

// Generate logo
async function generateLogo(url, text) {
  try {
    // Step 1: Get form data and cookies
    const formData = await getFormData(url);
    
    // Step 2: Prepare POST data
    const postData = new FormData();
    postData.append('text[]', text);
    postData.append('token', formData.token);
    postData.append('build_server', formData.buildServer);
    postData.append('build_server_id', formData.buildServerId);
    postData.append('submit', formData.submitBtn || 'GO');
    
    // Step 3: Submit the form
    const response = await axios.post(formData.actionUrl, postData, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Referer': url,
        'Origin': 'https://en.ephoto360.com',
        'Content-Type': `multipart/form-data; boundary=${postData._boundary}`,
        'Cookie': formData.cookies ? formData.cookies.join('; ') : ''
      },
      maxRedirects: 5,
      timeout: 30000 // 30 seconds timeout
    });
    
    // Step 4: Parse response to get image URL
    const $ = cheerio.load(response.data);
    
    // Look for generated image
    let imageUrl = null;
    let downloadUrl = null;
    
    // Try different selectors for image
    $('img.bg-image').each((i, elem) => {
      const src = $(elem).attr('src');
      if (src && src.includes('yotools.net')) {
        imageUrl = src;
      }
    });
    
    // If not found with bg-image class, try other selectors
    if (!imageUrl) {
      $('img').each((i, elem) => {
        const src = $(elem).attr('src');
        if (src && (src.includes('yotools.net') || src.includes('/user_image/'))) {
          imageUrl = src;
        }
      });
    }
    
    // Get download link
    $('#save-image-btn').each((i, elem) => {
      const href = $(elem).attr('href');
      if (href && href.includes('save-image')) {
        downloadUrl = href;
      }
    });
    
    // If no direct download link, use the image URL
    if (!downloadUrl && imageUrl) {
      downloadUrl = imageUrl;
    }
    
    // Also check for link in the share section
    if (!downloadUrl) {
      const linkText = $('#link-image').text();
      if (linkText) {
        const match = linkText.match(/https?:\/\/[^\s]+/);
        if (match) {
          downloadUrl = match[0];
        }
      }
    }
    
    return {
      success: true,
      image_url: imageUrl,
      download_url: downloadUrl,
      direct_image: imageUrl // For backward compatibility
    };
    
  } catch (error) {
    console.error('Error generating logo:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// API Routes
app.get('/', (req, res) => {
  res.json({
    message: 'ephoto360 API Server',
    endpoints: {
      '/api/logo': 'POST - Generate logo',
      '/api/logo/get': 'GET - Generate logo (query params)'
    }
  });
});

// POST endpoint
app.post('/api/logo', async (req, res) => {
  try {
    const { url, text } = req.body;
    
    if (!url || !text) {
      return res.status(400).json({
        success: false,
        error: 'URL and text are required'
      });
    }
    
    const result = await generateLogo(url, text);
    
    if (!result.success) {
      return res.status(500).json(result);
    }
    
    res.json({
      success: true,
      result: {
        image_url: result.image_url,
        download_url: result.download_url
      }
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET endpoint (for your bot compatibility)
app.get('/api/logo', async (req, res) => {
  try {
    const { url, name } = req.query;
    
    if (!url || !name) {
      return res.status(400).json({
        success: false,
        error: 'URL and name parameters are required'
      });
    }
    
    const result = await generateLogo(url, name);
    
    if (!result.success) {
      return res.status(500).json(result);
    }
    
    res.json({
      success: true,
      result: {
        image_url: result.image_url,
        download_url: result.download_url
      }
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Export for Vercel
module.exports = app;

// For local testing
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}
