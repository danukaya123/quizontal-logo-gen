import puppeteer from 'puppeteer-core';
import chromium from 'chrome-aws-lambda';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { url, name } = req.query;
  if (!url || !name) {
    return res.json({ status: false, message: "Missing url or name" });
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath,
      headless: chromium.headless
    });

    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2' });

    // Fill input and click "GO"
    await page.type('input[name="text[]"]', name);
    await page.click('input#submit');

    // Wait for generated logo
    await page.waitForSelector('#view-image-wrapper img.bg-image', { timeout: 20000 });
    const imgUrl = await page.$eval('#view-image-wrapper img.bg-image', el => el.src);

    await browser.close();
    res.json({ status: true, result: { download_url: imgUrl } });

  } catch (error) {
    if (browser) await browser.close();
    console.error(error);
    res.json({ status: false, message: "Failed to generate", error: error.message });
  }
}
