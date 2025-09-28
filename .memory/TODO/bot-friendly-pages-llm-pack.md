# Feature: LLM-Friendly Content Pack for AI Crawlers

## Goal

Create machine-readable content endpoints (`/_llm/*`) that provide structured, bot-friendly access to site content while maintaining the existing human-facing website unchanged. This enables AI crawlers and LLM applications to efficiently consume site content in standardized formats.

## Requirements

### Functional Requirements
- [ ] **Multiple Format Support**: Provide content in JSON, NDJSON, and Markdown formats
- [ ] **Bot Detection**: Intelligently route AI crawlers to optimized endpoints via CloudFront
- [ ] **Content Integrity**: Include content hashing and optional signing for verification
- [ ] **Zero Human Impact**: Maintain existing human-facing pages without modification
- [ ] **Performance**: Leverage CDN caching for efficient content delivery
- [ ] **Standards Compliance**: Follow web standards for content negotiation and caching

### Technical Requirements
- [ ] **Astro Endpoints**: Create prerendered static endpoints using Astro's API routes
- [ ] **Content Collections Integration**: Leverage existing `entries` collection structure
- [ ] **CloudFront Integration**: Extend existing CloudFront function for bot detection
- [ ] **Terraform Management**: Manage CloudFront function updates via Infrastructure as Code
- [ ] **Content Types**: Proper MIME types for JSON (`application/json`), NDJSON (`application/x-ndjson`), Markdown (`text/markdown`)

## Implementation Plan

### Phase 1: Content Endpoint Development
1. **Create LLM Pack Endpoints**
   - **`src/pages/_llm/pack.json.ts`**: Complete site bundle in JSON format
   - **`src/pages/_llm/pack.ndjson.ts`**: Streaming-friendly NDJSON format (one object per line)
   - **`src/pages/_llm/index.md.ts`**: Markdown index with links to all content
   - **`src/pages/_llm/md/[slug].md.ts`**: Individual content pages in Markdown format

2. **Content Structure Design**
   - Include metadata: `id`, `url`, `title`, `description`, `tags`, `pubDate`, `updatedDate`, `kind`
   - Include content: `content_md` (raw markdown), `content_text` (plain text), `content_html` (rendered HTML)
   - Include integrity: `content_hash` (SHA-256 of markdown content)
   - Include links: Self-referential URLs and related content links

3. **Astro Configuration**
   - Set `export const prerender = true` for all endpoints
   - Use `getCollection('entries')` to access content collections
   - Filter out draft content (`draft: false`)
   - Sort by publication date (newest first)

### Phase 2: Bot Detection & Routing
4. **CloudFront Function Enhancement**
   - Extend existing `function.js` to include bot detection logic
   - Detect AI crawlers via User-Agent strings
   - Detect content negotiation via Accept headers
   - Route detected bots to `/_llm/pack.ndjson` (preferred format)

5. **Bot Detection Strategy**
   - **User-Agent Detection**: Match known AI crawler patterns
   - **Accept Header Detection**: Detect `application/x-ndjson` or `application/llm+json`
   - **Fallback**: Default to human-facing content for unknown clients

### Phase 3: Infrastructure Integration
6. **Terraform Updates**
   - Update `infra/live/function.js` with bot detection logic
   - Update `infra/live/cloudfront.tf` to reference updated function
   - Add CloudFront function versioning for safe deployments

7. **Deployment Integration**
   - Ensure `scripts/deploy.sh` continues to work unchanged
   - Verify CloudFront function updates are included in deployments
   - Test bot routing in staging environment

### Phase 4: Content Integrity & Security
8. **Content Signing (Optional)**
   - Implement RFC 9421-style HTTP Message Signatures for content verification
   - Generate Ed25519 key pair for signing
   - Include signature metadata in JSON pack
   - Publish public key at `/_llm/llm-pack.pub`

9. **Security Considerations**
   - Rate limiting via CloudFront (if needed)
   - Content validation and sanitization
   - Bot allowlist management
   - Monitoring and alerting for unusual traffic patterns

## Technical Implementation Details

### Content Collection Integration

**Current Structure Analysis:**
- Single `entries` collection with `kind` field (`"project"` | `"blog"`)
- Schema includes: `title`, `description`, `pubDate`, `updatedDate`, `tags`, `heroImage`, `draft`
- All content in `src/content/entries/` directory

**LLM Pack Schema:**
```typescript
interface LLMPackEntry {
  id: string;                    // Content collection ID
  url: string;                   // Canonical URL
  title: string;                 // Content title
  description: string;           // Content description
  kind: "project" | "blog";      // Content type
  tags: string[];               // Content tags
  pubDate: string;              // Publication date (ISO 8601)
  updatedDate?: string;         // Last update date (ISO 8601)
  heroImage?: string;           // Hero image URL
  content_md: string;           // Raw markdown content
  content_text: string;        // Plain text content
  content_html: string;        // Rendered HTML content
  content_hash: string;        // SHA-256 hash of markdown
  word_count: number;          // Approximate word count
  reading_time: number;        // Estimated reading time (minutes)
}
```

