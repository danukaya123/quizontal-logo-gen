const puppeteer = require('puppeteer-core');
const chromium = require('chrome-aws-lambda');

module.exports = async (req, res) => {
  try {
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { url, name } = req.query;
    if (!url || !name) return res.json({ status: false, message: "Missing 'url' or 'name'" });

    // Launch headless Chromium
    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath,
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2' });

    // Fill text input
    await page.type('input[name="text[]"]', name);

    // Click GO button
    await page.click('input#submit');

    // Wait for generated image
    await page.waitForSelector('#view-image-wrapper img.bg-image', { timeout: 20000 });
    const imgUrl = await page.$eval('#view-image-wrapper img.bg-image', el => el.src);

    await browser.close();

    res.json({ status: true, result: { download_url: imgUrl } });

  } catch (e) {
    res.json({ status: false, message: "Image creation failed", error: e.message });
  }
};
