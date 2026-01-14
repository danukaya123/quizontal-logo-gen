const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
    // Disable caching
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // Handle OPTIONS request for CORS
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const { url, text } = req.query;
        
        if (!url || !text) {
            return res.status(400).json({ 
                success: false, 
                error: 'Missing url or text parameters',
                example: '/api/logo?url=EPHOTO_URL&text=YOUR_TEXT'
            });
        }

        console.log(`Processing: ${url} with text: ${text}`);
        const result = await generateEphotoLogo(url, text.trim());
        
        return res.status(200).json(result);
        
    } catch (error) {
        console.error('API Error:', error.message);
        return res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
};

async function generateEphotoLogo(pageUrl, inputText) {
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Cache-Control': 'no-cache'
    };

    try {
        console.log('Step 1: Fetching initial page...');
        
        // Step 1: Get the page
        const getResponse = await axios.get(pageUrl, { 
            headers,
            timeout: 15000
        });

        const $ = cheerio.load(getResponse.data);
        
        // Extract token
        let token = $('input[name="token"]').val();
        if (!token) {
            // Try alternative selectors
            token = $('input#token').val();
        }
        
        if (!token) {
            // Search in HTML
            const tokenMatch = getResponse.data.match(/name="token"\s+value="([^"]+)"/);
            if (tokenMatch) token = tokenMatch[1];
        }

        if (!token) {
            console.error('Token not found in HTML');
            throw new Error('Security token not found on the page');
        }

        console.log('Token found:', token.substring(0, 10) + '...');

        // Get other form fields
        const buildServer = $('input[name="build_server"]').val() || 'https://e1.yotools.net';
        const buildServerId = $('input[name="build_server_id"]').val() || '2';

        console.log('Step 2: Submitting form...');
        
        // Step 2: Submit form
        const formData = new URLSearchParams();
        formData.append('text[]', inputText);
        formData.append('token', token);
        formData.append('build_server', buildServer);
        formData.append('build_server_id', buildServerId);
        formData.append('submit', 'GO');

        const postHeaders = {
            ...headers,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Origin': 'https://en.ephoto360.com',
            'Referer': pageUrl
        };

        const postResponse = await axios.post(pageUrl, formData.toString(), {
            headers: postHeaders,
            timeout: 30000,
            maxRedirects: 5
        });

        console.log('Step 3: Parsing response...');
        
        // Step 3: Extract image URL from Save button
        const html = postResponse.data;
        
        // Method 1: Extract from save-image URL using regex
        console.log('Looking for save-image URL pattern...');
        const saveUrlMatch = html.match(/href="(https:\/\/e[0-9]\.yotools\.net\/save-image\/([a-f0-9]+)\.jpg\/\d+)"/i);
        
        if (saveUrlMatch && saveUrlMatch[1]) {
            const saveUrl = saveUrlMatch[1];
            const imageId = saveUrlMatch[2];
            const server = saveUrl.split('/')[2];
            
            const imageUrl = `https://${server}/images/user_image/${imageId}.jpg`;
            
            console.log('Success! Found save URL:', saveUrl);
            console.log('Image URL:', imageUrl);
            
            return {
                success: true,
                result: {
                    download_url: imageUrl,
                    direct_download: saveUrl,
                    text: inputText,
                    image_id: imageId,
                    server: server
                }
            };
        }

        // Method 2: Use Cheerio to find save button
        console.log('Trying Cheerio method...');
        const $result = cheerio.load(html);
        
        // Fix: Use Cheerio selector correctly
        const saveBtn = $result('#save-image-btn').attr('href');
        
        if (saveBtn && saveBtn.includes('save-image')) {
            console.log('Found save button:', saveBtn);
            const parts = saveBtn.split('/');
            const imageId = parts[parts.length - 2].replace('.jpg', '');
            const server = parts[2];
            
            const imageUrl = `https://${server}/images/user_image/${imageId}.jpg`;
            
            return {
                success: true,
                result: {
                    download_url: imageUrl,
                    direct_download: saveBtn,
                    text: inputText,
                    image_id: imageId
                }
            };
        }

        // Method 3: Look for any btn-primary with save-image
        const allButtons = $result('a.btn-primary');
        for (let i = 0; i < allButtons.length; i++) {
            const href = $result(allButtons[i]).attr('href');
            if (href && href.includes('save-image')) {
                console.log('Found save button in btn-primary:', href);
                const parts = href.split('/');
                const imageId = parts[parts.length - 2].replace('.jpg', '');
                const server = parts[2];
                
                const imageUrl = `https://${server}/images/user_image/${imageId}.jpg`;
                
                return {
                    success: true,
                    result: {
                        download_url: imageUrl,
                        direct_download: href,
                        text: inputText
                    }
                };
            }
        }

        // Method 4: Look for direct image URL
        console.log('Looking for direct image URL...');
        const imgMatch = html.match(/(https:\/\/e[0-9]\.yotools\.net\/images\/user_image\/[a-f0-9]+\.(jpg|png|jpeg))/i);
        if (imgMatch && imgMatch[0]) {
            const imageUrl = imgMatch[0];
            console.log('Found direct image URL:', imageUrl);
            
            const directDownload = imageUrl.replace('/images/user_image/', '/save-image/');
            
            return {
                success: true,
                result: {
                    download_url: imageUrl,
                    direct_download: directDownload,
                    text: inputText
                }
            };
        }

        // Method 5: Look for background image
        const bgMatch = html.match(/background-image\s*:\s*url\(['"]?(https:\/\/e[0-9]\.yotools\.net\/images\/user_image\/[^'")]+)['"]?\)/i);
        if (bgMatch && bgMatch[1]) {
            const imageUrl = bgMatch[1];
            console.log('Found background image:', imageUrl);
            
            const directDownload = imageUrl.replace('/images/user_image/', '/save-image/');
            
            return {
                success: true,
                result: {
                    download_url: imageUrl,
                    direct_download: directDownload,
                    text: inputText
                }
            };
        }

        // Debug: Check what we got
        console.log('Response length:', html.length);
        console.log('First 500 chars:', html.substring(0, 500));
        
        // Check if we got an error
        if (html.includes('Error') || html.includes('failed') || html.includes('Invalid')) {
            throw new Error('Website returned an error');
        }
        
        // Check if we're back on the form page
        if (html.includes('input[name="token"]')) {
            throw new Error('Form submission failed - returned to input page');
        }
        
        // Check if image is still processing
        if (html.includes('Creating') || html.includes('Please wait') || html.includes('Processing')) {
            // Try to extract image ID from the page
            const idMatch = html.match(/([a-f0-9]{12,})\.jpg/i);
            if (idMatch) {
                const imageId = idMatch[1];
                const imageUrl = `https://e1.yotools.net/images/user_image/${imageId}.jpg`;
                
                return {
                    success: true,
                    result: {
                        download_url: imageUrl,
                        direct_download: imageUrl.replace('/images/user_image/', '/save-image/'),
                        text: inputText,
                        note: 'Image might still be processing'
                    }
                };
            }
            
            return {
                success: false,
                error: 'Image is being generated. Please try again in 10 seconds.',
                retry: true
            };
        }

        throw new Error('Could not find image URL in the response');
        
    } catch (error) {
        console.error('Logo generation error:', error.message);
        
        if (error.code === 'ECONNABORTED') {
            return {
                success: false,
                error: 'Request timeout. The website might be slow.'
            };
        }
        
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data sample:', error.response.data?.substring?.(0, 200) || 'No data');
            
            return {
                success: false,
                error: `Website returned status ${error.response.status}`
            };
        }
        
        return {
            success: false,
            error: error.message
        };
    }
}
