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
    console.log('Fetching form data from:', url);
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Referer': 'https://en.ephoto360.com/',
        'Upgrade-Insecure-Requests': '1',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      },
      timeout: 10000
    });
    
    const $ = cheerio.load(response.data);
    
    // Extract form data - try different selectors
    let token = $('input[name="token"]').val();
    let buildServer = $('input[name="build_server"]').val();
    let buildServerId = $('input[name="build_server_id"]').val();
    
    // If token not found, try to extract from the page
    if (!token) {
      const tokenMatch = response.data.match(/name="token" value="([^"]+)"/);
      if (tokenMatch) token = tokenMatch[1];
    }
    
    if (!buildServer) {
      const serverMatch = response.data.match(/name="build_server" value="([^"]+)"/);
      if (serverMatch) buildServer = serverMatch[1];
    }
    
    if (!buildServerId) {
      const serverIdMatch = response.data.match(/name="build_server_id" value="([^"]+)"/);
      if (serverIdMatch) buildServerId = serverIdMatch[1];
    }
    
    console.log('Extracted data:', { 
      token: token ? 'Found' : 'Not found', 
      buildServer, 
      buildServerId 
    });
    
    // Get action URL
    let actionUrl = $('form.ajax-submit').attr('action') || 
                   $('form[method="post"]').attr('action') ||
                   $('form').attr('action');
    
    if (!actionUrl || actionUrl.trim() === '' || actionUrl === '#') {
      actionUrl = url; // Use the same page URL
    }
    
    // Ensure full URL
    if (actionUrl.startsWith('/')) {
      actionUrl = 'https://en.ephoto360.com' + actionUrl;
    }
    
    return {
      token,
      buildServer,
      buildServerId,
      actionUrl,
      cookies: response.headers['set-cookie'] || []
    };
  } catch (error) {
    console.error('Error getting form data:', error.message);
    throw error;
  }
}

// Generate logo
async function generateLogo(url, text) {
  try {
    console.log('Generating logo for:', { url, text });
    
    // Step 1: Get form data and cookies
    const formData = await getFormData(url);
    
    if (!formData.token || !formData.buildServer) {
      throw new Error('Could not extract required form data');
    }
    
    // Step 2: Prepare POST data
    const postData = new FormData();
    postData.append('text[]', text);
    postData.append('token', formData.token);
    postData.append('build_server', formData.buildServer);
    postData.append('build_server_id', formData.buildServerId);
    postData.append('submit', 'GO');
    
    // Add any additional fields that might be required
    postData.append('build_server_id2', formData.buildServerId);
    
    console.log('Submitting to:', formData.actionUrl);
    
    // Step 3: Submit the form
    const response = await axios.post(formData.actionUrl, postData, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Referer': url,
        'Origin': 'https://en.ephoto360.com',
        'Content-Type': `multipart/form-data; boundary=${postData._boundary}`,
        'Cookie': formData.cookies.join('; '),
        'Upgrade-Insecure-Requests': '1'
      },
      maxRedirects: 0, // Don't follow redirects
      validateStatus: function (status) {
        return status >= 200 && status < 303; // Accept 2xx and 302
      },
      timeout: 30000
    });
    
    console.log('Response status:', response.status);
    console.log('Response headers:', response.headers);
    
    let finalResponse = response.data;
    let final$ = cheerio.load(finalResponse);
    
    // Check if we got a redirect
    if (response.status === 302 || response.status === 301) {
      const redirectUrl = response.headers.location;
      console.log('Redirecting to:', redirectUrl);
      
      // Follow the redirect
      const redirectedResponse = await axios.get(redirectUrl, {
        headers: {
          'User-Agent': USER_AGENT,
          'Referer': url,
          'Cookie': formData.cookies.join('; ')
        },
        timeout: 30000
      });
      
      finalResponse = redirectedResponse.data;
      final$ = cheerio.load(finalResponse);
    }
    
    // Save the response for debugging
    // console.log('Final HTML:', finalResponse.substring(0, 2000));
    
    // Step 4: Parse response to get image URL
    let imageUrl = null;
    let downloadUrl = null;
    
    // Try multiple selectors for the image
    const selectors = [
      'img.bg-image',
      '.thumbnail img',
      '#view-image-wrapper img',
      '.bg-image',
      'img[src*="yotools.net"]',
      'img[src*="/user_image/"]',
      'img[src*=".jpg"]',
      'img[src*=".png"]',
      'img[src*=".jpeg"]'
    ];
    
    for (const selector of selectors) {
      final$(selector).each((i, elem) => {
        const src = final$(elem).attr('src');
        if (src && !imageUrl) {
          console.log('Found image with selector', selector, ':', src);
          // Make sure it's a full URL
          if (src.startsWith('http')) {
            imageUrl = src;
          } else if (src.startsWith('/')) {
            imageUrl = 'https://en.ephoto360.com' + src;
          } else if (src.startsWith('./')) {
            imageUrl = 'https://en.ephoto360.com' + src.substring(1);
          } else {
            // Try to construct URL
            const baseUrl = 'https://en.ephoto360.com';
            const urlMatch = url.match(/^(https?:\/\/[^\/]+)/);
            if (urlMatch) {
              imageUrl = urlMatch[1] + (src.startsWith('/') ? '' : '/') + src;
            }
          }
        }
      });
      if (imageUrl) break;
    }
    
    // Look for download link
    const downloadSelectors = [
      '#save-image-btn',
      'a.btn-primary[href*="save-image"]',
      'a[href*="save-image"]',
      'a[href*="yotools.net/save-image"]',
      'a.btn[href*=".jpg"]',
      'a[onclick*="download"]'
    ];
    
    for (const selector of downloadSelectors) {
      final$(selector).each((i, elem) => {
        const href = final$(elem).attr('href');
        if (href && !downloadUrl) {
          console.log('Found download link with selector', selector, ':', href);
          if (href.startsWith('http')) {
            downloadUrl = href;
          } else if (href.startsWith('/')) {
            downloadUrl = 'https://en.ephoto360.com' + href;
          } else {
            downloadUrl = 'https://en.ephoto360.com/' + href;
          }
        }
      });
      if (downloadUrl) break;
    }
    
    // Also look for image URL in the share section
    const shareLink = final$('#link-image').text();
    if (shareLink) {
      const urlMatch = shareLink.match(/(https?:\/\/[^\s]+)/);
      if (urlMatch && !imageUrl) {
        imageUrl = urlMatch[0];
        console.log('Found image in share link:', imageUrl);
      }
    }
    
    // If no download URL but we have image URL, use image URL as download
    if (!downloadUrl && imageUrl) {
      downloadUrl = imageUrl;
    }
    
    // If still no image URL, try to find in iframe or script
    if (!imageUrl) {
      const scriptMatches = finalResponse.match(/src=["']([^"']*\.(jpg|png|jpeg))["']/gi);
      if (scriptMatches) {
        for (const match of scriptMatches.slice(0, 5)) {
          const urlMatch = match.match(/src=["']([^"']+)["']/);
          if (urlMatch && urlMatch[1].includes('yotools.net')) {
            imageUrl = urlMatch[1];
            console.log('Found in script:', imageUrl);
            break;
          }
        }
      }
    }
    
    console.log('Final results:', { imageUrl, downloadUrl });
    
    if (!imageUrl || !downloadUrl) {
      throw new Error('Could not extract image URL from response');
    }
    
    return {
      success: true,
      image_url: imageUrl,
      download_url: downloadUrl
    };
    
  } catch (error) {
    console.error('Error generating logo:', error);
    return {
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    };
  }
}

