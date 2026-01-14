const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // Handle OPTIONS request for CORS
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const { url, name } = req.query;
        
        if (!url || !name) {
            return res.status(400).json({ 
                success: false, 
                error: 'Missing url or name parameter' 
            });
        }

        console.log(`Processing: ${url} with text: ${name}`);

        const result = await createLogo(url, name);
        
        if (!result.success) {
            return res.status(500).json(result);
        }
        
        return res.json(result);
        
    } catch (error) {
        console.error('Error:', error.message);
        return res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
};

async function createLogo(url, text) {
    try {
        // Enhanced headers to mimic real browser
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Cache-Control': 'max-age=0',
            'Referer': 'https://en.ephoto360.com/'
        };

        console.log('Step 1: Fetching page...');
        
        // Step 1: Get the page
        const getResponse = await axios.get(url, { 
            headers,
            timeout: 15000
        });

        console.log('Step 2: Parsing HTML...');
        const $ = cheerio.load(getResponse.data);
        
        // Debug: Log form HTML
        const formHtml = $('form').html();
        console.log('Form HTML sample:', formHtml?.substring(0, 500));

        // Try different selectors for token
        let token = $('input[name="token"]').val();
        
        // Alternative selectors
        if (!token) {
            token = $('input#token').val();
        }
        
        if (!token) {
            // Try to extract from all input fields
            $('input[type="hidden"]').each((i, el) => {
                if ($(el).attr('name') === 'token') {
                    token = $(el).val();
                }
            });
        }

        if (!token) {
            // Last resort: search in entire HTML
            const tokenMatch = getResponse.data.match(/name="token"\s+value="([^"]+)"/);
            if (tokenMatch) {
                token = tokenMatch[1];
            }
        }

        if (!token) {
            return { 
                success: false, 
                error: 'Token not found. The website structure may have changed.',
                debug: {
                    url: url,
                    hasForm: $('form').length > 0,
                    hiddenInputs: $('input[type="hidden"]').length
                }
            };
        }

        console.log('Token found:', token.substring(0, 10) + '...');

        // Get other form fields
        let buildServer = $('input[name="build_server"]').val();
        let buildServerId = $('input[name="build_server_id"]').val();
        
        if (!buildServer) buildServer = 'https://e1.yotools.net';
        if (!buildServerId) buildServerId = '2';

        console.log('Step 3: Preparing form data...');
        
        // Prepare form data
        const formData = new URLSearchParams();
        formData.append('text[]', text);
        formData.append('token', token);
        formData.append('build_server', buildServer);
        formData.append('build_server_id', buildServerId);
        formData.append('submit', 'GO');

        console.log('Step 4: Submitting form...');
        
        // Step 2: Submit the form
        const postHeaders = {
            ...headers,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Origin': 'https://en.ephoto360.com',
            'Referer': url,
            'X-Requested-With': 'XMLHttpRequest'
        };

        const postResponse = await axios.post(url, formData.toString(), {
            headers: postHeaders,
            timeout: 30000,
            maxRedirects: 5
        });

        console.log('Step 5: Parsing response...');
        
        // Parse the response
        const result$ = cheerio.load(postResponse.data);
        
        // Try multiple ways to find the image
        let imageUrl = null;
        
        // Method 1: Direct selector
        imageUrl = result$('img.bg-image').attr('src');
        
        // Method 2: Search for image patterns
        if (!imageUrl) {
            const html = postResponse.data;
            
            // Pattern for ephoto360 images
            const patterns = [
                /(https:\/\/e[0-9]\.yotools\.net\/images\/user_image\/[^"'\s<>]+\.(jpg|png|jpeg))/i,
                /src\s*=\s*["'](https:\/\/e[0-9]\.yotools\.net\/images\/user_image\/[^"']+)["']/i,
                /"image_url"\s*:\s*["'](https:\/\/[^"']+)["']/i,
                /background-image\s*:\s*url\(["']?(https:\/\/e[0-9]\.yotools\.net\/images\/user_image\/[^"')]+)["']?\)/i
            ];
            
            for (const pattern of patterns) {
                const match = html.match(pattern);
                if (match) {
                    imageUrl = match[1];
                    break;
                }
            }
        }
        
        // Method 3: Look for any .jpg URL
        if (!imageUrl) {
            const html = postResponse.data;
            const jpgUrls = html.match(/(https?:\/\/[^"\s<>]+\.jpg)/gi);
            if (jpgUrls) {
                for (const jpgUrl of jpgUrls) {
                    if (jpgUrl.includes('yotools.net') && jpgUrl.includes('user_image')) {
                        imageUrl = jpgUrl;
                        break;
                    }
                }
            }
        }

        if (!imageUrl) {
            console.log('Could not find image. Response sample:', postResponse.data.substring(0, 1000));
            
            // Check if we got a wait message
            if (postResponse.data.includes('Please wait') || 
                postResponse.data.includes('Creating') ||
                postResponse.data.includes('Processing')) {
                return {
                    success: false,
                    error: 'Image is being generated. The website may be slow. Try again in a few seconds.',
                    retry: true
                };
            }
            
            return { 
                success: false, 
                error: 'Could not extract image URL from response',
                debug: {
                    responseLength: postResponse.data.length,
                    hasImageTag: result$('img').length > 0
                }
            };
        }

        console.log('Image found:', imageUrl);
        
        // Create direct download URL
        const directUrl = imageUrl.replace('/images/user_image/', '/save-image/');
        
        return {
            success: true,
            result: {
                download_url: imageUrl,
                direct_download: directUrl,
                text: text,
                effect: url
            }
        };

    } catch (error) {
        console.error('Error in createLogo:', error.message);
        
        if (error.code === 'ECONNABORTED') {
            return { 
                success: false, 
                error: 'Request timeout. The website might be slow.' 
            };
        }
        
        if (error.response) {
            console.error('Response status:', error.response.status);
            return { 
                success: false, 
                error: `Website returned status ${error.response.status}` 
            };
        }
        
        return { 
            success: false, 
            error: `Request failed: ${error.message}` 
        };
    }
}

// Health check endpoint
module.exports.config = {
    api: {
        bodyParser: false,
    },
};
