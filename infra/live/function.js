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

    // www -> apex, before anything else rewrites the URI.
    //
    // Both hostnames served identical content and Google indexed both, which
    // splits crawl budget on a site still fighting to get crawled. The canonical
    // already stated a preference; a 301 leaves exactly one hostname.
    //
    // Safe to answer from viewer-request: CloudFront returns a response
    // generated here straight to the viewer and never caches it. Moving this to
    // origin-request would cache it, which is how a redirect becomes an outage.
    var hostHeader = request.headers && request.headers['host'];
    var host = hostHeader && hostHeader.value ? hostHeader.value.toLowerCase() : '';

    // indexOf(...) === 0, never indexOf('www') !== -1: the apex must not match,
    // or every request redirects to itself until the browser gives up. A host
    // that merely contains "www" must not match either.
    if (host.indexOf('www.') === 0) {
        var target = 'https://jgreen.one' + uri;

        // querystring is an object here, so it has to be rebuilt. Dropping it
        // would silently break any inbound link carrying campaign parameters.
        // A repeated key arrives as multiValue, with value holding the first;
        // emitting only value would quietly discard the rest.
        var query = request.querystring;
        var pairs = [];
        if (query) {
            for (var key in query) {
                if (Object.prototype.hasOwnProperty.call(query, key)) {
                    var entry = query[key];
                    var encodedKey = encodeURIComponent(key);
                    if (entry && entry.multiValue && entry.multiValue.length) {
                        for (var i = 0; i < entry.multiValue.length; i++) {
                            pairs.push(encodedKey + '=' + encodeURIComponent(entry.multiValue[i].value));
                        }
                    } else {
                        pairs.push(encodedKey + '=' + encodeURIComponent(entry && entry.value ? entry.value : ''));
                    }
                }
            }
        }
        if (pairs.length > 0) {
            target = target + '?' + pairs.join('&');
        }

        return {
            statusCode: 301,
            statusDescription: 'Moved Permanently',
            headers: {
                'location': { value: target },
                // An hour, not a year: the rule is stable but this is the one
                // response we would want to change quickly if it were ever wrong.
                'cache-control': { value: 'max-age=3600' }
            }
        };
    }

    // Content negotiation: an agent asking for Markdown gets the Markdown copy
    // of the page. Note this branches on what the client ASKED FOR, never on who
    // it claims to be — a search engine and a person always receive identical
    // HTML, which is what keeps this content negotiation rather than cloaking.
    var acceptHeader = request.headers && request.headers['accept'];
    var accept = acceptHeader && acceptHeader.value ? acceptHeader.value.toLowerCase() : '';

    // Every page has a Markdown twin at <path>index.md, so the rule is blanket
    // rather than a list of prefixes. A list kept by hand in this file would
    // drift from the routes, and a rewrite pointing at a twin that does not
    // exist would 404 a URL that has perfectly good HTML — worse than not
    // negotiating at all. `tests/integration/build.test.mjs` asserts the
    // invariant this depends on: every HTML route in dist/ has a sibling .md.
    //
    // A URI that already names a file is never rewritten: it is an asset, not
    // a page, and has no twin.
    var isPage = uri.indexOf('.') === -1 || uri.endsWith('/');

    if (isPage && accept.indexOf('text/markdown') !== -1) {
        request.uri = uri.endsWith('/') ? uri + 'index.md' : uri + '/index.md';
        return request;
    }

    // Clean URLs: map a directory-style path to the index document.
    if (uri.endsWith('/')) {
        request.uri += 'index.html';
    } else if (uri.indexOf('.') === -1) {
        request.uri += '/index.html';
    }

    return request;
}
