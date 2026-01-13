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

// Main function to generate logo
async function generateEphotoLogo(effectUrl, text) {
  try {
    console.log(`Generating logo: ${effectUrl} - "${text}"`);
    
    // Step 1: Get the effect page
    const pageResponse = await axios.get(effectUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Referer': 'https://en.ephoto360.com/',
        'Upgrade-Insecure-Requests': '1'
      },
      timeout: 10000
    });
    
    const $ = cheerio.load(pageResponse.data);
    
    // Extract form data
    const token = $('input[name="token"]').val();
    const buildServer = $('input[name="build_server"]').val();
    const buildServerId = $('input[name="build_server_id"]').val();
    
    if (!token || !buildServer) {
      throw new Error('Could not extract required form data');
    }
    
    console.log('Form data extracted:', { token: token.substring(0, 10) + '...', buildServer, buildServerId });
    
    // Step 2: Prepare form data (use URLSearchParams instead of FormData)
    const formData = new URLSearchParams();
    formData.append('text[]', text);
    formData.append('token', token);
    formData.append('build_server', buildServer);
    formData.append('build_server_id', buildServerId || '2');
    formData.append('submit', 'GO');
    
    // Step 3: Submit the form
    const postResponse = await axios.post(effectUrl, formData.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Referer': effectUrl,
        'Origin': 'https://en.ephoto360.com',
        'Upgrade-Insecure-Requests': '1',
        'Cookie': pageResponse.headers['set-cookie'] ? pageResponse.headers['set-cookie'].join('; ') : ''
      },
      maxRedirects: 5,
      timeout: 20000
    });
    
    const resultHtml = postResponse.data;
    
    // Step 4: Extract image URLs using the exact patterns you found
    let imageUrl = null;
    let downloadUrl = null;
    
    // Pattern 1: Look for the save button with exact href pattern
    const saveButtonMatch = resultHtml.match(/href="(https:\/\/e[0-9]\.yotools\.net\/save-image\/[^"]+\.jpg\/[0-9]+)"/);
    if (saveButtonMatch) {
      downloadUrl = saveButtonMatch[1];
      console.log('Found download URL from save button:', downloadUrl);
      
      // Extract filename from download URL to construct image URL
      const filenameMatch = downloadUrl.match(/save-image\/([^\/]+)\.jpg/);
      if (filenameMatch) {
        const filename = filenameMatch[1];
        // Construct image URL pattern: https://e1.yotools.net/images/user_image/YYYY/MM/filename.jpg
        const date = new Date();
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        imageUrl = `https://e1.yotools.net/images/user_image/${year}/${month}/${filename}.jpg`;
        console.log('Constructed image URL:', imageUrl);
      }
    }
    
    // Pattern 2: Look for image URL in the HTML directly
    if (!imageUrl) {
      const imageUrlMatch = resultHtml.match(/src="(https:\/\/e[0-9]\.yotools\.net\/images\/user_image\/[^"]+\.jpg)"/);
      if (imageUrlMatch) {
        imageUrl = imageUrlMatch[1];
        console.log('Found direct image URL:', imageUrl);
      }
    }
    
    // Pattern 3: Look for bg-image class
    if (!imageUrl) {
      const $result = cheerio.load(resultHtml);
      const bgImageSrc = $result('img.bg-image').attr('src');
      if (bgImageSrc) {
        imageUrl = bgImageSrc.startsWith('http') ? bgImageSrc : 'https:' + bgImageSrc;
        console.log('Found bg-image URL:', imageUrl);
      }
    }
    
    // Pattern 4: Generic search for yotools.net image URLs
    if (!imageUrl) {
      const yotoolsImageMatch = resultHtml.match(/(https:\/\/e[0-9]\.yotools\.net\/[^"\s<>]+\.(jpg|png|jpeg))/);
      if (yotoolsImageMatch) {
        imageUrl = yotoolsImageMatch[1];
        console.log('Found generic yotools image:', imageUrl);
      }
    }
    
    // If we have imageUrl but no downloadUrl, use imageUrl for both
    if (imageUrl && !downloadUrl) {
      downloadUrl = imageUrl;
    }
    
    // If we have downloadUrl but no imageUrl, try to convert it
    if (downloadUrl && !imageUrl) {
      // Try to convert save-image URL to image URL
      if (downloadUrl.includes('/save-image/')) {
        const filenameMatch = downloadUrl.match(/save-image\/([^\/]+)\.jpg/);
        if (filenameMatch) {
          const filename = filenameMatch[1];
          const date = new Date();
          const year = date.getFullYear();
          const month = (date.getMonth() + 1).toString().padStart(2, '0');
          imageUrl = `https://e1.yotools.net/images/user_image/${year}/${month}/${filename}.jpg`;
        }
      } else {
        imageUrl = downloadUrl;
      }
    }
    
    if (!imageUrl || !downloadUrl) {
      // For debugging: show a snippet of the HTML
      const htmlSnippet = resultHtml.substring(0, 3000);
      console.log('HTML snippet for debugging:', htmlSnippet);
      throw new Error('Could not extract image URLs from response');
    }
    
    return {
      success: true,
      image_url: imageUrl,
      download_url: downloadUrl
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
    message: 'ephoto360 API - Working Version',
    status: 'running',
    endpoints: {
      '/api/logo': 'GET - Generate logo',
      '/api/test': 'GET - Test endpoint',
      '/api/health': 'GET - Health check'
    },
    example: '/api/logo?url=https://en.ephoto360.com/naruto-shippuden-logo-style-text-effect-online-808.html&name=Naruto'
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
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
        error: 'Missing parameters. Use: /api/logo?url=EPHOTO_URL&name=TEXT',
        example: '/api/logo?url=https://en.ephoto360.com/naruto-shippuden-logo-style-text-effect-online-808.html&name=YourText'
      });
    }
    
    const result = await generateEphotoLogo(url, name);
    
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

// Error handling
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
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
