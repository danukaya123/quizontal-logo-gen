// ephoto-api.js - Fixed version without Puppeteer
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const app = express();

app.use(express.json());

// CORS middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
});

// API endpoint
app.get('/api/logo', async (req, res) => {
    try {
        const { url, name } = req.query;
        
        if (!url || !name) {
            return res.status(400).json({ 
                success: false, 
                error: 'Missing url or name parameter' 
            });
        }

        console.log(`Processing: ${url} with text: ${name}`);

        // Use axios method only (no puppeteer)
        const result = await createLogoWithAxios(url, name);
        
        if (!result.success) {
            return res.status(500).json(result);
        }

        res.json(result);
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Improved axios method
async function createLogoWithAxios(url, text) {
    try {
        // Set custom headers to mimic browser
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Cache-Control': 'max-age=0'
        };

        // Step 1: Get initial page
        console.log('Fetching initial page...');
        const getResponse = await axios.get(url, { 
            headers,
            timeout: 30000 
        });
        
        const $ = cheerio.load(getResponse.data);
        
        // Extract form data
        const token = $('input[name="token"]').val();
        const buildServer = $('input[name="build_server"]').val();
        const buildServerId = $('input[name="build_server_id"]').val();
        
        if (!token) {
            console.log('Token not found. HTML sample:', getResponse.data.substring(0, 1000));
            return { 
                success: false, 
                error: 'Token not found on page' 
            };
        }

        console.log('Extracted token:', token.substring(0, 10) + '...');

        // Step 2: Prepare form data
        const formData = new URLSearchParams();
        formData.append('text[]', text);
        formData.append('token', token);
        formData.append('build_server', buildServer || 'https://e1.yotools.net');
        formData.append('build_server_id', buildServerId || '2');
        formData.append('submit', 'GO');

        // Step 3: Submit form
        console.log('Submitting form...');
        const postHeaders = {
            ...headers,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Origin': 'https://en.ephoto360.com',
            'Referer': url,
            'X-Requested-With': 'XMLHttpRequest'
        };

        const postResponse = await axios.post(url, formData.toString(), {
            headers: postHeaders,
            timeout: 45000, // Increased timeout for image processing
            maxRedirects: 5,
            validateStatus: (status) => status < 500
        });

        console.log('Response status:', postResponse.status);
        
        // Step 4: Parse response and find image
        const result$ = cheerio.load(postResponse.data);
        
        // Method 1: Look for img tag with bg-image class
        let imageUrl = result$('img.bg-image').attr('src');
        
        // Method 2: Search in HTML for image patterns
        if (!imageUrl) {
            const html = postResponse.data;
            
            // Pattern 1: Direct image URL
            const regex1 = /(https:\/\/e[0-9]\.yotools\.net\/images\/user_image\/[^"'\s]+)/g;
            const matches = html.match(regex1);
            if (matches && matches.length > 0) {
                imageUrl = matches[0];
            }
            
            // Pattern 2: In src attribute
            if (!imageUrl) {
                const regex2 = /src="(https:\/\/e[0-9]\.yotools\.net\/images\/user_image\/[^"]+)"/;
                const match = html.match(regex2);
                if (match) imageUrl = match[1];
            }
            
            // Pattern 3: Look for any .jpg URL
            if (!imageUrl) {
                const regex3 = /(https:\/\/[^"\s]+\.jpg)/g;
                const jpgMatches = html.match(regex3);
                if (jpgMatches) {
                    for (const match of jpgMatches) {
                        if (match.includes('yotools.net') && match.includes('user_image')) {
                            imageUrl = match;
                            break;
                        }
                    }
                }
            }
        }

        // Method 3: Try to extract from JavaScript variables
        if (!imageUrl) {
            const scriptRegex = /var\s+image_url\s*=\s*['"]([^'"]+)['"]/;
            const scriptMatch = postResponse.data.match(scriptRegex);
            if (scriptMatch) {
                imageUrl = scriptMatch[1];
            }
        }

        if (!imageUrl) {
            console.log('Could not find image URL in response.');
            console.log('Response sample:', postResponse.data.substring(0, 2000));
            
            // Check if it's a delayed response (image is being generated)
            if (postResponse.data.includes('Creating image') || 
                postResponse.data.includes('Please wait') ||
                postResponse.data.includes('Processing')) {
                
                return {
                    success: false,
                    error: 'Image is still being generated. Try again in 10 seconds.',
                    retry: true
                };
            }
            
            return { 
                success: false, 
                error: 'Image URL not found in response' 
            };
        }

        console.log('Found image URL:', imageUrl);
        
        // Create direct download URL
        let directDownload = imageUrl;
        if (imageUrl.includes('/images/user_image/')) {
            const filename = imageUrl.split('/').pop();
            directDownload = `https://e1.yotools.net/save-image/${filename}`;
        }

        return {
            success: true,
            result: {
                download_url: imageUrl,
                direct_download: directDownload,
                text: text,
                effect_url: url
            }
        };
        
    } catch (error) {
        console.error('Axios error:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
        }
        return { 
            success: false, 
            error: `Request failed: ${error.message}` 
        };
    }
}

// Health check endpoint
app.get('/', (req, res) => {
    res.json({ 
        status: 'online',
        service: 'Ephoto360 Logo Generator API',
        endpoints: {
            logo: '/api/logo?url=EPHOTO_URL&name=TEXT',
            example: '/api/logo?url=https://en.ephoto360.com/naruto-shippuden-logo-style-text-effect-online-808.html&name=Naruto'
        }
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
    });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

module.exports = app;
