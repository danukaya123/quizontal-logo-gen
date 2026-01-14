const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');
const app = express();
const port = 3000;

app.use(express.json());

// API endpoint to create logos
app.get('/api/logo', async (req, res) => {
    try {
        const { url, name } = req.query;
        
        if (!url || !name) {
            return res.status(400).json({ error: 'Missing url or name parameter' });
        }

        console.log(`Processing: ${url} with text: ${name}`);

        // Method 1: Using axios and cheerio (faster but may need adjustments)
        const result = await createLogoWithAxios(url, name);
        
        // Method 2: Fallback to puppeteer if axios method fails
        if (!result || !result.imageUrl) {
            const puppeteerResult = await createLogoWithPuppeteer(url, name);
            return res.json(puppeteerResult);
        }

        res.json(result);
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Method 1: Using axios and cheerio (faster)
async function createLogoWithAxios(url, text) {
    try {
        // Step 1: Get the initial page to extract token
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        const $ = cheerio.load(response.data);
        
        // Extract the token from the form
        const token = $('input[name="token"]').val();
        const buildServer = $('input[name="build_server"]').val();
        const buildServerId = $('input[name="build_server_id"]').val();
        
        if (!token) {
            throw new Error('Token not found');
        }

        // Step 2: Submit the form
        const formData = new URLSearchParams();
        formData.append('text[]', text);
        formData.append('token', token);
        formData.append('build_server', buildServer);
        formData.append('build_server_id', buildServerId);
        formData.append('submit', 'GO');

        const submitResponse = await axios.post(url, formData, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Origin': 'https://en.ephoto360.com',
                'Referer': url
            }
        });

        const submit$ = cheerio.load(submitResponse.data);
        
        // Try to find the image URL
        let imageUrl = submit$('img.bg-image').attr('src');
        
        if (!imageUrl) {
            // Look for image in script tags or other locations
            const html = submitResponse.data;
            const imgMatch = html.match(/https:\/\/e[0-9]\.yotools\.net\/images\/user_image\/[^"]+/);
            if (imgMatch) {
                imageUrl = imgMatch[0];
            }
        }

        if (!imageUrl) {
            throw new Error('Image URL not found in response');
        }

        return {
            success: true,
            result: {
                download_url: imageUrl,
                direct_download: imageUrl.replace('/images/user_image/', '/save-image/')
            }
        };
        
    } catch (error) {
        console.error('Axios method failed:', error.message);
        return null;
    }
}

// Method 2: Using puppeteer (more reliable but slower)
async function createLogoWithPuppeteer(url, text) {
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        
        const page = await browser.newPage();
        
        // Set user agent
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
        
        // Navigate to the page
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        
        // Fill the form
        await page.type('input[name="text[]"]', text);
        
        // Click the submit button
        await page.click('input[name="submit"]');
        
        // Wait for image to be generated (10-15 seconds)
        await page.waitForSelector('img.bg-image', { timeout: 30000 });
        
        // Get the image URL
        const imageUrl = await page.$eval('img.bg-image', img => img.src);
        
        // Close browser
        await browser.close();
        
        return {
            success: true,
            result: {
                download_url: imageUrl,
                direct_download: imageUrl.replace('/images/user_image/', '/save-image/')
            }
        };
        
    } catch (error) {
        if (browser) {
            await browser.close();
        }
        throw error;
    }
}

app.listen(port, () => {
    console.log(`Ephoto360 API server running on port ${port}`);
});

module.exports = app;
