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

    // A page is anything that does not already name a file. Those are assets,
    // or the twin itself, and have no twin of their own.
    var isPage = uri.length > 0 && (uri.indexOf('.') === -1 || uri.endsWith('/'));

    if (isPage && !headers.link) {
        var twin = SITE + (uri.endsWith('/') ? uri + 'index.md' : uri + '/index.md');
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

    return response;
}
