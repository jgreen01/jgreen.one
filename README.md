# jgreen.one

A personal website showcasing projects, blog posts, and professional information for Jon Green - a senior software developer focused on reliable, scalable systems and clear, human-centered design.

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

The site will be available at `http://localhost:4321`.

## 📋 Project Overview

This is a modern, static website built with [Astro](https://astro.build) and deployed on AWS infrastructure. The site features:

- **Personal Website**: Showcases projects and blog posts in a unified content system
- **Modern Tech Stack**: Astro + Tailwind CSS + TypeScript
- **Serverless Architecture**: AWS S3 + CloudFront + Route 53
- **AI-Assisted Development**: Built using CLI LLM agent with structured memory system
- **Content Management**: Type-safe content collections for blog posts and projects

## 🏗️ Architecture

### Frontend Stack
- **[Astro](https://astro.build)**: Static site generator with zero-JS by default
- **[Tailwind CSS](https://tailwindcss.com)**: Utility-first CSS framework
- **[TypeScript](https://www.typescriptlang.org)**: Type safety and better developer experience
- **Content Collections**: Schema-enforced content management for blog posts and projects

### Infrastructure (AWS)
- **Amazon S3**: Private bucket for static assets with Origin Access Control (OAC)
- **Amazon CloudFront**: Global CDN with custom function for clean URLs
- **AWS Certificate Manager**: SSL/TLS certificate management
- **Amazon Route 53**: DNS management with alias records
- **Terraform**: Infrastructure as Code for reproducible deployments

### Development Workflow
- **CLI LLM Agent**: AI-assisted development with structured memory system
- **Quick Notes**: Emoji-dense running logs for decision tracking
- **Conventional Commits**: Structured commit messages
- **Automated Validation**: Guide validation and security checks

## 📁 Project Structure

```
/
├── src/
│   ├── assets/              # Imported assets (e.g. avatar.svg)
│   ├── components/          # Reusable Astro components (EntryCard, SEO, Avatar)
│   ├── content/             # Content collections
│   │   ├── config.ts        # Collection schema (single "entries" collection)
│   │   └── entries/         # Blog posts & projects (.md, distinguished by `kind`)
│   ├── layouts/             # Page layouts (Base, PageLayout, ArticleLayout)
│   ├── pages/               # Route-based pages (incl. /entries, /blog, /projects, /tags)
│   └── styles/              # Global styles and design tokens
├── infra/                   # Terraform infrastructure code
│   ├── bootstrap/           # Initial infrastructure setup (state backend)
│   └── live/                # Production infrastructure (S3, CloudFront, ACM, Route 53)
├── guides/                  # Documentation and how-tos (+ TEMPLATE.md)
├── scripts/                 # deploy.sh + validate_guides.mjs
├── samples/                 # Design mockups & color references (PNG/XCF)
├── .memory/                 # AI agent memory system
│   ├── TODO/                # Feature-level task tracking
│   ├── adr/                 # Architecture decision records
│   └── private/             # Session quicknotes (gitignored)
├── GEMINI.md                # CLI LLM agent operating manual (memory/tasks/quicknotes)
└── public/                  # Static assets (entries/, og/, favicon, robots.txt)
```

## 🛠️ Development

### Content Management

The site uses Astro's Content Collections for type-safe content management:

```typescript
// src/content/config.ts
const entries = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    description: z.string().max(160),
    pubDate: z.coerce.date(),
    kind: z.enum(["project", "blog"]).default("blog"),
    tags: z.array(z.string()).default([]),
    heroImage: z.string().optional(),
    draft: z.boolean().default(false)
  }),
});
```

### Adding Content

1. **Blog Posts**: Create `.md` files in `src/content/entries/`
2. **Projects**: Create `.md` files in `src/content/entries/` with `kind: "project"`
3. **Pages**: Create `.astro` files in `src/pages/`

### Styling

The site uses Tailwind CSS with custom design tokens for theming:

```css
:root {
  --bg-color: #f9f7c7;
  --text-color: #362827;
  --accent-color: #f6780a;
  --muted-color: #6e797f;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg-color: #1f2429;
    --text-color: #efe6dd;
    --accent-color: #38bdf8;
    --muted-color: #8f9aa1;
  }
}
```

## 🚀 Deployment

### Infrastructure Setup

1. **Bootstrap** (one-time):
   ```bash
   cd infra/bootstrap
   terraform init && terraform apply
   ```

2. **Deploy Live Infrastructure**:
   ```bash
   cd infra/live
   terraform init && terraform plan && terraform apply
   ```

### Site Deployment

The site can be deployed using the automated deployment script:

```bash
# Run the deployment script
./scripts/deploy.sh
```

The `deploy.sh` script automatically:

1. **Gets Terraform outputs**: Retrieves CloudFront Distribution ID and S3 bucket name from Terraform state
2. **Builds the site**: Runs `npm ci` and `npm run build` to generate the production build
3. **Syncs to S3**: Uploads all files to the S3 bucket with `--delete` flag to remove old files
4. **Invalidates CloudFront**: Creates a cache invalidation for all paths (`/*`)


## 🧠 AI-Assisted Development

This project was built using a CLI LLM agent with a structured memory system documented in `GEMINI.md`. Key features:

- **Quick Notes**: Emoji-dense running logs for decision tracking
- **Memory Persistence**: Cross-session memory for maintaining context
- **Task Management**: Feature-level task tracking in `.memory/TODO/`
- **Security**: Automated validation to prevent secret leaks

## 📚 Available Scripts

| Command | Action |
|---------|--------|
| `npm run dev` | Start development server at `localhost:4321` |
| `npm run build` | Build production site to `./dist/` |
| `npm run preview` | Preview production build locally |
| `npm run astro ...` | Run Astro CLI commands |
| `./scripts/deploy.sh` | Deploy site to AWS (build, sync to S3, invalidate CloudFront) |
| `node scripts/validate_guides.mjs` | Validate guides and check for secrets |

## 🔧 Configuration

### Tailwind Configuration

The site uses Tailwind CSS v4 with custom configuration in `tailwind.config.mjs`.

### Astro Configuration

Configuration is in `astro.config.mjs` with integrations for:
- Sitemap generation
- MDX support
- Favicon generation
- Tailwind CSS

## 🤝 Contributing

This is a personal website, but if you find issues or have suggestions:

1. Check existing issues
2. Create a new issue with detailed description
3. Follow conventional commit format for any changes

## 📄 License

© 2025 Jon Green. All rights reserved.

This code is provided for educational and reference purposes only.

## 🔗 Links

- **Live Site**: [https://jgreen.one](https://jgreen.one)
- **GitHub**: [https://github.com/jgreen01/jgreen.one](https://github.com/jgreen01/jgreen.one)
- **About**: [https://jgreen.one/about](https://jgreen.one/about)

---

Built with ❤️ using Astro, Tailwind CSS, and AWS infrastructure.