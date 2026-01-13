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

// Direct function to find the save button URL
function findSaveButtonUrl(html) {
  console.log('Looking for save button URL...');
  
  // EXACT pattern you provided
  const patterns = [
    // Pattern 1: Exact save button with id
    /<a[^>]*id="save-image-btn"[^>]*href="([^"]+)"[^>]*>/i,
    
    // Pattern 2: Save button with class
    /<a[^>]*class="[^"]*btn-primary[^"]*"[^>]*href="([^"]+)"[^>]*>/i,
    
    // Pattern 3: Any save button pattern
    /<a[^>]*href="(https:\/\/e[0-9]\.yotools\.net\/save-image\/[^"]+)"[^>]*>/i,
    
    // Pattern 4: Simple href with save-image
    /href="(https:\/\/e[0-9]\.yotools\.net\/save-image\/[^"]+)"/i,
    
    // Pattern 5: Just look for save-image URL anywhere
    /(https:\/\/e[0-9]\.yotools\.net\/save-image\/[a-zA-Z0-9]+\.jpg\/[0-9]+)/,
    
    // Pattern 6: Look for any e1.yotools.net image URL
    /(https:\/\/e1\.yotools\.net\/[a-zA-Z0-9_\/\-\.]+\.jpg)/,
    
    // Pattern 7: Most generic - any image on yotools
    /(https:\/\/e[0-9]\.yotools\.net\/[a-zA-Z0-9_\/\-\.]+\.(jpg|png|jpeg))/,
  ];
  
  for (let i = 0; i < patterns.length; i++) {
    const match = html.match(patterns[i]);
    if (match && match[1]) {
      console.log(`Found with pattern ${i + 1}: ${match[1]}`);
      return match[1];
    } else if (match && match[0]) {
      console.log(`Found with pattern ${i + 1} (group 0): ${match[0]}`);
      // Extract URL from the match
      const urlMatch = match[0].match(/https:\/\/[^"'\s]+/);
      if (urlMatch) return urlMatch[0];
    }
  }
  
  // If still not found, search for "save-image" text
  const saveIndex = html.indexOf('save-image');
  if (saveIndex !== -1) {
    // Extract 100 characters around "save-image"
    const snippet = html.substring(Math.max(0, saveIndex - 50), Math.min(html.length, saveIndex + 150));
    console.log('Found "save-image" text in snippet:', snippet);
    
    // Try to extract URL from snippet
    const urlMatch = snippet.match(/https:\/\/[^"'\s]+/);
    if (urlMatch) {
      console.log('Extracted from snippet:', urlMatch[0]);
      return urlMatch[0];
    }
  }
  
  return null;
}

// Main function
async function generateLogo(effectUrl, text) {
  try {
    console.log(`\n=== Generating: ${effectUrl} ===`);
    console.log(`Text: ${text}`);
    
    // Step 1: Get page
    const pageRes = await axios.get(effectUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      timeout: 10000
    });
    
    // Extract token
    const tokenMatch = pageRes.data.match(/name="token" value="([^"]+)"/);
    const serverMatch = pageRes.data.match(/name="build_server" value="([^"]+)"/);
    const serverIdMatch = pageRes.data.match(/name="build_server_id" value="([^"]+)"/);
    
    if (!tokenMatch || !serverMatch) {
      throw new Error('Form data not found');
    }
    
    const token = tokenMatch[1];
    const buildServer = serverMatch[1];
    const buildServerId = serverIdMatch ? serverIdMatch[1] : '2';
    
    // Step 2: Submit form
    const formData = new URLSearchParams();
    formData.append('text[]', text);
    formData.append('token', token);
    formData.append('build_server', buildServer);
    formData.append('build_server_id', buildServerId);
    formData.append('submit', 'GO');
    
    console.log('Submitting form...');
    const postRes = await axios.post(effectUrl, formData.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': effectUrl,
        'Origin': 'https://en.ephoto360.com',
      },
      timeout: 20000
    });
    
    // Step 3: Find the URL
    const html = postRes.data;
    const downloadUrl = findSaveButtonUrl(html);
    
    if (!downloadUrl) {
      // Show what we actually got
      console.log('HTML length:', html.length);
      console.log('First 2000 chars:', html.substring(0, 2000));
      
      // Try one more method: search for any image URL
      const anyImageMatch = html.match(/(https:\/\/e[0-9]\.yotools\.net\/[a-zA-Z0-9_\/\-\.]+\.jpg)/);
      if (anyImageMatch) {
        return {
          success: true,
          image_url: anyImageMatch[1],
          download_url: anyImageMatch[1]
        };
      }
      
      throw new Error('Could not find image URL in response');
    }
    
    // Construct image URL from download URL
    let imageUrl = downloadUrl;
    
    // If it's a save-image URL, convert to image URL
    if (downloadUrl.includes('/save-image/')) {
      const filenameMatch = downloadUrl.match(/save-image\/([a-zA-Z0-9]+)\.jpg/);
      if (filenameMatch) {
        const filename = filenameMatch[1];
        const date = new Date();
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        imageUrl = `https://e1.yotools.net/images/user_image/${year}/${month}/${filename}.jpg`;
      }
    }
    
    console.log('Success!');
    console.log('Download URL:', downloadUrl);
    console.log('Image URL:', imageUrl);
    
    return {
      success: true,
      image_url: imageUrl,
      download_url: downloadUrl
    };
    
  } catch (error) {
    console.error('Error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// API Routes
app.get('/', (req, res) => {
  res.json({
    message: 'ephoto360 API - Direct Pattern Matching',
    endpoints: ['/api/logo'],
    example: '/api/logo?url=EPHOTO_URL&name=TEXT'
  });
});

app.get('/api/logo', async (req, res) => {
  try {
    const { url, name } = req.query;
    
    if (!url || !name) {
      return res.status(400).json({
        success: false,
        error: 'Need url and name parameters'
      });
    }
    
    const result = await generateLogo(url, name);
    
    if (result.success) {
      res.json({
        success: true,
        result: {
          image_url: result.image_url,
          download_url: result.download_url
        }
      });
    } else {
      res.status(500).json(result);
    }
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Test endpoint that shows raw HTML
app.get('/api/raw', async (req, res) => {
  try {
    const { url, name } = req.query;
    
    if (!url || !name) {
      return res.json({ error: 'Need url and name' });
    }
    
    // Get page
    const pageRes = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 10000
    });
    
    // Extract token
    const tokenMatch = pageRes.data.match(/name="token" value="([^"]+)"/);
    const serverMatch = pageRes.data.match(/name="build_server" value="([^"]+)"/);
    
    if (!tokenMatch || !serverMatch) {
      return res.json({ error: 'No form data found' });
    }
    
    // Submit form
    const formData = new URLSearchParams();
    formData.append('text[]', name);
    formData.append('token', tokenMatch[1]);
    formData.append('build_server', serverMatch[1]);
    formData.append('build_server_id', '2');
    formData.append('submit', 'GO');
    
    const postRes = await axios.post(url, formData.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': url
      },
      timeout: 15000
    });
    
    // Return first 5000 chars of HTML
    const html = postRes.data;
    const hasSaveImage = html.includes('save-image');
    const saveImageIndex = html.indexOf('save-image');
    const snippet = saveImageIndex !== -1 
      ? html.substring(Math.max(0, saveImageIndex - 200), Math.min(html.length, saveImageIndex + 300))
      : 'No save-image found';
    
    res.json({
      html_length: html.length,
      has_save_image: hasSaveImage,
      save_image_snippet: snippet,
      first_1000_chars: html.substring(0, 1000)
    });
    
  } catch (error) {
    res.json({ error: error.message });
  }
});

module.exports = app;
