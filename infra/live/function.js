function handler(event) {
    var request = event.request;
    var uri = request.uri;

    // Check whether the URI is missing a file name (ends with /)
    if (uri.endsWith('/')) {
        request.uri += 'index.html';
    }
    // Check whether the URI is missing a file extension (e.g., /about instead of /about.html)
    else if (!uri.includes('.')) {
        request.uri += '/index.html';
    }

    return request;
}
