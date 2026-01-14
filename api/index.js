const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    try {
        const { url, text } = req.query;
        
        if (!url || !text) {
            return res.json({ 
                success: false, 
                error: 'Parameters: url, text',
                example: '/api/logo?url=https://en.ephoto360.com/naruto-shippuden-logo-style-text-effect-online-808.html&text=Naruto'
            });
        }

        const result = await getEphotoImage(url, text.trim());
        return res.json(result);
        
    } catch (error) {
        return res.json({ 
            success: false, 
            error: error.message 
        });
    }
};

async function getEphotoImage(pageUrl, inputText) {
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://en.ephoto360.com/'
    };

    // Step 1: Get page and extract token
    const pageRes = await axios.get(pageUrl, { headers });
    const $page = cheerio.load(pageRes.data);
    
    const token = $page('input[name="token"]').val();
    if (!token) throw new Error('Token not found');
    
    // Step 2: Submit form
    const formData = new URLSearchParams();
    formData.append('text[]', inputText);
    formData.append('token', token);
    formData.append('build_server', $page('input[name="build_server"]').val() || 'https://e1.yotools.net');
    formData.append('build_server_id', $page('input[name="build_server_id"]').val() || '2');
    formData.append('submit', 'GO');
    
    const postRes = await axios.post(pageUrl, formData.toString(), {
        headers: {
            ...headers,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Origin': 'https://en.ephoto360.com',
            'Referer': pageUrl
        },
        timeout: 20000
    });
    
    // Step 3: Extract image URL from Save button
    const html = postRes.data;
    
    // Method 1: Extract from save-image URL
    const saveUrlMatch = html.match(/href="(https:\/\/e[0-9]\.yotools\.net\/save-image\/([a-z0-9]+)\.jpg\/\d+)"/i);
    if (saveUrlMatch) {
        const saveUrl = saveUrlMatch[1];
        const imageId = saveUrlMatch[2];
        const server = saveUrl.split('/')[2];
        
        return {
            success: true,
            result: {
                download_url: `https://${server}/images/user_image/${imageId}.jpg`,
                direct_download: saveUrl,
                text: inputText,
                server: server,
                image_id: imageId
            }
        };
    }
    
    // Method 2: Use Cheerio to find save button
    const $result = cheerio.load(html);
    const saveBtn = $('#save-image-btn', html).attr('href') || 
                   $('a.btn-primary[href*="save-image"]', html).attr('href');
    
    if (saveBtn && saveBtn.includes('save-image')) {
        const parts = saveBtn.split('/');
        const imageId = parts[parts.length - 2].replace('.jpg', '');
        const server = parts[2];
        
        return {
            success: true,
            result: {
                download_url: `https://${server}/images/user_image/${imageId}.jpg`,
                direct_download: saveBtn,
                text: inputText
            }
        };
    }
    
    // Method 3: Look for direct image URL
    const imgMatch = html.match(/(https:\/\/e[0-9]\.yotools\.net\/images\/user_image\/[a-z0-9]+\.(jpg|png))/i);
    if (imgMatch) {
        const imageUrl = imgMatch[0];
        return {
            success: true,
            result: {
                download_url: imageUrl,
                direct_download: imageUrl.replace('/images/user_image/', '/save-image/'),
                text: inputText
            }
        };
    }
    
    throw new Error('Image URL not found in response');
}