// API Routes
app.get('/', (req, res) => {
  res.json({
    message: 'ephoto360 API Server - Improved Version',
    status: 'running',
    endpoints: {
      '/api/logo': 'GET - Generate logo (use url and name parameters)',
      '/api/debug': 'GET - Debug endpoint',
      '/api/test': 'GET - Test with Naruto effect'
    },
    example: '/api/logo?url=https://en.ephoto360.com/naruto-shippuden-logo-style-text-effect-online-808.html&name=Test'
  });
});

// Debug endpoint
app.get('/api/debug', async (req, res) => {
  try {
    const testUrl = 'https://en.ephoto360.com/naruto-shippuden-logo-style-text-effect-online-808.html';
    
    const response = await axios.get(testUrl, {
      headers: {
        'User-Agent': USER_AGENT
      }
    });
    
    const $ = cheerio.load(response.data);
    
    // Extract form elements
    const formElements = {};
    $('input').each((i, elem) => {
      const name = $(elem).attr('name');
      const value = $(elem).attr('value');
      if (name) {
        formElements[name] = value || '';
      }
    });
    
    res.json({
      status: 'success',
      url: testUrl,
      formElements,
      hasToken: !!formElements.token,
      hasBuildServer: !!formElements.build_server,
      cookies: response.headers['set-cookie'] || []
    });
    
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

// Test endpoint
app.get('/api/test', async (req, res) => {
  try {
    const result = await generateLogo(
      'https://en.ephoto360.com/naruto-shippuden-logo-style-text-effect-online-808.html',
      'Naruto'
    );
    
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET endpoint (main endpoint)
app.get('/api/logo', async (req, res) => {
  try {
    const { url, name } = req.query;
    
    if (!url || !name) {
      return res.status(400).json({
        success: false,
        error: 'URL and name parameters are required',
        example: '/api/logo?url=https://en.ephoto360.com/naruto-shippuden-logo-style-text-effect-online-808.html&name=YourText'
      });
    }
    
    console.log(`API request: ${url} with text: ${name}`);
    
    const result = await generateLogo(url, name);
    
    res.json(result);
    
  } catch (error) {
    console.error('API error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Internal server error'
    });
  }
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
    
    res.json(result);
    
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
