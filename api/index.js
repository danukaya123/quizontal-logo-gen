const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    try {
        const { url, name } = req.query;
        
        if (!url || !name) {
            return res.json({ 
                success: false, 
                error: 'Need url and name parameters' 
            });
        }

        console.log(`Testing with: ${url} - Text: ${name}`);
        
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': 'https://en.ephoto360.com/'
        };

        // Step 1: Get the page
        const getResponse = await axios.get(url, { headers });
        const $ = cheerio.load(getResponse.data);
        
        // Find the form and token
        const token = $('input[name="token"]').val();
        console.log('Token:', token ? 'Found' : 'Not found');
        
        if (!token) {
            // Show what we got
            return res.json({
                success: false,
                error: 'No token found',
                debug: {
                    title: $('title').text(),
                    formExists: $('form').length > 0,
                    sampleHtml: getResponse.data.substring(0, 1000)
                }
            });
        }

        // Step 2: Submit form
        const formData = new URLSearchParams();
        formData.append('text[]', name);
        formData.append('token', token);
        formData.append('build_server', 'https://e1.yotools.net');
        formData.append('build_server_id', '2');
        formData.append('submit', 'GO');

        const postHeaders = {
            ...headers,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Origin': 'https://en.ephoto360.com',
            'Referer': url
        };

        const postResponse = await axios.post(url, formData.toString(), { headers: postHeaders });
        
        // Analyze the response
        const result$ = cheerio.load(postResponse.data);
        
        // Find ALL images in the response
        const allImages = [];
        result$('img').each((i, el) => {
            const src = result$(el).attr('src');
            if (src) {
                allImages.push({
                    src: src,
                    class: result$(el).attr('class') || 'no-class',
                    id: result$(el).attr('id') || 'no-id'
                });
            }
        });

        // Find background images in CSS
        const bgImages = [];
        const styleRegex = /background(?:-image)?\s*:\s*url\(['"]?([^'"()]+)['"]?\)/gi;
        let match;
        while ((match = styleRegex.exec(postResponse.data)) !== null) {
            bgImages.push(match[1]);
        }

        // Look for image URLs in script tags
        const scriptImages = [];
        const scriptRegex = /(https?:\/\/[^"'\s<>]+\.(jpg|png|jpeg|gif|webp))/gi;
        const scriptMatches = postResponse.data.match(scriptRegex) || [];
        scriptMatches.forEach(url => {
            if (url.includes('yotools.net')) {
                scriptImages.push(url);
            }
        });

        // Also look for common patterns
        const commonPatterns = [
            /"image"\s*:\s*"([^"]+)"/,
            /"url"\s*:\s*"([^"]+)"/,
            /src\s*=\s*["']([^"']+\.(jpg|png|jpeg))["']/i,
            /href\s*=\s*["']([^"']+\.(jpg|png|jpeg))["']/i
        ];

        const patternMatches = [];
        commonPatterns.forEach(pattern => {
            const matches = postResponse.data.match(pattern);
            if (matches) {
                patternMatches.push(matches[1]);
            }
        });

        return res.json({
            success: true,
            debug: {
                responseLength: postResponse.data.length,
                totalImagesFound: allImages.length,
                allImages: allImages,
                backgroundImages: bgImages,
                scriptImages: scriptImages.slice(0, 5),
                patternMatches: patternMatches,
                hasViewImageWrapper: result$('#view-image-wrapper').length > 0,
                hasBgImageClass: result$('.bg-image').length > 0,
                first500Chars: postResponse.data.substring(0, 500),
                // Look for specific sections
                containsCreating: postResponse.data.includes('Creating'),
                containsPleaseWait: postResponse.data.includes('Please wait'),
                containsProcessing: postResponse.data.includes('Processing')
            }
        });

    } catch (error) {
        return res.json({
            success: false,
            error: error.message,
            stack: error.stack
        });
    }
};
