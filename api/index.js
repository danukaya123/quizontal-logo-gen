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

// Debug function to save HTML for analysis
function debugHtml(html, filename) {
  // Uncomment for debugging
  // const fs = require('fs');
  // fs.writeFileSync(`debug_${filename}.html`, html);
  console.log(`Debug: HTML length = ${html.length}`);
}

// Extract URLs from HTML with multiple methods
function extractImageUrls(html) {
  const urls = {
    image_url: null,
    download_url: null
  };
  
  console.log('Extracting URLs from HTML...');
  
  // Method 1: Look for save-image button (EXACT pattern you provided)
  const saveButtonRegex = /href=["'](https:\/\/e[0-9]\.yotools\.net\/save-image\/[a-zA-Z0-9]+\.jpg\/[0-9]+)["']/;
  const saveMatch = html.match(saveButtonRegex);
  
  if (saveMatch && saveMatch[1]) {
    urls.download_url = saveMatch[1];
    console.log('Found download URL (save button):', urls.download_url);
    
    // Extract filename from download URL
    const filenameMatch = urls.download_url.match(/save-image\/([a-zA-Z0-9]+)\.jpg/);
    if (filenameMatch) {
      const filename = filenameMatch[1];
      const date = new Date();
      const year = date.getFullYear();
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      urls.image_url = `https://e1.yotools.net/images/user_image/${year}/${month}/${filename}.jpg`;
      console.log('Constructed image URL:', urls.image_url);
    }
  }
  
  // Method 2: Look for direct image URL pattern
  if (!urls.image_url) {
    const imageRegex = /(https:\/\/e[0-9]\.yotools\.net\/images\/user_image\/\d{4}\/\d{2}\/[a-zA-Z0-9]+\.(jpg|png|jpeg))/;
    const imageMatch = html.match(imageRegex);
    
    if (imageMatch) {
      urls.image_url = imageMatch[1];
      console.log('Found direct image URL:', urls.image_url);
      
      if (!urls.download_url) {
        urls.download_url = urls.image_url;
      }
    }
  }
  
  // Method 3: Look for bg-image src
  if (!urls.image_url) {
    const bgImageRegex = /src=["'](https:\/\/e[0-9]\.yotools\.net\/[^"']+\.(jpg|png|jpeg))["'][^>]*class=["'][^"']*bg-image["']/;
    const bgMatch = html.match(bgImageRegex);
    
    if (bgMatch) {
      urls.image_url = bgMatch[1];
      console.log('Found bg-image URL:', urls.image_url);
      
      if (!urls.download_url) {
        urls.download_url = urls.image_url;
      }
    }
  }
  
  // Method 4: Generic search for any yotools image
  if (!urls.image_url) {
    const genericImageRegex = /(https:\/\/e[0-9]\.yotools\.net\/[a-zA-Z0-9_\/\-\.]+\.(jpg|png|jpeg))/g;
    const matches = html.match(genericImageRegex);
    
    if (matches && matches.length > 0) {
      // Filter out common non-image URLs
      const filtered = matches.filter(url => 
        !url.includes('logo') && 
        !url.includes('icon') &&
        (url.includes('/user_image/') || url.includes('/save-image/'))
      );
      
      if (filtered.length > 0) {
        urls.image_url = filtered[0];
        console.log('Found generic image URL:', urls.image_url);
        
        if (!urls.download_url) {
          urls.download_url = urls.image_url;
        }
      }
    }
  }
  
  // Method 5: Use cheerio to parse HTML
  if (!urls.image_url) {
    try {
      const $ = cheerio.load(html);
      
      // Look for save button
      const saveBtn = $('#save-image-btn').attr('href');
      if (saveBtn && saveBtn.includes('yotools.net')) {
        urls.download_url = saveBtn.startsWith('http') ? saveBtn : 'https:' + saveBtn;
        console.log('Found with cheerio (save button):', urls.download_url);
      }
      
      // Look for images
      $('img').each((i, elem) => {
        const src = $(elem).attr('src');
        if (src && src.includes('yotools.net') && src.match(/\.(jpg|png|jpeg)$/)) {
          urls.image_url = src.startsWith('http') ? src : 'https:' + src;
          console.log('Found with cheerio (img tag):', urls.image_url);
          return false; // Break loop
        }
      });
      
      // If we have download URL but no image URL, construct it
      if (urls.download_url && !urls.image_url && urls.download_url.includes('/save-image/')) {
        const filenameMatch = urls.download_url.match(/save-image\/([a-zA-Z0-9]+)\.jpg/);
        if (filenameMatch) {
          const filename = filenameMatch[1];
          const date = new Date();
          const year = date.getFullYear();
          const month = (date.getMonth() + 1).toString().padStart(2, '0');
          urls.image_url = `https://e1.yotools.net/images/user_image/${year}/${month}/${filename}.jpg`;
        }
      }
      
    } catch (e) {
      console.log('Cheerio parsing failed:', e.message);
    }
  }
  
  // Final fallback: If we have partial URL, complete it
  if (urls.image_url && urls.image_url === 'https://e1.yotools.net') {
    // Look for any path after yotools.net
    const pathMatch = html.match(/e1\.yotools\.net(\/[a-zA-Z0-9_\/\-\.]+\.(jpg|png|jpeg))/);
    if (pathMatch) {
      urls.image_url = 'https://e1.yotools.net' + pathMatch[1];
      console.log('Fixed partial URL:', urls.image_url);
    }
  }
  
  return urls;
}

// Main function to generate logo
async function generateEphotoLogo(effectUrl, text) {
  try {
    console.log(`\n=== Generating logo: ${effectUrl} ===`);
    console.log(`Text: "${text}"`);
    
    // Step 1: Get the effect page
    const pageResponse = await axios.get(effectUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Referer': 'https://en.ephoto360.com/',
      },
      timeout: 15000
    });
    
    const $ = cheerio.load(pageResponse.data);
    
    // Extract form data
    const token = $('input[name="token"]').val();
    const buildServer = $('input[name="build_server"]').val();
    const buildServerId = $('input[name="build_server_id"]').val();
    
    console.log('Extracted token:', token ? 'Yes' : 'No');
    console.log('Build server:', buildServer);
    
    if (!token || !buildServer) {
      throw new Error('Could not extract form data. Token or build server missing.');
    }
    
    // Step 2: Prepare form data
    const formData = new URLSearchParams();
    formData.append('text[]', text);
    formData.append('token', token);
    formData.append('build_server', buildServer);
    formData.append('build_server_id', buildServerId || '2');
    formData.append('submit', 'GO');
    
    // Step 3: Submit the form
    console.log('Submitting form...');
    const postResponse = await axios.post(effectUrl, formData.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Referer': effectUrl,
        'Origin': 'https://en.ephoto360.com',
        'Cookie': pageResponse.headers['set-cookie'] ? pageResponse.headers['set-cookie'].join('; ') : ''
      },
      maxRedirects: 5,
      timeout: 25000
    });
    
    console.log('Form submitted. Response length:', postResponse.data.length);
    
    // Save HTML for debugging if needed
    debugHtml(postResponse.data, 'response');
    
    // Step 4: Extract URLs
    const urls = extractImageUrls(postResponse.data);
    
    if (!urls.image_url || !urls.download_url) {
      // Try one more time with different regex
      console.log('Primary extraction failed, trying alternative methods...');
      
      // Look for any URL with timestamp pattern
      const timestampPattern = /(https:\/\/e[0-9]\.yotools\.net\/[a-zA-Z0-9_\/\-]+\.jpg\/[0-9]+)/;
      const timestampMatch = postResponse.data.match(timestampPattern);
      
      if (timestampMatch) {
        urls.download_url = timestampMatch[1];
        console.log('Found with timestamp pattern:', urls.download_url);
      }
      
      // Look for image in JavaScript
      const jsPattern = /["'](https:\/\/e[0-9]\.yotools\.net\/[^"']+\.jpg)["']/g;
      const jsMatches = postResponse.data.match(jsPattern);
      
      if (jsMatches && jsMatches.length > 0) {
        // Get the longest match (likely the actual image)
        const longestMatch = jsMatches.reduce((a, b) => a.length > b.length ? a : b);
        urls.image_url = longestMatch.replace(/["']/g, '');
        console.log('Found in JavaScript:', urls.image_url);
      }
    }
    
    // Final check
    if (!urls.image_url || !urls.download_url) {
      console.log('Could not find URLs. Showing HTML snippet for debugging:');
      console.log(postResponse.data.substring(0, 1000));
      
      return {
        success: false,
        error: 'Could not extract image URLs',
        debug: {
          html_length: postResponse.data.length,
          contains_yotools: postResponse.data.includes('yotools.net'),
          contains_jpg: postResponse.data.includes('.jpg'),
          sample: postResponse.data.substring(0, 500)
        }
      };
    }
    
    console.log('Success! URLs found:');
    console.log('Image URL:', urls.image_url);
    console.log('Download URL:', urls.download_url);
    
    return {
      success: true,
      image_url: urls.image_url,
      download_url: urls.download_url
    };
    
  } catch (error) {
    console.error('Error in generateEphotoLogo:', error.message);
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
    message: 'ephoto360 API - Fixed Version',
    status: 'running',
    endpoints: {
      '/api/logo': 'GET - Generate logo (url, name params)',
      '/api/test': 'GET - Test with Naruto',
      '/api/debug': 'GET - Debug mode'
    },
    example: '/api/logo?url=https://en.ephoto360.com/naruto-shippuden-logo-style-text-effect-online-808.html&name=Naruto'
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

// Debug endpoint
app.get('/api/debug', async (req, res) => {
  try {
    const { url, name } = req.query;
    
    if (!url || !name) {
      return res.json({
        error: 'Provide url and name parameters',
        example: '/api/debug?url=https://en.ephoto360.com/naruto-shippuden-logo-style-text-effect-online-808.html&name=TEST'
      });
    }
    
    const result = await generateEphotoLogo(url, name);
    res.json(result);
    
  } catch (error) {
    res.json({
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
        example: '/api/logo?url=https://en.ephoto360.com/naruto-shippuden-logo-style-text-effect-online-808.html&name=YourText'
      });
    }
    
    const result = await generateEphotoLogo(url, name);
    
    res.json({
      success: result.success,
      result: result.success ? {
        image_url: result.image_url,
        download_url: result.download_url
      } : undefined,
      error: result.error,
      debug: result.debug
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

// Local testing
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}
