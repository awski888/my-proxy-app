const express = require('express');
const path = require('path');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

app.get('/api/my-ip', async (req, res) => {
    try {
        const response = await axios.get('https://api.ipify.org?format=json');
        res.json({ ip: response.data.ip });
    } catch (error) {
        res.status(500).json({ error: 'Unable to fetch IP' });
    }
});

app.get('/proxy', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send('URL is required.');

    try {
        let formattedUrl = targetUrl;
        if (!/^https?:\/\//i.test(formattedUrl)) {
            formattedUrl = 'https://' + formattedUrl;
        }

        const response = await axios({
            method: 'get',
            url: formattedUrl,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            responseType: 'text'
        });

        let html = response.data;
        const targetOrigin = new URL(formattedUrl).origin;

        html = html.replace(/(src|href)=["'](?!https?:\/\/|\/\/|data:)([^"']+)["']/g, (match, attr, path) => {
            const absolute = new URL(path, targetOrigin).href;
            return `${attr}="/proxy?url=${encodeURIComponent(absolute)}"`;
        });

        res.send(html);
    } catch (err) {
        res.status(500).send(`Proxy Error: ${err.message}`);
    }
});

app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
