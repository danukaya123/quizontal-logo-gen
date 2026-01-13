const express = require('express');
const axios = require('axios');

const app = express();

// Enable CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

app.use(express.json());

// Wait function
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Main function
async function generateLogo(effectUrl, text) {
  try {
    console.log(`Generating logo: ${text}`);
    
    // Step 1: Get the page to extract form data
    const pageRes = await axios.get(effectUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      timeout: 10000
    });
    
    const html = pageRes.data;
    
    // Extract form data using regex
    const tokenMatch = html.match(/name="token" value="([^"]+)"/);
    const serverMatch = html.match(/name="build_server" value="([^"]+)"/);
    const serverIdMatch = html.match(/name="build_server_id" value="([^"]+)"/);
    
    if (!tokenMatch || !serverMatch) {
      throw new Error('Could not extract form data');
    }
    
    const token = tokenMatch[1];
    const buildServer = serverMatch[1];
    const buildServerId = serverIdMatch ? serverIdMatch[1] : '2';
    
    console.log('Form data extracted');
    
    // Step 2: Prepare form data as multipart/form-data
    // ephoto360 expects multipart form data, not urlencoded
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36);
    const formData = `--${boundary}\r
Content-Disposition: form-data; name="text[]"\r
\r
${text}\r
--${boundary}\r
Content-Disposition: form-data; name="token"\r
\r
${token}\r
--${boundary}\r
Content-Disposition: form-data; name="build_server"\r
\r
${buildServer}\r
--${boundary}\r
Content-Disposition: form-data; name="build_server_id"\r
\r
${buildServerId}\r
--${boundary}\r
Content-Disposition: form-data; name="submit"\r
\r
GO\r
--${boundary}--\r
`;
    
    // Step 3: Submit the form
    console.log('Submitting form...');
    const submitRes = await axios.post(effectUrl, formData, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Referer': effectUrl,
        'Origin': 'https://en.ephoto360.com',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      maxRedirects: 0, // Don't follow redirects
      validateStatus: null, // Accept all status codes
      timeout: 30000
    });
    
    console.log('Form submitted. Status:', submitRes.status);
    
    // Check if we got a redirect
    if (submitRes.status === 302 || submitRes.status === 301) {
      const redirectUrl = submitRes.headers.location;
      console.log('Got redirect to:', redirectUrl);
      
      // Wait for image generation (10-15 seconds as you mentioned)
      console.log('Waiting 15 seconds for image generation...');
      await sleep(15000);
      
      // Follow the redirect
      console.log('Following redirect...');
      const resultRes = await axios.get(redirectUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': effectUrl,
        },
        timeout: 30000
      });
      
      return extractUrls(resultRes.data);
    } else {
      // If no redirect, maybe we got the result directly
      console.log('No redirect, checking response...');
      
      // Wait a bit anyway
      await sleep(10000);
      
      // Try to extract from current response
      return extractUrls(submitRes.data);
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// Function to extract URLs from HTML
function extractUrls(html) {
  console.log('Extracting URLs from HTML...');
  
  // Pattern 1: Look for save button URL (your exact pattern)
  const saveButtonPattern = /<a[^>]*id="save-image-btn"[^>]*href="(https:\/\/e1\.yotools\.net\/save-image\/[^"]+\.jpg\/[^"]+)"/;
  const saveMatch = html.match(saveButtonPattern);
  
  if (saveMatch && saveMatch[1]) {
    const downloadUrl = saveMatch[1];
    console.log('Found save button URL:', downloadUrl);
    
    // Extract image URL from save URL
    const filenameMatch = downloadUrl.match(/save-image\/([a-f0-9]+)\.jpg/);
    if (filenameMatch) {
      const filename = filenameMatch[1];
      const date = new Date();
      const year = date.getFullYear();
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const imageUrl = `https://e1.yotools.net/images/user_image/${year}/${month}/${filename}.jpg`;
      
      return {
        success: true,
        image_url: imageUrl,
        download_url: downloadUrl
      };
    }
  }
  
  // Pattern 2: Look for image src directly
  const imagePattern = /<img[^>]*class="bg-image"[^>]*src="(https:\/\/e1\.yotools\.net\/images\/user_image\/[^"]+\.jpg)"/;
  const imageMatch = html.match(imagePattern);
  
  if (imageMatch && imageMatch[1]) {
    const imageUrl = imageMatch[1];
    console.log('Found image URL:', imageUrl);
    
    return {
      success: true,
      image_url: imageUrl,
      download_url: imageUrl
    };
  }
  
  // Pattern 3: Look for any image URL
  const anyImagePattern = /(https:\/\/e1\.yotools\.net\/[a-zA-Z0-9_\/\-\.]+\.jpg)/g;
  const matches = html.match(anyImagePattern);
  
  if (matches && matches.length > 0) {
    // Filter to find the generated image (not icons/logos)
    for (const url of matches) {
      if (url.includes('/user_image/') || url.includes('/save-image/')) {
        console.log('Found generated image URL:', url);
        return {
          success: true,
          image_url: url,
          download_url: url
        };
      }
    }
  }
  
  // Pattern 4: Look for share link
  const sharePattern = /Link Image (https:\/\/[^\s<]+)/;
  const shareMatch = html.match(sharePattern);
  
  if (shareMatch && shareMatch[1]) {
    console.log('Found share link:', shareMatch[1]);
    return {
      success: true,
      image_url: shareMatch[1],
      download_url: shareMatch[1]
    };
  }
  
  console.log('Could not find URLs in HTML');
  console.log('HTML sample:', html.substring(0, 1000));
  
  return {
    success: false,
    error: 'Could not extract image URLs',
    html_sample: html.substring(0, 1000)
  };
}

// API Routes
app.get('/', (req, res) => {
  res.json({
    message: 'ephoto360 API - With Wait Time',
    endpoints: ['/api/logo'],
    usage: '/api/logo?url=EPHOTO_URL&name=TEXT',
    note: 'This API waits 15 seconds for image generation'
  });
});

app.get('/api/logo', async (req, res) => {
  try {
    const { url, name } = req.query;
    
    if (!url || !name) {
      return res.status(400).json({
        success: false,
        error: 'URL and name parameters are required'
      });
    }
    
    console.log(`API Request: ${url} - "${name}"`);
    
    const result = await generateLogo(url, name);
    
    res.json(result);
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Simple test endpoint
app.get('/api/test', async (req, res) => {
  try {
    const result = await generateLogo(
      'https://en.ephoto360.com/naruto-shippuden-logo-style-text-effect-online-808.html',
      'NARUTO'
    );
    res.json(result);
  } catch (error) {
    res.json({
      success: false,
      error: error.message
    });
  }
});

module.exports = app;
