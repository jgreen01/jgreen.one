// CloudFront viewer-response function.
//
// Runs on EVERY response the site returns. An unhandled exception here is a
// site-wide fault, so every property access below is guarded, exactly as in
// function.js.
//
// Runtime is cloudfront-js-1.0: ES5.1 SYNTAX only (no const/let, arrow
// functions or template literals — those fail at parse time). The standard
// library is modern; only the syntax is restricted.
//
// It does two things, both of which must vary per resource and therefore
// cannot be done with a CloudFront response headers policy, which sets fixed
// values:
//
//   1. Advertises the Markdown twin of a page with a Link header (RFC 8288).
//      The llms.txt specification recommends advertising a Markdown version by
//      URL convention, by <link rel="alternate">, and by this header. The site
//      does the first two already; this is the third, and it reaches a client
//      that never parses the body.
//
//   2. Renames the per-object token count from S3 user metadata to
//      x-markdown-tokens, the header Cloudflare's Markdown for Agents defines,
//      so an agent can budget context from a HEAD request.
//
// One case is handled by the platform rather than by this code: CloudFront does
// not invoke a function when the origin returns 400 or above, so the 404 page
// never reaches here and cannot be given a link to a twin it does not have.
//
// Covered by tests/unit/cloudfrontResponseFunction.test.ts, and gated on deploy
// by scripts/test-cloudfront-function.sh, which runs it in the real engine.
var SITE = 'https://jgreen.one';

function handler(event) {
    var response = event.response || {};
    var request = event.request || {};
    var headers = response.headers || {};
    response.headers = headers;

    var uri = typeof request.uri === 'string' ? request.uri : '';

    // The URI here is the one the viewer-request function produced, not the
    // one the viewer typed: a request for /about/ arrives as
    // /about/index.html. Both forms are handled, because the documentation
    // describes this object as the request "received from the viewer" and
    // production does otherwise — so neither is safe to assume.
    var path = uri;
    if (path.endsWith('/index.html')) {
        path = path.slice(0, path.length - 'index.html'.length);
    }

    // A page is anything that does not name a file. What is left is an asset,
    // or a twin itself, and neither has a twin of its own.
    var isPage = path.length > 0 && (path.endsWith('/') || path.indexOf('.') === -1);

    if (isPage && !headers.link) {
        var twin = SITE + (path.endsWith('/') ? path + 'index.md' : path + '/index.md');
        headers.link = { value: '<' + twin + '>; rel="alternate"; type="text/markdown"' };
    }

    // The count is written onto the object at deploy time, because it differs
    // per document and nothing at the edge can compute it.
    var contentType = headers['content-type'];
    var isMarkdown =
        contentType && contentType.value
            ? contentType.value.toLowerCase().indexOf('text/markdown') !== -1
            : false;
    var count = headers['x-amz-meta-markdown-tokens'];

    if (isMarkdown && count && count.value && /^[0-9]+$/.test(count.value)) {
        headers['x-markdown-tokens'] = { value: count.value };
    }

    // X-Robots-Tag: noindex on the twin's OWN url.
    //
    // The twins are linked from every article now, so they are genuinely
    // discoverable — which is exactly when Google needs telling to index the
    // HTML rather than a near-duplicate of it. noindex does not prevent
    // fetching; the crawler has to fetch the response to read the header. The
    // copy button, content negotiation and every AI crawler are unaffected.
    //
    // The distinction that matters: a NEGOTIATED Markdown response is served at
    // the *page* URL, and marking that noindex would tell a crawler not to
    // index the article itself. Both cases arrive here with the same rewritten
    // URI, so they are told apart by whether the request asked for Markdown.
    var acceptHeader = request.headers && request.headers['accept'];
    var accept = acceptHeader && acceptHeader.value ? acceptHeader.value.toLowerCase() : '';
    var negotiated = accept.indexOf('text/markdown') !== -1;

    if (isMarkdown && !negotiated && !headers['x-robots-tag']) {
        headers['x-robots-tag'] = { value: 'noindex' };
    }

    // Vary: Accept on the two representations the Accept header selects between.
    //
    // CloudFront's own cache is already safe — the viewer-request function
    // rewrites the URI before the cache lookup, so HTML and Markdown occupy
    // different keys. This is for everything downstream: browsers, corporate
    // proxies, any shared cache that would otherwise be entitled to serve one
    // representation in place of the other. RFC 9110 section 12.5.5.
    //
    // Assets are deliberately excluded. They have one representation, and
    // declaring Vary on them fragments a cache across every distinct Accept
    // header for nothing.
    if (isPage || isMarkdown) {
        var vary = headers.vary;
        var existing = vary && vary.value ? vary.value : '';
        // Whole field name only: "Accept-Encoding" contains "accept" but is a
        // different field and does not make this response vary by Accept.
        if (!/(^|,)\s*accept\s*(,|$)/i.test(existing)) {
            headers.vary = { value: existing ? existing + ', Accept' : 'Accept' };
        }
    }

    return response;
}
