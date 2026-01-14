const axios = require('axios');

module.exports = async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    try {
        const { url, text } = req.query;
        
        if (!url || !text) {
            return res.json({ error: 'Need url and text' });
        }
        
        console.log('DEBUG: Starting request...');
        
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9'
        };
        
        // Step 1: Get the page
        console.log('DEBUG: Getting page...');
        const pageRes = await axios.get(url, { headers });
        console.log('DEBUG: Page loaded, length:', pageRes.data.length);
        
        // Extract token using regex
        const tokenMatch = pageRes.data.match(/name="token"\s+value="([^"]+)"/);
        console.log('DEBUG: Token match:', !!tokenMatch);
        
        if (!tokenMatch) {
            return res.json({ 
                error: 'Token not found',
                debug: { sample: pageRes.data.substring(0, 500) }
            });
        }
        
        const token = tokenMatch[1];
        console.log('DEBUG: Token found (first 10):', token.substring(0, 10) + '...');
        
        // Step 2: Submit form
        console.log('DEBUG: Submitting form...');
        const formData = new URLSearchParams();
        formData.append('text[]', text);
        formData.append('token', token);
        formData.append('build_server', 'https://e1.yotools.net');
        formData.append('build_server_id', '2');
        formData.append('submit', 'GO');
        
        const postRes = await axios.post(url, formData.toString(), {
            headers: {
                ...headers,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Origin': 'https://en.ephoto360.com',
                'Referer': url
            },
            timeout: 25000
        });
        
        console.log('DEBUG: Form submitted, response length:', postRes.data.length);
        console.log('DEBUG: First 500 chars:', postRes.data.substring(0, 500));
        
        // Look for save-image URL
        const saveMatch = postRes.data.match(/href="(https:\/\/e[0-9]\.yotools\.net\/save-image\/([^\.]+)\.jpg\/[^"]+)"/);
        console.log('DEBUG: Save match found:', !!saveMatch);
        
        if (saveMatch) {
            const saveUrl = saveMatch[1];
            const imageId = saveMatch[2];
            const server = saveUrl.split('/')[2];
            const imageUrl = `https://${server}/images/user_image/${imageId}.jpg`;
            
            console.log('DEBUG: Success! Image URL:', imageUrl);
            
            return res.json({
                success: true,
                result: {
                    download_url: imageUrl,
                    direct_download: saveUrl,
                    image_id: imageId
                }
            });
        }
        
        // Look for any image URL
        const imgMatch = postRes.data.match(/(https:\/\/e[0-9]\.yotools\.net\/images\/user_image\/[a-f0-9]+\.jpg)/i);
        console.log('DEBUG: Image match found:', !!imgMatch);
        
        if (imgMatch) {
            const imageUrl = imgMatch[0];
            return res.json({
                success: true,
                result: {
                    download_url: imageUrl,
                    direct_download: imageUrl.replace('/images/user_image/', '/save-image/')
                }
            });
        }
        
        // Return debug info
        return res.json({
            success: false,
            error: 'No image found',
            debug: {
                response_length: postRes.data.length,
                has_save: postRes.data.includes('save-image'),
                has_token_again: postRes.data.includes('name="token"'),
                first_300: postRes.data.substring(0, 300),
                last_300: postRes.data.substring(postRes.data.length - 300)
            }
        });
        
    } catch (error) {
        console.error('DEBUG Error:', error.message);
        return res.json({ 
            error: error.message,
            stack: error.stack?.split('\n')[0]
        });
    }
};
