// CloudFront viewer-request function.
//
// Runs on EVERY request to the site. An unhandled exception here returns HTTP
// 503 for that request, so a bug is a full outage rather than a degraded
// feature. Every property access below is guarded for that reason.
//
// Runtime is cloudfront-js-1.0: ES5.1 SYNTAX (no const/let, arrow functions or
// template literals — those fail at parse time, taking every request down with
// them). To stay safe, we avoid String.includes and use indexOf instead.
//
// Covered by tests/unit/cloudfrontFunction.test.ts, and gated on deploy by
// scripts/test-cloudfront-function.sh, which runs it in the real engine.
function handler(event) {
    var request = event.request;
    var uri = request.uri;

    // Content negotiation: an agent asking for Markdown gets the Markdown copy
    // of an entry. Note this branches on what the client ASKED FOR, never on who
    // it claims to be — a search engine and a person always receive identical
    // HTML, which is what keeps this content negotiation rather than cloaking.
    var acceptHeader = request.headers && request.headers['accept'];
    var accept = acceptHeader && acceptHeader.value ? acceptHeader.value.toLowerCase() : '';

    if (accept.indexOf('text/markdown') !== -1 && uri.indexOf('/entries/') === 0) {
        // Only individual entries have a Markdown copy; /entries/ is a listing.
        var slug = uri.slice('/entries/'.length).replace(/\/$/, '');
        if (slug.length > 0 && slug.indexOf('/') === -1 && slug.indexOf('.') === -1) {
            request.uri = '/entries/' + slug + '/index.md';
            return request;
        }
    }

    // Clean URLs: map a directory-style path to the index document.
    if (uri.endsWith('/')) {
        request.uri += 'index.html';
    } else if (uri.indexOf('.') === -1) {
        request.uri += '/index.html';
    }

    return request;
}
