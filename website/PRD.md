## PRD: Plan with Daisy Landing Page (HTML + TailwindCSS)

### 1) Goal

Create a single-page marketing landing page for "Plan with Daisy" (CLI: `daisy`) - a tool that runs continuous autonomous AI development loops using Claude Code. The page should communicate the core value proposition, explain the workflow, and drive users to install or request early access.

### 2) Target Audience

- Developers using Claude Code for AI-assisted development
- Engineering teams wanting to automate iterative AI workflows
- Indie hackers and startups shipping fast with AI
- DevOps engineers seeking observable, controlled AI execution
- Product teams managing AI-powered feature development

### 3) Core Value Proposition

"Run Claude Code in continuous loops. Define tasks, let AI execute iteratively, track progress and costs automatically."

### 4) Page Structure (Sections)

1. **Top Nav**

   - Logo: "daisy" (left) with a small flower/loop icon
   - Links: Features, How it Works, Use Cases, Pricing, FAQ
   - CTA button: "Get Started" or "npm install"
   - Mobile: hamburger menu

2. **Hero**

   - Headline: "Autonomous AI development loops, made simple."
   - Subheadline: "Define your tasks. Let Claude Code execute them iteratively. Track progress, costs, and results in real-time."
   - Primary CTA: "npm install -g daisy" (copyable code block style)
   - Secondary CTA: "View on GitHub"
   - Visual: Terminal mockup showing daisy running with task progress and token usage

3. **Social Proof / Trust Strip**

   - "Built on the Ralph Wiggum Loop technique"
   - Mini badges: "MCP Native", "Cost Tracking", "Task Dependencies", "Webhook Events", "Claude Code Compatible"

4. **Features (6 cards)**

   - **Continuous Loop Execution**: Run Claude Code in controlled iterations. Set limits, track progress, stop anytime.
   - **Hierarchical Task Management**: Define tasks with subtasks, dependencies, and acceptance criteria. AI picks up where it left off.
   - **AI-Powered Planning**: Generate structured tasks from PRD documents using multiple AI providers (OpenRouter, OpenAI, Anthropic).
   - **Cost & Token Tracking**: Monitor API usage per iteration. Know exactly what each development cycle costs.
   - **MCP Server Integration**: Native tools for Claude Code to manage tasks, signal completion, and track stats during execution.
   - **Terminal UI & Webhooks**: Rich terminal interface with real-time progress. Webhook events for CI/CD integration.

5. **How It Works**
   3-step horizontal section:

   - **Step 1: Initialize** - Run `daisy init` to set up your project with tasks, prompts, and MCP configuration.
   - **Step 2: Plan** - Define tasks manually or run `daisy plan` to generate them from a PRD using AI.
   - **Step 3: Execute** - Run `daisy run 10` to execute 10 iterations. Claude Code works through tasks, you watch progress.

6. **Use Cases**
   4 cards:

   - "Ship features while you sleep" - Set up tasks, run overnight, review in the morning
   - "Automated refactoring cycles" - Let AI iterate through codebase improvements
   - "PRD to implementation" - Generate tasks from specs, execute with tracking
   - "CI/CD AI workflows" - Integrate with webhooks for automated pipelines

7. **Terminal Demo**

   - Animated or static terminal mockup showing:
     - `daisy run 5` command
     - Task list with progress indicators
     - Token usage and cost summary
     - Completion status
   - Optional: "What happens in a loop?" expandable accordion

8. **Pricing (simple)**

   - **Open Source**: Free forever, MIT licensed
   - **Pro** (coming soon): Team features, cloud dashboard, priority support
   - CTA: "Star on GitHub" / "Join waitlist for Pro"

9. **FAQ**
   6 questions (accordion):

   - "What is the Ralph Wiggum Loop?" - Explain the technique origin
   - "Does it work with my existing Claude Code setup?" - Yes, non-intrusive
   - "How do I control costs?" - Iteration limits, token tracking, stop anytime
   - "Can I use different AI providers for planning?" - Yes, OpenRouter, OpenAI, Anthropic
   - "What's MCP and why does it matter?" - Model Context Protocol integration explained
   - "Is my code safe?" - Runs within Claude Code's sandbox, respects permissions

10. **Final CTA Footer**

- Headline: "Start building with continuous AI loops today."
- Code block: `npm install -g daisy && daisy init`
- Secondary: "Read the docs" link
- Small footer links: GitHub, Documentation, Discord/Community, Privacy, Terms

### 5) Requirements

**Functional**

- Single HTML file using TailwindCSS (CDN)
- Fully responsive (mobile-first)
- Smooth scroll to sections
- Copy-to-clipboard for install commands
- FAQ accordion (simple JS)
- Mobile menu toggle (simple JS)
- Terminal mockup with syntax highlighting (CSS-based)

**Content**

- Copy should be technical and developer-focused
- Show concrete benefits: automation, tracking, cost visibility
- Reference the Ralph Wiggum Loop origin (with credit to Geoffrey Huntley)

**Non-functional**

- Fast load (minimal JS, no heavy images)
- Accessible: semantic headings, button labels, focus states, contrast-safe
- SEO basics: title, meta description, Open Graph tags
- Analytics placeholders: `data-cta="install"`, `data-cta="github"` on CTAs

### 6) Tailwind Design Direction

- Dark theme primary (developer/terminal aesthetic)
- Accent color: Soft yellow/gold (daisy flower reference)
- Use cards with subtle borders, dark backgrounds
- Terminal mockups with monospace fonts, syntax-highlighted style
- Typography: Bold headlines, readable body, generous spacing
- Icons: Inline SVG (terminal, loop, checklist, dollar sign, webhook, etc.)

### 7) Acceptance Criteria

- On desktop and mobile:

  - Hero CTA (install command) is visible without scrolling
  - Features clearly explain loop execution, task management, and tracking
  - All nav links scroll to correct sections
  - FAQ expands/collapses correctly
  - Mobile menu opens/closes properly
  - Terminal mockups are readable and well-styled

- Accessibility:

  - Good contrast (especially with dark theme)
  - Proper heading hierarchy (H1 once, then H2s)
  - Buttons are `<button>`, links are `<a>`
  - Copy buttons have appropriate ARIA labels

### 8) Deliverables

- `website/index.html` (Tailwind via CDN)
- Optional: `website/assets/` folder for logo or terminal screenshots

### 9) Key Messaging Points

**Taglines to consider:**

- "Autonomous AI development loops, made simple."
- "Let Claude Code work while you don't."
- "From tasks to done, automatically."
- "The loop that ships."

**Technical credibility:**

- Based on proven Ralph Wiggum Loop technique
- MCP-native integration with Claude Code
- JSON-based storage (no database dependencies)
- Works with multiple AI providers
- Full token and cost transparency
