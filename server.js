const express = require('express');
const path = require('path');
const axios = require('axios');
const { URL } = require('url');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Public Proxy IP API
app.get('/api/my-ip', async (req, res) => {
    try {
        const response = await axios.get('https://api.ipify.org?format=json');
        res.json({ ip: response.data.ip });
    } catch {
        res.status(500).json({ error: 'IP lookup failed' });
    }
});

// Advanced Proxy Engine
app.all('/proxy', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send('Target URL parameter is required.');

    try {
        let fullUrl = targetUrl;
        if (!/^https?:\/\//i.test(fullUrl)) {
            fullUrl = 'https://' + fullUrl;
        }

        const parsedTarget = new URL(fullUrl);

        // Forward essential client request headers
        const requestHeaders = {
            'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': req.headers['accept-language'] || 'en-US,en;q=0.9',
            'Accept': req.headers['accept'] || '*/*',
            'Referer': parsedTarget.origin
        };

        if (req.headers.cookie) {
            requestHeaders['Cookie'] = req.headers.cookie;
        }

        // Send proxied request
        const response = await axios({
            method: req.method,
            url: fullUrl,
            headers: requestHeaders,
            data: ['POST', 'PUT', 'PATCH'].includes(req.method) ? req.body : undefined,
            responseType: 'arraybuffer',
            validateStatus: () => true // Allow non-200 responses to pass through
        });

        const contentType = response.headers['content-type'] || '';

        // Pass binary assets (images, fonts, media, PDF) directly back
        if (!contentType.includes('text/html') && !contentType.includes('text/css') && !contentType.includes('application/javascript')) {
            res.set('Content-Type', contentType);
            return res.status(response.status).send(Buffer.from(response.data));
        }

        let content = Buffer.from(response.data).toString('utf-8');

        // Rewrite HTML pages
        if (contentType.includes('text/html')) {
            // Inject <base> tag to automatically resolve root-relative paths
            const baseTag = `<base href="${parsedTarget.href}">`;
            if (content.includes('<head>')) {
                content = content.replace('<head>', `<head>${baseTag}`);
            } else {
                content = `${baseTag}${content}`;
            }

            // Rewrite form actions to keep POST requests in proxy
            content = content.replace(/action=["'](?!https?:\/\/|\/\/)([^"']+)["']/gi, (match, p1) => {
                const abs = new URL(p1, parsedTarget.href).href;
                return `action="/proxy?url=${encodeURIComponent(abs)}"`;
            });

            // Rewrite src and href elements
            content = content.replace(/(src|href)=["'](?!https?:\/\/|\/\/|data:)([^"']+)["']/gi, (match, attr, p1) => {
                const abs = new URL(p1, parsedTarget.href).href;
                return `${attr}="/proxy?url=${encodeURIComponent(abs)}"`;
            });
        }

        // Rewrite CSS url() declarations
        if (contentType.includes('text/css') || contentType.includes('text/html')) {
            content = content.replace(/url\((['"]?)(?!https?:\/\/\vert{}\/\/\vert{}data:)([^'"\)]+)\1\)/gi, (match, quote, p1) => {
                const abs = new URL(p1, parsedTarget.href).href;
                return `url("/proxy?url=${encodeURIComponent(abs)}")`;
            });
        }

        res.set('Content-Type', contentType);
        res.status(response.status).send(content);

    } catch (err) {
        res.status(500).send(`Proxy Error: ${err.message}`);
    }
});

app.listen(PORT, () => console.log(`Proxy active on port ${PORT}`));
