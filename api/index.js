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
                error: 'Missing url or name parameters' 
            });
        }

        console.log(`Processing: ${url} with text: ${name}`);
        const result = await generateEphotoLogo(url, name);
        
        return res.json(result);
        
    } catch (error) {
        console.error('API Error:', error.message);
        return res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
};

async function generateEphotoLogo(url, text) {
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Cache-Control': 'max-age=0'
    };

    try {
        // Step 1: Get initial page
        console.log('Step 1: Fetching page...');
        const getResponse = await axios.get(url, { 
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
            throw new Error('Security token not found');
        }

        // Get other form fields
        const buildServer = $('input[name="build_server"]').val() || 'https://e1.yotools.net';
        const buildServerId = $('input[name="build_server_id"]').val() || '2';

        console.log('Step 2: Submitting form...');
        
        // Step 2: Submit form
        const formData = new URLSearchParams();
        formData.append('text[]', text);
        formData.append('token', token);
        formData.append('build_server', buildServer);
        formData.append('build_server_id', buildServerId);
        formData.append('submit', 'GO');

        const postHeaders = {
            ...headers,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Origin': 'https://en.ephoto360.com',
            'Referer': url
        };

        const postResponse = await axios.post(url, formData.toString(), {
            headers: postHeaders,
            timeout: 30000,
            maxRedirects: 5
        });

        console.log('Step 3: Parsing response for image URL...');
        
        // Step 3: Extract image URL from Save button href
        const resultHtml = postResponse.data;
        
        // Look for the save button href
        const saveButtonRegex = /href="(https:\/\/e[0-9]\.yotools\.net\/save-image\/([a-f0-9]+)\.jpg\/\d+)"/i;
        const saveButtonMatch = resultHtml.match(saveButtonRegex);
        
        if (saveButtonMatch) {
            const saveUrl = saveButtonMatch[1];
            const imageId = saveButtonMatch[2];
            
            // Construct the actual image URL
            const imageUrl = `https://${saveUrl.split('/')[2]}/images/user_image/${imageId}.jpg`;
            const directDownload = saveUrl;
            
            console.log('Success! Image URL:', imageUrl);
            
            return {
                success: true,
                result: {
                    download_url: imageUrl,
                    direct_download: directDownload,
                    text: text,
                    image_id: imageId
                }
            };
        }

        // Alternative: Look for image in img tags
        const $result = cheerio.load(resultHtml);
        
        // Check #save-image-btn
        const saveButtonHref = $result('#save-image-btn').attr('href');
        if (saveButtonHref) {
            const parts = saveButtonHref.split('/');
            const imageId = parts[parts.length - 2].replace('.jpg', '');
            const server = parts[2];
            
            const imageUrl = `https://${server}/images/user_image/${imageId}.jpg`;
            
            return {
                success: true,
                result: {
                    download_url: imageUrl,
                    direct_download: saveButtonHref,
                    text: text,
                    image_id: imageId
                }
            };
        }

        // Look for any save-image URL
        const anySaveUrlMatch = resultHtml.match(/(https:\/\/e[0-9]\.yotools\.net\/save-image\/[^"']+)/);
        if (anySaveUrlMatch) {
            const saveUrl = anySaveUrlMatch[0];
            const parts = saveUrl.split('/');
            const imageId = parts[parts.length - 2].replace('.jpg', '');
            const server = parts[2];
            
            const imageUrl = `https://${server}/images/user_image/${imageId}.jpg`;
            
            return {
                success: true,
                result: {
                    download_url: imageUrl,
                    direct_download: saveUrl,
                    text: text,
                    image_id: imageId
                }
            };
        }

        // If we can't find the save button, try to find the image directly
        const imageRegex = /(https:\/\/e[0-9]\.yotools\.net\/images\/user_image\/[a-f0-9]+\.jpg)/i;
        const imageMatch = resultHtml.match(imageRegex);
        
        if (imageMatch) {
            const imageUrl = imageMatch[0];
            const directDownload = imageUrl.replace('/images/user_image/', '/save-image/');
            
            return {
                success: true,
                result: {
                    download_url: imageUrl,
                    direct_download: directDownload,
                    text: text
                }
            };
        }

        // Check if we got an error or the original page
        if (resultHtml.includes('input[name="token"]')) {
            throw new Error('Form submission failed - returned to input page');
        }

        // If we get a "processing" message
        if (resultHtml.includes('Creating') || resultHtml.includes('Please wait')) {
            // Try to wait and retry (simplified)
            return {
                success: false,
                error: 'Image is being generated. Try again in 10 seconds.',
                retry: true
            };
        }

        throw new Error('Could not find image URL in response');
        
    } catch (error) {
        console.error('Error generating logo:', error.message);
        
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
            error: error.message
        };
    }
}
