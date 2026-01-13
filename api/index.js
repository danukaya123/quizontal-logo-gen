const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const FormData = require('form-data');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// User-Agent
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Function to extract form data using regex (more reliable)
function extractFormData(html) {
  const formData = {};
  
  // Extract token
  const tokenMatch = html.match(/name="token"\s+value="([^"]+)"/);
  if (tokenMatch) formData.token = tokenMatch[1];
  
  // Extract build_server
  const serverMatch = html.match(/name="build_server"\s+value="([^"]+)"/);
  if (serverMatch) formData.buildServer = serverMatch[1];
  
  // Extract build_server_id
  const serverIdMatch = html.match(/name="build_server_id"\s+value="([^"]+)"/);
  if (serverIdMatch) formData.buildServerId = serverIdMatch[1];
  
  // Extract form action
  const actionMatch = html.match(/<form[^>]*action="([^"]*)"[^>]*>/);
  if (actionMatch && actionMatch[1]) {
    formData.action = actionMatch[1].trim();
  }
  
  return formData;
}

// Main function to generate logo
async function generateEphotoLogo(effectUrl, text) {
  try {
    console.log('Starting logo generation for:', effectUrl);
    
    // Step 1: Fetch the effect page
    const response = await fetch(effectUrl, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Referer': 'https://en.ephoto360.com/',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch page: ${response.status} ${response.statusText}`);
    }
    
    const html = await response.text();
    console.log('Page fetched successfully');
    
    // Step 2: Extract form data using regex
    const formData = extractFormData(html);
    
    if (!formData.token || !formData.buildServer) {
      console.log('Form data not found, trying alternative method...');
      
      // Try alternative method - look for the form data in different patterns
      const $ = cheerio.load(html);
      formData.token = $('input[name="token"]').val();
      formData.buildServer = $('input[name="build_server"]').val();
      formData.buildServerId = $('input[name="build_server_id"]').val();
      
      if (!formData.token) {
        // Try to find token in JavaScript
        const tokenRegex = /token\s*=\s*["']([^"']+)["']/;
        const tokenMatch = html.match(tokenRegex);
        if (tokenMatch) formData.token = tokenMatch[1];
      }
    }
    
    console.log('Extracted form data:', {
      token: formData.token ? 'Found' : 'Not found',
      server: formData.buildServer,
      serverId: formData.buildServerId
    });
    
    if (!formData.token) {
      throw new Error('Could not find token in the page');
    }
    
    // Step 3: Prepare the POST request
    const postUrl = formData.action || effectUrl;
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    
    // Build form data manually
    const body = `--${boundary}\r
Content-Disposition: form-data; name="text[]"\r
\r
${text}\r
--${boundary}\r
Content-Disposition: form-data; name="token"\r
\r
${formData.token}\r
--${boundary}\r
Content-Disposition: form-data; name="build_server"\r
\r
${formData.buildServer}\r
--${boundary}\r
Content-Disposition: form-data; name="build_server_id"\r
\r
${formData.buildServerId || '2'}\r
--${boundary}\r
Content-Disposition: form-data; name="submit"\r
\r
GO\r
--${boundary}--\r
`;
    
    // Step 4: Submit the form
    console.log('Submitting form to:', postUrl);
    
    const postResponse = await fetch(postUrl, {
      method: 'POST',
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Referer': effectUrl,
        'Origin': 'https://en.ephoto360.com',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Cookie': response.headers.get('set-cookie') || ''
      },
      body: body,
      redirect: 'follow'
    });
    
    const resultHtml = await postResponse.text();
    console.log('Form submitted, response length:', resultHtml.length);
    
    // Step 5: Parse the result to find image URL
    let imageUrl = null;
    let downloadUrl = null;
    
    // Method 1: Look for image in HTML
    const $result = cheerio.load(resultHtml);
    
    // Try to find image with various selectors
    const imageSelectors = [
      'img.bg-image',
      '.thumbnail img',
      '#view-image-wrapper img',
      'img[src*="yotools.net"]',
      'img[src*="/user_image/"]',
      'img[src*=".jpg"]',
      'img[src*=".png"]',
      'img[src*=".jpeg"]'
    ];
    
    for (const selector of imageSelectors) {
      const src = $result(selector).attr('src');
      if (src && src.includes('.')) {
        imageUrl = src;
        console.log('Found image with selector', selector, ':', imageUrl);
        break;
      }
    }
    
    // Method 2: Look for download button
    const downloadSelectors = [
      '#save-image-btn',
      'a[href*="save-image"]',
      'a.btn-primary[href*=".jpg"]',
      'a[onclick*="download"]'
    ];
    
    for (const selector of downloadSelectors) {
      const href = $result(selector).attr('href');
      if (href) {
        downloadUrl = href;
        console.log('Found download link with selector', selector, ':', downloadUrl);
        break;
      }
    }
    
    // Method 3: Look in share link
    const shareText = $result('#link-image').text();
    if (shareText) {
      const urlMatch = shareText.match(/(https?:\/\/[^\s]+)/);
      if (urlMatch) {
        imageUrl = urlMatch[0];
        console.log('Found in share text:', imageUrl);
      }
    }
    
    // Method 4: Use regex to find any image URL
    if (!imageUrl) {
      const imageRegex = /(https?:\/\/[^\s"']*\.(jpg|png|jpeg|webp))/gi;
      const matches = resultHtml.match(imageRegex);
      if (matches) {
        for (const match of matches) {
          if (match.includes('yotools.net') || match.includes('/user_image/')) {
            imageUrl = match;
            console.log('Found with regex:', imageUrl);
            break;
          }
        }
      }
    }
    
    // Ensure URLs are complete
    if (imageUrl && !imageUrl.startsWith('http')) {
      if (imageUrl.startsWith('/')) {
        imageUrl = 'https://en.ephoto360.com' + imageUrl;
      } else if (imageUrl.startsWith('./')) {
        imageUrl = 'https://en.ephoto360.com' + imageUrl.substring(1);
      } else {
        imageUrl = 'https://en.ephoto360.com/' + imageUrl;
      }
    }
    
    if (downloadUrl && !downloadUrl.startsWith('http')) {
      if (downloadUrl.startsWith('/')) {
        downloadUrl = 'https://en.ephoto360.com' + downloadUrl;
      } else if (downloadUrl.startsWith('./')) {
        downloadUrl = 'https://en.ephoto360.com' + downloadUrl.substring(1);
      } else {
        downloadUrl = 'https://en.ephoto360.com/' + downloadUrl;
      }
    }
    
    // If no download URL, use image URL
    if (!downloadUrl && imageUrl) {
      downloadUrl = imageUrl;
    }
    
    // If still no image, check for JavaScript variables
    if (!imageUrl) {
      const jsVarRegex = /(?:imageUrl|src|url)\s*[:=]\s*["']([^"']+)["']/gi;
      const jsMatches = resultHtml.match(jsVarRegex);
      if (jsMatches) {
        for (const match of jsMatches) {
          const urlMatch = match.match(/["']([^"']+)["']/);
          if (urlMatch && urlMatch[1].includes('.jpg')) {
            imageUrl = urlMatch[1];
            console.log('Found in JS variable:', imageUrl);
            break;
          }
        }
      }
    }
    
    if (!imageUrl) {
      console.log('Could not find image URL in response');
      // Return the first 2000 chars of HTML for debugging
      return {
        success: false,
        error: 'Image URL not found in response',
        debug: {
          htmlPreview: resultHtml.substring(0, 2000),
          responseLength: resultHtml.length
        }
      };
    }
    
    return {
      success: true,
      result: {
        image_url: imageUrl,
        download_url: downloadUrl || imageUrl
      }
    };
    
  } catch (error) {
    console.error('Error in generateEphotoLogo:', error);
    return {
      success: false,
      error: error.message,
      stack: error.stack
    };
  }
}

// API Routes
app.get('/', (req, res) => {
  res.json({
    message: 'ephoto360 API - Simple Version',
    status: 'running',
    version: '2.0',
    endpoints: {
      '/api/logo': 'GET - Generate logo',
      '/api/health': 'GET - Health check',
      '/api/test': 'GET - Test with Naruto'
    },
    example: '/api/logo?url=https://en.ephoto360.com/naruto-shippuden-logo-style-text-effect-online-808.html&name=Test'
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

// Test endpoint
app.get('/api/test', async (req, res) => {
  try {
    const result = await generateEphotoLogo(
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

// Main logo endpoint
app.get('/api/logo', async (req, res) => {
  try {
    const { url, name } = req.query;
    
    if (!url || !name) {
      return res.status(400).json({
        success: false,
        error: 'Missing parameters',
        usage: '/api/logo?url=EPHOTO360_URL&name=TEXT',
        example: '/api/logo?url=https://en.ephoto360.com/naruto-shippuden-logo-style-text-effect-online-808.html&name=Naruto'
      });
    }
    
    // Validate URL
    if (!url.includes('ephoto360.com')) {
      return res.status(400).json({
        success: false,
        error: 'Invalid URL. Must be an ephoto360.com URL'
      });
    }
    
    console.log(`Request: ${url} - "${name}"`);
    
    const result = await generateEphotoLogo(url, name);
    
    if (!result.success) {
      return res.status(500).json(result);
    }
    
    res.json(result);
    
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
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
    
    const result = await generateEphotoLogo(url, text);
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

// Local server for testing
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}