### CloudFront Function Enhancement

**Enhanced Bot Detection Logic:**
```javascript
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  var headers = request.headers || {};
  
  // Existing subdirectory rewrite logic
  if (uri.endsWith('/')) {
    request.uri += 'index.html';
  } else if (!uri.includes('.')) {
    request.uri += '/index.html';
  }
  
  // Bot detection and routing
  var userAgent = (headers['user-agent'] && headers['user-agent'].value || '').toLowerCase();
  var accept = (headers['accept'] && headers['accept'].value || '').toLowerCase();
  
  // Known AI crawler patterns
  var aiCrawlers = [
    'chatgpt-user', 'gptbot', 'oai-searchbot',           // OpenAI
    'claude-user', 'claudebot',                          // Anthropic
    'perplexitybot',                                     // Perplexity
    'bingbot', 'msnbot',                                 // Microsoft
    'googlebot', 'google-other'                           // Google (experimental)
  ];
  
  // Content negotiation detection
  var acceptsLlmFormat = accept.includes('application/x-ndjson') || 
                        accept.includes('application/llm+json') ||
                        accept.includes('application/json');
  
  // Bot detection
  var isAiCrawler = aiCrawlers.some(function(crawler) {
    return userAgent.includes(crawler);
  });
  
  // Route to LLM pack if bot detected or content negotiation requested
  if (isAiCrawler || acceptsLlmFormat) {
    request.uri = '/_llm/pack.ndjson';
  }
  
  return request;
}
```

### Astro Endpoint Implementation

**JSON Pack Endpoint (`src/pages/_llm/pack.json.ts`):**
```typescript
export const prerender = true;

import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { createHash } from 'node:crypto';
import removeMd from 'remove-markdown';
import { experimental_AstroContainer } from 'astro/container';

export const GET: APIRoute = async ({ site }) => {
  const entries = await getCollection('entries', ({ data }) => !data.draft);
  const container = await experimental_AstroContainer.create();
  
  const processedEntries = await Promise.all(entries.map(async (entry) => {
    const { Content } = await entry.render();
    const html = await container.renderToString(Content);
    const body = entry.body || '';
    const plainText = removeMd(body);
    const wordCount = plainText.split(/\s+/).length;
    const readingTime = Math.ceil(wordCount / 200); // 200 words per minute
    
    return {
      id: entry.id,
      url: new URL(`/${entry.slug}/`, site!).toString(),
      title: entry.data.title,
      description: entry.data.description,
      kind: entry.data.kind,
      tags: entry.data.tags,
      pubDate: entry.data.pubDate.toISOString(),
      updatedDate: entry.data.updatedDate?.toISOString(),
      heroImage: entry.data.heroImage,
      content_md: body,
      content_text: plainText,
      content_html: html,
      content_hash: createHash('sha256').update(body).digest('hex'),
      word_count: wordCount,
      reading_time: readingTime
    };
  }));
  
  const pack = {
    version: '1.0',
    site: site?.toString() || '',
    generated_at: new Date().toISOString(),
    total_entries: processedEntries.length,
    links: {
      self: '/_llm/pack.json',
      ndjson: '/_llm/pack.ndjson',
      md_index: '/_llm/index.md',
      pubkey: '/_llm/llm-pack.pub'
    },
    entries: processedEntries
  };
  
  return new Response(JSON.stringify(pack, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=3600',
      'x-content-type-options': 'nosniff'
    }
  });
};
```

**NDJSON Pack Endpoint (`src/pages/_llm/pack.ndjson.ts`):**
```typescript
export const prerender = true;

import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { createHash } from 'node:crypto';
import removeMd from 'remove-markdown';
import { experimental_AstroContainer } from 'astro/container';

export const GET: APIRoute = async ({ site }) => {
  const entries = await getCollection('entries', ({ data }) => !data.draft);
  const container = await experimental_AstroContainer.create();
  
  const ndjsonLines = await Promise.all(entries.map(async (entry) => {
    const { Content } = await entry.render();
    const html = await container.renderToString(Content);
    const body = entry.body || '';
    const plainText = removeMd(body);
    const wordCount = plainText.split(/\s+/).length;
    const readingTime = Math.ceil(wordCount / 200);
    
    return JSON.stringify({
      id: entry.id,
      url: new URL(`/${entry.slug}/`, site!).toString(),
      title: entry.data.title,
      description: entry.data.description,
      kind: entry.data.kind,
      tags: entry.data.tags,
      pubDate: entry.data.pubDate.toISOString(),
      updatedDate: entry.data.updatedDate?.toISOString(),
      heroImage: entry.data.heroImage,
      content_md: body,
      content_text: plainText,
      content_html: html,
      content_hash: createHash('sha256').update(body).digest('hex'),
      word_count: wordCount,
      reading_time: readingTime
    });
  }));
  
  return new Response(ndjsonLines.join('\n') + '\n', {
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'public, max-age=3600',
      'x-content-type-options': 'nosniff'
    }
  });
};
```

