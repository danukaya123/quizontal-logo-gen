const axios = require("axios").default;
const cheerio = require("cheerio");
const qs = require("qs");

module.exports = async (req, res) => {
  try {
    const { url, name } = req.query;
    if (!url || !name) {
      return res.json({ status: false, message: "Missing params" });
    }

    const client = axios.create({
      withCredentials: true,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        "Accept": "*/*"
      }
    });

    // 1️⃣ Bootstrap session (VERY IMPORTANT)
    await client.get("https://en.ephoto360.com/");

    // 2️⃣ Load effect page
    const page = await client.get(url);
    const $ = cheerio.load(page.data);

    const token = $("#token").val();
    const build_server = $("#build_server").val();
    const build_server_id = $("#build_server_id").val();

    // 3️⃣ Create image
    const create = await client.post(
      "https://en.ephoto360.com/effect/create-image",
      qs.stringify({
        "text[]": name,
        token,
        build_server,
        build_server_id
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Referer": url,
          "Origin": "https://en.ephoto360.com"
        }
      }
    );

    if (!create.data?.id) {
      return res.json({
        status: false,
        message: "Image creation failed (blocked by Ephoto360)"
      });
    }

    const id = create.data.id;

    // 4️⃣ Poll
    for (let i = 0; i < 12; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const r2 = await client.post(
        "https://en.ephoto360.com/effect/get-image",
        qs.stringify({ id }),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
      );

      if (r2.data?.image) {
        return res.json({
          status: true,
          result: { download_url: r2.data.image }
        });
      }
    }

    res.json({ status: false, message: "Timeout" });

  } catch (e) {
    res.json({ status: false, error: e.message });
  }
};
