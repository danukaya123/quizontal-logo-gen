const axios = require("axios");
const cheerio = require("cheerio");
const qs = require("qs");

module.exports = async (req, res) => {
  try {
    // CORS preflight
    if (req.method === "OPTIONS") {
      return res.status(200).end();
    }

    const { url, name } = req.query;

    if (!url || !name) {
      return res.status(400).json({
        status: false,
        message: "Missing url or name"
      });
    }

    // 🔹 Anti-bot headers
    const headers = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
      "Referer": url,
      "Origin": "https://en.ephoto360.com"
    };

    // 1️⃣ Load page
    const page = await axios.get(url, { headers });
    const $ = cheerio.load(page.data);

    const token = $("#token").val();
    const build_server = $("#build_server").val();
    const build_server_id = $("#build_server_id").val();

    if (!token) {
      return res.json({
        status: false,
        message: "Failed to extract token"
      });
    }

    // 2️⃣ Create image
    const create = await axios.post(
      "https://en.ephoto360.com/effect/create-image",
      qs.stringify({
        "text[]": name,
        token,
        build_server,
        build_server_id
      }),
      {
        headers: {
          ...headers,
          "Content-Type": "application/x-www-form-urlencoded"
        }
      }
    );

    const id = create.data?.id;
    if (!id) {
      return res.json({
        status: false,
        message: "Image creation failed"
      });
    }

    // 3️⃣ Poll image
    let image;
    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 1000));

      const result = await axios.post(
        "https://en.ephoto360.com/effect/get-image",
        qs.stringify({ id }),
        {
          headers: {
            ...headers,
            "Content-Type": "application/x-www-form-urlencoded"
          }
        }
      );

      if (result.data?.image) {
        image = result.data.image;
        break;
      }
    }

    if (!image) {
      return res.json({
        status: false,
        message: "Timeout while generating image"
      });
    }

    return res.json({
      status: true,
      result: {
        download_url: image
      }
    });

  } catch (err) {
    return res.status(500).json({
      status: false,
      error: err.message
    });
  }
};