### Terraform Integration

**Updated CloudFront Function:**
```hcl
resource "aws_cloudfront_function" "llm_router" {
  name    = "llm-router"
  runtime = "cloudfront-js-1.0"
  comment = "Routes AI crawlers to LLM pack endpoints"
  publish = true
  
  code = file("${path.module}/function.js")
}

resource "aws_cloudfront_distribution" "cdn" {
  # ... existing configuration ...
  
  default_cache_behavior {
    # ... existing behavior configuration ...
    
    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.llm_router.arn
    }
  }
}
```

## Risk Assessment & Mitigation

### High Risk
- **CloudFront Function Errors**: Malformed function could break all site access
  - *Mitigation*: Test function thoroughly in staging, implement gradual rollout
- **Content Exposure**: LLM pack might expose sensitive information
  - *Mitigation*: Filter draft content, sanitize user-generated content, review all exposed data

### Medium Risk
- **Performance Impact**: Additional endpoints might increase build time
  - *Mitigation*: Monitor build performance, optimize content processing
- **Bot Traffic Spikes**: AI crawlers might generate unexpected traffic
  - *Mitigation*: Implement rate limiting, monitor traffic patterns

### Low Risk
- **SEO Impact**: Bot routing might affect search engine indexing
  - *Mitigation*: Ensure Googlebot gets appropriate content, monitor search console

## Testing Strategy

### Local Testing
1. **Build Testing**: Verify all endpoints generate correctly in `dist/_llm/`
2. **Content Validation**: Check JSON/NDJSON format compliance
3. **Function Testing**: Test CloudFront function logic with various User-Agent strings

### Staging Testing
1. **Bot Simulation**: Test with spoofed AI crawler User-Agent strings
2. **Content Negotiation**: Test Accept header-based routing
3. **Performance Testing**: Measure impact on site performance
4. **Cache Testing**: Verify CloudFront caching behavior

### Production Validation
1. **Real Bot Testing**: Monitor actual AI crawler behavior
2. **Traffic Analysis**: Analyze bot traffic patterns and impact
3. **Content Accuracy**: Verify LLM pack content matches human-facing content

## Success Criteria

- [ ] All LLM pack endpoints accessible at `/_llm/*` paths
- [ ] AI crawlers automatically routed to optimized endpoints
- [ ] Content negotiation works via Accept headers
- [ ] Human-facing site remains unchanged
- [ ] CloudFront function updates deployed successfully
- [ ] Content integrity verified via hashing
- [ ] Performance impact minimal (<100ms additional build time)
- [ ] Bot traffic properly cached and optimized

## Open Questions

- [ ] **Content Filtering**: Should we filter any specific content types or tags?
- [ ] **Rate Limiting**: Do we need to implement rate limiting for bot traffic?
- [ ] **Analytics**: Should we track LLM pack usage separately from human traffic?
- [ ] **Content Updates**: How often should LLM packs be regenerated?
- [ ] **Bot Allowlist**: Should we maintain a strict allowlist or use pattern matching?
- [ ] **Error Handling**: How should we handle malformed content or missing entries?

## Dependencies

- Astro Content Collections (`getCollection`)
- Astro `experimental_AstroContainer` for rendering components to strings.
- Node.js crypto module for hashing
- `remove-markdown` package for plain text extraction (needs to be added to `package.json`)
- CloudFront Function runtime (JavaScript 1.0)
- Terraform for infrastructure management

## Estimated Timeline

- **Phase 1 (Endpoints)**: 4-6 hours
- **Phase 2 (Bot Detection)**: 2-3 hours  
- **Phase 3 (Infrastructure)**: 2-3 hours
- **Phase 4 (Security)**: 3-4 hours
- **Testing & Validation**: 3-4 hours
- **Total**: 14-20 hours

## Priority

**Medium Priority** - This feature enhances AI crawler experience and positions the site for future LLM integration. It's valuable for SEO and AI discoverability but not critical for core site functionality.

## Notes

- **Standards Compliance**: Following web standards for content negotiation and caching
- **Future-Proofing**: Design allows for easy addition of new content formats
- **Monitoring**: Implement logging to track bot usage patterns
- **Documentation**: Create public documentation for LLM pack endpoints
- **Blog Post Opportunity**: "Building AI-Friendly Content Packs for LLM Crawlers"