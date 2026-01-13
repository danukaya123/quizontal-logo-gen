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

// Debug endpoint to see raw HTML
app.get('/api/debug', async (req, res) => {
  try {
    const { url, name } = req.query;
    
    if (!url || !name) {
      return res.json({
        error: 'Provide url and name parameters',
        example: '/api/debug?url=https://en.ephoto360.com/naruto-shippuden-logo-style-text-effect-online-808.html&name=TEST'
      });
    }
    
    console.log('Debug request:', { url, name });
    
    // Step 1: Get the page
    const pageResponse = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      timeout: 10000
    });
    
    const $ = cheerio.load(pageResponse.data);
    
    // Extract form data
    const token = $('input[name="token"]').val();
    const buildServer = $('input[name="build_server"]').val();
    const buildServerId = $('input[name="build_server_id"]').val();
    
    const formData = new URLSearchParams();
    formData.append('text[]', name);
    formData.append('token', token);
    formData.append('build_server', buildServer);
    formData.append('build_server_id', buildServerId || '2');
    formData.append('submit', 'GO');
    
    // Step 2: Submit form
    const postResponse = await axios.post(url, formData.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': url,
        'Origin': 'https://en.ephoto360.com',
      },
      timeout: 15000
    });
    
    // Return raw HTML for inspection
    const rawHtml = postResponse.data;
    
    // Find any image-like patterns
    const imagePatterns = rawHtml.match(/https?:\/\/[^\s"']*\.(jpg|png|jpeg|webp|gif)/gi) || [];
    
    // Find any src attributes
    const srcPatterns = rawHtml.match(/src=["']([^"']+)["']/gi) || [];
    
    // Find any href attributes
    const hrefPatterns = rawHtml.match(/href=["']([^"']+)["']/gi) || [];
    
    // Extract just the first 2000 chars of HTML
    const htmlPreview = rawHtml.substring(0, 2000);
    
    res.json({
      status: 'success',
      data: {
        token_found: !!token,
        build_server_found: !!buildServer,
        response_length: rawHtml.length,
        html_preview: htmlPreview,
        found_image_patterns: imagePatterns.slice(0, 10),
        found_src_attributes: srcPatterns.slice(0, 10),
        found_href_attributes: hrefPatterns.slice(0, 10),
        contains_yotools: rawHtml.includes('yotools.net'),
        contains_user_image: rawHtml.includes('/user_image/'),
        contains_save_image: rawHtml.includes('save-image'),
        contains_view_image: rawHtml.includes('view-image-wrapper'),
        contains_bg_image: rawHtml.includes('bg-image')
      }
    });
    
  } catch (error) {
    res.json({
      status: 'error',
      error: error.message,
      stack: error.stack
    });
  }
});

// Main logo endpoint (simplified)
app.get('/api/logo', async (req, res) => {
  try {
    const { url, name } = req.query;
    
    if (!url || !name) {
      return res.status(400).json({
        success: false,
        error: 'Missing parameters'
      });
    }
    
    // Get the page
    const pageResponse = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      timeout: 10000
    });
    
    const $ = cheerio.load(pageResponse.data);
    
    // Extract form data
    const token = $('input[name="token"]').val();
    const buildServer = $('input[name="build_server"]').val();
    const buildServerId = $('input[name="build_server_id"]').val();
    
    if (!token || !buildServer) {
      throw new Error('Form data not found');
    }
    
    // Submit form
    const formData = new URLSearchParams();
    formData.append('text[]', name);
    formData.append('token', token);
    formData.append('build_server', buildServer);
    formData.append('build_server_id', buildServerId || '2');
    formData.append('submit', 'GO');
    
    const postResponse = await axios.post(url, formData.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': url,
        'Origin': 'https://en.ephoto360.com',
      },
      timeout: 20000,
      maxRedirects: 5
    });
    
    // Try to find image using multiple methods
    const html = postResponse.data;
    let imageUrl = null;
    
    // Method 1: Regex for any image URL
    const imageRegex = /(https?:\/\/[^\s"']*\.(jpg|png|jpeg|webp))/gi;
    const matches = html.match(imageRegex);
    
    if (matches) {
      for (const match of matches) {
        if (match.includes('yotools.net') || match.includes('/user_image/')) {
          imageUrl = match;
          break;
        }
      }
    }
    
    // Method 2: Look for specific patterns
    if (!imageUrl) {
      const patterns = [
        /https:\/\/e[0-9]\.yotools\.net\/[^"'\s]+\.(jpg|png|jpeg)/i,
        /https:\/\/[^"'\s]*\/user_image\/[^"'\s]+\.(jpg|png|jpeg)/i,
        /\/images\/user_image\/[^"'\s]+\.(jpg|png|jpeg)/i
      ];
      
      for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match) {
          imageUrl = match[0];
          if (!imageUrl.startsWith('http')) {
            imageUrl = 'https:' + imageUrl;
          }
          break;
        }
      }
    }
    
    if (!imageUrl) {
      // Return more debug info
      return res.json({
        success: false,
        error: 'Could not find generated image',
        debug: {
          response_length: html.length,
          contains_yotools: html.includes('yotools.net'),
          contains_image_ext: html.includes('.jpg') || html.includes('.png'),
          sample: html.substring(0, 1000) // First 1000 chars for inspection
        }
      });
    }
    
    res.json({
      success: true,
      result: {
        image_url: imageUrl,
        download_url: imageUrl
      }
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      type: error.name
    });
  }
});

// Home
app.get('/', (req, res) => {
  res.json({
    status: 'OK',
    endpoints: [
      '/api/logo?url=EPHOTO_URL&name=TEXT',
      '/api/debug?url=EPHOTO_URL&name=TEXT'
    ]
  });
});

module.exports = app;
