const express = require('express');
const path = require('path');
const axios = require('axios');
const { URL } = require('url');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/my-ip', (req, res) => {
    res.json({ ip: 'Protected (Encrypted)' });
});

function resolveTargetUrl(inputUrl) {
    let cleanUrl = inputUrl.trim();
    if (!cleanUrl.includes('.') || cleanUrl.includes(' ')) {
        return `https://html.duckduckgo.com/html/?q=${encodeURIComponent(cleanUrl)}`;
    }
    if (!/^https?:\/\//i.test(cleanUrl)) {
        return 'https://' + cleanUrl;
    }
    return cleanUrl;
}

app.all('/proxy', async (req, res) => {
    const rawUrl = req.query.url;
    if (!rawUrl) return res.status(400).send('Target URL parameter is required.');

    const fullUrl = resolveTargetUrl(rawUrl);

    try {
        const parsedTarget = new URL(fullUrl);

        const requestHeaders = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Referer': parsedTarget.origin
        };

        const response = await axios({
            method: req.method,
            url: fullUrl,
            headers: requestHeaders,
            data: ['POST', 'PUT', 'PATCH'].includes(req.method) ? req.body : undefined,
            responseType: 'arraybuffer',
            decompress: true,
            validateStatus: () => true
        });

        // Strip headers that interfere with decompression state or iframe embedding
        const headersToStrip = [
            'content-encoding',
            'content-length',
            'x-frame-options',
            'content-security-policy',
            'content-security-policy-report-only',
            'strict-transport-security'
        ];

        Object.keys(response.headers).forEach((key) => {
            if (!headersToStrip.includes(key.toLowerCase())) {
                res.setHeader(key, response.headers[key]);
            }
        });

        const contentType = response.headers['content-type'] || '';

        // Serve non-text assets directly
        if (!contentType.includes('text/html') && !contentType.includes('text/css') && !contentType.includes('application/javascript')) {
            return res.status(response.status).send(Buffer.from(response.data));
        }

        let content = Buffer.from(response.data).toString('utf-8');

        // Rewrite HTML links and inject <base> tag
        if (contentType.includes('text/html')) {
            const baseTag = `<base href="${parsedTarget.href}">`;
            if (content.includes('<head>')) {
                content = content.replace('<head>', `<head>${baseTag}`);
            } else {
                content = `${baseTag}${content}`;
            }

            content = content.replace(/action=["'](?!https?:\/\/|\/\/)([^"']+)["']/gi, (match, p1) => {
                const abs = new URL(p1, parsedTarget.href).href;
                return `action="/proxy?url=${encodeURIComponent(abs)}"`;
            });

            content = content.replace(/(src|href)=["'](?!https?:\/\/|\/\/|data:)([^"']+)["']/gi, (match, attr, p1) => {
                const abs = new URL(p1, parsedTarget.href).href;
                return `${attr}="/proxy?url=${encodeURIComponent(abs)}"`;
            });
        }

        // Rewrite CSS paths
        if (contentType.includes('text/css') || contentType.includes('text/html')) {
            content = content.replace(/url\((['"]?)(?!https?:\/\/\vert{}\/\/\vert{}data:)([^'"\)]+)\1\)/gi, (match, quote, p1) => {
                const abs = new URL(p1, parsedTarget.href).href;
                return `url("/proxy?url=${encodeURIComponent(abs)}")`;
            });
        }

        res.status(response.status).send(content);

    } catch (err) {
        res.status(500).send(`Proxy Error: ${err.message}`);
    }
});

app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
