import express from 'express';
import { createServer as createViteServer } from 'vite';
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import path from 'path';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Proxy endpoint for m3u8 and ts files
  app.get(['/api/proxy', '/api/proxy/*'], async (req, res) => {
    const targetUrl = req.query.url as string;
    const proxyUrl = req.query.proxy as string;
    
    if (!targetUrl) {
      return res.status(400).send('Missing url parameter');
    }

    try {
      const headers: any = { ...req.headers };
      // Remove headers that might cause issues
      delete headers.host;
      delete headers.referer;
      delete headers.origin;
      delete headers['accept-encoding']; // Let axios handle decompression safely
      
      // Apply custom headers from query
      if (req.query.userAgent) headers['User-Agent'] = req.query.userAgent;
      if (req.query.referer) headers['Referer'] = req.query.referer;
      if (req.query.cookie) headers['Cookie'] = req.query.cookie;

      const axiosConfig: any = {
        url: targetUrl,
        method: 'GET',
        responseType: 'stream',
        headers,
        validateStatus: () => true, // Don't throw on error status codes
      };

      if (proxyUrl) {
        axiosConfig.httpsAgent = new HttpsProxyAgent(proxyUrl);
        axiosConfig.proxy = false;
      }

      const response = await axios(axiosConfig);

      // Pass through the status code
      res.status(response.status);

      // CORS headers
      res.set('Access-Control-Allow-Origin', '*');

      const contentType = response.headers['content-type'] || '';
      if (contentType) {
        res.set('Content-Type', contentType);
      }

      if (req.query.raw === 'true') {
        response.data.pipe(res);
        return;
      }

      const isM3u8 = contentType.includes('mpegurl') || targetUrl.includes('.m3u8');

      if (isM3u8) {
        let m3u8Content = '';
        response.data.on('data', (chunk: Buffer) => {
          m3u8Content += chunk.toString('utf8');
        });
        
        response.data.on('end', () => {
          // Use the final URL after any redirects to resolve relative paths correctly
          const finalUrl = response.request?.res?.responseUrl || targetUrl;
          const baseUrl = new URL(finalUrl);
          
          const rewrittenContent = m3u8Content.split('\n').map(line => {
            const trimmedLine = line.trim();
            if (trimmedLine === '') return line;
            
            if (trimmedLine.startsWith('#')) {
               // Handle URI attributes in tags like #EXT-X-KEY:METHOD=AES-128,URI="key.bin"
               if (trimmedLine.includes('URI="')) {
                   return trimmedLine.replace(/URI="([^"]+)"/g, (match, uri) => {
                       // Don't rewrite data URIs
                       if (uri.startsWith('data:')) return match;
                       
                       try {
                         const absoluteUri = new URL(uri, baseUrl).toString();
                         let proxyUri = `/api/proxy?url=${encodeURIComponent(absoluteUri)}`;
                         if (proxyUrl) proxyUri += `&proxy=${encodeURIComponent(proxyUrl)}`;
                         if (req.query.userAgent) proxyUri += `&userAgent=${encodeURIComponent(req.query.userAgent as string)}`;
                         if (req.query.referer) proxyUri += `&referer=${encodeURIComponent(req.query.referer as string)}`;
                         if (req.query.cookie) proxyUri += `&cookie=${encodeURIComponent(req.query.cookie as string)}`;
                         
                         return `URI="${proxyUri}"`;
                       } catch (e) {
                         return match;
                       }
                   });
               }
               return trimmedLine;
            }
            
            // It's a URL line
            try {
              const absoluteUrl = new URL(trimmedLine, baseUrl).toString();
              let proxyEndpoint = `/api/proxy?url=${encodeURIComponent(absoluteUrl)}`;
              if (proxyUrl) proxyEndpoint += `&proxy=${encodeURIComponent(proxyUrl)}`;
              if (req.query.userAgent) proxyEndpoint += `&userAgent=${encodeURIComponent(req.query.userAgent as string)}`;
              if (req.query.referer) proxyEndpoint += `&referer=${encodeURIComponent(req.query.referer as string)}`;
              if (req.query.cookie) proxyEndpoint += `&cookie=${encodeURIComponent(req.query.cookie as string)}`;
              
              return proxyEndpoint;
            } catch (e) {
              return trimmedLine;
            }
          }).join('\n');
          
          res.send(rewrittenContent);
        });
      } else {
        // Just pipe the stream (e.g., TS segments)
        // We intentionally DO NOT forward Content-Length here because if axios decompressed the stream,
        // the original Content-Length will be wrong and cause the video player to hang/fail.
        response.data.pipe(res);
      }

    } catch (error: any) {
      console.error('Proxy error:', error.message);
      res.status(500).send('Proxy error: ' + error.message);
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
